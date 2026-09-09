/**
 * trace_island_outlines.js
 * 
 * Offline build script that extracts vector polygon outlines from the
 * original Grepolis island PNG sprites. Uses alpha-thresholding,
 * Moore boundary tracing, morphological erosion for inner contours,
 * and Ramer-Douglas-Peucker simplification.
 *
 * Output: src/lib/map/island_outlines.json
 *
 * Usage: node scripts/trace_island_outlines.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const defs = require('../src/lib/map/island_definitions.json');

// ─── Configuration ───────────────────────────────────────────────

const ALPHA_THRESHOLD = 30;              // Min alpha to count as land
const SIMPLIFY_EPSILON = 1.8;            // RDP tolerance in source pixels
const SMOOTH_WINDOW = 5;                 // Moving average window for pre-smoothing
const CONTOUR_EPSILON_FACTOR = 1.4;      // Contour simplification is slightly looser
const MIN_BOUNDARY_POINTS = 8;           // Skip tiny fragments

// Erosion depths for inner contours, scaled per island size category
const CONTOUR_CONFIG = {
  large:  { erosion: [6, 14], minDimPx: 200 },   // Types 1-10, 37-46
  medium: { erosion: [5, 10], minDimPx: 120 },    // Types 13, 16, 47-60
  small:  { erosion: [3],     minDimPx: 60  },     // Types 11-12, 14-15
  rock:   { erosion: [],      minDimPx: 0   }      // Rock island
};


// ─── Ocean Water Removal ─────────────────────────────────────────

function removeOceanWater(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a === 0) continue;

    // Primary ocean water: deep blue (#1f6496 and variants)
    const isWater = (b > r + 28 && b >= 78 && g >= 38 && r < 100);
    // Edge water: lighter transition pixels
    const isWaterEdge = (b > r + 15 && b >= 68 && r < 120);
    // Lighter ocean variants (teal/cyan shallow water near shores)
    const isLightWater = (b > r + 20 && b >= 90 && g >= 60 && g < 180 && r < 140);
    // Very light diamond-edge water (isometric tile boundaries)
    const isDiamondEdge = (b > r + 10 && b >= 100 && g >= 80 && r < 100 && g < 160);

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

      // BFS flood-fill for this component
      const queue = [idx];
      visited[idx] = 1;
      let size = 0;

      while (queue.length > 0) {
        const ci = queue.pop();
        labelMap[ci] = currentLabel;
        size++;

        const cx = ci % width;
        const cy = (ci - cx) / width;

        // 4-connected neighbors
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

  // Build mask with only the largest component
  const result = new Uint8Array(width * height);
  for (let i = 0; i < labelMap.length; i++) {
    if (labelMap[i] === bestLabel) result[i] = 1;
  }
  return result;
}

/**
 * Traces the outer boundary of the largest connected component in a
 * binary mask using the Moore-Neighbor tracing algorithm.
 * Returns an ordered array of [x, y] pixel coordinates.
 */
