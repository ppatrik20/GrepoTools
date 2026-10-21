import { createRequire } from 'module';
import { prisma } from './prisma.js';
import { PALETTE } from './constants.js';
import { pixelToLng, pixelToLat } from './map/coordProjection.js';

const require = createRequire(import.meta.url);
const islandDefinitions = require('./map/island_definitions.json');
const alignmentMetadata = require('./map/alignment_metadata.json');
const islandOutlines = require('./map/island_outlines.json');

// In-game directional and colonization offsets extracted from Grepolis client
const TOWN_DIR_OFFSETS = {
  nw: { x: 9, y: 14 },
  ne: { x: 17, y: 11 },
  sw: { x: 10, y: 13 },
  se: { x: 15, y: 13 }
};
const FREE_SLOT_OFFSET = { x: 18, y: 18 };

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
 * Builds a map of Top 10 alliance names to PALETTE colors.
 */
function buildAllianceColorMap(alliances = []) {
  const sorted = [...(alliances || [])]
    .sort((a, b) => {
      if (typeof a?.towns === 'number' && typeof b?.towns === 'number') {
        return b.towns - a.towns;
      }
      return 0;
    })
    .slice(0, 10);

  const allianceColors = {};
  sorted.forEach((entry, i) => {
    const name = typeof entry === 'string' ? entry : entry?.name;
    if (name) {
      allianceColors[name] = PALETTE[i] || '#ffffff';
    }
  });
  return allianceColors;
}

/**
 * Resolves player and alliance metadata for a town from nested relations or lookup maps.
 */
function resolveTownRelations(town, playerById, allianceById) {
  const playerObj = town.player || (town.playerId != null ? playerById.get(town.playerId) : null) || null;
  const allianceObj =
    playerObj?.alliance ||
    (playerObj?.allianceId != null ? allianceById.get(playerObj.allianceId) : null) ||
    null;

  return {
    playerObj,
    allianceObj,
    playerName: playerObj ? playerObj.name : 'Ghost Town',
    playerId: playerObj?.id ?? town.playerId ?? null,
    allianceName: allianceObj?.name || null,
    allianceId: allianceObj?.id ?? playerObj?.allianceId ?? null
  };
}

/**
 * Computes the dominant alliance and island color for an island's towns.
 */
function computeIslandDominance(islandTowns, playerById, allianceById, allianceColors) {
  let dominantAlliance = null;
  let maxTowns = 0;
  const localAllyCounts = {};

  for (const t of islandTowns) {
    const { allianceName } = resolveTownRelations(t, playerById, allianceById);
    if (allianceName) {
      localAllyCounts[allianceName] = (localAllyCounts[allianceName] || 0) + 1;
      if (localAllyCounts[allianceName] > maxTowns) {
        maxTowns = localAllyCounts[allianceName];
        dominantAlliance = allianceName;
      }
    }
  }

  let islandColor = '#1e293b'; // Default empty island color
  if (islandTowns.length > 0) {
    islandColor = '#e2e8f0';
    if (dominantAlliance && allianceColors[dominantAlliance]) {
      islandColor = allianceColors[dominantAlliance];
    }
  }

  return { dominantAlliance, islandColor };
}

/**
 * Pure projection: compiles a GeoJSON FeatureCollection from in-memory world entities.
 * Performs Top 10 alliance PALETTE assignment, circular boundary filtering (distSq > 250 * 250),
 * island town grouping, dominant alliance calculation, and GeoJSON feature assembly without Prisma.
 */
