const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const zlib = require('zlib');
const islandDefinitions = require('../src/lib/map/island_definitions.json');

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
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"
];

async function generateAndCacheGeoJSON(worldId = 'hu119') {
  console.log(`[CacheRebuild] Generating upgraded GeoJSON for world: ${worldId}...`);
  console.time('GeoJSON Generation');

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
          alliance: { select: { id: true, name: true } }
        }
      }
    }
  });

  const dbAlliances = await prisma.alliance.findMany({
    where: { worldId },
    orderBy: { towns: 'desc' },
    take: 10,
    select: { name: true }
  });
  const topAlliances = dbAlliances.map(a => a.name);
  const allianceColors = {};
  topAlliances.forEach((name, i) => {
    allianceColors[name] = PALETTE[i];
  });

  const townLookup = {};
  for (const t of towns) {
    const key = `${t.islandX},${t.islandY}`;
    if (!townLookup[key]) townLookup[key] = [];
    townLookup[key].push(t);
  }

  const worldRadius = 250;
  const worldRadiusSq = Math.pow(worldRadius, 2);
  const minX = 500 - worldRadius;
  const maxX = 500 + worldRadius;
  const minY = 500 - worldRadius;
  const maxY = 500 + worldRadius;

  const allIslandsInBox = await prisma.island.findMany({
    where: {
      worldId,
      x: { gte: minX, lte: maxX },
      y: { gte: minY, lte: maxY }
    },
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

  const islands = allIslandsInBox.filter(i => {
    const distSq = Math.pow(i.x - 500, 2) + Math.pow(i.y - 500, 2);
    return distSq <= worldRadiusSq;
  });

  const features = [];

  for (const island of islands) {
    const islandTowns = townLookup[`${island.x},${island.y}`] || [];
    let dominantAlliance = null;
    let maxTowns = 0;
    const localAllyCounts = {};

    for (const t of islandTowns) {
      const allyName = t.player?.alliance?.name;
      if (allyName) {
        localAllyCounts[allyName] = (localAllyCounts[allyName] || 0) + 1;
        if (localAllyCounts[allyName] > maxTowns) {
          maxTowns = localAllyCounts[allyName];
          dominantAlliance = allyName;
        }
      }
    }

    const totalCapacity = island.availableTowns + islandTowns.length;
    if (totalCapacity === 0) continue;

    const isRock = totalCapacity <= 13 || (island.type >= 11 && island.type <= 36) || (island.type >= 47 && island.type <= 60);

    let islandColor = "#1e293b";
    if (islandTowns.length > 0) {
      islandColor = "#e2e8f0";
      if (dominantAlliance && allianceColors[dominantAlliance]) {
        islandColor = allianceColors[dominantAlliance];
      }
    }

    const islandDef = islandDefinitions[island.type] || null;
    const tileWidth = islandDef?.width || (isRock ? 4 : 7);
    const tileHeight = islandDef?.height || (isRock ? 3 : 4);

    const islandPixelX = island.x * 128;
    const islandPixelY = island.y * 128 + ((island.x & 1) ? 64 : 0);

    const islandCenterPixelX = islandPixelX + (tileWidth * 128) / 2;
    const islandCenterPixelY = islandPixelY + (tileHeight * 128) / 2;
    const islandLng = pixelToLng(islandCenterPixelX);
    const islandLat = pixelToLat(islandCenterPixelY);

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [islandLng, islandLat] },
      properties: {
        renderType: isRock ? 'rock' : 'island',
        id: island.id,
        x: island.x,
        y: island.y,
        islandType: island.type,
        img: islandDef?.img || 'island1.png',
        width: tileWidth,
        height: tileHeight,
        resourcePlus: island.resourcePlus,
        resourceMinus: island.resourceMinus,
        availableTowns: island.availableTowns,
        colonizedCount: islandTowns.length,
        islandColor: islandColor,
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
        const orbitRadius = isRock ? 0.10 : 0.15;
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
      } else if (slot < island.availableTowns) {
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

  console.timeEnd('GeoJSON Generation');
  const geojson = { type: 'FeatureCollection', features };

  console.log(`📦 Compressing ${features.length} GeoJSON features with gzip...`);
  const gzipBuffer = zlib.gzipSync(JSON.stringify(geojson));
  const geoJsonGzip = gzipBuffer.toString('base64');
  console.log(`✅ Compressed size: ${(gzipBuffer.length / 1024).toFixed(1)} KB`);

  await prisma.world.update({
    where: { id: worldId },
    data: { geoJsonCache: geoJsonGzip, lastSync: new Date() }
  });

  await prisma.syncMetadata.upsert({
    where: { id: 1 },
    update: { worldId, geoJsonCache: geoJsonGzip, lastSync: new Date() },
    create: { id: 1, worldId, geoJsonCache: geoJsonGzip, lastSync: new Date() }
  });

  console.log(`🚀 Successfully updated world.geoJsonCache for [${worldId}] in PostgreSQL database!`);
}

generateAndCacheGeoJSON('hu119')
  .catch(console.error)
  .finally(() => prisma.$disconnect());
