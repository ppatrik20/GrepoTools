/**
 * src/lib/map/dominions.js
 * Connected Alliance Territorial Landmasses & Dominions Generator
 * For Macro Zoom Levels (Zoom 2.0 to 5.8)
 */

function computeConvexHull(points) {
  if (points.length <= 2) return points;
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

// Generate organic rounded boundary around hull points
function createOrganicTerritoryRing(hull, bufferDeg = 0.75, numSubdivisions = 6) {
  if (!hull || hull.length === 0) return [];
  
  if (hull.length === 1) {
    const [cx, cy] = hull[0];
    const ring = [];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      ring.push([
        Number((cx + Math.cos(angle) * bufferDeg).toFixed(5)),
        Number((cy + Math.sin(angle) * (bufferDeg * 0.7)).toFixed(5))
      ]);
    }
    return [ring];
  }
  
  if (hull.length === 2) {
    const [p1, p2] = hull;
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * bufferDeg;
    const ny = (dx / len) * (bufferDeg * 0.7);
    
    return [[
      [Number((p1[0] + nx).toFixed(5)), Number((p1[1] + ny).toFixed(5))],
      [Number((p2[0] + nx).toFixed(5)), Number((p2[1] + ny).toFixed(5))],
      [Number((p2[0] + Math.cos(0.3) * bufferDeg).toFixed(5)), Number((p2[1] + Math.sin(0.3) * bufferDeg * 0.7).toFixed(5))],
      [Number((p2[0] - nx).toFixed(5)), Number((p2[1] - ny).toFixed(5))],
      [Number((p1[0] - nx).toFixed(5)), Number((p1[1] - ny).toFixed(5))],
      [Number((p1[0] - Math.cos(0.3) * bufferDeg).toFixed(5)), Number((p1[1] - Math.sin(0.3) * bufferDeg * 0.7).toFixed(5))],
      [Number((p1[0] + nx).toFixed(5)), Number((p1[1] + ny).toFixed(5))]
    ]];
  }

  // Smooth multi-point hull by interpolating outward curved lobes
  const n = hull.length;
  const outerControlPoints = [];

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
    
    outerControlPoints.push([
      curr[0] + (avgN[0] / avgLen) * bufferDeg,
      curr[1] + (avgN[1] / avgLen) * (bufferDeg * 0.7)
    ]);
  }

  // Subdivide and smooth corners using cubic-like midpoint smoothing
  const smoothRing = [];
  const m = outerControlPoints.length;
  for (let i = 0; i < m; i++) {
    const pCurr = outerControlPoints[i];
    const pNext = outerControlPoints[(i + 1) % m];
    
    smoothRing.push([Number(pCurr[0].toFixed(5)), Number(pCurr[1].toFixed(5))]);

    // Subdivide straight segments with gentle natural curvature
    for (let s = 1; s < numSubdivisions; s++) {
      const t = s / numSubdivisions;
      const arcFactor = Math.sin(t * Math.PI) * (bufferDeg * 0.12);
      const ix = pCurr[0] + (pNext[0] - pCurr[0]) * t;
      const iy = pCurr[1] + (pNext[1] - pCurr[1]) * t;
      smoothRing.push([
        Number(ix.toFixed(5)),
        Number((iy + arcFactor).toFixed(5))
      ]);
    }
  }
  smoothRing.push(smoothRing[0]); // Close ring
  return [smoothRing];
}

/**
 * Computes connected alliance dominion polygons for macro zoom.
 * 
 * @param {Array<Object>} towns - Array of town objects or GeoJSON features
 * @param {Array<Object>} topAlliances - Top alliances with colors
 * @param {Object} customColors - User-customized hex colors
 * @returns {Object} GeoJSON FeatureCollection of polygons and label markers
 */
