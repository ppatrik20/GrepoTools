/**
 * trace_town_outlines.js
 *
 * Offline build script that extracts high-fidelity vector polygon outlines
 * and architectural contours from Grepolis town sprites and generates
 * crisp, outlined, dynamic SVG town icons for the World Map.
 *
 * Stages:
 *  - Stage 1: Hamlet (175 - 599 pts)
 *  - Stage 2: Village (600 - 2,399 pts)
 *  - Stage 3: Town (2,400 - 5,499 pts)
 *  - Stage 4: City (5,500 - 9,999 pts)
 *  - Stage 5: Metropolis (10,000+ pts)
 *  - Ghost: Ruined / Abandoned Acropolis
 *  - Slot: Empty Colonization Foundation
 *
 * Outputs:
 *  - src/lib/map/town_outlines.json
 *  - public/map/towns/town_1.svg
 *  - public/map/towns/town_2.svg
 *  - public/map/towns/town_3.svg
 *  - public/map/towns/town_4.svg
 *  - public/map/towns/town_5.svg
 *  - public/map/towns/town_ghost.svg
 *  - public/map/slots/empty_slot.svg
 *  - matching high-resolution PNG assets
 *
 * Usage: node scripts/trace_town_outlines.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// ─── Configuration ───────────────────────────────────────────────

const ALPHA_THRESHOLD = 35;
const SIMPLIFY_EPSILON = 0.95;
const SMOOTH_WINDOW = 3;
const MIN_BOUNDARY_POINTS = 8;

// ─── Image Processing & Tracing Helpers ──────────────────────────

function isolateLargestComponent(mask, width, height) {
  const visited = new Uint8Array(width * height);
  const labelMap = new Int32Array(width * height);
  let currentLabel = 1;
  let bestLabel = 0, bestSize = 0;
  const queue = [];

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1 && !visited[i]) {
      queue.push(i);
      visited[i] = 1;
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

function erodeMask(mask, width, height, radius) {
  let current = new Uint8Array(mask);
  for (let step = 0; step < radius; step++) {
    const next = new Uint8Array(current.length);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (current[idx] !== 1) continue;
        if (
          current[idx - 1] === 1 &&
          current[idx + 1] === 1 &&
          current[idx - width] === 1 &&
          current[idx + width] === 1
        ) {
          next[idx] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

function smoothPoints(points, windowSize = 3) {
  const n = points.length;
  if (n < windowSize * 2) return points;
  const smoothed = [];
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < n; i++) {
    let sumX = 0, sumY = 0, count = 0;
    for (let j = -half; j <= half; j++) {
      const idx = (i + j + n) % n;
      sumX += points[idx][0];
      sumY += points[idx][1];
      count++;
    }
    smoothed.push([sumX / count, sumY / count]);
  }
  return smoothed;
}

function pointLineDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function rdp(points, epsilon) {
  if (points.length <= 2) return points;
  let maxDist = 0, maxIdx = 0;
  const first = points[0], last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointLineDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, maxIdx + 1), epsilon);
    const right = rdp(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function simplifyClosedPolygon(points, epsilon) {
  if (points.length < 4) return points;
  let maxD = 0, splitIdx = Math.floor(points.length / 2);
  const p0 = points[0];

  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - p0[0], points[i][1] - p0[1]);
    if (d > maxD) {
      maxD = d;
      splitIdx = i;
    }
  }

  const half1 = points.slice(0, splitIdx + 1);
  const half2 = points.slice(splitIdx).concat([points[0]]);

  const simp1 = rdp(half1, epsilon);
  const simp2 = rdp(half2, epsilon);

  return simp1.slice(0, -1).concat(simp2.slice(0, -1));
}

function roundCoord(val) {
  return Math.round(val * 10000) / 10000;
}

function normalizeAndRound(points, width, height) {
  return points.map(([x, y]) => [
    roundCoord(x / width),
    roundCoord(y / height)
  ]);
}

// ─── SVG Vector Asset Generator ──────────────────────────────────

/**
 * Creates classical Hellenic architectural SVG icons with crisp geometry,
 * solid white fill (for MapLibre SDF icon-color tinting), and true transparent
 * cutouts (alpha = 0) for columns, pediments, doors, arches and battlements.
 */
