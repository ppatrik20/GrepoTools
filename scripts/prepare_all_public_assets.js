const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function prepareAssets() {
  const mapDir = path.join(__dirname, '../src/lib/map');
  const publicDir = path.join(__dirname, '../public/map');
  const publicIslandsDir = path.join(publicDir, 'islands');
  const publicTownsDir = path.join(publicDir, 'towns');
  const publicSlotsDir = path.join(publicDir, 'slots');

  [publicDir, publicIslandsDir, publicTownsDir, publicSlotsDir].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  // 1. Copy & standardize all island PNGs as island_<type>.png
  const islandFiles = fs.readdirSync(mapDir).filter(f => /^\d+\.png$/.test(f));
  console.log(`🏝️ Found ${islandFiles.length} island files in ${mapDir}`);

  for (const file of islandFiles) {
    const typeNum = parseInt(file);
    const dest = path.join(publicIslandsDir, `island_${typeNum}.png`);
    fs.copyFileSync(path.join(mapDir, file), dest);
  }
  console.log(`✅ Copied all ${islandFiles.length} base island sprites to public/map/islands/`);

  // 2. Put our 4K Remastered Island 1 in place
  const artifactDir = 'C:\\Users\\perfi\\.gemini\\antigravity\\brain\\d137a17b-5926-4b74-9fa8-6aab6336ff3a';
  const island1Remaster = path.join(artifactDir, 'test_island1_transparent.png');
  if (fs.existsSync(island1Remaster)) {
    fs.copyFileSync(island1Remaster, path.join(publicIslandsDir, 'island_1.png'));
    console.log('🌟 Set 4K Remaster for island_1.png');
  }

  // 3. Ensure town stages 1 through 5 exist in public/map/towns
  const townSourceMap = {
    1: 'clean_isolated_town1_hamlet_1787843472136.jpg',
    2: 'clean_isolated_town1_hamlet_1787843472136.jpg', // fallback to hamlet/village
    3: 'clean_isolated_town3_town_1787843462824.jpg',
    4: 'clean_isolated_town3_town_1787843462824.jpg', // fallback to fortified town
    5: 'clean_isolated_town5_metropolis_1787843451809.jpg'
  };

  for (let stage = 1; stage <= 5; stage++) {
    const srcName = townSourceMap[stage];
    const srcPath = path.join(artifactDir, srcName);
    const destPath = path.join(publicTownsDir, `town_${stage}.png`);

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
        .png()
        .toFile(destPath);
      console.log(`🏰 Created public/map/towns/town_${stage}.png`);
    }
  }

  // 4. Empty slot
  const slotSrc = path.join(artifactDir, 'empty_colony_slot_test_1787842652834.jpg');
  if (fs.existsSync(slotSrc)) {
    const { data, info } = await sharp(slotSrc).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
      .png()
      .toFile(path.join(publicSlotsDir, 'empty_slot.png'));
    console.log('⚓ Created public/map/slots/empty_slot.png');
  }

  console.log('🎉 Assets preparation complete!');
}

prepareAssets().catch(console.error);
