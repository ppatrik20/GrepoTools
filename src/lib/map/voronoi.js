/**
 * src/lib/map/voronoi.js
 * Voronoi Political Territory Heatmap & Contested Frontline Calculation Engine
 * Milestone 1 (F1, F2)
 */

/**
 * Computes GPU-ready GeoJSON Polygon FeatureCollection representing alliance spheres of influence.
 * 
 * @param {Array<Object>} towns - Array of world towns (raw objects or GeoJSON features)
 * @param {Array<Object>} alliances - Array of alliance metadata ({ id, name, color })
 * @param {Object} options - Configuration options ({ maxRadius: number, minTownCount: number, customColors: Object })
 * @returns {Object} GeoJSON FeatureCollection
 */
export function computeAllianceVoronoi(towns = [], alliances = [], options = {}) {
  const opts = options || {};
  const maxRadius = opts.maxRadius ?? 25.0;
  const minTownCount = opts.minTownCount ?? 2;
  const customColors = opts.customColors || {};

  if (!Array.isArray(towns) || towns.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const allianceMap = new Map();
  (alliances || []).forEach(a => {
    if (a && a.id !== undefined) allianceMap.set(a.id, a);
  });

  const townsByAlliance = new Map();
  let totalEligibleTowns = 0;

  towns.forEach(t => {
    if (!t) return;
    const raw = t.properties ? { ...t.properties, ...t } : t;
    if (!raw) return;
    const aId = typeof raw.player === 'object' 
      ? raw.player?.alliance?.id 
      : (raw.allianceId ?? raw.alliance?.id ?? (typeof raw.alliance === 'number' ? raw.alliance : undefined));
    
    if (aId !== undefined && aId !== null) {
      if (!townsByAlliance.has(aId)) townsByAlliance.set(aId, []);
      townsByAlliance.get(aId).push(raw);
      totalEligibleTowns++;
    }
  });

  const features = [];

  townsByAlliance.forEach((allianceTowns, aId) => {
    if (allianceTowns.length < minTownCount) return;

    const allianceMeta = allianceMap.get(aId) || { id: aId, name: `Alliance #${aId}`, color: '#3b82f6' };
    const allyName = allianceMeta.name || `Alliance #${aId}`;
    const allyColor = customColors[allyName] || allianceMeta.color || '#3b82f6';
    const dominantShare = totalEligibleTowns > 0 ? allianceTowns.length / totalEligibleTowns : 0;

    const coords = allianceTowns.map(t => {
      let x = Number(t.islandX ?? t.x ?? 500);
      let y = Number(t.islandY ?? t.y ?? 500);
      if (!Number.isFinite(x)) x = 500;
      if (!Number.isFinite(y)) y = 500;
      const lng = (x / 1000) * 360 - 180;
      const lat = -((y / 1000) * 180 - 90);
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
        allianceId: aId,
        allianceName: allyName,
        color: allyColor,
        townCount: allianceTowns.length,
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
 * @returns {Object} GeoJSON FeatureCollection
 */
export function computeContestedFrontlines(towns = [], voronoiData = { features: [] }) {
  if (!Array.isArray(towns) || towns.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const features = [];

  // 1. Multi-alliance contested island detection
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
    const allianceIds = new Set();
    islandTowns.forEach(t => {
      if (!t) return;
      const aId = typeof t.player === 'object' 
        ? t.player?.alliance?.id 
        : (t.allianceId ?? t.alliance?.id ?? (typeof t.alliance === 'number' ? t.alliance : undefined));
      if (aId !== undefined && aId !== null) allianceIds.add(aId);
    });

    if (allianceIds.size >= 2) {
      let [ix, iy] = key.split('_').map(Number);
      if (!Number.isFinite(ix)) ix = 500;
      if (!Number.isFinite(iy)) iy = 500;
      const centerLng = (ix / 1000) * 360 - 180;
      const centerLat = -((iy / 1000) * 180 - 90);
      const aList = Array.from(allianceIds);
      const tension = islandTowns.length > 0 ? Math.min(1.0, (allianceIds.size / islandTowns.length) * 1.5) : 0.5;

      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [centerLng - 0.005, centerLat - 0.005],
            [centerLng + 0.005, centerLat + 0.005]
          ]
        },
        properties: {
          allianceA: `Alliance #${aList[0]}`,
          allianceB: `Alliance #${aList[1]}`,
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
        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [midLng - 0.01, midLat - 0.01],
              [midLng + 0.01, midLat + 0.01]
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
