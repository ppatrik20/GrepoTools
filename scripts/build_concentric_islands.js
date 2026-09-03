const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const defs = require('../src/lib/map/island_definitions.json');

async function buildPixelPerfectIslands() {
  const srcDir = path.join(__dirname, '..', 'src', 'lib', 'map');
  const destDir = path.join(__dirname, '..', 'public', 'map', 'islands');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const alignmentMetadata = {};
  const canvasSize = 512;
  const canvasCenter = 256;

  console.log('Building mathematically locked island sprites...');

  for (let type = 1; type <= 60; type++) {
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

    // Add 4px margin around landmass
    const cropX = Math.max(0, minX - 4);
    const cropY = Math.max(0, minY - 4);
    const cropW = Math.min(info.width - cropX, (maxX - minX) + 8);
    const cropH = Math.min(info.height - cropY, (maxY - minY) + 8);

    // Step 3: Town bounds in game pixels
    const minTownX = Math.min(...def.town_offsets.map(t => t.x));
    const maxTownX = Math.max(...def.town_offsets.map(t => t.x));
    const minTownY = Math.min(...def.town_offsets.map(t => t.y));
    const maxTownY = Math.max(...def.town_offsets.map(t => t.y));

    const townCenterX = (minTownX + maxTownX) / 2;
    const townCenterY = (minTownY + maxTownY) / 2;
    const townSpanX = maxTownX - minTownX;
    const townSpanY = maxTownY - minTownY;

    // Save alignment metadata for GeoJSON generator
    alignmentMetadata[type] = {
      townCenterX,
      townCenterY,
      townSpanX,
      townSpanY
    };

    // Step 4: True Physical Scaling
    // 1 canvas pixel = 2 game pixels.
    const targetCanvasW = Math.round((townSpanX / 2) * 1.14);
    const targetCanvasH = Math.round((townSpanY / 2) * 1.14);

    const scaleFactor = Math.min(targetCanvasW / cropW, targetCanvasH / cropH);
    const scaledW = Math.max(16, Math.round(cropW * scaleFactor));
    const scaledH = Math.max(16, Math.round(cropH * scaleFactor));

    const croppedBuffer = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 }
    })
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .resize(scaledW, scaledH, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 1.2, m1: 1.4, m2: 0.8 })
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

    // Clamp any faint anti-aliasing / fringe noise on the 512x512 canvas to pure 0
    for (let i = 3; i < finalRaw.data.length; i += 4) {
      if (finalRaw.data[i] <= 30) {
        finalRaw.data[i] = 0;
      }
    }

    const destFile = path.join(destDir, `island_${type}.png`);
    await sharp(finalRaw.data, {
      raw: { width: canvasSize, height: canvasSize, channels: 4 }
    })
    .png({ compressionLevel: 9 })
    .toFile(destFile);
  }

  // Step 5: Solid Rock Island Graphic
  const rockDest = path.join(destDir, 'rock_island.png');
  const rockSvg = `
    <svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="rockShine" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#94a3b8" />
          <stop offset="45%" stop-color="#64748b" />
          <stop offset="85%" stop-color="#334155" />
          <stop offset="100%" stop-color="#1e293b" />
        </radialGradient>
        <radialGradient id="beachSand" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stop-color="#e2d4a8" />
          <stop offset="90%" stop-color="#cbb57a" />
          <stop offset="100%" stop-color="#9a8247" />
        </radialGradient>
      </defs>
      <!-- Underwater reef fringe -->
      <ellipse cx="128" cy="132" rx="75" ry="52" fill="rgba(14, 165, 233, 0.25)" filter="blur(6px)" />
      <!-- Sandy Beach Shelf -->
      <ellipse cx="128" cy="128" rx="68" ry="46" fill="url(#beachSand)" />
      <!-- Rocky Island Core -->
      <path d="M 80,132 Q 88,102 115,90 Q 140,80 162,94 Q 178,108 174,134 Q 160,154 130,156 Q 95,154 80,132 Z" fill="url(#rockShine)" stroke="#1e293b" stroke-width="2" />
      <!-- Mountain Ridges -->
      <path d="M 95,128 L 125,96 L 150,108 L 165,132 M 125,96 L 130,142" stroke="#475569" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.6" />
      <!-- Greenery patches -->
      <ellipse cx="112" cy="118" rx="10" ry="7" fill="#15803d" opacity="0.8" />
      <ellipse cx="142" cy="124" rx="9" ry="6" fill="#166534" opacity="0.75" />
    </svg>
  `;
  const finalRockRaw = await sharp(Buffer.from(rockSvg)).resize(512, 512).raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < finalRockRaw.data.length; i += 4) {
    if (finalRockRaw.data[i] <= 30) finalRockRaw.data[i] = 0;
  }
  await sharp(finalRockRaw.data, {
    raw: { width: 512, height: 512, channels: 4 }
  }).png().toFile(rockDest);

  fs.writeFileSync(
    path.join(__dirname, '..', 'src', 'lib', 'map', 'alignment_metadata.json'),
    JSON.stringify(alignmentMetadata, null, 2)
  );

  console.log('✅ Generated physically proportional island sprites with 100% clean alpha cutouts!');
}

buildPixelPerfectIslands().catch(console.error);
