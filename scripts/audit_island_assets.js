const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function audit() {
  const dir = path.join(__dirname, '..', 'src', 'lib', 'map');
  const files = fs.readdirSync(dir).filter(f => /^\d+\.png$/.test(f));
  console.log(`Found ${files.length} island image files in ${dir}`);

  const oceanColorSamples = [];
  for (const f of files) {
    const filePath = path.join(dir, f);
    const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    
    // Check corners
    const corners = [
      0,
      (info.width - 1) * 4,
      (info.width * (info.height - 1)) * 4,
      (info.width * info.height - 1) * 4
    ];
    
    const colors = corners.map(c => [data[c], data[c + 1], data[c + 2], data[c + 3]]);
    oceanColorSamples.push({ file: f, width: info.width, height: info.height, corner0: colors[0] });
  }

  console.log('Sample corner colors from first 10 islands:');
  for (const s of oceanColorSamples.slice(0, 10)) {
    console.log(`Island ${s.file} (${s.width}x${s.height}): RGBA = [${s.corner0.join(', ')}]`);
  }
}

audit().catch(console.error);
