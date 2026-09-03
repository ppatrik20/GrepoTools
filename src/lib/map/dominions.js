/**
 * src/lib/map/dominions.js
 * Connected Alliance Territorial Landmasses & Dominions Generator
 * For Macro Zoom Levels (Zoom 2.0 to 5.5)
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

function expandPolygon(hull, bufferDeg = 0.9, numSmoothSteps = 16) {
  if (!hull || hull.length === 0) return [];
  
  if (hull.length === 1) {
    const [cx, cy] = hull[0];
    const ring = [];
    for (let i = 0; i <= numSmoothSteps; i++) {
      const angle = (i / numSmoothSteps) * Math.PI * 2;
      ring.push([cx + Math.cos(angle) * bufferDeg, cy + Math.sin(angle) * (bufferDeg * 0.75)]);
    }
    return [ring];
  }
  
  if (hull.length === 2) {
    const [p1, p2] = hull;
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * bufferDeg;
    const ny = dx / len * (bufferDeg * 0.75);
    
    return [[
      [p1[0] + nx, p1[1] + ny],
      [p2[0] + nx, p2[1] + ny],
      [p2[0] + Math.cos(0.3) * bufferDeg, p2[1] + Math.sin(0.3) * bufferDeg * 0.75],
      [p2[0] - nx, p2[1] - ny],
      [p1[0] - nx, p1[1] - ny],
      [p1[0] - Math.cos(0.3) * bufferDeg, p1[0] - Math.sin(0.3) * bufferDeg * 0.75],
      [p1[0] + nx, p1[1] + ny]
    ]];
  }

  const ring = [];
  const n = hull.length;
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
    
    ring.push([
      curr[0] + (avgN[0] / avgLen) * bufferDeg,
      curr[1] + (avgN[1] / avgLen) * (bufferDeg * 0.75)
    ]);
  }
  ring.push(ring[0]);
  return [ring];
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

  // Group towns by alliance and cluster by spatial proximity
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

  allianceGroups.forEach((group, aName) => {
    const points = group.points;
    if (points.length < 2) return;

    // Cluster points within distance threshold (~4.5 degrees longitude/latitude)
    const clusters = [];
    const visited = new Set();
    const clusterDistThreshold = 4.5;

    for (let i = 0; i < points.length; i++) {
      if (visited.has(i)) continue;
      const cluster = [points[i]];
      visited.add(i);

      for (let j = i + 1; j < points.length; j++) {
        if (visited.has(j)) continue;
        // Check distance to any point in the cluster
        for (const cp of cluster) {
          const dist = Math.hypot(points[j][0] - cp[0], points[j][1] - cp[1]);
          if (dist < clusterDistThreshold) {
            cluster.push(points[j]);
            visited.add(j);
            break;
          }
        }
      }
      clusters.push(cluster);
    }

    // Generate smoothed territory landmass for each cluster
    clusters.forEach((cluster, cIndex) => {
      const townCount = cluster.length;
      if (townCount < 2) return;

      const hull = computeConvexHull(cluster);
      const coordinates = expandPolygon(hull, 1.2);
      if (coordinates.length === 0 || coordinates[0].length < 3) return;

      // Dynamic border thickness based on town count
      let borderWidth = 2.5;
      if (townCount >= 50) borderWidth = 6.5;
      else if (townCount >= 20) borderWidth = 4.8;
      else if (townCount >= 8) borderWidth = 3.5;

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
          fillOpacity: 0.26
        }
      });

      // Label for significant dominions
      if (townCount >= 3) {
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
            label: `${aName} (${townCount} Cities)`
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