export function compileGeoJsonSnapshot({ towns = [], players = [], alliances = [], islands = [] } = {}) {
  const allianceColors = buildAllianceColorMap(alliances);
  const playerById = new Map((players || []).map(p => [p.id, p]));
  const allianceById = new Map((alliances || []).filter(a => a && typeof a === 'object' && a.id != null).map(a => [a.id, a]));

  const townLookup = {};
  for (const t of towns || []) {
    const key = `${t.islandX},${t.islandY}`;
    if (!townLookup[key]) townLookup[key] = [];
    townLookup[key].push(t);
  }

  const worldRadius = 250;
  const worldRadiusSq = worldRadius * worldRadius;

  const features = [];

  for (const island of islands || []) {
    const distSq = Math.pow(island.x - 500, 2) + Math.pow(island.y - 500, 2);
    if (distSq > worldRadiusSq) continue;

    const islandTowns = townLookup[`${island.x},${island.y}`] || [];
    const { dominantAlliance, islandColor } = computeIslandDominance(
      islandTowns,
      playerById,
      allianceById,
      allianceColors
    );

    const totalCapacity = (island.availableTowns || 0) + islandTowns.length;
    if (totalCapacity === 0) continue; // Skip purely decorative rocks

    const isColonizable = (island.type >= 1 && island.type <= 16) || (island.type >= 37 && island.type <= 60);
    const isPopulatedRock = !isColonizable && islandTowns.length > 0;
    const shouldRenderIsland = isColonizable || isPopulatedRock;
    const isRock = !shouldRenderIsland;

    // Lookup island definition
    const islandDef = islandDefinitions[island.type] || null;
    const tileWidth = islandDef?.width || (isRock ? 4 : 7);
    const tileHeight = islandDef?.height || (isRock ? 3 : 4);

    // Exact Grepolis pixel coordinates for island origin (offset Y on odd X)
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

    // Push Island Feature
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [islandLng, islandLat] },
      properties: {
        renderType: isRock ? 'rock' : 'island',
        id: island.id,
        x: island.x,
        y: island.y,
        islandType: islandOutlines[island.type] ? island.type : (isColonizable ? island.type : 999),
        img: islandDef?.img || 'rock_island.png',
        width: tileWidth,
        height: tileHeight,
        resourcePlus: island.resourcePlus,
        resourceMinus: island.resourceMinus,
        availableTowns: island.availableTowns,
        colonizedCount: islandTowns.length,
        islandColor: islandColor,
        dominantAlliance: dominantAlliance || 'None'
      }
    });

    // Map occupied slots
    const townSlotMap = {};
    for (const t of islandTowns) {
      const { playerObj, playerName, playerId, allianceName, allianceId } = resolveTownRelations(
        t,
        playerById,
        allianceById
      );
      townSlotMap[t.islandSlot] = {
        id: t.id,
        name: t.name,
        points: t.points,
        stage: getTownStage(t.points),
        player: playerName,
        playerId,
        alliance: allianceName || 'None',
        allianceId,
        townColor: (allianceName && allianceColors[allianceName]) ? allianceColors[allianceName] : '#94a3b8',
        isGhost: !playerObj
      };
    }

    // Determine total slots on this island
    const definedSlots = islandDef?.town_offsets || [];
    const maxOccupiedSlot = Math.max(-1, ...Object.keys(townSlotMap).map(Number));
    const totalSlotCount = definedSlots.length > 0
      ? definedSlots.length
      : Math.max(island.availableTowns || 0, maxOccupiedSlot + 1, 1);

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
        // Coastal anchorage placement for rocks or islands without explicit slot definitions
        dir = 'nw';
        const dirOffset = town ? (TOWN_DIR_OFFSETS[dir] || { x: 0, y: 0 }) : FREE_SLOT_OFFSET;
        const fallbackCenterX = (tileWidth * 128) / 2;
        const fallbackCenterY = (tileHeight * 128) / 2;
        const radiusPx = Math.min(tileWidth, tileHeight) * 128 * 0.28;
        const angle = (slot / totalSlotCount) * Math.PI * 2 - Math.PI / 2;
        const townPixelX = islandPixelX + fallbackCenterX + Math.cos(angle) * radiusPx + dirOffset.x;
        const townPixelY = islandPixelY + fallbackCenterY + Math.sin(angle) * radiusPx + dirOffset.y;
        slotLng = pixelToLng(townPixelX);
        slotLat = pixelToLat(townPixelY);
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

  return {
    type: 'FeatureCollection',
    features
  };
}

/**
 * Pure projection: compiles ocean-scoped summary islands and towns sharing the same
 * Top 10 PALETTE, circular boundary filter (distSq > 250 * 250), and dominant alliance grouping.
 */
