const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function testComposite() {
  const artifactDir = 'C:\\Users\\perfi\\.gemini\\antigravity\\brain\\d137a17b-5926-4b74-9fa8-6aab6336ff3a';
  const islandPath = path.join(artifactDir, 'island_1_upscale_faithful_1787842926059.jpg');
  const town5Path = path.join(artifactDir, 'clean_isolated_town5_metropolis_1787843451809.jpg');

  console.log('🖼️ Reading island image...');
  const island = sharp(islandPath);
  const islandMeta = await island.metadata();

  console.log('🏰 Processing Town 5: removing solid black background...');
  // Read raw pixels of town5 and make black pixels transparent
  const { data, info } = await sharp(town5Path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const threshold = 18; // dark cutoff
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const maxVal = Math.max(r, g, b);
    if (maxVal < threshold) {
      data[i + 3] = 0; // Transparent
    } else if (maxVal < threshold + 25) {
      // Smooth alpha feathering
      data[i + 3] = Math.round(((maxVal - threshold) / 25) * 255);
    }
  }

  // Resize town to realistic slot scale (e.g. 180px wide on a 1024px island)
  const townPngBuffer = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 }
  })
  .resize(190, 190)
  .png()
  .toBuffer();

  const outTownPng = path.join(artifactDir, 'test_town5_isolated_transparent.png');
  fs.writeFileSync(outTownPng, townPngBuffer);
  console.log(`✅ Saved transparent town PNG to: ${outTownPng}`);

  // Also cut out Island 1 background
  console.log('🏝️ Processing Island 1: removing black background...');
  const islandRaw = await sharp(islandPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < islandRaw.data.length; i += 4) {
    const r = islandRaw.data[i];
    const g = islandRaw.data[i + 1];
    const b = islandRaw.data[i + 2];
    const maxVal = Math.max(r, g, b);
    if (maxVal < threshold) {
      islandRaw.data[i + 3] = 0;
    } else if (maxVal < threshold + 20) {
      islandRaw.data[i + 3] = Math.round(((maxVal - threshold) / 20) * 255);
    }
  }

  const islandPngBuffer = await sharp(islandRaw.data, {
    raw: { width: islandMeta.width, height: islandMeta.height, channels: 4 }
  })
  .png()
  .toBuffer();

  const outIslandPng = path.join(artifactDir, 'test_island1_transparent.png');
  fs.writeFileSync(outIslandPng, islandPngBuffer);
  console.log(`✅ Saved transparent island PNG to: ${outIslandPng}`);

  // Now Composite Town onto Island at Slot position (e.g. at upper cove: left 450, top 210)
  console.log('🎨 Compositing Town onto Island...');
  const composited = await sharp(islandPngBuffer)
    .composite([
      {
        input: townPngBuffer,
        left: 450,
        top: 200
      },
      {
        input: townPngBuffer,
        left: 210,
        top: 360
      }
    ])
    .png()
    .toBuffer();

  const outComposite = path.join(artifactDir, 'test_layered_island_with_towns.png');
  fs.writeFileSync(outComposite, composited);
  console.log(`🎉 SUCCESS! Layered test saved to: ${outComposite}`);
}

testComposite().catch(console.error);