function traceBoundary(inputMask, width, height) {
  // First, isolate the largest connected component to avoid tracing artifacts
  const mask = isolateLargestComponent(inputMask, width, height);

  // Clockwise 8-connected neighborhood starting from East
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  // Find the topmost-leftmost land pixel in the cleaned mask
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
  // We entered from the west (pixel to left is guaranteed water for topmost-leftmost)
  let backDir = 4; // Direction 4 = West
  const maxIter = width * height * 2;
  let iterations = 0;

  do {
    boundary.push([cx, cy]);

    // Scan neighbors clockwise starting from (backDir + 1) % 8
    let found = false;
    for (let i = 0; i < 8; i++) {
      const d = (backDir + 1 + i) % 8;
      const nx = cx + dx[d];
      const ny = cy + dy[d];

      if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny * width + nx] === 1) {
        backDir = (d + 4) % 8; // Opposite direction becomes new backtrack
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

/**
 * Erodes a binary mask by `radius` pixels using iterative 4-connected
 * peeling. Returns a new mask.
 */
function erodeMask(mask, width, height, radius) {
  let current = new Uint8Array(mask);

  for (let step = 0; step < radius; step++) {
    const next = new Uint8Array(current.length);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (current[idx] !== 1) continue;
        // Keep only if all 4-neighbors are land
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

/**
 * Applies a circular moving-average filter to smooth staircase
 * artifacts from pixel-grid tracing.
 */
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


// ─── Ramer-Douglas-Peucker Simplification ────────────────────────

function perpendicularDist(point, lineStart, lineEnd) {
  const [px, py] = point;
  const [sx, sy] = lineStart;
  const [ex, ey] = lineEnd;

  const dx = ex - sx;
  const dy = ey - sy;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const ddx = px - sx;
    const ddy = py - sy;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }

  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lenSq));
  const projX = sx + t * dx;
  const projY = sy + t * dy;

  const distX = px - projX;
  const distY = py - projY;
  return Math.sqrt(distX * distX + distY * distY);
}

function rdpSimplify(points, epsilon) {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDist(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }

  return [points[0], points[points.length - 1]];
}

/**
 * Simplifies a closed polygon using RDP.
 * Handles the circular nature by unrolling at the point farthest
 * from its predecessor.
 */
function simplifyClosedPolygon(points, epsilon) {
  if (points.length < MIN_BOUNDARY_POINTS) return points;

  // Find the point farthest from its neighbors to use as split point
  let maxDist = 0;
  let splitIdx = 0;
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];
    const d = perpendicularDist(points[i], prev, next);
    if (d > maxDist) {
      maxDist = d;
      splitIdx = i;
    }
  }

  // Rotate so split point is at start and end
  const rotated = [...points.slice(splitIdx), ...points.slice(0, splitIdx), points[splitIdx]];
  const simplified = rdpSimplify(rotated, epsilon);

  // Remove the duplicate closing point
  if (simplified.length > 1 &&
      simplified[0][0] === simplified[simplified.length - 1][0] &&
      simplified[0][1] === simplified[simplified.length - 1][1]) {
    simplified.pop();
  }

  return simplified;
}


// ─── Sub-sampling for very dense boundaries ──────────────────────

/**
 * If the boundary has too many points (>800), uniformly subsample
 * before smoothing/simplification to keep processing fast.
 */
function subsample(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const result = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(points[Math.floor(i * step)]);
  }
  return result;
}


// ─── Rock Island Outline Generator ───────────────────────────────

/**
 * Generates a small procedural irregular polygon for decorative
 * rock islands. Uses the type number as a seed for consistency.
 */
