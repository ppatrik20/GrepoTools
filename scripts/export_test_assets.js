const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function exportTestAssets() {
  const artifactDir = 'C:\\Users\\perfi\\.gemini\\antigravity\\brain\\d137a17b-5926-4b74-9fa8-6aab6336ff3a';
  const publicMapDir = path.join(__dirname, '../public/map');
  const islandsDir = path.join(publicMapDir, 'islands');
  const townsDir = path.join(publicMapDir, 'towns');
  const slotsDir = path.join(publicMapDir, 'slots');

  [publicMapDir, islandsDir, townsDir, slotsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  console.log('🖼️ Processing Island 1 cutout (island_1_upscale_faithful)...');
  const islandInput = path.join(artifactDir, 'island_1_upscale_faithful_1787842926059.jpg');
  
  if (fs.existsSync(islandInput)) {
    const { data, info } = await sharp(islandInput).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
      .toFile(path.join(islandsDir, 'island1.png'));
    console.log('✅ Exported public/map/islands/island1.png');
  }

  // Process Towns
  const townConfigs = [
    { src: 'clean_isolated_town5_metropolis_1787843451809.jpg', dest: 'town_5.png' },
    { src: 'clean_isolated_town3_town_1787843462824.jpg', dest: 'town_3.png' },
    { src: 'clean_isolated_town1_hamlet_1787843472136.jpg', dest: 'town_1.png' }
  ];

  for (const t of townConfigs) {
    const townInput = path.join(artifactDir, t.src);
    if (fs.existsSync(townInput)) {
      console.log(`🏰 Processing ${t.dest}...`);
      const { data, info } = await sharp(townInput).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const threshold = 18;
      for (let i = 0; i < data.length; i += 4) {
        const maxVal = Math.max(data[i], data[i+1], data[i+2]);
        if (maxVal < threshold) {
          data[i + 3] = 0;
        } else if (maxVal < threshold + 20) {
          data[i + 3] = Math.round(((maxVal - threshold) / 20) * 255);
        }
      }
      await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .png()
        .toFile(path.join(townsDir, t.dest));
      console.log(`✅ Exported public/map/towns/${t.dest}`);
    }
  }

  // Also process empty slot
  const slotInput = path.join(artifactDir, 'empty_colony_slot_test_1787842652834.jpg');
  if (fs.existsSync(slotInput)) {
    console.log('⚓ Processing empty colony slot...');
    const { data, info } = await sharp(slotInput).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const threshold = 18;
    for (let i = 0; i < data.length; i += 4) {
      const maxVal = Math.max(data[i], data[i+1], data[i+2]);
      if (maxVal < threshold) {
        data[i + 3] = 0;
      } else if (maxVal < threshold + 20) {
        data[i + 3] = Math.round(((maxVal - threshold) / 20) * 255);
      }
    }
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toFile(path.join(slotsDir, 'empty_slot.png'));
    console.log('✅ Exported public/map/slots/empty_slot.png');
  }

  console.log('🎉 All test assets prepared in public/map/!');
}

exportTestAssets().catch(console.error);
