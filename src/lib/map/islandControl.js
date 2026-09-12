/**
 * src/lib/map/islandControl.js
 * Island Control & Sovereignty Engine
 * Evaluates island slot ownership, cleanliness tiers (Clean, Infiltrated, Contested),
 * alliance coalition families, and produces GPU-ready GeoJSON feature sets.
 */

import { worldToLng, worldToLat } from './coordProjection.js';

export const ISLAND_STATUS = {
  CLEAN: 'CLEAN',             // 100% owned by one alliance / coalition family
  INFILTRATED: 'INFILTRATED', // Dominant alliance holds majority, but 1-2 enemy towns exist
  CONTESTED: 'CONTESTED',     // Significant multi-alliance presence (< 75% dominant)
  NEUTRAL: 'NEUTRAL'          // Ghosts, uncolonized or low presence
};

/**
 * Builds a fast lookup map for alliance coalitions / families.
 * @param {Array<Object>} coalitions - Array of coalition definitions
 * @returns {Map<string, Object>} Map from allianceName (lowercase) to coalition info
 */
export function buildCoalitionLookup(coalitions = []) {
  const lookup = new Map();
  if (!Array.isArray(coalitions)) return lookup;

  coalitions.forEach(c => {
    if (!c || !c.name) return;
    const members = Array.isArray(c.alliances) ? c.alliances : [];
    members.forEach(m => {
      if (typeof m === 'string') {
        lookup.set(m.trim().toLowerCase(), c);
      } else if (m && typeof m === 'object' && m.name) {
        lookup.set(m.name.trim().toLowerCase(), c);
        if (m.id !== undefined && m.id !== null) {
          lookup.set(String(m.id), c);
        }
      } else if (m !== undefined && m !== null) {
        lookup.set(String(m), c);
      }
    });

    if (Array.isArray(c.allianceIds)) {
      c.allianceIds.forEach(id => {
        if (id !== undefined && id !== null) {
          lookup.set(String(id), c);
        }
      });
    }

    // Also map coalition's own name
    lookup.set(c.name.trim().toLowerCase(), c);
  });

  return lookup;
}

/**
 * Classifies all islands in the world based on slot ownership, cleanliness, and alliance distribution.
 * 
 * @param {Array<Object>} islands - Array of island features or objects
 * @param {Array<Object>} towns - Array of town features or objects
 * @param {Object} options - { coalitions: Array, customColors: Object, minCleanTowns: number }
 * @returns {Object} { islandsMap, islandSummaryList, cleanGeoJSON, infiltratedGeoJSON, contestedGeoJSON, enemyBeachheadsGeoJSON }
 */
