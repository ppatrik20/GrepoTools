/**
 * src/lib/map/maritimeBoundaries.js
 * Island-Centric Maritime Territorial Boundaries Engine
 * Generates continuous alliance ocean basins, inter-alliance frontline maritime borders,
 * and island sovereignty overlays that fill empty ocean between islands.
 */

import { worldToLng, worldToLat } from './coordProjection.js';
import { ISLAND_STATUS } from './islandControl.js';

/**
 * Computes 2D convex hull for an array of [lng, lat] coordinates.
 */
function computeConvexHull(points) {
  if (!points || points.length <= 2) return points || [];
  const sorted = points.slice().sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/**
 * Creates an organic rounded maritime territorial sea polygon around a set of island centers.
 * 
 * @param {Array<[number, number]>} hull - Convex hull coordinates
 * @param {number} bufferDeg - Maritime territorial buffer in degrees (default 0.95 ~ 6-7 grid units)
 * @returns {Array<Array<[number, number]>>} GeoJSON Polygon coordinates
 */
function createMaritimePolygon(hull, bufferDeg = 0.95) {
  if (!hull || hull.length === 0) return [];

  // Single island maritime sea (smooth circle)
  if (hull.length === 1) {
    const [cx, cy] = hull[0];
    const ring = [];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      ring.push([
        Number((cx + Math.cos(angle) * bufferDeg).toFixed(5)),
        Number((cy + Math.sin(angle) * (bufferDeg * 0.72)).toFixed(5))
      ]);
    }
    return [ring];
  }

  // Two islands (pill/capsule shape connecting the two island maritime waters)
  if (hull.length === 2) {
    const [p1, p2] = hull;
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * bufferDeg;
    const ny = (dx / len) * (bufferDeg * 0.72);
    
    return [[
      [Number((p1[0] + nx).toFixed(5)), Number((p1[1] + ny).toFixed(5))],
      [Number((p2[0] + nx).toFixed(5)), Number((p2[1] + ny).toFixed(5))],
      [Number((p2[0] + Math.cos(0.4) * bufferDeg).toFixed(5)), Number((p2[1] + Math.sin(0.4) * bufferDeg * 0.72).toFixed(5))],
      [Number((p2[0] - nx).toFixed(5)), Number((p2[1] - ny).toFixed(5))],
      [Number((p1[0] - nx).toFixed(5)), Number((p1[1] - ny).toFixed(5))],
      [Number((p1[0] - Math.cos(0.4) * bufferDeg).toFixed(5)), Number((p1[1] - Math.sin(0.4) * bufferDeg * 0.72).toFixed(5))],
      [Number((p1[0] + nx).toFixed(5)), Number((p1[1] + ny).toFixed(5))]
    ]];
  }

  // Multi-island cluster: expand hull outward along vertex normals with curvature
  const n = hull.length;
  const outerNormals = [];

  for (let i = 0; i < n; i++) {
    const prev = hull[(i - 1 + n) % n];
    const curr = hull[i];
    const next = hull[(i + 1) % n];

    const v1 = [curr[0] - prev[0], curr[1] - prev[1]];
    const v2 = [next[0] - curr[0], next[1] - curr[1]];

    const l1 = Math.hypot(v1[0], v1[1]) || 1;
    const l2 = Math.hypot(v2[0], v2[1]) || 1;

    const n1 = [-v1[1] / l1, v1[0] / l1];
    const n2 = [-v2[1] / l2, v2[0] / l2];

    const avgN = [(n1[0] + n2[0]) / 2, (n1[1] + n2[1]) / 2];
    const avgLen = Math.hypot(avgN[0], avgN[1]) || 1;

    outerNormals.push([
      curr[0] + (avgN[0] / avgLen) * bufferDeg,
      curr[1] + (avgN[1] / avgLen) * (bufferDeg * 0.72)
    ]);
  }

  // Smooth interpolating ring
  const ring = [];
  const m = outerNormals.length;
  const subdivisions = 6;

  for (let i = 0; i < m; i++) {
    const pCurr = outerNormals[i];
    const pNext = outerNormals[(i + 1) % m];

    ring.push([Number(pCurr[0].toFixed(5)), Number(pCurr[1].toFixed(5))]);

    for (let s = 1; s < subdivisions; s++) {
      const t = s / subdivisions;
      const arc = Math.sin(t * Math.PI) * (bufferDeg * 0.10);
      ring.push([
        Number((pCurr[0] + (pNext[0] - pCurr[0]) * t).toFixed(5)),
        Number((pCurr[1] + (pNext[1] - pCurr[1]) * t + arc).toFixed(5))
      ]);
    }
  }
  ring.push(ring[0]); // Close polygon
  return [ring];
}

