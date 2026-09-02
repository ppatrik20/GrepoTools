const path = require('path');
const sharp = require('sharp');

async function inspectWater() {
  const filePath = path.join(__dirname, '..', 'src', 'lib', 'map', '2.png');
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const waterColors = {};
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a > 50 && b > r + 30 && b > 100) { // Blue/cyan ocean water
      const key = `${Math.round(r/10)*10},${Math.round(g/10)*10},${Math.round(b/10)*10}`;
      waterColors[key] = (waterColors[key] || 0) + 1;
    }
  }
  console.log('Top ocean water color clusters in 2.png:', Object.entries(waterColors).sort((a,b) => b[1] - a[1]).slice(0, 10));
}

inspectWater().catch(console.error);
