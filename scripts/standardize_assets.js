const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const defs = require('../src/lib/map/island_definitions.json');

async function standardizeAssets() {
  const mapDir = path.join(__dirname, '../src/lib/map');
  const publicDir = path.join(__dirname, '../public/map');
  const publicIslandsDir = path.join(publicDir, 'islands');
  const publicTownsDir = path.join(publicDir, 'towns');
  const publicSlotsDir = path.join(publicDir, 'slots');

  [publicDir, publicIslandsDir, publicTownsDir, publicSlotsDir].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  const islandFiles = fs.readdirSync(mapDir).filter(f => /^\d+\.png$/.test(f));
  console.log(`Processing ${islandFiles.length} island images...`);

  for (const file of islandFiles) {
    const typeNum = parseInt(file);
    const srcPath = path.join(mapDir, file);
    const destPath = path.join(publicIslandsDir, `island_${typeNum}.png`);

    // If type 1, use our 4K Remaster
    if (typeNum === 1) {
      const artifactDir = 'C:\\Users\\perfi\\.gemini\\antigravity\\brain\\d137a17b-5926-4b74-9fa8-6aab6336ff3a';
      const island1Remaster = path.join(artifactDir, 'test_island1_transparent.png');
      if (fs.existsSync(island1Remaster)) {
        await sharp(island1Remaster)
          .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toFile(destPath);
        console.log(`🌟 Standardized 4K Remaster for island_1.png (512x512)`);
        continue;
      }
    }

    // Standardize base game island sprite into 512x512 transparent canvas
    await sharp(srcPath)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(destPath);
  }

  // Also make sure town sprites are standardized at 256x256
  const townFiles = [1, 2, 3, 4, 5];
  for (const stage of townFiles) {
    const townPath = path.join(publicTownsDir, `town_${stage}.png`);
    if (fs.existsSync(townPath)) {
      const buf = await sharp(townPath)
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      fs.writeFileSync(townPath, buf);
    }
  }

  // Standardize empty slot
  const slotPath = path.join(publicSlotsDir, 'empty_slot.png');
  if (fs.existsSync(slotPath)) {
    const buf = await sharp(slotPath)
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    fs.writeFileSync(slotPath, buf);
  }

  console.log('✅ All map assets standardized to 512x512 (islands) and 256x256 (towns/slots)!');
}

standardizeAssets().catch(console.error);