function generateHellenicTownSvg(stage) {
  let maskContent = '';
  let bodyContent = '';

  if (stage === 1) {
    // Stage 1: Hamlet (rural dwelling, stone base, pitched roof, palisade)
    maskContent = `
    <!-- Door cutout (100% transparent opening) -->
    <path d="M 116,170 Q 128,158 140,170 L 140,224 L 116,224 Z" fill="#000000" />
    <!-- Window cutout -->
    <rect x="84" y="164" width="16" height="18" rx="2" fill="#000000" />
    <!-- Palisade arrow slits -->
    <rect x="46" y="194" width="4" height="14" rx="1" fill="#000000" />
    <rect x="206" y="194" width="4" height="14" rx="1" fill="#000000" />`;

    bodyContent = `
    <!-- Base Foundation & Cottage -->
    <path d="M 60,224 L 196,224 L 196,156 L 128,110 L 60,156 Z" fill="#ffffff" />
    <!-- Thatch/Tile Roof Highlights & Outlines -->
    <polygon points="128,96 52,148 64,152 128,108 192,152 204,148" fill="#ffffff" />
    <rect x="154" y="106" width="16" height="28" rx="2" fill="#ffffff" />
    <!-- Perimeter Palisade Walls -->
    <path d="M 36,224 L 60,224 L 60,188 L 48,180 L 36,188 Z" fill="#ffffff" />
    <path d="M 196,224 L 220,224 L 220,188 L 208,180 L 196,188 Z" fill="#ffffff" />`;
  } else if (stage === 2) {
    // Stage 2: Village (fortified estate, watchtower, battlements, stone houses)
    maskContent = `
    <!-- Fortified Gate Archway -->
    <path d="M 96,172 Q 112,158 128,172 L 128,224 L 96,224 Z" fill="#000000" />
    <!-- Watchtower Arrow Slit -->
    <rect x="152" y="128" width="8" height="22" rx="2" fill="#000000" />
    <!-- Residential Window -->
    <rect x="56" y="184" width="14" height="16" rx="2" fill="#000000" />
    <!-- Wall Embrasure Slit -->
    <rect x="194" y="180" width="8" height="18" rx="1" fill="#000000" />`;

    bodyContent = `
    <!-- Perimeter Wall & Watchtower Base -->
    <path d="M 38,224 L 218,224 L 218,168 L 180,168 L 180,118 L 132,118 L 132,152 L 82,152 L 82,176 L 38,176 Z" fill="#ffffff" />
    <!-- Watchtower Battlements -->
    <path d="M 128,118 L 184,118 L 184,98 L 174,98 L 174,106 L 164,106 L 164,98 L 152,98 L 152,106 L 142,106 L 142,98 L 128,98 Z" fill="#ffffff" />
    <!-- Secondary Building Roof -->
    <polygon points="82,152 32,176 40,180 82,158 132,158 132,152" fill="#ffffff" />
    <!-- Wall Crenellations -->
    <rect x="42" y="170" width="8" height="6" fill="#ffffff" />
    <rect x="60" y="170" width="8" height="6" fill="#ffffff" />
    <rect x="190" y="162" width="8" height="6" fill="#ffffff" />
    <rect x="206" y="162" width="8" height="6" fill="#ffffff" />`;
  } else if (stage === 3) {
    // Stage 3: Town (stone citadel, fortified ramparts, colonnade porch, acropolis tower)
    maskContent = `
    <!-- Colonnade Column Gaps -->
    <rect x="106" y="140" width="6" height="28" fill="#000000" />
    <rect x="120" y="140" width="6" height="28" fill="#000000" />
    <rect x="134" y="140" width="6" height="28" fill="#000000" />
    <rect x="144" y="140" width="6" height="28" fill="#000000" />
    <!-- Main City Arched Gate -->
    <path d="M 48,182 Q 64,168 80,182 L 80,224 L 48,224 Z" fill="#000000" />
    <!-- Citadel Tower Embrasure -->
    <rect x="176" y="116" width="8" height="20" rx="2" fill="#000000" />
    <!-- Lower Rampart Embrasures -->
    <rect x="180" y="178" width="12" height="16" rx="1" fill="#000000" />
    <rect x="204" y="178" width="12" height="16" rx="1" fill="#000000" />`;

    bodyContent = `
    <!-- Tiered Stone Citadel Base -->
    <path d="M 28,224 L 228,224 L 228,162 L 202,162 L 202,104 L 158,104 L 158,136 L 96,136 L 96,168 L 28,168 Z" fill="#ffffff" />
    <!-- Citadel Acropolis Tower Battlements -->
    <path d="M 154,104 L 206,104 L 206,84 L 198,84 L 198,90 L 188,90 L 188,84 L 176,84 L 176,90 L 166,90 L 166,84 L 154,84 Z" fill="#ffffff" />
    <!-- Classical Colonnade Facade (Temple/Council Hall) -->
    <polygon points="96,136 158,136 127,106" fill="#ffffff" />`;
  } else if (stage === 4) {
    // Stage 4: City (classical polis, grand temple with Doric columns, tiered ramparts, towers)
    maskContent = `
    <!-- Pediment Tympanum Relief Cutout -->
    <polygon points="86,74 170,74 128,48" fill="#000000" />
    <!-- Doric Colonnade Column Gaps (6 columns) -->
    <rect x="86" y="82" width="7" height="44" fill="#000000" />
    <rect x="102" y="82" width="7" height="44" fill="#000000" />
    <rect x="118" y="82" width="7" height="44" fill="#000000" />
    <rect x="134" y="82" width="7" height="44" fill="#000000" />
    <rect x="150" y="82" width="7" height="44" fill="#000000" />
    <rect x="166" y="82" width="7" height="44" fill="#000000" />
    <!-- Monumental City Gates with Portcullis -->
    <path d="M 106,174 Q 128,156 150,174 L 150,224 L 106,224 Z" fill="#000000" />
    <!-- Rampart Arrow Slits & Arcades -->
    <rect x="30" y="174" width="6" height="22" rx="1" fill="#000000" />
    <rect x="54" y="174" width="12" height="18" rx="1" fill="#000000" />
    <rect x="190" y="174" width="12" height="18" rx="1" fill="#000000" />
    <rect x="220" y="174" width="6" height="22" rx="1" fill="#000000" />`;

    bodyContent = `
    <!-- Grand Fortress Foundation & Lower Polis -->
    <path d="M 20,224 L 236,224 L 236,156 L 212,156 L 212,102 L 180,102 L 180,78 L 76,78 L 76,102 L 44,102 L 44,156 L 20,156 Z" fill="#ffffff" />
    <!-- Classical Greek Temple Pediment -->
    <polygon points="72,78 184,78 128,44" fill="#ffffff" />
    <!-- Flanking Citadel Guard Towers with Crenellations -->
    <path d="M 40,102 L 76,102 L 76,88 L 70,88 L 70,94 L 62,94 L 62,88 L 54,88 L 54,94 L 46,94 L 46,88 L 40,88 Z" fill="#ffffff" />
    <path d="M 180,102 L 216,102 L 216,88 L 210,88 L 210,94 L 202,94 L 202,88 L 194,88 L 194,94 L 186,94 L 186,88 L 180,88 Z" fill="#ffffff" />`;
  } else if (stage === 5) {
    // Stage 5: Metropolis (Monumental Hellenic Acropolis, Parthenon pediment, 8 columns, sprawling citadel)
    maskContent = `
    <!-- Inner Pediment Tympanum Relief Cutout -->
    <polygon points="74,64 182,64 128,36" fill="#000000" />
    <!-- Monumental Acropolis Colonnade Column Gaps (8 columns) -->
    <rect x="72" y="72" width="6" height="52" fill="#000000" />
    <rect x="86" y="72" width="6" height="52" fill="#000000" />
    <rect x="100" y="72" width="6" height="52" fill="#000000" />
    <rect x="114" y="72" width="6" height="52" fill="#000000" />
    <rect x="136" y="72" width="6" height="52" fill="#000000" />
    <rect x="150" y="72" width="6" height="52" fill="#000000" />
    <rect x="164" y="72" width="6" height="52" fill="#000000" />
    <rect x="178" y="72" width="6" height="52" fill="#000000" />
    <!-- Grand Propylaea / Amphitheatre Arch Gate -->
    <path d="M 102,166 Q 128,144 154,166 L 154,224 L 102,224 Z" fill="#000000" />
    <!-- Monumental Terrace & Archway Arcades -->
    <path d="M 48,168 Q 64,154 80,168 L 80,208 L 48,208 Z" fill="#000000" />
    <path d="M 176,168 Q 192,154 208,168 L 208,208 L 176,208 Z" fill="#000000" />
    <rect x="22" y="168" width="6" height="24" rx="1" fill="#000000" />
    <rect x="228" y="168" width="6" height="24" rx="1" fill="#000000" />`;

    bodyContent = `
    <!-- Grand Acropolis Plateau & Multi-tiered Ramparts -->
    <path d="M 14,224 L 242,224 L 242,150 L 220,150 L 220,92 L 192,92 L 192,68 L 64,68 L 64,92 L 36,92 L 36,150 L 14,150 Z" fill="#ffffff" />
    <!-- Monumental Pediment (Grand Parthenon Acropolis) -->
    <polygon points="58,68 198,68 128,30" fill="#ffffff" />
    <!-- Twin Bastion Citadel Towers -->
    <path d="M 30,92 L 64,92 L 64,78 L 58,78 L 58,84 L 50,84 L 50,78 L 42,78 L 42,84 L 34,84 L 34,78 L 30,78 Z" fill="#ffffff" />
    <path d="M 192,92 L 226,92 L 226,78 L 222,78 L 222,84 L 214,84 L 214,78 L 206,78 L 206,84 L 198,84 L 198,78 L 192,78 Z" fill="#ffffff" />`;
  } else if (stage === 'ghost') {
    // Ghost Town: Ruined Acropolis, fractured pediment, crumbled pillars
    maskContent = `
    <!-- Broken pediment gap -->
    <polygon points="82,96 110,82 144,86 152,96" fill="#000000" />
    <!-- Fallen & Broken Columns -->
    <rect x="78" y="106" width="7" height="36" fill="#000000" />
    <path d="M 96,106 L 104,106 L 104,126 L 110,138 L 96,138 Z" fill="#000000" />
    <rect x="132" y="106" width="7" height="20" fill="#000000" />
    <rect x="150" y="106" width="7" height="44" fill="#000000" />
    <!-- Crumbled Rubble & Breaches in Ramparts -->
    <path d="M 100,172 L 112,160 L 116,186 L 128,174 L 144,224 L 124,224 L 110,190 L 102,224 L 96,224 Z" fill="#000000" />
    <path d="M 40,180 L 52,172 L 48,200 L 36,200 Z" fill="#000000" />
    <path d="M 184,180 L 196,170 L 208,196 L 180,196 Z" fill="#000000" />`;

    bodyContent = `
    <!-- Fractured Ruined Acropolis Foundation -->
    <path d="M 24,224 L 232,224 L 232,178 L 208,178 L 200,138 L 180,144 L 172,110 L 144,106 L 132,132 L 92,132 L 84,164 L 24,164 Z" fill="#ffffff" />
    <!-- Crumbled Broken Temple Pediment -->
    <path d="M 68,102 L 108,76 L 118,90 L 140,64 L 160,102 Z" fill="#ffffff" />`;
  } else if (stage === 'slot') {
    // Colonization Slot: Ancient Greek circular stone foundation / coastal anchorage ring
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <g fill="#ffffff">
    <!-- Outer stone foundation ring with transparent channel -->
    <path fill-rule="evenodd" d="M 128,44 A 84,84 0 1,0 128,212 A 84,84 0 1,0 128,44 Z M 128,62 A 66,66 0 1,0 128,194 A 66,66 0 1,0 128,62 Z" />
    <!-- Inner stone hub ring with transparent mooring center pool -->
    <path fill-rule="evenodd" d="M 128,90 A 38,38 0 1,0 128,166 A 38,38 0 1,0 128,90 Z M 128,110 A 18,18 0 1,0 128,146 A 18,18 0 1,0 128,110 Z" />
    <!-- Radial cardinal mooring cleats -->
    <rect x="122" y="32" width="12" height="24" rx="3" />
    <rect x="122" y="200" width="12" height="24" rx="3" />
    <rect x="32" y="122" width="24" height="12" rx="3" />
    <rect x="200" y="122" width="24" height="12" rx="3" />
    <!-- Diagonal mooring cleats -->
    <rect x="58" y="58" width="12" height="20" rx="2" transform="rotate(-45 64 68)" />
    <rect x="186" y="58" width="12" height="20" rx="2" transform="rotate(45 192 68)" />
    <rect x="58" y="178" width="12" height="20" rx="2" transform="rotate(45 64 188)" />
    <rect x="186" y="178" width="12" height="20" rx="2" transform="rotate(-45 192 188)" />
  </g>
</svg>
`;
  }

  const maskId = `town-cutout-mask-${stage}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <mask id="${maskId}">
      <rect width="256" height="256" fill="#ffffff" />
${maskContent}
    </mask>
  </defs>
  <g mask="url(#${maskId})">
${bodyContent}
  </g>
</svg>
`;
}

// ─── Main Pipeline ────────────────────────────────────────────────

async function traceAllTowns() {
  const rootDir = path.join(__dirname, '..');
  const publicTownsDir = path.join(rootDir, 'public', 'map', 'towns');
  const publicSlotsDir = path.join(rootDir, 'public', 'map', 'slots');
  const outputJsonPath = path.join(rootDir, 'src', 'lib', 'map', 'town_outlines.json');

  if (!fs.existsSync(publicTownsDir)) fs.mkdirSync(publicTownsDir, { recursive: true });
  if (!fs.existsSync(publicSlotsDir)) fs.mkdirSync(publicSlotsDir, { recursive: true });

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     Town Vector Outline Extraction Pipeline      ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const outlines = {};
  const stats = [];

  // 1. Process Stages 1 through 5
  for (let stage = 1; stage <= 5; stage++) {
    const svgPath = path.join(publicTownsDir, `town_${stage}.svg`);
    const pngDestPath = path.join(publicTownsDir, `town_${stage}.png`);
    const svgContent = generateHellenicTownSvg(stage);
    fs.writeFileSync(svgPath, svgContent, 'utf8');

    // High-resolution rasterization from SVG
    await sharp(Buffer.from(svgContent)).png().toFile(pngDestPath);

    // Extract vector polygons and inner contours
    const { data, info } = await sharp(pngDestPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;

    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) {
      mask[i] = data[i * 4 + 3] > ALPHA_THRESHOLD ? 1 : 0;
    }

    let rawBoundary = traceBoundary(mask, width, height);
    let boundaryPoints = [];
    const contours = [];

    if (rawBoundary.length >= MIN_BOUNDARY_POINTS) {
      rawBoundary = smoothPoints(rawBoundary, SMOOTH_WINDOW);
      const simplified = simplifyClosedPolygon(rawBoundary, SIMPLIFY_EPSILON);
      boundaryPoints = normalizeAndRound(simplified, width, height);

      // Inner contours for architectural elevation and relief
      for (const depth of [6, 14, 22]) {
        const eroded = erodeMask(mask, width, height, depth);
        let cBoundary = traceBoundary(eroded, width, height);
        if (cBoundary.length >= MIN_BOUNDARY_POINTS) {
          cBoundary = smoothPoints(cBoundary, SMOOTH_WINDOW);
          const cSimp = simplifyClosedPolygon(cBoundary, SIMPLIFY_EPSILON * 1.2);
          if (cSimp.length >= MIN_BOUNDARY_POINTS) {
            contours.push(normalizeAndRound(cSimp, width, height));
          }
        }
      }
    }

    outlines[stage] = {
      stage,
      name: ['', 'Hamlet', 'Village', 'Town', 'City', 'Metropolis'][stage],
      exterior: boundaryPoints,
      contours,
      width,
      height
    };

    stats.push({
      stage,
      pts: boundaryPoints.length,
      contours: contours.length,
      svg: `town_${stage}.svg`
    });

    console.log(`  ✓ Town Stage ${stage} [${outlines[stage].name.padEnd(10)}] → ${boundaryPoints.length} outline pts, ${contours.length} inner contour(s)`);
  }

  // 2. Process Ghost Town
  const ghostSvg = generateHellenicTownSvg('ghost');
  const ghostSvgPath = path.join(publicTownsDir, 'town_ghost.svg');
  const ghostPngPath = path.join(publicTownsDir, 'town_ghost.png');
  fs.writeFileSync(ghostSvgPath, ghostSvg, 'utf8');
  await sharp(Buffer.from(ghostSvg)).png().toFile(ghostPngPath);

  const { data: ghostData, info: ghostInfo } = await sharp(ghostPngPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ghostMask = new Uint8Array(ghostInfo.width * ghostInfo.height);
  for (let i = 0; i < ghostMask.length; i++) {
    ghostMask[i] = ghostData[i * 4 + 3] > ALPHA_THRESHOLD ? 1 : 0;
  }

  let ghostRaw = traceBoundary(ghostMask, ghostInfo.width, ghostInfo.height);
  let ghostBoundary = [];
  const ghostContours = [];

  if (ghostRaw.length >= MIN_BOUNDARY_POINTS) {
    ghostRaw = smoothPoints(ghostRaw, SMOOTH_WINDOW);
    const simplified = simplifyClosedPolygon(ghostRaw, SIMPLIFY_EPSILON);
    ghostBoundary = normalizeAndRound(simplified, ghostInfo.width, ghostInfo.height);

    for (const depth of [6, 14]) {
      const eroded = erodeMask(ghostMask, ghostInfo.width, ghostInfo.height, depth);
      let cBoundary = traceBoundary(eroded, ghostInfo.width, ghostInfo.height);
      if (cBoundary.length >= MIN_BOUNDARY_POINTS) {
        cBoundary = smoothPoints(cBoundary, SMOOTH_WINDOW);
        const cSimp = simplifyClosedPolygon(cBoundary, SIMPLIFY_EPSILON * 1.2);
        if (cSimp.length >= MIN_BOUNDARY_POINTS) {
          ghostContours.push(normalizeAndRound(cSimp, ghostInfo.width, ghostInfo.height));
        }
      }
    }
  }

  outlines['ghost'] = {
    stage: 'ghost',
    name: 'Ghost Town',
    exterior: ghostBoundary,
    contours: ghostContours,
    width: 256,
    height: 256
  };
  console.log(`  ✓ Ghost Town      [Ruins     ] → ${ghostBoundary.length} outline pts, ${ghostContours.length} inner contour(s)`);

  // 3. Process Empty Colonization Slot
  const slotSvg = generateHellenicTownSvg('slot');
  const slotSvgPath = path.join(publicSlotsDir, 'empty_slot.svg');
  const slotPngDestPath = path.join(publicSlotsDir, 'empty_slot.png');
  fs.writeFileSync(slotSvgPath, slotSvg, 'utf8');
  await sharp(Buffer.from(slotSvg)).png().toFile(slotPngDestPath);

  const { data: slotData, info: slotInfo } = await sharp(slotPngDestPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const slotMask = new Uint8Array(slotInfo.width * slotInfo.height);
  for (let i = 0; i < slotMask.length; i++) {
    slotMask[i] = slotData[i * 4 + 3] > ALPHA_THRESHOLD ? 1 : 0;
  }

  let slotRaw = traceBoundary(slotMask, slotInfo.width, slotInfo.height);
  let slotExterior = [];
  const slotContours = [];

  if (slotRaw.length >= MIN_BOUNDARY_POINTS) {
    slotRaw = smoothPoints(slotRaw, SMOOTH_WINDOW);
    const simplified = simplifyClosedPolygon(slotRaw, SIMPLIFY_EPSILON);
    slotExterior = normalizeAndRound(simplified, slotInfo.width, slotInfo.height);

    for (const depth of [6, 12]) {
      const eroded = erodeMask(slotMask, slotInfo.width, slotInfo.height, depth);
      let cBoundary = traceBoundary(eroded, slotInfo.width, slotInfo.height);
      if (cBoundary.length >= MIN_BOUNDARY_POINTS) {
        cBoundary = smoothPoints(cBoundary, SMOOTH_WINDOW);
        const cSimp = simplifyClosedPolygon(cBoundary, SIMPLIFY_EPSILON * 1.2);
        if (cSimp.length >= MIN_BOUNDARY_POINTS) {
          slotContours.push(normalizeAndRound(cSimp, slotInfo.width, slotInfo.height));
        }
      }
    }
  }

  outlines['empty_slot'] = {
    stage: 'empty_slot',
    name: 'Colonization Slot',
    exterior: slotExterior,
    contours: slotContours,
    width: 256,
    height: 256
  };
  console.log(`  ✓ Empty Slot      [Anchor    ] → ${slotExterior.length} outline pts, ${slotContours.length} inner contour(s)`);

  // 4. Save JSON file
  fs.writeFileSync(outputJsonPath, JSON.stringify(outlines, null, 2), 'utf8');

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  Pipeline Complete                               ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Saved: src/lib/map/town_outlines.json           ║`);
  console.log(`║  Generated: 7 SVG assets + 7 PNG fallbacks       ║`);
  console.log('╚══════════════════════════════════════════════════╝');
}

traceAllTowns().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
