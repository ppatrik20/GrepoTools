/**
 * src/lib/map/voronoi.js
 * Voronoi Political Territory Heatmap & Contested Frontline Calculation Engine
 * Milestone 1 (F1, F2)
 */
import { worldToLng, worldToLat } from './coordProjection.js';
import { buildCoalitionLookup } from './islandControl.js';

/**
 * Computes GPU-ready GeoJSON Polygon FeatureCollection representing alliance spheres of influence.
 * 
 * @param {Array<Object>} towns - Array of world towns (raw objects or GeoJSON features)
 * @param {Array<Object>} alliances - Array of alliance metadata ({ id, name, color })
 * @param {Object} options - Configuration options ({ maxRadius: number, minTownCount: number, customColors: Object, coalitions: Array })
 * @returns {Object} GeoJSON FeatureCollection
 */
export function computeAllianceVoronoi(towns = [], alliances = [], options = {}) {
  const opts = options || {};
  const maxRadius = opts.maxRadius ?? 25.0;
  const minTownCount = opts.minTownCount ?? 2;
  const customColors = opts.customColors || {};
  const coalitionLookup = buildCoalitionLookup(opts.coalitions || []);

  if (!Array.isArray(towns) || towns.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const allianceMap = new Map();
  (alliances || []).forEach(a => {
    if (a && a.id !== undefined) allianceMap.set(a.id, a);
    if (a && a.name) allianceMap.set(a.name.trim().toLowerCase(), a);
  });

  const townsByGroup = new Map();
  let totalEligibleTowns = 0;

  towns.forEach(t => {
    if (!t) return;
    const raw = t.properties ? { ...t.properties, ...t } : t;
    if (!raw) return;

    const aName = (typeof raw.alliance === 'object' ? raw.alliance?.name : raw.alliance) || '';
    const aId = typeof raw.player === 'object' 
      ? raw.player?.alliance?.id 
      : (raw.allianceId ?? raw.alliance?.id ?? (typeof raw.alliance === 'number' ? raw.alliance : undefined));
    const pName = typeof raw.player === 'object' ? raw.player?.name : (raw.player || '');
    const isGhost = Boolean(raw.isGhost || pName === 'Ghost Town' || aName === 'None');

    if (isGhost) return;

    const normName = aName.trim().toLowerCase();
    const coalition = coalitionLookup.get(normName) || (aId !== null && aId !== undefined ? coalitionLookup.get(String(aId)) : null);

    let groupKey;
    if (coalition) {
      groupKey = `coalition_${coalition.name.toLowerCase()}`;
    } else if (aId !== undefined && aId !== null) {
      groupKey = `ally_id_${aId}`;
    } else if (normName) {
      groupKey = `ally_name_${normName}`;
    } else {
      return;
    }

    if (!townsByGroup.has(groupKey)) {
      townsByGroup.set(groupKey, {
        coalition,
        aId,
        aName,
        towns: []
      });
    }

    townsByGroup.get(groupKey).towns.push(raw);
    totalEligibleTowns++;
  });

  const features = [];

  townsByGroup.forEach((group, groupKey) => {
    const groupTowns = group.towns;
    if (groupTowns.length < minTownCount) return;

    let allyName, allyColor, allianceId, isCoalition;

    if (group.coalition) {
      isCoalition = true;
      allyName = group.coalition.name;
      allyColor = group.coalition.color || '#10b981';
      allianceId = group.coalition.id;
    } else {
      isCoalition = false;
      allianceId = group.aId;
      const allianceMeta = (group.aId !== undefined ? allianceMap.get(group.aId) : null) || 
                           (group.aName ? allianceMap.get(group.aName.trim().toLowerCase()) : null) || 
                           { id: group.aId, name: group.aName || `Alliance #${group.aId}`, color: '#3b82f6' };
      allyName = allianceMeta.name || group.aName || `Alliance #${group.aId}`;
      allyColor = customColors[allyName] || allianceMeta.color || '#3b82f6';
    }

    const dominantShare = totalEligibleTowns > 0 ? groupTowns.length / totalEligibleTowns : 0;

    const coords = groupTowns.map(t => {
      let x = Number(t.islandX ?? t.x ?? 500);
      let y = Number(t.islandY ?? t.y ?? 500);
      if (!Number.isFinite(x)) x = 500;
      if (!Number.isFinite(y)) y = 500;
      const lng = worldToLng(x);
      const lat = worldToLat(y);
      return [lng, lat, x, y];
    });

    if (coords.length === 0) return;

    const avgLng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
    const avgLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
    const radiusDeg = (maxRadius / 1000) * 360;

    const polyPoints = [];
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const r = radiusDeg * (0.8 + 0.2 * Math.cos(angle * 2));
      polyPoints.push([avgLng + Math.cos(angle) * r, avgLat + Math.sin(angle) * r]);
    }

    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [polyPoints]
      },
      properties: {
        allianceId,
        allianceName: allyName,
        color: allyColor,
        isCoalition,
        townCount: groupTowns.length,
        dominantShare: +dominantShare.toFixed(4)
      }
    });
  });

  return {
    type: "FeatureCollection",
    features
  };
}

/**
 * Computes contested frontline LineString FeatureCollection covering multi-alliance islands and inter-Voronoi borders.
 * 
 * @param {Array<Object>} towns - Array of world towns (raw objects or GeoJSON features)
 * @param {Object} voronoiData - GeoJSON FeatureCollection of political territories
 * @param {Object} options - Configuration options ({ coalitions: Array })
 * @returns {Object} GeoJSON FeatureCollection
 */