function generateRockOutline(type) {
  // Simple seeded pseudo-random
  function seededRand(seed) {
    let s = seed;
    return () => {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  const rand = seededRand(type * 7919 + 31);
  const numPoints = 8 + Math.floor(rand() * 4); // 8-11 vertices
  const points = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const radius = 0.25 + 0.10 * rand(); // Slight irregularity
    points.push([
      roundCoord(0.5 + radius * Math.cos(angle)),
      roundCoord(0.5 + radius * Math.sin(angle))
    ]);
  }

  return points;
}


// ─── Island Size Classification ──────────────────────────────────

function getIslandSizeCategory(type) {
  // Large: 20-slot islands
  if ((type >= 1 && type <= 10) || (type >= 37 && type <= 46)) return 'large';
  // Medium: 9-13 slot islands
  if (type === 13 || type === 16 || (type >= 47 && type <= 60)) return 'medium';
  // Small: 7-8 slot islands
  if (type >= 11 && type <= 15) return 'small';
  return 'rock';
}


// ─── Coordinate Helpers ──────────────────────────────────────────

function roundCoord(val) {
  return Math.round(val * 10000) / 10000;
}

function normalizeAndRound(points, width, height) {
  return points.map(([x, y]) => [
    roundCoord(x / width),
    roundCoord(y / height)
  ]);
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
  console.log('╚══════════════════════════════════════════════════╝\n');

  // ── Process colonizable islands (types 1-16, 37-60) ──

  for (let type = 1; type <= 60; type++) {
    const def = defs[type];
    if (!def) continue;

    const isColonizable = (type >= 1 && type <= 16) || (type >= 37 && type <= 60);

    // Types 17-36 are decorative rocks - generate procedurally
    if (!isColonizable) {
      outlines[type] = {
        exterior: generateRockOutline(type),
        contours: [],
        width: 1,
        height: 1
      };
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

    // Remove cyan ocean water
    removeOceanWater(data);

    // Create binary mask
    const mask = createBinaryMask(data, info.width, info.height);

    // Count land pixels to verify mask quality
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

    // Subsample if very dense
    boundary = subsample(boundary, 600);

    // Smooth to reduce staircase artifacts
    boundary = smoothPoints(boundary, SMOOTH_WINDOW);

    // Simplify with RDP
    const simplified = simplifyClosedPolygon(boundary, SIMPLIFY_EPSILON);

    // Normalize to [0, 1]
    const exterior = normalizeAndRound(simplified, info.width, info.height);

    // ── Inner contours via erosion ──
    const category = getIslandSizeCategory(type);
    const config = CONTOUR_CONFIG[category];
    const contours = [];

    for (const depth of config.erosion) {
      // Skip if image is too small for this erosion depth
      const minDim = Math.min(info.width, info.height);
      if (depth * 2 >= minDim * 0.6) continue;

      const erodedMask = erodeMask(mask, info.width, info.height, depth);

      // Verify eroded mask has enough land
      let erodedLand = 0;
      for (let i = 0; i < erodedMask.length; i++) if (erodedMask[i]) erodedLand++;
      if (erodedLand < 20) continue;

      let contourBoundary = traceBoundary(erodedMask, info.width, info.height);
      if (contourBoundary.length < MIN_BOUNDARY_POINTS) continue;

      contourBoundary = subsample(contourBoundary, 400);
      contourBoundary = smoothPoints(contourBoundary, SMOOTH_WINDOW);

      const contourSimplified = simplifyClosedPolygon(
        contourBoundary,
        SIMPLIFY_EPSILON * CONTOUR_EPSILON_FACTOR
      );

      if (contourSimplified.length >= MIN_BOUNDARY_POINTS) {
        contours.push(normalizeAndRound(contourSimplified, info.width, info.height));
      }
    }

    let width = def.width;
    let height = def.height;
    if (def.town_offsets && def.town_offsets.length > 0) {
      const maxX = Math.max(...def.town_offsets.map(t => t.x));
      const maxY = Math.max(...def.town_offsets.map(t => t.y));
      if (maxX > width * 128) width = Math.ceil((maxX + 20) / 128);
      if (maxY > height * 128) height = Math.ceil((maxY + 20) / 128);
    }

    outlines[type] = {
      exterior,
      contours,
      width,
      height
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

    process.stdout.write(`  ✓ Type ${String(type).padStart(2)} [${category.padEnd(6)}] | ${info.width}×${info.height} → ${exterior.length} pts`);
    if (contours.length > 0) {
      process.stdout.write(` + ${contours.length} contour(s)`);
    }
    process.stdout.write('\n');
  }

  // ── Process rock island outline ──

  if (fs.existsSync(rockSrc)) {
    const { data, info } = await sharp(rockSrc)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const mask = createBinaryMask(data, info.width, info.height);
    let boundary = traceBoundary(mask, info.width, info.height);

    if (boundary.length >= MIN_BOUNDARY_POINTS) {
      boundary = subsample(boundary, 300);
      boundary = smoothPoints(boundary, SMOOTH_WINDOW);
      const simplified = simplifyClosedPolygon(boundary, SIMPLIFY_EPSILON * 2);
      const exterior = normalizeAndRound(simplified, info.width, info.height);

      outlines['999'] = {
        exterior,
        contours: [],
        width: 4,
        height: 3
      };
      console.log(`  ✓ Rock island → ${exterior.length} pts`);
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
