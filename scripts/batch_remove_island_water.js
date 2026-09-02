const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function processIsland(srcFile, destFile) {
  const { data, info } = await sharp(srcFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a === 0) continue;

    // Detect Grepolis cyan ocean water:
    // Ocean water has high Blue, moderate Green, and low Red (B > R + 35, B >= 90)
    const isWater = (b > r + 35 && b >= 85 && g >= 45 && r < 90);
    const isWaterEdge = (b > r + 20 && b >= 75 && r < 110);

    if (isWater) {
      data[i + 3] = 0; // 100% Transparent
    } else if (isWaterEdge) {
      // Smooth alpha feathering at coastline foam
      const factor = Math.max(0, Math.min(1, (r + 35 - b) / 20));
      data[i + 3] = Math.round(a * factor);
    }
  }

  // Create high-res 512x512 standardized asset with Lanczos3 resampling and slight sharpening
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(512, 512, { 
      fit: 'contain', 
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3
    })
    .sharpen({ sigma: 1.0, m1: 1.2, m2: 0.8 })
    .png({ compressionLevel: 9 })
    .toFile(destFile);
}

async function run() {
  const srcDir = path.join(__dirname, '..', 'src', 'lib', 'map');
  const destDir = path.join(__dirname, '..', 'public', 'map', 'islands');
  
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const files = fs.readdirSync(srcDir).filter(f => /^\d+\.png$/.test(f));
  console.log(`Processing ${files.length} islands for background removal...`);

  let count = 0;
  for (const f of files) {
    const typeNum = parseInt(f);
    const srcFile = path.join(srcDir, f);
    const destFile = path.join(destDir, `island_${typeNum}.png`);

    // For island 1, keep our 4K remaster
    if (typeNum === 1 && fs.existsSync(destFile)) {
      console.log(`Skipping island 1 (using 4K Remaster)`);
      continue;
    }

    await processIsland(srcFile, destFile);
    count++;
  }
  console.log(`✅ Successfully processed and cleaned ${count} islands!`);
}

run().catch(console.error);
