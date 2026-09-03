const fs = require('fs');
const path = require('path');

// Test generating alliance dominion landmasses
function computeConvexHull(points) {
  if (points.length <= 2) return points;
  
  // Sort by x, then y
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

// Expand a polygon by a buffer radius to form an organic territorial landmass
function expandPolygon(hull, bufferDeg = 0.8, numSmoothSteps = 16) {
  if (hull.length === 1) {
    const [cx, cy] = hull[0];
    const ring = [];
    for (let i = 0; i <= numSmoothSteps; i++) {
      const angle = (i / numSmoothSteps) * Math.PI * 2;
      ring.push([cx + Math.cos(angle) * bufferDeg, cy + Math.sin(angle) * (bufferDeg * 0.7)]);
    }
    return [ring];
  }
  
  if (hull.length === 2) {
    const [p1, p2] = hull;
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * bufferDeg;
    const ny = dx / len * (bufferDeg * 0.7);
    
    return [[
      [p1[0] + nx, p1[1] + ny],
      [p2[0] + nx, p2[1] + ny],
      [p2[0] + Math.cos(0.25)*bufferDeg, p2[1] + Math.sin(0.25)*bufferDeg*0.7],
      [p2[0] - nx, p2[1] - ny],
      [p1[0] - nx, p1[1] - ny],
      [p1[0] - Math.cos(0.25)*bufferDeg, p1[1] - Math.sin(0.25)*bufferDeg*0.7],
      [p1[0] + nx, p1[1] + ny]
    ]];
  }

  // Multi-point hull: compute outward normal offsets
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
      curr[1] + (avgN[1] / avgLen) * (bufferDeg * 0.7)
    ]);
  }
  ring.push(ring[0]); // close polygon
  return [ring];
}

console.log('Testing hull generation:');
const samplePoints = [[10, 10], [12, 10], [15, 14], [10, 15]];
const hull = computeConvexHull(samplePoints);
console.log('Convex hull points:', hull.length);
const expanded = expandPolygon(hull, 1.0);
console.log('Expanded ring points:', expanded[0].length);
console.log('First point:', expanded[0][0]);
console.log('Last point:', expanded[0][expanded[0].length - 1]);
