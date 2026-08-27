const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function processTown2() {
  const artifactDir = 'C:\\Users\\perfi\\.gemini\\antigravity\\brain\\d137a17b-5926-4b74-9fa8-6aab6336ff3a';
  const srcPath = path.join(artifactDir, 'clean_isolated_town2_village_1787847978010.jpg');
  const destPath = path.join(__dirname, '../public/map/towns/town_2.png');

  if (fs.existsSync(srcPath)) {
    const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const threshold = 18;
    for (let i = 0; i < data.length; i += 4) {
      const maxVal = Math.max(data[i], data[i+1], data[i+2]);
      if (maxVal < threshold) {
        data[i + 3] = 0;
      } else if (maxVal < threshold + 25) {
        data[i + 3] = Math.round(((maxVal - threshold) / 25) * 255);
      }
    }
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(destPath);
    console.log('🏰 Successfully created public/map/towns/town_2.png from new Stage 2 Village remaster!');
  }
}

processTown2().catch(console.error);
