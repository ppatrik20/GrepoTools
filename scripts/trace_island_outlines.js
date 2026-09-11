/**
 * trace_island_outlines.js
 * 
 * Offline build script that extracts high-fidelity vector polygon outlines
 * from original Grepolis island PNG sprites. Uses alpha-thresholding,
 * Moore boundary tracing, morphological erosion for inner contours,
 * concentric town-slot alignment, and Ramer-Douglas-Peucker simplification.
 *
 * Output: src/lib/map/island_outlines.json
 *
 * Usage: node scripts/trace_island_outlines.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const defs = require('../src/lib/map/island_definitions.json');
const alignmentMeta = require('../src/lib/map/alignment_metadata.json');

// ─── Configuration ───────────────────────────────────────────────

const ALPHA_THRESHOLD = 30;              // Min alpha to count as land
const SIMPLIFY_EPSILON = 0.85;           // RDP tolerance in source pixels (crisp bays, capes, promontories)
const SMOOTH_WINDOW = 3;                 // Moving average window (preserves sharp rocky contours)
const CONTOUR_EPSILON_FACTOR = 1.1;      // Tight contour simplification for crisp elevation rings
const MIN_BOUNDARY_POINTS = 6;           // Skip tiny fragments

// Erosion depths for inner elevation contours, scaled per island category
const CONTOUR_CONFIG = {
  large:  { erosion: [4, 8, 14, 22], minDimPx: 120 },   // Types 1-10, 37-46 (up to 4 contours)
  medium: { erosion: [3, 7, 12],     minDimPx: 70  },   // Types 13, 16, 47-60 (up to 3 contours)
  small:  { erosion: [2, 5],         minDimPx: 35  },   // Types 11-12, 14-15 (up to 2 contours)
  rock:   { erosion: [2],            minDimPx: 20  }    // Rock island
};


// ─── Ocean Water Removal ─────────────────────────────────────────

function removeOceanWater(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a === 0) continue;

    // Primary ocean water: deep blue (#1f6496 and variants)
    const isWater = (b > r + 25 && b >= 75 && g >= 35 && r < 110);
    // Edge water: lighter transition pixels
    const isWaterEdge = (b > r + 15 && b >= 68 && r < 120);
    // Lighter ocean variants (teal/cyan shallow water near shores)
    const isLightWater = (b > r + 20 && b >= 85 && g >= 55 && g < 185 && r < 140);
    // Very light diamond-edge water (isometric tile boundaries)
    const isDiamondEdge = (b > r + 10 && b >= 95 && g >= 75 && r < 105 && g < 165);

    if (isWater || isLightWater) {
      data[i + 3] = 0;
    } else if (isWaterEdge || isDiamondEdge) {
      const factor = Math.max(0, Math.min(1, (r + 28 - b) / 20));
      data[i + 3] = Math.round(a * factor);
    }

    if (data[i + 3] <= ALPHA_THRESHOLD) {
      data[i + 3] = 0;
    }
  }
}


// ─── Binary Mask ─────────────────────────────────────────────────

function createBinaryMask(data, width, height) {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      mask[y * width + x] = data[idx + 3] > ALPHA_THRESHOLD ? 1 : 0;
    }
  }
  return mask;
}


// ─── Moore Boundary Tracing ──────────────────────────────────────

/**
 * Finds connected components in a binary mask via flood-fill and
 * returns a new mask containing only the largest component.
 */
function isolateLargestComponent(mask, width, height) {
  const visited = new Uint8Array(width * height);
  let bestLabel = null;
  let bestSize = 0;
  const labelMap = new Int32Array(width * height).fill(-1);
  let currentLabel = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] !== 1 || visited[idx]) continue;

      const queue = [idx];
      visited[idx] = 1;
      let size = 0;

      while (queue.length > 0) {
        const ci = queue.pop();
        labelMap[ci] = currentLabel;
        size++;

        const cx = ci % width;
        const cy = (ci - cx) / width;

        const neighbors = [
          cy > 0 ? ci - width : -1,
          cy < height - 1 ? ci + width : -1,
          cx > 0 ? ci - 1 : -1,
          cx < width - 1 ? ci + 1 : -1
        ];

        for (const ni of neighbors) {
          if (ni >= 0 && mask[ni] === 1 && !visited[ni]) {
            visited[ni] = 1;
            queue.push(ni);
          }
        }
      }

      if (size > bestSize) {
        bestSize = size;
        bestLabel = currentLabel;
      }
      currentLabel++;
    }
  }

  const result = new Uint8Array(width * height);
  for (let i = 0; i < labelMap.length; i++) {
    if (labelMap[i] === bestLabel) result[i] = 1;
  }
  return result;
}

