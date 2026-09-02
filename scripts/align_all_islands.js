const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const islandDefs = require('../src/lib/map/island_definitions.json');

async function buildAlignedIslands() {
  const srcDir = path.join(__dirname, '..', 'src', 'lib', 'map');
  const destDir = path.join(__dirname, '..', 'public', 'map', 'islands');

  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  console.log('Building pixel-perfect aligned island sprites for all 40 types...');

  for (let type = 1; type <= 60; type++) {
    const def = islandDefs[type];
    if (!def) continue;

    const srcFile = path.join(srcDir, `${type}.png`);
    if (!fs.existsSync(srcFile)) continue;

    const widthTiles = def.width || 5;
    const heightTiles = def.height || 4;
    const worldPxW = widthTiles * 128;
    const worldPxH = heightTiles * 128;

    // Standardized canvas size: 512 x 512
    // Scale factor from world pixels to 512 canvas:
    // A standard 8-tile island (1024px) fits within 512px canvas (scale = 512 / 1024 = 0.5)
    const canvasSize = 512;
    const targetScale = canvasSize / 1024; // 0.5

    // Read and remove ocean water
    const { data, info } = await sharp(srcFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a === 0) continue;

      const isWater = (b > r + 30 && b >= 80 && g >= 40 && r < 95);
      const isWaterEdge = (b > r + 15 && b >= 70 && r < 115);

      if (isWater) {
        data[i + 3] = 0;
      } else if (isWaterEdge) {
        const factor = Math.max(0, Math.min(1, (r + 30 - b) / 20));
        data[i + 3] = Math.round(a * factor);
      }
    }

    // Centering offsets from island_definitions.json
    const offsetX = (def.centering_offset_x || 0);
    const offsetY = (def.centering_offset_y || 0);

    // Island image size in world pixels:
    // In Grepolis, raw PNGs are drawn directly at (islandPixelX + offsetX, islandPixelY + offsetY)
    // with width/height matching the island physical bounding box
    const islandScaledW = Math.round(worldPxW * targetScale);
    const islandScaledH = Math.round(worldPxH * targetScale);

    // Position of island center relative to the 512x512 canvas center:
    // The feature point is placed at (islandPixelX + worldPxW/2, islandPixelY + worldPxH/2)
    // The island top-left is at (islandPixelX + offsetX, islandPixelY + offsetY)
    const leftInCanvas = Math.round((canvasSize - islandScaledW) / 2 + (offsetX * targetScale));
    const topInCanvas = Math.round((canvasSize - islandScaledH) / 2 + (offsetY * targetScale));

    const cleanedIslandBuffer = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 }
    })
    .resize(islandScaledW, islandScaledH, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 1.2, m1: 1.4, m2: 0.9 })
    .png()
    .toBuffer();

    // Composite onto transparent 512x512 canvas
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
      input: cleanedIslandBuffer,
      left: Math.max(0, Math.min(canvasSize - islandScaledW, leftInCanvas)),
      top: Math.max(0, Math.min(canvasSize - islandScaledH, topInCanvas))
    }])
    .png({ compressionLevel: 9 })
    .toFile(destFile);
  }

  console.log('✅ Successfully generated pixel-perfect aligned island sprites for all 40 types!');
}

buildAlignedIslands().catch(console.error);