export function computeContestedFrontlines(towns = [], voronoiData = { features: [] }, options = {}) {
  if (!Array.isArray(towns) || towns.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const opts = options || {};
  const coalitionLookup = buildCoalitionLookup(opts.coalitions || []);
  const features = [];

  // 1. Multi-alliance / multi-coalition contested island detection
  const townsByIsland = new Map();
  towns.forEach(t => {
    if (!t) return;
    const raw = t.properties ? { ...t.properties, ...t } : t;
    if (!raw) return;
    let ix = Number(raw.islandX ?? raw.x ?? 500);
    let iy = Number(raw.islandY ?? raw.y ?? 500);
    if (!Number.isFinite(ix)) ix = 500;
    if (!Number.isFinite(iy)) iy = 500;
    const islandKey = `${ix}_${iy}`;
    if (!townsByIsland.has(islandKey)) townsByIsland.set(islandKey, []);
    townsByIsland.get(islandKey).push(raw);
  });

  townsByIsland.forEach((islandTowns, key) => {
    const familyKeys = new Set();
    const familyLabels = [];

    islandTowns.forEach(t => {
      if (!t) return;
      const aName = (typeof t.alliance === 'object' ? t.alliance?.name : t.alliance) || '';
      const aId = typeof t.player === 'object' 
        ? t.player?.alliance?.id 
        : (t.allianceId ?? t.alliance?.id ?? (typeof t.alliance === 'number' ? t.alliance : undefined));
      const pName = typeof t.player === 'object' ? t.player?.name : (t.player || '');
      const isGhost = Boolean(t.isGhost || pName === 'Ghost Town' || aName === 'None');

      if (isGhost) return;

      const normName = aName.trim().toLowerCase();
      const coalition = coalitionLookup.get(normName) || (aId !== null && aId !== undefined ? coalitionLookup.get(String(aId)) : null);

      const famKey = coalition ? `coalition_${coalition.name.toLowerCase()}` : (aId !== undefined && aId !== null ? `ally_id_${aId}` : `ally_name_${normName}`);
      const famName = coalition ? coalition.name : (aName || `Alliance #${aId}`);

      if (!familyKeys.has(famKey)) {
        familyKeys.add(famKey);
        familyLabels.push(famName);
      }
    });

    // Only draw contested lines if 2 or more DIFFERENT families/coalitions occupy the island
    if (familyKeys.size >= 2) {
      let [ix, iy] = key.split('_').map(Number);
      if (!Number.isFinite(ix)) ix = 500;
      if (!Number.isFinite(iy)) iy = 500;
      const centerLng = worldToLng(ix);
      const centerLat = worldToLat(iy);
      const tension = islandTowns.length > 0 ? Math.min(1.0, (familyKeys.size / islandTowns.length) * 1.5) : 0.5;

      const rad = 0.04;
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [centerLng - rad, centerLat],
            [centerLng + rad, centerLat]
          ]
        },
        properties: {
          allianceA: familyLabels[0] || 'Alliance A',
          allianceB: familyLabels[1] || 'Alliance B',
          tension: +tension.toFixed(2),
          islandKey: key,
          isContestedIsland: true
        }
      });
    }
  });

  // 2. Inter-Voronoi boundary edge lines
  const vFeatures = voronoiData?.features || [];
  for (let i = 0; i < vFeatures.length; i++) {
    for (let j = i + 1; j < vFeatures.length; j++) {
      const fA = vFeatures[i];
      const fB = vFeatures[j];
      if (!fA || !fB) continue;

      const aProps = fA.properties || {};
      const bProps = fB.properties || {};

      if (aProps.allianceId === undefined || bProps.allianceId === undefined) continue;
      if (aProps.allianceId === bProps.allianceId) continue;
      if (aProps.allianceName && bProps.allianceName && aProps.allianceName === bProps.allianceName) continue;

      if (!fA?.geometry?.coordinates?.[0]?.[0] || !fB?.geometry?.coordinates?.[0]?.[0]) continue;

      const cA = fA.geometry.coordinates[0][0];
      const cB = fB.geometry.coordinates[0][0];
      if (!Array.isArray(cA) || !Array.isArray(cB) || !Number.isFinite(cA[0]) || !Number.isFinite(cA[1]) || !Number.isFinite(cB[0]) || !Number.isFinite(cB[1])) {
        continue;
      }

      const midLng = (cA[0] + cB[0]) / 2;
      const midLat = (cA[1] + cB[1]) / 2;
      const dist = Math.hypot(cB[0] - cA[0], cB[1] - cA[1]);

      // Adjacent alliance territories within ~40 degrees
      if (dist < 40.0) {
        const tension = Math.min(1.0, 0.5 + Math.max(0, (40.0 - dist) / 80));
        const dx = cB[0] - cA[0];
        const dy = cB[1] - cA[1];
        const len = Math.hypot(dx, dy) || 1;
        const span = Math.min(dist * 0.35, 1.5);
        const nx = (-dy / len) * span;
        const ny = (dx / len) * span;

        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [midLng - nx, midLat - ny],
              [midLng + nx, midLat + ny]
            ]
          },
          properties: {
            allianceA: aProps.allianceName || `Alliance #${aProps.allianceId}`,
            allianceB: bProps.allianceName || `Alliance #${bProps.allianceId}`,
            tension: +tension.toFixed(2),
            isContestedIsland: false
          }
        });
      }
    }
  }

  return {
    type: "FeatureCollection",
    features
  };
}

export const VoronoiPoliticalEngine = {
  computeAllianceVoronoi,
  computeContestedFrontlines
};

export default VoronoiPoliticalEngine;
