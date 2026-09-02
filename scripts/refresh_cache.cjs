const { PrismaClient } = require('@prisma/client');
const zlib = require('zlib');
const prisma = new PrismaClient();
const islandDefinitions = require('../src/lib/map/island_definitions.json');
const alignmentMetadata = require('../src/lib/map/alignment_metadata.json');

const TOWN_DIR_OFFSETS = {
  nw: { x: 9, y: 14 },
  ne: { x: 17, y: 11 },
  sw: { x: 10, y: 13 },
  se: { x: 15, y: 13 }
};
const FREE_SLOT_OFFSET = { x: 18, y: 18 };

const pixelToLng = (px) => (px / 128000) * 360 - 180;
const pixelToLat = (py) => -((py / 128000) * 180 - 90);

function getTownStage(points) {
  if (!points || points < 600) return 1;
  if (points < 2400) return 2;
  if (points < 5500) return 3;
  if (points < 10000) return 4;
  return 5;
}

const PALETTE = [
  '#ef4444', '#3b82f6', '#10b981', '#a855f7', '#f97316',
  '#ec4899', '#eab308', '#06b6d4', '#84cc16', '#6366f1'
];

async function generateGeoJSON(worldId = 'hu119') {
  const towns = await prisma.town.findMany({
    where: { worldId },
    select: {
      id: true,
      name: true,
      points: true,
      islandX: true,
      islandY: true,
      islandSlot: true,
      player: {
        select: {
          id: true,
          name: true,
          alliance: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  });

  const islands = await prisma.island.findMany({
    where: { worldId },
    select: {
      id: true,
      x: true,
      y: true,
      type: true,
      availableTowns: true,
      resourcePlus: true,
      resourceMinus: true
    }
  });

  const topAlliances = await prisma.alliance.findMany({
    where: { worldId },
    orderBy: { points: 'desc' },
    take: 10,
    select: { name: true }
  });

  const allianceColors = {};
  topAlliances.forEach((a, index) => {
    allianceColors[a.name] = PALETTE[index % PALETTE.length];
  });

  const townLookup = {};
  for (const t of towns) {
    const key = `${t.islandX},${t.islandY}`;
    if (!townLookup[key]) townLookup[key] = [];
    townLookup[key].push(t);
  }

  const features = [];

  for (const island of islands) {
    const islandTowns = townLookup[`${island.x},${island.y}`] || [];
    const totalCapacity = island.availableTowns + islandTowns.length;
    if (totalCapacity === 0 && islandTowns.length === 0) continue;

    const isColonizable = (island.type >= 1 && island.type <= 16) || (island.type >= 37 && island.type <= 60);
    const isPopulatedRock = !isColonizable && islandTowns.length > 0;
    const shouldRenderIsland = isColonizable || isPopulatedRock;
    const isRock = !shouldRenderIsland;

    const islandDef = islandDefinitions[island.type] || null;
    const tileWidth = islandDef?.width || (isRock ? 4 : 7);
    const tileHeight = islandDef?.height || (isRock ? 3 : 4);

    // Exact Grepolis pixel coordinates for island origin (stagger Y only on odd X)
    const islandPixelX = island.x * 128;
    const islandPixelY = island.y * 128 + ((island.x & 1) ? 64 : 0);

    // Precise concentric center coordinates matching town offsets
    const meta = alignmentMetadata[island.type];
    const centerX = meta ? meta.townCenterX : (tileWidth * 128) / 2;
    const centerY = meta ? meta.townCenterY : (tileHeight * 128) / 2;

    const islandCenterPixelX = islandPixelX + centerX;
    const islandCenterPixelY = islandPixelY + centerY;

    const islandLng = pixelToLng(islandCenterPixelX);
    const islandLat = pixelToLat(islandCenterPixelY);

    const allianceCounts = {};
    for (const t of islandTowns) {
      const allName = t.player?.alliance?.name;
      if (allName) {
        allianceCounts[allName] = (allianceCounts[allName] || 0) + 1;
      }
    }
    
    let dominantAlliance = null;
    let maxCount = 0;
    for (const [allName, count] of Object.entries(allianceCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantAlliance = allName;
      }
    }

    const islandColor = dominantAlliance && allianceColors[dominantAlliance] 
      ? allianceColors[dominantAlliance] 
      : '#334155';

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [islandLng, islandLat]
      },
      properties: {
        renderType: isRock ? 'rock' : 'island',
        id: island.id,
        x: island.x,
        y: island.y,
        islandType: isColonizable ? island.type : 999,
        img: islandDef?.img || 'rock_island.png',
        width: tileWidth,
        height: tileHeight,
        resourcePlus: island.resourcePlus,
        resourceMinus: island.resourceMinus,
        availableTowns: island.availableTowns,
        colonizedCount: islandTowns.length,
        islandColor,
        dominantAlliance: dominantAlliance || "None"
      }
    });

    const townSlotMap = {};
    for (const t of islandTowns) {
      townSlotMap[t.islandSlot] = {
        id: t.id,
        name: t.name,
        points: t.points,
        stage: getTownStage(t.points),
        player: t.player ? t.player.name : 'Ghost Town',
        playerId: t.player?.id || null,
        alliance: t.player?.alliance?.name || 'None',
        allianceId: t.player?.alliance?.id || null,
        townColor: (t.player?.alliance?.name && allianceColors[t.player.alliance.name]) ? allianceColors[t.player.alliance.name] : '#94a3b8',
        isGhost: !t.player
      };
    }

    const definedSlots = islandDef?.town_offsets || [];
    const maxOccupiedSlot = Math.max(-1, ...Object.keys(townSlotMap).map(Number));
    const totalSlotCount = definedSlots.length > 0 
      ? definedSlots.length 
      : Math.max(island.availableTowns, maxOccupiedSlot + 1, 1);

    for (let slot = 0; slot < totalSlotCount; slot++) {
      const slotDef = definedSlots[slot];
      const town = townSlotMap[slot];

      let slotLng, slotLat, dir;

      if (slotDef) {
        dir = slotDef.dir || 'nw';
        const dirOffset = town ? (TOWN_DIR_OFFSETS[dir] || { x: 0, y: 0 }) : FREE_SLOT_OFFSET;
        const townPixelX = islandPixelX + slotDef.x + dirOffset.x;
        const townPixelY = islandPixelY + slotDef.y + dirOffset.y;
        slotLng = pixelToLng(townPixelX);
        slotLat = pixelToLat(townPixelY);
      } else {
        dir = 'nw';
        const orbitRadius = 0.12;
        const angle = (slot / totalSlotCount) * Math.PI * 2;
        slotLat = islandLat + Math.sin(angle) * orbitRadius;
        slotLng = islandLng + Math.cos(angle) * orbitRadius / Math.cos(islandLat * Math.PI / 180);
      }

      if (town) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [slotLng, slotLat] },
          properties: {
            renderType: 'town',
            id: town.id,
            name: town.name,
            points: town.points,
            stage: town.stage,
            dir: dir,
            islandSlot: slot,
            islandId: island.id,
            islandX: island.x,
            islandY: island.y,
            islandType: island.type,
            player: town.player,
            playerId: town.playerId,
            alliance: town.alliance,
            allianceId: town.allianceId,
            townColor: town.townColor,
            isGhost: town.isGhost
          }
        });
      } else if (!isRock && definedSlots.length > 0 && slot < definedSlots.length) {
        // ONLY create empty slots on colonizable player islands with defined beach slots!
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [slotLng, slotLat] },
          properties: {
            renderType: 'empty-slot',
            islandId: island.id,
            islandX: island.x,
            islandY: island.y,
            islandType: island.type,
            slot: slot,
            dir: dir
          }
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}

async function run() {
  console.log('Generating fresh aligned GeoJSON for hu119...');
  const geojson = await generateGeoJSON('hu119');
  const townsCount = geojson.features.filter(f => f.properties.renderType === 'town').length;
  const emptyCount = geojson.features.filter(f => f.properties.renderType === 'empty-slot').length;
  const islandsCount = geojson.features.filter(f => f.properties.renderType === 'island').length;
  console.log(`Features: ${islandsCount} islands, ${townsCount} towns, ${emptyCount} empty slots (Total: ${geojson.features.length})`);

  const jsonBuffer = Buffer.from(JSON.stringify(geojson));
  const compressed = zlib.gzipSync(jsonBuffer);
  const base64Cache = compressed.toString('base64');

  await prisma.world.update({
    where: { id: 'hu119' },
    data: {
      geoJsonCache: base64Cache,
      lastSync: new Date()
    }
  });

  console.log('✅ World hu119 geoJsonCache successfully refreshed in DB with concentric alignment!');
}

run().finally(() => prisma.$disconnect());
