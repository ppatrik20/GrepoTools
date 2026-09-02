const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const defs = require('../src/lib/map/island_definitions.json');

async function buildPixelPerfectIslands() {
  const srcDir = path.join(__dirname, '..', 'src', 'lib', 'map');
  const destDir = path.join(__dirname, '..', 'public', 'map', 'islands');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const alignmentMetadata = {};

  for (let type = 1; type <= 60; type++) {
    const def = defs[type];
    if (!def || !def.town_offsets || def.town_offsets.length === 0) continue;

    const srcFile = path.join(srcDir, `${type}.png`);
    if (!fs.existsSync(srcFile)) continue;

    const { data, info } = await sharp(srcFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    // Step 1: Remove cyan ocean water
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
    }

    // Step 2: Find visual landmass bounding box
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

    // Step 3: Town bounds
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

    // Step 4: Scale cropped landmass to fit 460x460 inside 512x512 canvas
    const canvasSize = 512;
    const targetLandSize = 440; // Leave 36px margin for coastal town models!
    const scaleFactor = Math.min(targetLandSize / cropW, targetLandSize / cropH);
    const scaledW = Math.round(cropW * scaleFactor);
    const scaledH = Math.round(cropH * scaleFactor);

    const croppedBuffer = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 }
    })
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .resize(scaledW, scaledH, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 1.3, m1: 1.5, m2: 0.9 })
    .png()
    .toBuffer();

    const destFile = path.join(destDir, `island_${type}.png`);
    await sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
    .composite([{
      input: croppedBuffer,
      left: Math.round((canvasSize - scaledW) / 2),
      top: Math.round((canvasSize - scaledH) / 2)
    }])
    .png({ compressionLevel: 9 })
    .toFile(destFile);
  }

  // Step 5: Generate solid rock island sprite for uninhabited / rock islands with towns
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
      <ellipse cx="128" cy="132" rx="98" ry="68" fill="rgba(14, 165, 233, 0.25)" filter="blur(6px)" />
      <!-- Sandy Beach Shelf -->
      <ellipse cx="128" cy="128" rx="88" ry="60" fill="url(#beachSand)" />
      <!-- Rocky Island Core -->
      <path d="M 68,135 Q 75,100 110,85 Q 140,75 168,90 Q 192,105 186,138 Q 170,165 132,168 Q 85,165 68,135 Z" fill="url(#rockShine)" stroke="#1e293b" stroke-width="2" />
      <!-- Mountain Ridges -->
      <path d="M 85,130 L 125,92 L 155,105 L 175,135 M 125,92 L 132,150" stroke="#475569" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.6" />
      <!-- Greenery patches -->
      <ellipse cx="108" cy="115" rx="14" ry="9" fill="#15803d" opacity="0.8" />
      <ellipse cx="145" cy="122" rx="12" ry="8" fill="#166534" opacity="0.75" />
    </svg>
  `;
  await sharp(Buffer.from(rockSvg)).resize(512, 512).png().toFile(rockDest);
  console.log('✅ Generated solid rock island sprite: rock_island.png');

  fs.writeFileSync(
    path.join(__dirname, '..', 'src', 'lib', 'map', 'alignment_metadata.json'),
    JSON.stringify(alignmentMetadata, null, 2)
  );

  console.log('✅ Successfully generated concentric aligned island sprites and alignment_metadata.json!');
}

buildPixelPerfectIslands().catch(console.error);
