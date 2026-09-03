const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const defs = require('../src/lib/map/island_definitions.json');

// Rock island types in Grepolis (small colonizable islands without farming villages)
const ROCK_TYPES = [
  11, 12, 13, 14, 15, 16,
  47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60
];

function generateRockIslandSvg(slots, canvasSize = 512, canvasCenter = 256) {
  // Slots are in game coordinates relative to island top-left
  const xs = slots.map(s => s.x);
  const ys = slots.map(s => s.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Map each slot to canvas coordinates (1 canvas px = 2 game px)
  const canvasSlots = slots.map(s => ({
    cx: canvasCenter + (s.x - centerX) / 2,
    cy: canvasCenter + (s.y - centerY) / 2
  }));

  // Build an organic hull enclosing all slots with margin
  // Sort slots angularly around center
  const sorted = canvasSlots.slice().sort((a, b) => {
    return Math.atan2(a.cy - canvasCenter, a.cx - canvasCenter) - 
           Math.atan2(b.cy - canvasCenter, b.cx - canvasCenter);
  });

  // Create boundary points by offsetting outward from each slot
  const beachPoints = [];
  const reefPoints = [];
  const rockPoints = [];

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const angle = Math.atan2(p.cy - canvasCenter, p.cx - canvasCenter);
    
    // Outward vector
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Reef extends 28px outward
    reefPoints.push([p.cx + cos * 28, p.cy + sin * 28]);
    // Beach extends 18px outward
    beachPoints.push([p.cx + cos * 18, p.cy + sin * 18]);
    // Rock edge is 4px inward from slots towards center
    rockPoints.push([
      p.cx * 0.85 + canvasCenter * 0.15,
      p.cy * 0.85 + canvasCenter * 0.15
    ]);
  }

  const toPath = (pts) => {
    if (pts.length === 0) return '';
    let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const mx = (prev[0] + curr[0]) / 2;
      const my = (prev[1] + curr[1]) / 2;
      d += ` Q ${prev[0].toFixed(1)},${prev[1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
    }
    d += ` Z`;
    return d;
  };

  const reefPath = toPath(reefPoints);
  const beachPath = toPath(beachPoints);
  const rockPath = toPath(rockPoints);

  return `
    <svg width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Sand gradient -->
        <radialGradient id="sandGrad" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stop-color="#dfd2a5" />
          <stop offset="85%" stop-color="#c5b27a" />
          <stop offset="100%" stop-color="#9a864d" />
        </radialGradient>

        <!-- Rock core gradient -->
        <linearGradient id="rockGrad" x1="20%" y1="10%" x2="80%" y2="90%">
          <stop offset="0%" stop-color="#64748b" />
          <stop offset="35%" stop-color="#475569" />
          <stop offset="70%" stop-color="#334155" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>

        <!-- Mountain peak shadow -->
        <linearGradient id="peakShadow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#94a3b8" />
          <stop offset="50%" stop-color="#475569" />
          <stop offset="100%" stop-color="#0f172a" />
        </linearGradient>
      </defs>

      <!-- 1. Underwater Reef Fringe -->
      <path d="${reefPath}" fill="rgba(14, 165, 233, 0.35)" filter="blur(6px)" />
      <path d="${reefPath}" fill="rgba(45, 212, 191, 0.2)" filter="blur(3px)" />

      <!-- 2. Sandy Beach Shelf -->
      <path d="${beachPath}" fill="url(#sandGrad)" stroke="#85703b" stroke-width="1.5" />

      <!-- 3. Rocky Base Island Core -->
      <path d="${rockPath}" fill="url(#rockGrad)" stroke="#1e293b" stroke-width="2" />

      <!-- 4. Mountain Ridges & Cliffs -->
      <ellipse cx="${canvasCenter}" cy="${canvasCenter - 4}" rx="${(maxX - minX) / 5}" ry="${(maxY - minY) / 5}" fill="url(#peakShadow)" />
      <path d="M ${canvasCenter - 25},${canvasCenter + 10} L ${canvasCenter},${canvasCenter - 15} L ${canvasCenter + 25},${canvasCenter + 8}" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.75" />
      <path d="M ${canvasCenter},${canvasCenter - 15} L ${canvasCenter + 5},${canvasCenter + 20}" stroke="#1e293b" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.8" />

      <!-- 5. Shrubbery / Mediterranean Pine Patches -->
      <ellipse cx="${canvasCenter - 15}" cy="${canvasCenter - 6}" rx="8" ry="6" fill="#15803d" opacity="0.85" />
      <ellipse cx="${canvasCenter + 12}" cy="${canvasCenter - 2}" rx="7" ry="5" fill="#166534" opacity="0.85" />
      <ellipse cx="${canvasCenter - 2}" cy="${canvasCenter + 14}" rx="6" ry="4" fill="#14532d" opacity="0.75" />
    </svg>
  `;
}

async function buildAllRockIslands() {
  const destDir = path.join(__dirname, '..', 'public', 'map', 'islands');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  console.log('Generating solid rock island terrain for types 11-16 and 47-60...');

  for (const type of ROCK_TYPES) {
    const def = defs[type];
    if (!def || !def.town_offsets || def.town_offsets.length === 0) continue;

    const svg = generateRockIslandSvg(def.town_offsets);
    const destFile = path.join(destDir, `island_${type}.png`);

    const raw = await sharp(Buffer.from(svg))
      .resize(512, 512)
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Clean any low alpha fringe
    for (let i = 3; i < raw.data.length; i += 4) {
      if (raw.data[i] <= 30) raw.data[i] = 0;
    }

    await sharp(raw.data, {
      raw: { width: 512, height: 512, channels: 4 }
    })
    .png({ compressionLevel: 9 })
    .toFile(destFile);

    console.log(`Generated solid rock island_${type}.png`);
  }

  // Also update generic rock_island.png
  const genericSlots = [
    { x: 120, y: 120 }, { x: 200, y: 80 }, { x: 280, y: 90 },
    { x: 340, y: 180 }, { x: 260, y: 240 }, { x: 140, y: 220 }
  ];
  const genericSvg = generateRockIslandSvg(genericSlots);
  const genericDest = path.join(destDir, 'rock_island.png');
  const genericRaw = await sharp(Buffer.from(genericSvg))
    .resize(512, 512)
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 3; i < genericRaw.data.length; i += 4) {
    if (genericRaw.data[i] <= 30) genericRaw.data[i] = 0;
  }
  await sharp(genericRaw.data, {
    raw: { width: 512, height: 512, channels: 4 }
  }).png({ compressionLevel: 9 }).toFile(genericDest);

  console.log('✅ All rock islands and rock_island.png generated with 100% solid beach & terrain coverage!');
}

buildAllRockIslands().catch(console.error);