export function classifyIslands(islands = [], towns = [], options = {}) {
  const {
    coalitions = [],
    customColors = {},
    minCleanTowns = 1
  } = options;

  const coalitionLookup = buildCoalitionLookup(coalitions);

  // 1. Group towns by island key (x_y)
  const townsByIsland = new Map();
  (towns || []).forEach(t => {
    if (!t) return;
    const raw = t.properties ? { ...t.properties, ...t } : t;
    const ix = Number(raw.islandX ?? raw.x ?? 500);
    const iy = Number(raw.islandY ?? raw.y ?? 500);
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) return;

    const key = `${ix}_${iy}`;
    if (!townsByIsland.has(key)) townsByIsland.set(key, []);

    let lng, lat;
    if (t.geometry?.coordinates) {
      [lng, lat] = t.geometry.coordinates;
    } else {
      lng = worldToLng(ix);
      lat = worldToLat(iy);
    }

    const aName = (typeof raw.alliance === 'object' ? raw.alliance?.name : raw.alliance) || 'None';
    const aId = (typeof raw.alliance === 'object' ? raw.alliance?.id : raw.allianceId) ?? null;
    const pName = (typeof raw.player === 'object' ? raw.player?.name : raw.player) || 'Ghost Town';
    const isGhost = Boolean(raw.isGhost || !pName || pName === 'Ghost Town' || aName === 'None');

    // Resolve coalition / alliance family
    const normName = aName.trim().toLowerCase();
    const coalition = !isGhost 
      ? (coalitionLookup.get(normName) || (aId !== null && aId !== undefined ? coalitionLookup.get(String(aId)) : null))
      : null;
    const familyKey = coalition ? `coalition_${coalition.name}` : (isGhost ? 'GHOST' : `ally_${aName}`);
    const familyName = coalition ? coalition.name : (isGhost ? 'Ghost Town' : aName);
    const familyColor = coalition?.color || customColors[aName] || raw.townColor || '#94a3b8';

    townsByIsland.get(key).push({
      id: raw.id,
      name: raw.name || `Town #${raw.id}`,
      points: Number(raw.points || 0),
      slot: Number(raw.islandSlot ?? raw.slot ?? 0),
      x: ix,
      y: iy,
      lng,
      lat,
      allianceName: aName,
      allianceId: aId,
      playerName: pName,
      isGhost,
      familyKey,
      familyName,
      familyColor
    });
  });

  // 2. Index island metadata
  const islandMetaMap = new Map();
  (islands || []).forEach(isl => {
    if (!isl) return;
    const raw = isl.properties ? { ...isl.properties, ...isl } : isl;
    const ix = Number(raw.x ?? raw.islandX ?? 500);
    const iy = Number(raw.y ?? raw.islandY ?? 500);
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) return;

    const key = `${ix}_${iy}`;
    islandMetaMap.set(key, {
      id: raw.id,
      x: ix,
      y: iy,
      islandType: Number(raw.islandType ?? raw.type ?? 1),
      availableTowns: Number(raw.availableTowns || 0),
      resourcePlus: raw.resourcePlus || '+',
      resourceMinus: raw.resourceMinus || '-'
    });
  });

  const islandSummaryList = [];
  const cleanFeatures = [];
  const infiltratedFeatures = [];
  const contestedFeatures = [];
  const enemyBeachheadFeatures = [];

  // 3. Classify every island that has towns or island metadata
  const allIslandKeys = new Set([...islandMetaMap.keys(), ...townsByIsland.keys()]);

  allIslandKeys.forEach(key => {
    const [ix, iy] = key.split('_').map(Number);
    const meta = islandMetaMap.get(key) || { id: null, x: ix, y: iy, availableTowns: 0, islandType: 1 };
    const islandTowns = townsByIsland.get(key) || [];

    const centerLng = worldToLng(ix);
    const centerLat = worldToLat(iy);

    const occupiedCount = islandTowns.length;
    const availableCount = meta.availableTowns;
    const totalSlots = occupiedCount + availableCount;

    if (occupiedCount === 0) {
      islandSummaryList.push({
        islandKey: key,
        x: ix,
        y: iy,
        centerLng,
        centerLat,
        totalSlots,
        occupiedCount: 0,
        availableCount,
        status: ISLAND_STATUS.NEUTRAL,
        dominantAlliance: 'None',
        dominantColor: '#1e293b',
        dominanceRatio: 0,
        towns: []
      });
      return;
    }

    // Tally by family key
    const familyCounts = new Map();
    let totalNonGhostTowns = 0;

    islandTowns.forEach(t => {
      if (t.isGhost) return;
      totalNonGhostTowns++;
      if (!familyCounts.has(t.familyKey)) {
        familyCounts.set(t.familyKey, {
          key: t.familyKey,
          name: t.familyName,
          color: t.familyColor,
          count: 0,
          towns: []
        });
      }
      const fam = familyCounts.get(t.familyKey);
      fam.count++;
      fam.towns.push(t);
    });

    let dominantFamily = null;
    familyCounts.forEach(fam => {
      if (!dominantFamily || fam.count > dominantFamily.count) {
        dominantFamily = fam;
      }
    });

    let status = ISLAND_STATUS.NEUTRAL;
    let dominantName = 'None';
    let dominantColor = '#94a3b8';
    let dominantCount = 0;
    let enemyCount = 0;
    let dominanceRatio = 0;
    const enemyTowns = [];

    if (dominantFamily && totalNonGhostTowns > 0) {
      dominantName = dominantFamily.name;
      dominantColor = dominantFamily.color;
      dominantCount = dominantFamily.count;
      enemyCount = totalNonGhostTowns - dominantCount;
      dominanceRatio = dominantCount / totalNonGhostTowns;

      // Identify enemy towns (towns not belonging to the dominant family)
      islandTowns.forEach(t => {
        if (!t.isGhost && t.familyKey !== dominantFamily.key) {
          enemyTowns.push(t);
        }
      });

      // Status classification based on Grepolis game mechanics:
      // 1. CLEAN: 100% of player towns belong to dominant family, 0 enemy towns
      if (enemyCount === 0 && dominantCount >= minCleanTowns) {
        status = ISLAND_STATUS.CLEAN;
      } 
      // 2. INFILTRATED: Dominant family has strong presence, but 1-2 enemy towns breached the island
      else if (enemyCount >= 1 && enemyCount <= 2 && dominantCount >= 3 && dominanceRatio >= 0.70) {
        status = ISLAND_STATUS.INFILTRATED;
      } 
      // 3. CONTESTED: Split control across competing alliances
      else if (enemyCount > 0) {
        status = ISLAND_STATUS.CONTESTED;
      }
    }

    const summary = {
      islandKey: key,
      x: ix,
      y: iy,
      centerLng,
      centerLat,
      totalSlots,
      occupiedCount,
      availableCount,
      status,
      dominantAlliance: dominantName,
      dominantColor,
      dominantCount,
      enemyCount,
      dominanceRatio: +dominanceRatio.toFixed(3),
      towns: islandTowns,
      enemyTowns,
      isFrontline: false,
      threatLevel: 'NONE',
      frontlineRival: null,
      frontlineRivalColor: null,
      frontlineDist: null,
      isSafeCore: false
    };
    islandSummaryList.push(summary);
  });

  // 4. Spatial Frontier & Threat Analysis: Detect frontline contact zones vs safe core heartlands
  const populatedIslands = islandSummaryList.filter(i => 
    i.occupiedCount > 0 && 
    i.dominantAlliance !== 'None' && 
    i.status !== ISLAND_STATUS.NEUTRAL
  );

  const FRONTLINE_PROXIMITY_DEG = 4.0; // ~11 grid units in Grepolis world coords (~1-2h bireme/siege range)

  populatedIslands.forEach(isl => {
    let closestDist = Infinity;
    let closestRival = null;
    let closestRivalColor = null;

    for (const other of populatedIslands) {
      if (other === isl) continue;
      if (other.dominantAlliance === isl.dominantAlliance) continue;

      const dist = Math.hypot(other.centerLng - isl.centerLng, other.centerLat - isl.centerLat);
      if (dist < closestDist) {
        closestDist = dist;
        closestRival = other.dominantAlliance;
        closestRivalColor = other.dominantColor;
      }
    }

    const isNearEnemy = closestDist <= FRONTLINE_PROXIMITY_DEG;
    const isContested = isl.status === ISLAND_STATUS.CONTESTED;

    isl.isFrontline = isNearEnemy || isContested;
    isl.frontlineDist = Number.isFinite(closestDist) ? Number(closestDist.toFixed(3)) : null;
    isl.frontlineRival = closestRival || (isContested ? 'Hostile Forces' : null);
    isl.frontlineRivalColor = closestRivalColor || '#f43f5e';

    if (isContested) {
      isl.threatLevel = 'CRITICAL';
      isl.isSafeCore = false;
    } else if (isNearEnemy) {
      if (closestDist <= 1.8) {
        isl.threatLevel = 'CRITICAL';
      } else if (closestDist <= 2.8) {
        isl.threatLevel = 'HIGH';
      } else {
        isl.threatLevel = 'GUARD';
      }
      isl.isSafeCore = false;
    } else {
      isl.threatLevel = 'NONE';
      isl.isSafeCore = (isl.status === ISLAND_STATUS.CLEAN);
    }
  });

  // 5. Generate GPU-ready GeoJSON feature sets
  const frontlineFeatures = [];

  islandSummaryList.forEach(isl => {
    if (isl.occupiedCount === 0) return;

    const pointGeometry = {
      type: "Point",
      coordinates: [isl.centerLng, isl.centerLat]
    };

    const commonProps = {
      islandKey: isl.islandKey,
      x: isl.x,
      y: isl.y,
      dominantAlliance: isl.dominantAlliance,
      color: isl.dominantColor,
      dominantCount: isl.dominantCount,
      enemyCount: isl.enemyCount,
      totalSlots: isl.totalSlots,
      status: isl.status,
      isFrontline: isl.isFrontline,
      threatLevel: isl.threatLevel,
      frontlineRival: isl.frontlineRival,
      frontlineRivalColor: isl.frontlineRivalColor,
      frontlineDist: isl.frontlineDist,
      isSafeCore: isl.isSafeCore
    };

    if (isl.status === ISLAND_STATUS.CLEAN) {
      cleanFeatures.push({
        type: "Feature",
        geometry: pointGeometry,
        properties: {
          ...commonProps,
          townCount: isl.dominantCount
        }
      });
    } else if (isl.status === ISLAND_STATUS.INFILTRATED) {
      infiltratedFeatures.push({
        type: "Feature",
        geometry: pointGeometry,
        properties: {
          ...commonProps,
          dominanceRatio: isl.dominanceRatio,
          warningMessage: `${isl.enemyCount} enemy town${isl.enemyCount > 1 ? 's' : ''} on ${isl.dominantAlliance} island!`
        }
      });

      // Target beacons on exact enemy towns
      isl.enemyTowns.forEach(et => {
        enemyBeachheadFeatures.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [et.lng, et.lat]
          },
          properties: {
            townId: et.id,
            name: et.name,
            x: et.x,
            y: et.y,
            islandKey: isl.islandKey,
            player: et.playerName,
            enemyAlliance: et.allianceName,
            hostAlliance: isl.dominantAlliance,
            color: '#ef4444',
            isBeachhead: true
          }
        });
      });
    } else if (isl.status === ISLAND_STATUS.CONTESTED) {
      contestedFeatures.push({
        type: "Feature",
        geometry: pointGeometry,
        properties: {
          ...commonProps,
          tension: +(1 - isl.dominanceRatio).toFixed(2)
        }
      });
    }

    // Add to tactical Frontline Islands feature collection
    if (isl.isFrontline) {
      frontlineFeatures.push({
        type: "Feature",
        geometry: pointGeometry,
        properties: {
          ...commonProps,
          combatLabel: isl.status === ISLAND_STATUS.CONTESTED
            ? `⚔️ CONTESTED (${isl.dominantCount} vs ${isl.enemyCount})`
            : `⚔️ FRONT vs ${isl.frontlineRival}`,
          badgeText: isl.status === ISLAND_STATUS.CONTESTED ? '⚔️ CONTESTED' : `⚔️ ${isl.threatLevel}`
        }
      });
    }
  });

  return {
    islandSummaryList,
    cleanGeoJSON: { type: "FeatureCollection", features: cleanFeatures },
    infiltratedGeoJSON: { type: "FeatureCollection", features: infiltratedFeatures },
    contestedGeoJSON: { type: "FeatureCollection", features: contestedFeatures },
    enemyBeachheadsGeoJSON: { type: "FeatureCollection", features: enemyBeachheadFeatures },
    frontlineIslandsGeoJSON: { type: "FeatureCollection", features: frontlineFeatures }
  };
}

const islandControl = {
  ISLAND_STATUS,
  buildCoalitionLookup,
  classifyIslands
};

export default islandControl;