export function computeAllianceDominions(towns = [], topAlliances = [], customColors = {}) {
  if (!Array.isArray(towns) || towns.length === 0) {
    return { 
      polygons: { type: 'FeatureCollection', features: [] },
      labels: { type: 'FeatureCollection', features: [] }
    };
  }

  const allianceMap = new Map();
  (topAlliances || []).forEach(a => {
    if (a && a.name) {
      allianceMap.set(a.name, customColors[a.name] || a.color || '#3b82f6');
    }
  });

  // Group towns by alliance
  const allianceGroups = new Map();

  towns.forEach(t => {
    const raw = t.properties || t;
    const aName = typeof raw.alliance === 'string' ? raw.alliance : raw.alliance?.name;
    if (!aName || aName === 'None' || aName === 'Ghost Town') return;
    
    const color = allianceMap.get(aName);
    if (!color) return; // Focus on top alliances

    let lng, lat;
    if (t.geometry && t.geometry.coordinates) {
      [lng, lat] = t.geometry.coordinates;
    } else {
      const x = Number(raw.islandX ?? raw.x ?? 500);
      const y = Number(raw.islandY ?? raw.y ?? 500);
      lng = (x / 1000) * 360 - 180;
      lat = -((y / 1000) * 180 - 90);
    }

    if (!allianceGroups.has(aName)) {
      allianceGroups.set(aName, {
        name: aName,
        color: color,
        points: []
      });
    }
    allianceGroups.get(aName).points.push([lng, lat]);
  });

  const polygonFeatures = [];
  const labelFeatures = [];

  // Tactical clustering parameters:
  // Points must be within 1.5 degrees (~4-5 tiles) to belong to same local archipelago dominion
  // Maximum cluster diameter is clamped to 3.2 degrees to prevent chaining across multiple oceans!
  const LOCAL_CLUSTER_DIST = 1.5;
  const MAX_CLUSTER_DIAMETER = 3.2;

  allianceGroups.forEach((group, aName) => {
    const points = group.points;
    if (points.length < 3) return;

    const clusters = [];
    const used = new Set();

    for (let i = 0; i < points.length; i++) {
      if (used.has(i)) continue;

      const cluster = [points[i]];
      used.add(i);

      let minLng = points[i][0], maxLng = points[i][0];
      let minLat = points[i][1], maxLat = points[i][1];

      for (let j = 0; j < points.length; j++) {
        if (used.has(j)) continue;

        const candidate = points[j];
        // Check if candidate is near any point in current cluster
        let isNear = false;
        for (const cp of cluster) {
          const dist = Math.hypot(candidate[0] - cp[0], candidate[1] - cp[1]);
          if (dist <= LOCAL_CLUSTER_DIST) {
            isNear = true;
            break;
          }
        }

        if (isNear) {
          // Check that adding candidate does not exceed max cluster diameter
          const nextMinLng = Math.min(minLng, candidate[0]);
          const nextMaxLng = Math.max(maxLng, candidate[0]);
          const nextMinLat = Math.min(minLat, candidate[1]);
          const nextMaxLat = Math.max(maxLat, candidate[1]);

          const spanLng = nextMaxLng - nextMinLng;
          const spanLat = nextMaxLat - nextMinLat;

          if (spanLng <= MAX_CLUSTER_DIAMETER && spanLat <= MAX_CLUSTER_DIAMETER) {
            cluster.push(candidate);
            used.add(j);
            minLng = nextMinLng;
            maxLng = nextMaxLng;
            minLat = nextMinLat;
            maxLat = nextMaxLat;
          }
        }
      }

      // Only make a dominion if the alliance controls >= 3 towns in this local cluster
      if (cluster.length >= 3) {
        clusters.push(cluster);
      }
    }

    // Generate smoothed organic territory landmass for each valid cluster
    clusters.forEach((cluster, cIndex) => {
      const townCount = cluster.length;
      const hull = computeConvexHull(cluster);
      const coordinates = createOrganicTerritoryRing(hull, 0.70);
      if (coordinates.length === 0 || coordinates[0].length < 3) return;

      // Dynamic border thickness based on military presence
      let borderWidth = 2.2;
      if (townCount >= 30) borderWidth = 5.0;
      else if (townCount >= 15) borderWidth = 3.8;
      else if (townCount >= 7) borderWidth = 2.8;

      const centerLng = cluster.reduce((sum, p) => sum + p[0], 0) / cluster.length;
      const centerLat = cluster.reduce((sum, p) => sum + p[1], 0) / cluster.length;

      polygonFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: coordinates
        },
        properties: {
          id: `dominion-${aName}-${cIndex}`,
          alliance: aName,
          color: group.color,
          townCount: townCount,
          borderWidth: borderWidth,
          fillOpacity: 0.18
        }
      });

      // Crest label for significant holdings
      if (townCount >= 4) {
        labelFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [centerLng, centerLat]
          },
          properties: {
            id: `dominion-label-${aName}-${cIndex}`,
            alliance: aName,
            color: group.color,
            townCount: townCount,
            label: `${aName} (${townCount})`
          }
        });
      }
    });
  });

  return {
    polygons: { type: 'FeatureCollection', features: polygonFeatures },
    labels: { type: 'FeatureCollection', features: labelFeatures }
  };
}