/**
 * Traces the outer boundary using the Moore-Neighbor tracing algorithm.
 */
function traceBoundary(inputMask, width, height) {
  const mask = isolateLargestComponent(inputMask, width, height);

  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  let startX = -1, startY = -1;
  for (let y = 0; y < height && startX === -1; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 1) {
        startX = x;
        startY = y;
        break;
      }
    }
  }
  if (startX === -1) return [];

  const boundary = [];
  let cx = startX, cy = startY;
  let backDir = 4;
  const maxIter = width * height * 2;
  let iterations = 0;

  do {
    boundary.push([cx, cy]);

    let found = false;
    for (let i = 0; i < 8; i++) {
      const d = (backDir + 1 + i) % 8;
      const nx = cx + dx[d];
      const ny = cy + dy[d];

      if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny * width + nx] === 1) {
        backDir = (d + 4) % 8;
        cx = nx;
        cy = ny;
        found = true;
        break;
      }
    }

    if (!found) break;
    iterations++;
  } while ((cx !== startX || cy !== startY) && iterations < maxIter);

  return boundary;
}


// ─── Morphological Erosion ───────────────────────────────────────

function erodeMask(mask, width, height, radius) {
  let current = new Uint8Array(mask);

  for (let step = 0; step < radius; step++) {
    const next = new Uint8Array(current.length);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (current[idx] !== 1) continue;
        if (current[idx - 1] === 1 &&
            current[idx + 1] === 1 &&
            current[idx - width] === 1 &&
            current[idx + width] === 1) {
          next[idx] = 1;
        }
      }
    }
    current = next;
  }

  return current;
}


// ─── Coordinate Smoothing ────────────────────────────────────────

function smoothPoints(points, windowSize) {
  if (points.length < windowSize) return points;
  const half = Math.floor(windowSize / 2);
  const n = points.length;
  const result = [];

  for (let i = 0; i < n; i++) {
    let sumX = 0, sumY = 0, count = 0;
    for (let j = -half; j <= half; j++) {
      const idx = (i + j + n) % n;
      sumX += points[idx][0];
      sumY += points[idx][1];
      count++;
    }
    result.push([sumX / count, sumY / count]);
  }

  return result;
}


// ─── Polygon Simplification (Ramer-Douglas-Peucker) ──────────────

function perpendicularDistance(p, p1, p2) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const mag = Math.hypot(dx, dy);
  if (mag === 0) return Math.hypot(p[0] - p1[0], p[1] - p1[1]);
  return Math.abs(dy * p[0] - dx * p[1] + p2[0] * p1[1] - p2[1] * p1[0]) / mag;
}

function rdpSimplify(points, epsilon) {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[end]);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }

  return [points[0], points[end]];
}

function simplifyClosedPolygon(points, epsilon) {
  if (points.length <= 4) return points;

  let bestD = 0;
  let splitIdx = Math.floor(points.length / 2);

  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
    if (d > bestD) {
      bestD = d;
      splitIdx = i;
    }
  }

  const half1 = points.slice(0, splitIdx + 1);
  const half2 = points.slice(splitIdx).concat([points[0]]);

  const simp1 = rdpSimplify(half1, epsilon);
  const simp2 = rdpSimplify(half2, epsilon);

  return simp1.slice(0, -1).concat(simp2.slice(0, -1));
}

function subsample(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const result = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(points[Math.floor(i * step)]);
  }
  return result;
}


// ─── Procedural Rock Island Generator ────────────────────────────

