import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';
import { PALETTE } from '@/lib/constants';
import islandDefinitions from '@/lib/map/island_definitions.json';

// In-game directional and colonization offsets extracted from Grepolis client
const TOWN_DIR_OFFSETS = {
  nw: { x: 9, y: 14 },
  ne: { x: 17, y: 11 },
  sw: { x: 10, y: 13 },
  se: { x: 15, y: 13 }
};
const FREE_SLOT_OFFSET = { x: 18, y: 18 };

// Grepolis map is 1000 tiles * 128px = 128,000 global pixels
const pixelToLng = (px) => (px / 128000) * 360 - 180;
const pixelToLat = (py) => -((py / 128000) * 180 - 90);

/**
 * Calculates official town visual stage based on point thresholds
 * Stage 1: 175 - 599 (Hamlet)
 * Stage 2: 600 - 2,399 (Village)
 * Stage 3: 2,400 - 5,499 (Town)
 * Stage 4: 5,500 - 9,999 (City)
 * Stage 5: 10,000+ (Metropolis)
 */
export function getTownStage(points) {
  if (!points || points < 600) return 1;
  if (points < 2400) return 2;
  if (points < 5500) return 3;
  if (points < 10000) return 4;
  return 5;
}

/**
 * Generates compiled GeoJSON FeatureCollection for a specific world with pixel-perfect in-game coordinates.
 */
export async function generateGeoJSON(worldId = 'hu119') {
  console.time(`GeoJSON Generation [${worldId}]`);
  
  // 1. Fetch towns for this world with player and alliance info
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

  // 2. Fetch Top 10 Alliances for color coding
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

  // 3. Create a quick lookup for towns by island coordinates
  const townLookup = {};
  for (const t of towns) {
    const key = `${t.islandX},${t.islandY}`;
    if (!townLookup[key]) townLookup[key] = [];
    townLookup[key].push(t);
  }

  // 4. World border radius 250 (coordinates 250 to 750)
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

  // Filter to circular world border
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
    if (totalCapacity === 0) continue; // Skip purely decorative rocks

    const isColonizable = (island.type >= 1 && island.type <= 16) || (island.type >= 37 && island.type <= 60);
    const isRock = !isColonizable;

    let islandColor = "#1e293b"; // Default empty island color
    if (islandTowns.length > 0) {
      islandColor = "#e2e8f0"; 
      if (dominantAlliance && allianceColors[dominantAlliance]) {
        islandColor = allianceColors[dominantAlliance];
      }
    }

    // Lookup island definition
    const islandDef = islandDefinitions[island.type] || null;
    const tileWidth = islandDef?.width || (isRock ? 4 : 7);
    const tileHeight = islandDef?.height || (isRock ? 3 : 4);

    // Exact Grepolis pixel coordinates for island origin
    const islandPixelX = island.x * 128;
    const islandPixelY = island.y * 128 + ((island.x & 1) ? 64 : 0);

    // Center coordinates for the island landmass
    const islandCenterPixelX = islandPixelX + (tileWidth * 128) / 2;
    const islandCenterPixelY = islandPixelY + (tileHeight * 128) / 2;
    const islandLng = pixelToLng(islandCenterPixelX);
    const islandLat = pixelToLat(islandCenterPixelY);

    // Push Island Feature
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

    // Map occupied slots
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

    // Determine total slots on this island
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
        // Pixel-perfect official coordinate placement
        dir = slotDef.dir || 'nw';
        const dirOffset = town ? (TOWN_DIR_OFFSETS[dir] || { x: 0, y: 0 }) : FREE_SLOT_OFFSET;
        const townPixelX = islandPixelX + slotDef.x + dirOffset.x;
        const townPixelY = islandPixelY + slotDef.y + dirOffset.y;
        slotLng = pixelToLng(townPixelX);
        slotLat = pixelToLat(townPixelY);
      } else {
        // Orbit fallback only if type definition is missing (non-colonizable / rocks)
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
      } else if (!isRock && definedSlots.length > 0 && slot < definedSlots.length) {
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

  console.timeEnd(`GeoJSON Generation [${worldId}]`);
  
  return { 
    type: 'FeatureCollection', 
    features
  };
}

export const getCachedGeoJSON = unstable_cache(
  async (worldId = 'hu119') => {
    return await generateGeoJSON(worldId);
  },
  ['world-geojson-by-world'],
  { tags: ['world-geojson'] }
);