export function compileOceanSummarySnapshot({ oceanId = null, towns = [], players = [], alliances = [], islands = [] } = {}) {
  const allianceColors = buildAllianceColorMap(alliances);
  const playerById = new Map((players || []).map(p => [p.id, p]));
  const allianceById = new Map((alliances || []).filter(a => a && typeof a === 'object' && a.id != null).map(a => [a.id, a]));

  let candidateIslands = islands || [];
  let candidateTowns = towns || [];

  if (oceanId !== null && oceanId !== undefined && String(oceanId).length > 0) {
    const xStr = String(oceanId).padStart(2, '0');
    const oceanX = parseInt(xStr[0], 10);
    const oceanY = parseInt(xStr[1], 10);
    if (!isNaN(oceanX) && !isNaN(oceanY)) {
      const minX = oceanX * 100;
      const maxX = (oceanX + 1) * 100;
      const minY = oceanY * 100;
      const maxY = (oceanY + 1) * 100;
      candidateIslands = candidateIslands.filter(i => i.x >= minX && i.x < maxX && i.y >= minY && i.y < maxY);
      candidateTowns = candidateTowns.filter(t => t.islandX >= minX && t.islandX < maxX && t.islandY >= minY && t.islandY < maxY);
    }
  }

  const townLookup = {};
  for (const t of candidateTowns) {
    const key = `${t.islandX},${t.islandY}`;
    if (!townLookup[key]) townLookup[key] = [];
    townLookup[key].push(t);
  }

  const worldRadiusSq = 250 * 250;
  const outputIslands = [];
  const outputTowns = [];

  for (const island of candidateIslands) {
    const distSq = Math.pow(island.x - 500, 2) + Math.pow(island.y - 500, 2);
    if (distSq > worldRadiusSq) continue;

    const islandTowns = townLookup[`${island.x},${island.y}`] || [];
    const { dominantAlliance, islandColor } = computeIslandDominance(
      islandTowns,
      playerById,
      allianceById,
      allianceColors
    );

    const totalCapacity = (island.availableTowns || 0) + islandTowns.length;
    if (totalCapacity === 0) continue;

    const isRock = totalCapacity <= 13;

    outputIslands.push({
      id: island.id,
      x: island.x,
      y: island.y,
      type: isRock ? 'rock' : 'island',
      availableTowns: island.availableTowns,
      resourcePlus: island.resourcePlus,
      resourceMinus: island.resourceMinus,
      colonizedCount: islandTowns.length,
      color: islandColor,
      alliance: dominantAlliance || 'None'
    });

    for (const t of islandTowns) {
      const { playerName, allianceName } = resolveTownRelations(t, playerById, allianceById);
      outputTowns.push({
        id: t.id,
        islandX: t.islandX,
        islandY: t.islandY,
        slot: t.islandSlot,
        name: t.name,
        points: t.points,
        player: playerName,
        alliance: allianceName || 'None'
      });
    }
  }

  return {
    islands: outputIslands,
    towns: outputTowns
  };
}

/**
 * Generates compiled GeoJSON FeatureCollection for a specific world with pixel-perfect in-game coordinates.
 */
export async function generateGeoJSON(worldId = 'hu119', { snapshot = null, prismaClient = prisma } = {}) {
  if (snapshot && snapshot.towns && snapshot.alliances && snapshot.islands) {
    return compileGeoJsonSnapshot(snapshot);
  }

  console.time(`GeoJSON Generation [${worldId}]`);

  const worldRadius = 250;
  const minX = 500 - worldRadius;
  const maxX = 500 + worldRadius;
  const minY = 500 - worldRadius;
  const maxY = 500 + worldRadius;

  const [towns, dbAlliances, allIslandsInBox] = await Promise.all([
    snapshot?.towns ?? prismaClient.town.findMany({
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
    }),
    snapshot?.alliances ?? prismaClient.alliance.findMany({
      where: { worldId },
      orderBy: { towns: 'desc' },
      take: 10,
      select: { id: true, name: true, towns: true }
    }),
    snapshot?.islands ?? prismaClient.island.findMany({
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
    })
  ]);

  const result = compileGeoJsonSnapshot({
    towns,
    players: snapshot?.players || [],
    alliances: dbAlliances,
    islands: allIslandsInBox
  });

  console.timeEnd(`GeoJSON Generation [${worldId}]`);

  return result;
}