function generateRockOutline(type) {
  function seededRand(seed) {
    let s = seed;
    return () => {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  const rand = seededRand(type * 7919 + 31);
  const numPoints = 14 + Math.floor(rand() * 5); // 14-18 vertices for craggy angular detail
  const exterior = [];
  const contour = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const noise = 0.08 * Math.sin(angle * 3) + 0.04 * Math.cos(angle * 5);
    const radius = 0.32 + 0.12 * rand() + noise;
    exterior.push([
      roundCoord(0.5 + radius * Math.cos(angle)),
      roundCoord(0.5 + radius * Math.sin(angle))
    ]);
  }

  // Inner elevation contour (ridge line)
  const contourPoints = 8;
  for (let i = 0; i < contourPoints; i++) {
    const angle = (i / contourPoints) * 2 * Math.PI;
    const radius = 0.15 + 0.05 * rand();
    contour.push([
      roundCoord(0.5 + radius * Math.cos(angle)),
      roundCoord(0.5 + radius * Math.sin(angle))
    ]);
  }

  return { exterior, contours: [contour] };
}


// ─── Island Size Classification ──────────────────────────────────

function getIslandSizeCategory(type) {
  if ((type >= 1 && type <= 10) || (type >= 37 && type <= 46)) return 'large';
  if (type === 13 || type === 16 || (type >= 47 && type <= 60)) return 'medium';
  if (type >= 11 && type <= 15) return 'small';
  return 'rock';
}

function roundCoord(val) {
  return Math.round(val * 10000) / 10000;
}


// ─── Main Processing Pipeline ────────────────────────────────────

async function traceAllIslands() {
  const srcDir = path.join(__dirname, '..', 'src', 'lib', 'map');
  const rockSrc = path.join(__dirname, '..', 'public', 'map', 'islands', 'rock_island.png');
  const outlines = {};

  let processedCount = 0;
  let skippedCount = 0;
  const stats = [];

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     Island Vector Outline Extraction Pipeline    ║');
  console.log('║     High-Fidelity & Concentric Shoreline Alignment║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // ── Process islands (types 1-60) ──

  for (let type = 1; type <= 60; type++) {
    const def = defs[type];
    if (!def) continue;

    const isColonizable = (type >= 1 && type <= 16) || (type >= 37 && type <= 60);

    // Types 17-36 are decorative rocks - generate procedural craggy polygons with contours
    if (!isColonizable) {
      const rockData = generateRockOutline(type);
      outlines[type] = {
        exterior: rockData.exterior,
        contours: rockData.contours,
        width: 1,
        height: 1
      };
      processedCount++;
      continue;
    }

    const srcFile = path.join(srcDir, `${type}.png`);
    if (!fs.existsSync(srcFile)) {
      console.warn(`  ⚠ Source PNG missing for type ${type}: ${srcFile}`);
      skippedCount++;
      continue;
    }

    // Load and process source PNG
    const { data, info } = await sharp(srcFile)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    removeOceanWater(data);
    const mask = createBinaryMask(data, info.width, info.height);

    let landPixels = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) landPixels++;
    const landPercent = ((landPixels / mask.length) * 100).toFixed(1);

    // Trace outer boundary
    let boundary = traceBoundary(mask, info.width, info.height);

    if (boundary.length < MIN_BOUNDARY_POINTS) {
      console.warn(`  ⚠ Type ${type}: boundary too small (${boundary.length} points), skipping`);
      skippedCount++;
      continue;
    }

    // Subsample with higher density limit
    boundary = subsample(boundary, 800);
    boundary = smoothPoints(boundary, SMOOTH_WINDOW);
    const simplified = simplifyClosedPolygon(boundary, SIMPLIFY_EPSILON);

    // ── Inner elevation contours via multi-tier erosion ──
    const category = getIslandSizeCategory(type);
    const config = CONTOUR_CONFIG[category];
    const rawContours = [];

    for (const depth of config.erosion) {
      const minDim = Math.min(info.width, info.height);
      if (depth * 2 >= minDim * 0.7) continue;

      const erodedMask = erodeMask(mask, info.width, info.height, depth);

      let erodedLand = 0;
      for (let i = 0; i < erodedMask.length; i++) if (erodedMask[i]) erodedLand++;
      if (erodedLand < 15) continue;

      let contourBoundary = traceBoundary(erodedMask, info.width, info.height);
      if (contourBoundary.length < MIN_BOUNDARY_POINTS) continue;

      contourBoundary = subsample(contourBoundary, 600);
      contourBoundary = smoothPoints(contourBoundary, SMOOTH_WINDOW);

      const contourSimplified = simplifyClosedPolygon(
        contourBoundary,
        SIMPLIFY_EPSILON * CONTOUR_EPSILON_FACTOR
      );

      if (contourSimplified.length >= MIN_BOUNDARY_POINTS) {
        rawContours.push(contourSimplified);
      }
    }

    // ── Concentric Town Alignment & Scaling ──
    // Find land bounds in raw PNG
    let minPxX = info.width, maxPxX = 0, minPxY = info.height, maxPxY = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (mask[y * info.width + x]) {
          if (x < minPxX) minPxX = x;
          if (x > maxPxX) maxPxX = x;
          if (y < minPxY) minPxY = y;
          if (y > maxPxY) maxPxY = y;
        }
      }
    }

    const rawW = Math.max(1, maxPxX - minPxX + 1);
    const rawH = Math.max(1, maxPxY - minPxY + 1);
    const rawCenterX = (minPxX + maxPxX) / 2;
    const rawCenterY = (minPxY + maxPxY) / 2;

    const townOffsets = def.town_offsets || [];
    let townCenterX = (def.width * 128) / 2;
    let townCenterY = (def.height * 128) / 2;
    let scale = 5.0;

    if (townOffsets.length > 0) {
      const townMinX = Math.min(...townOffsets.map(t => t.x));
      const townMaxX = Math.max(...townOffsets.map(t => t.x));
      const townMinY = Math.min(...townOffsets.map(t => t.y));
      const townMaxY = Math.max(...townOffsets.map(t => t.y));
      const townW = townMaxX - townMinX;
      const townH = townMaxY - townMinY;
      const meta = alignmentMeta[type];
      townCenterX = meta ? meta.townCenterX : (townMinX + townMaxX) / 2;
      townCenterY = meta ? meta.townCenterY : (townMinY + townMaxY) / 2;

      // Scale to fit town perimeter neatly along shoreline with a 24-32px margin
      const scaleX = Math.max((townW + 32) / rawW, 1.0);
      const scaleY = Math.max((townH + 32) / rawH, 1.0);
      scale = Math.max(scaleX, scaleY);
    }

    // Transform points to world tile pixel space centered on townCenter
    const transformPt = ([px, py]) => [
      townCenterX + (px - rawCenterX) * scale,
      townCenterY + (py - rawCenterY) * scale
    ];

    let worldBoundary = simplified.map(transformPt);
    let worldContours = rawContours.map(c => c.map(transformPt));

    // Guard against negative coordinates (shift all if needed)
    const minWx = Math.min(...worldBoundary.map(p => p[0]));
    const minWy = Math.min(...worldBoundary.map(p => p[1]));
    let shiftX = 0, shiftY = 0;
    if (minWx < 10) shiftX = 10 - minWx;
    if (minWy < 10) shiftY = 10 - minWy;

    if (shiftX > 0 || shiftY > 0) {
      worldBoundary = worldBoundary.map(([x, y]) => [x + shiftX, y + shiftY]);
      worldContours = worldContours.map(c => c.map(([x, y]) => [x + shiftX, y + shiftY]));
    }

    // Determine final tile bounding box in 128px units
    const allWorldX = [
      ...worldBoundary.map(p => p[0]),
      ...townOffsets.map(t => t.x + 20)
    ];
    const allWorldY = [
      ...worldBoundary.map(p => p[1]),
      ...townOffsets.map(t => t.y + 20)
    ];

    const maxWx = Math.max(...allWorldX);
    const maxWy = Math.max(...allWorldY);
    const tileW = Math.max(def.width, Math.ceil((maxWx + 15) / 128));
    const tileH = Math.max(def.height, Math.ceil((maxWy + 15) / 128));

    // Normalize to [0, 1] relative to tileW * 128 and tileH * 128
    const exterior = worldBoundary.map(([wx, wy]) => [
      roundCoord(wx / (tileW * 128)),
      roundCoord(wy / (tileH * 128))
    ]);

    const contours = worldContours.map(c => c.map(([wx, wy]) => [
      roundCoord(wx / (tileW * 128)),
      roundCoord(wy / (tileH * 128))
    ]));

    outlines[type] = {
      exterior,
      contours,
      width: tileW,
      height: tileH
    };

    const stat = {
      type,
      category,
      srcSize: `${info.width}×${info.height}`,
      landPercent: `${landPercent}%`,
      rawBoundary: boundary.length,
      simplified: exterior.length,
      contourCount: contours.length,
      contourPoints: contours.map(c => c.length).join('+') || '-'
    };
    stats.push(stat);
    processedCount++;

    process.stdout.write(`  ✓ Type ${String(type).padStart(2)} [${category.padEnd(6)}] | ${exterior.length} pts`);
    if (contours.length > 0) {
      process.stdout.write(` + ${contours.length} contour(s) [${contours.map(c => c.length).join('+')}]`);
    }
    process.stdout.write('\n');
  }

  // ── Process rock island outline (999) ──

  if (fs.existsSync(rockSrc)) {
    const { data, info } = await sharp(rockSrc)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    removeOceanWater(data);
    const mask = createBinaryMask(data, info.width, info.height);
    let boundary = traceBoundary(mask, info.width, info.height);

    if (boundary.length >= MIN_BOUNDARY_POINTS) {
      boundary = subsample(boundary, 400);
      boundary = smoothPoints(boundary, SMOOTH_WINDOW);
      const simplified = simplifyClosedPolygon(boundary, SIMPLIFY_EPSILON);
      const exterior = simplified.map(([x, y]) => [
        roundCoord(x / info.width),
        roundCoord(y / info.height)
      ]);

      // Add 1 inner contour for rock island
      const erodedMask = erodeMask(mask, info.width, info.height, 4);
      let contourBoundary = traceBoundary(erodedMask, info.width, info.height);
      const contours = [];
      if (contourBoundary.length >= MIN_BOUNDARY_POINTS) {
        contourBoundary = smoothPoints(contourBoundary, SMOOTH_WINDOW);
        const simpContour = simplifyClosedPolygon(contourBoundary, SIMPLIFY_EPSILON * 1.2);
        contours.push(simpContour.map(([x, y]) => [
          roundCoord(x / info.width),
          roundCoord(y / info.height)
        ]));
      }

      outlines['999'] = {
        exterior,
        contours,
        width: 4,
        height: 3
      };
      console.log(`  ✓ Rock island (999) → ${exterior.length} pts + ${contours.length} contour(s)`);
    }
  }

  // ── Write output ──

  const outputPath = path.join(srcDir, 'island_outlines.json');
  fs.writeFileSync(outputPath, JSON.stringify(outlines, null, 2));

  // ── Summary ──

  const totalPoints = Object.values(outlines).reduce(
    (sum, o) => sum + o.exterior.length + o.contours.reduce((s, c) => s + c.length, 0), 0
  );
  const fileSizeKB = (Buffer.byteLength(JSON.stringify(outlines)) / 1024).toFixed(1);

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  Results                                        ║`);
  console.log(`╠══════════════════════════════════════════════════╣`);
  console.log(`║  Processed: ${String(processedCount).padStart(3)} island types                    ║`);
  console.log(`║  Skipped:   ${String(skippedCount).padStart(3)}                                   ║`);
  console.log(`║  Total pts: ${String(totalPoints).padStart(5)}                                 ║`);
  console.log(`║  File size: ${fileSizeKB.padStart(6)} KB                              ║`);
  console.log(`║  Output:    ${outputPath.split(path.sep).slice(-3).join('/')}  ║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
}

traceAllIslands().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