/**
 * Computes contiguous maritime ocean territories and inter-alliance frontlines from classified islands.
 * 
 * @param {Array<Object>} islandSummaryList - Array of island classification records from classifyIslands
 * @param {Object} options - Configuration options
 * @returns {Object} { oceanBasinsGeoJSON, frontlinesGeoJSON, islandHalosGeoJSON, macroLabelsGeoJSON }
 */
export function computeMaritimeBoundaries(islandSummaryList = [], options = {}) {
  if (!Array.isArray(islandSummaryList) || islandSummaryList.length === 0) {
    return {
      oceanBasinsGeoJSON: { type: 'FeatureCollection', features: [] },
      frontlinesGeoJSON: { type: 'FeatureCollection', features: [] },
      islandHalosGeoJSON: { type: 'FeatureCollection', features: [] },
      macroLabelsGeoJSON: { type: 'FeatureCollection', features: [] }
    };
  }

  const {
    clusterMaxGapDeg = 4.5, // Gap between islands (~12-14 grid units) to form connected maritime basin (1 grid unit = 0.36 deg)
    bufferDeg = 1.05        // Territorial waters radius buffer
  } = options;

  // 1. Group controlled islands by dominant alliance / coalition
  const allianceIslands = new Map();

  islandSummaryList.forEach(isl => {
    if (!isl || isl.status === ISLAND_STATUS.NEUTRAL || isl.dominantAlliance === 'None') return;

    const allyName = isl.dominantAlliance;
    if (!allianceIslands.has(allyName)) {
      allianceIslands.set(allyName, {
        name: allyName,
        color: isl.dominantColor || '#3b82f6',
        islands: []
      });
    }
    allianceIslands.get(allyName).islands.push(isl);
  });

  const basinFeatures = [];
  const labelFeatures = [];
  const islandHaloFeatures = [];

  // 2. Build continuous maritime ocean basins for each alliance
  allianceIslands.forEach(group => {
    const islands = group.islands;
    if (islands.length === 0) return;

    // Cluster neighboring islands within maritime proximity
    const clusters = [];
    const used = new Set();

    for (let i = 0; i < islands.length; i++) {
      if (used.has(i)) continue;

      const cluster = [islands[i]];
      used.add(i);

      for (let j = 0; j < islands.length; j++) {
        if (used.has(j)) continue;

        const candidate = islands[j];
        let isNear = false;
        for (const member of cluster) {
          const dist = Math.hypot(candidate.centerLng - member.centerLng, candidate.centerLat - member.centerLat);
          if (dist <= clusterMaxGapDeg) {
            isNear = true;
            break;
          }
        }

        if (isNear) {
          cluster.push(candidate);
          used.add(j);
        }
      }
      clusters.push(cluster);
    }

    // Generate maritime ocean polygon for each cluster of islands
    clusters.forEach(cluster => {
      const islandPoints = cluster.map(isl => [isl.centerLng, isl.centerLat]);
      const totalTowns = cluster.reduce((sum, isl) => sum + isl.dominantCount, 0);
      const cleanIslandCount = cluster.filter(isl => isl.status === ISLAND_STATUS.CLEAN).length;
      const infiltratedIslandCount = cluster.filter(isl => isl.status === ISLAND_STATUS.INFILTRATED).length;

      const hull = computeConvexHull(islandPoints);
      const coordinates = createMaritimePolygon(hull, bufferDeg);
      if (!coordinates.length || coordinates[0].length < 3) return;

      basinFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates
        },
        properties: {
          allianceName: group.name,
          color: group.color,
          islandCount: cluster.length,
          cleanIslandCount,
          infiltratedIslandCount,
          totalTowns,
          dominantShare: totalTowns > 0 ? cleanIslandCount / cluster.length : 0
        }
      });

      // Macro Label placed at centroid of significant maritime basins (filter out isolated 1-town outpost rocks)
      if (cluster.length >= 2 || totalTowns >= 6) {
        const centerLng = islandPoints.reduce((s, p) => s + p[0], 0) / islandPoints.length;
        const centerLat = islandPoints.reduce((s, p) => s + p[1], 0) / islandPoints.length;

        labelFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [Number(centerLng.toFixed(5)), Number(centerLat.toFixed(5))]
          },
          properties: {
            label: cluster.length > 1
              ? `${group.name} (${cluster.length} isl • ${totalTowns}t)`
              : `${group.name} (${totalTowns} towns)`,
            allianceName: group.name,
            color: group.color,
            islandCount: cluster.length,
            totalTowns
          }
        });
      }
    });
  });

  // 3. Build Island Status Halos (Clean, Infiltrated, Contested, Frontline, Safe Core)
  islandSummaryList.forEach(isl => {
    if (isl.occupiedCount === 0) return;

    let haloColor = isl.dominantColor;
    let strokeColor = '#ffffff';
    let haloType = 'clean';
    let pulseRate = 0;

    if (isl.status === ISLAND_STATUS.CONTESTED) {
      haloColor = '#f59e0b'; // Amber alert center
      strokeColor = '#ef4444'; // Red combat ring
      haloType = 'contested';
      pulseRate = 800;
    } else if (isl.status === ISLAND_STATUS.INFILTRATED) {
      haloColor = '#f59e0b'; // Amber alert
      strokeColor = '#ef4444'; // Red breach border
      haloType = 'infiltrated';
      pulseRate = 1200;
    } else if (isl.isFrontline) {
      haloColor = isl.dominantColor;
      strokeColor = '#f43f5e'; // Combat coral perimeter
      haloType = 'frontline';
      pulseRate = 1400;
    } else if (isl.status === ISLAND_STATUS.CLEAN) {
      haloColor = isl.dominantColor;
      strokeColor = '#10b981'; // Emerald edge for 100% clean safe haven
      haloType = 'clean';
      pulseRate = 0;
    } else {
      haloColor = isl.dominantColor;
      strokeColor = '#64748b';
      haloType = 'standard';
      pulseRate = 0;
    }

    islandHaloFeatures.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [isl.centerLng, isl.centerLat]
      },
      properties: {
        islandKey: isl.islandKey,
        x: isl.x,
        y: isl.y,
        status: isl.status,
        dominantAlliance: isl.dominantAlliance,
        haloColor,
        strokeColor,
        haloType,
        pulseRate,
        isFrontline: Boolean(isl.isFrontline),
        threatLevel: isl.threatLevel || 'NONE',
        frontlineRival: isl.frontlineRival || null,
        dominantCount: isl.dominantCount,
        enemyCount: isl.enemyCount,
        totalSlots: isl.totalSlots,
        dominanceRatio: isl.dominanceRatio
      }
    });
  });

  // 4. Compute Clean Perpendicular Maritime Demarcation Barriers between Opposing Waters
  // Replaces the chaotic midpoint chaining and snaking loops with crisp, non-intersecting naval barriers.
  const frontlineFeatures = [];
  const populatedIslands = islandSummaryList.filter(i => 
    i.occupiedCount > 0 && 
    i.dominantAlliance !== 'None' && 
    i.status !== ISLAND_STATUS.NEUTRAL
  );

  const processedPairs = new Set();

  for (let i = 0; i < populatedIslands.length; i++) {
    for (let j = i + 1; j < populatedIslands.length; j++) {
      const islA = populatedIslands[i];
      const islB = populatedIslands[j];

      if (islA.dominantAlliance === islB.dominantAlliance) continue;

      const dist = Math.hypot(islB.centerLng - islA.centerLng, islB.centerLat - islA.centerLat);

      if (dist <= clusterMaxGapDeg * 1.2) {
        const pairKey = [islA.islandKey, islB.islandKey].sort().join('::');
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const midLng = (islA.centerLng + islB.centerLng) / 2;
        const midLat = (islA.centerLat + islB.centerLat) / 2;

        const dx = islB.centerLng - islA.centerLng;
        const dy = islB.centerLat - islA.centerLat;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;

        const tension = Math.min(1.0, 0.4 + (1.0 - dist / (clusterMaxGapDeg * 1.2)) * 0.6);
        const barrierSpan = Math.min(0.55, Math.max(0.20, dist * 0.28));

        const p1 = [
          Number((midLng - nx * barrierSpan).toFixed(5)),
          Number((midLat - ny * barrierSpan * 0.72).toFixed(5))
        ];
        const p2 = [
          Number((midLng + nx * barrierSpan).toFixed(5)),
          Number((midLat + ny * barrierSpan * 0.72).toFixed(5))
        ];

        const aA = islA.dominantAlliance < islB.dominantAlliance ? islA.dominantAlliance : islB.dominantAlliance;
        const aB = islA.dominantAlliance < islB.dominantAlliance ? islB.dominantAlliance : islA.dominantAlliance;

        frontlineFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [p1, p2]
          },
          properties: {
            allianceA: aA,
            allianceB: aB,
            tension: +tension.toFixed(2),
            dist: +dist.toFixed(2),
            isFrontline: true,
            type: 'demarcation_barrier'
          }
        });
      }
    }
  }

  return {
    oceanBasinsGeoJSON: { type: 'FeatureCollection', features: basinFeatures },
    frontlinesGeoJSON: { type: 'FeatureCollection', features: frontlineFeatures },
    islandHalosGeoJSON: { type: 'FeatureCollection', features: islandHaloFeatures },
    macroLabelsGeoJSON: { type: 'FeatureCollection', features: labelFeatures }
  };
}

const maritimeBoundaries = {
  computeMaritimeBoundaries
};

export default maritimeBoundaries;
