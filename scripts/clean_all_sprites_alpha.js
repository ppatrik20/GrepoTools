const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function cleanSprite(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  
  // Sample background color from corners
  const corners = [
    0, // top-left
    (info.width - 1) * 4, // top-right
    (info.width * (info.height - 1)) * 4, // bottom-left
    (info.width * info.height - 1) * 4 // bottom-right
  ];
  
  let bgR = 0, bgG = 0, bgB = 0;
  for (const c of corners) {
    bgR += data[c];
    bgG += data[c + 1];
    bgB += data[c + 2];
  }
  bgR /= corners.length;
  bgG /= corners.length;
  bgB /= corners.length;

  console.log(`Processing ${path.basename(filePath)}: bg estimated at RGB(${Math.round(bgR)}, ${Math.round(bgG)}, ${Math.round(bgB)})`);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Distance to dark background
    const dist = Math.sqrt(Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2));
    const maxChannel = Math.max(r, g, b);
    
    // If very close to background color or nearly black/dark grey
    if (dist < 22 || maxChannel < 25) {
      data[i + 3] = 0;
    } else if (dist < 38) {
      const alphaFactor = (dist - 22) / 16;
      data[i + 3] = Math.round(data[i + 3] * alphaFactor);
    }
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(filePath);
  console.log(`✅ Cleaned ${path.basename(filePath)}`);
}

async function run() {
  const files = [
    'public/map/slots/empty_slot.png',
    'public/map/towns/town_1.png',
    'public/map/towns/town_2.png',
    'public/map/towns/town_3.png',
    'public/map/towns/town_4.png',
    'public/map/towns/town_5.png'
  ];

  for (const f of files) {
    const full = path.join(__dirname, '..', f);
    if (fs.existsSync(full)) {
      await cleanSprite(full);
    }
  }
}

run().catch(console.error);
