const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const defs = require('../src/lib/map/island_definitions.json');

async function testOffsets() {
  for (let i = 1; i <= 10; i++) {
    const def = defs[i];
    if (!def) continue;
    const imgPath = path.join(__dirname, '..', 'src', 'lib', 'map', `${i}.png`);
    if (!fs.existsSync(imgPath)) continue;
    const meta = await sharp(imgPath).metadata();
    console.log(`Island Type ${i}: width_tiles=${def.width} (${def.width*128}px), height_tiles=${def.height} (${def.height*128}px)`);
    console.log(`  Raw PNG size: ${meta.width}x${meta.height}`);
    console.log(`  centering_offset: x=${def.centering_offset_x}, y=${def.centering_offset_y}`);
    console.log(`  Town slot 0 offset: x=${def.town_offsets[0].x}, y=${def.town_offsets[0].y}`);
  }
}

testOffsets();
