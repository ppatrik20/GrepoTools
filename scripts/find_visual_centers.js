const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const defs = require('../src/lib/map/island_definitions.json');

async function findVisualIslandCenters() {
  const srcDir = path.join(__dirname, '..', 'src', 'lib', 'map');

  console.log('Calculating visual landmass center vs town center:');

  for (let type = 1; type <= 60; type++) {
    const def = defs[type];
    if (!def || !def.town_offsets || def.town_offsets.length === 0) continue;

    const srcFile = path.join(srcDir, `${type}.png`);
    if (!fs.existsSync(srcFile)) continue;

    const { data, info } = await sharp(srcFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    // Find non-transparent pixel bounds in raw PNG
    let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const idx = (y * info.width + x) * 4;
        const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
        // If not transparent and not ocean water
        const isWater = (b > r + 30 && b >= 80 && g >= 40 && r < 95);
        if (a > 30 && !isWater) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const landW = maxX - minX;
    const landH = maxY - minY;
    const landCenterX = (minX + maxX) / 2;
    const landCenterY = (minY + maxY) / 2;

    // Town bounds
    const minTownX = Math.min(...def.town_offsets.map(t => t.x));
    const maxTownX = Math.max(...def.town_offsets.map(t => t.x));
    const minTownY = Math.min(...def.town_offsets.map(t => t.y));
    const maxTownY = Math.max(...def.town_offsets.map(t => t.y));

    const townSpanX = maxTownX - minTownX;
    const townSpanY = maxTownY - minTownY;

    // Compare scale: townSpanX in game pixels vs landW in raw PNG
    const scaleX = townSpanX / landW;
    const scaleY = townSpanY / landH;

    if (type <= 10) {
      console.log(`Type ${type}: RawPNG=${info.width}x${info.height}, LandBounds=[${minX}..${maxX}, ${minY}..${maxY}] (${landW}x${landH}), TownBounds=[${minTownX}..${maxTownX}, ${minTownY}..${maxTownY}] (${townSpanX}x${townSpanY}), ScaleRatio=(${scaleX.toFixed(2)}, ${scaleY.toFixed(2)})`);
    }
  }
}

findVisualIslandCenters().catch(console.error);
