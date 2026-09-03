const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const defs = require('../src/lib/map/island_definitions.json');

// Only large islands with farming villages
const LARGE_ISLAND_TYPES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  37, 38, 39, 40, 41, 42, 43, 44, 45, 46
];

async function buildLargeIslands() {
  const srcDir = path.join(__dirname, '..', 'src', 'lib', 'map');
  const destDir = path.join(__dirname, '..', 'public', 'map', 'islands');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const canvasSize = 512;
  const canvasCenter = 256;

  console.log('Building tight, non-fusing large island terrain...');

  for (const type of LARGE_ISLAND_TYPES) {
    const def = defs[type];
    if (!def || !def.town_offsets || def.town_offsets.length === 0) continue;

    const srcFile = path.join(srcDir, `${type}.png`);
    if (!fs.existsSync(srcFile)) continue;

    const { data, info } = await sharp(srcFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    // Step 1: Remove cyan ocean water (#1f6496)
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a === 0) continue;
      const isWater = (b > r + 28 && b >= 78 && g >= 38 && r < 100);
      const isWaterEdge = (b > r + 15 && b >= 68 && r < 120);

      if (isWater) {
        data[i + 3] = 0;
      } else if (isWaterEdge) {
        const factor = Math.max(0, Math.min(1, (r + 28 - b) / 20));
        data[i + 3] = Math.round(a * factor);
      }

      if (data[i + 3] <= 30) {
        data[i + 3] = 0;
      }
    }

    // Step 2: Find visual landmass bounding box in raw PNG
    let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const idx = (y * info.width + x) * 4;
        if (data[idx + 3] > 20) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX <= minX || maxY <= minY) {
      minX = 0; maxX = info.width; minY = 0; maxY = info.height;
    }

    const cropX = Math.max(0, minX - 2);
    const cropY = Math.max(0, minY - 2);
    const cropW = Math.min(info.width - cropX, (maxX - minX) + 4);
    const cropH = Math.min(info.height - cropY, (maxY - minY) + 4);

    // Step 3: Town bounds in game pixels
    const minTownX = Math.min(...def.town_offsets.map(t => t.x));
    const maxTownX = Math.max(...def.town_offsets.map(t => t.x));
    const minTownY = Math.min(...def.town_offsets.map(t => t.y));
    const maxTownY = Math.max(...def.town_offsets.map(t => t.y));

    const townSpanX = maxTownX - minTownX;
    const townSpanY = maxTownY - minTownY;

    // Tight 1.03 scale: towns sit right on the shoreline with just 3% beach margin
    // This prevents large adjacent islands from touching or fusing together!
    const targetCanvasW = Math.round((townSpanX / 2) * 1.03);
    const targetCanvasH = Math.round((townSpanY / 2) * 1.03);

    const scaleFactor = Math.min(targetCanvasW / cropW, targetCanvasH / cropH);
    const scaledW = Math.max(16, Math.round(cropW * scaleFactor));
    const scaledH = Math.max(16, Math.round(cropH * scaleFactor));

    const croppedBuffer = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 }
    })
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .resize(scaledW, scaledH, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 1.1, m1: 1.2, m2: 0.8 })
    .png()
    .toBuffer();

    const finalRaw = await sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
    .composite([{
      input: croppedBuffer,
      left: Math.round(canvasCenter - scaledW / 2),
      top: Math.round(canvasCenter - scaledH / 2)
    }])
    .raw()
    .toBuffer({ resolveWithObject: true });

    for (let i = 3; i < finalRaw.data.length; i += 4) {
      if (finalRaw.data[i] <= 30) finalRaw.data[i] = 0;
    }

    const destFile = path.join(destDir, `island_${type}.png`);
    await sharp(finalRaw.data, {
      raw: { width: canvasSize, height: canvasSize, channels: 4 }
    })
    .png({ compressionLevel: 9 })
    .toFile(destFile);
  }

  console.log('✅ Generated non-fusing large island terrain with clean ocean clearance!');
}

buildLargeIslands().catch(console.error);
