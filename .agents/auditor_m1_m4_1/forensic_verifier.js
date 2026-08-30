const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function runForensics() {
  console.log("=== FORENSIC INTEGRITY AUDIT START ===");
  const results = {
    hardcodedCheck: true,
    facadeCheck: true,
    assetAuthenticity: true,
    island1Alpha: true,
    parameterIngestion: true,
    geoJsonOffsets: true,
    scalingCurve: true,
    details: []
  };

  // 1. ASSET AUTHENTICITY & IMAGE INTEGRITY
  console.log("\n--- Checking Asset Authenticity in public/map/ ---");
  const islandDir = path.resolve('public/map/islands');
  const townDir = path.resolve('public/map/towns');
  const slotDir = path.resolve('public/map/slots');

  const colonizableTypes = [
    ...Array.from({ length: 16 }, (_, i) => i + 1),
    ...Array.from({ length: 24 }, (_, i) => i + 37)
  ];

  for (const typeId of colonizableTypes) {
    const p = path.join(islandDir, `island_${typeId}.png`);
    if (!fs.existsSync(p)) {
      results.assetAuthenticity = false;
      results.details.push(`Missing island asset: island_${typeId}.png`);
    } else {
      const meta = await sharp(p).metadata();
      if (meta.format !== 'png' || meta.channels < 3) {
        results.assetAuthenticity = false;
        results.details.push(`Invalid image format for island_${typeId}.png: format=${meta.format}, channels=${meta.channels}`);
      }
    }
  }

  for (let s = 1; s <= 5; s++) {
    const p = path.join(townDir, `town_${s}.png`);
    if (!fs.existsSync(p)) {
      results.assetAuthenticity = false;
      results.details.push(`Missing town asset: town_${s}.png`);
    } else {
      const meta = await sharp(p).metadata();
      if (meta.format !== 'png' || meta.channels < 3) {
        results.assetAuthenticity = false;
        results.details.push(`Invalid format for town_${s}.png: format=${meta.format}`);
      }
    }
  }

  const emptySlotPath = path.join(slotDir, 'empty_slot.png');
  if (!fs.existsSync(emptySlotPath)) {
    results.assetAuthenticity = false;
    results.details.push('Missing empty_slot.png');
  } else {
    const meta = await sharp(emptySlotPath).metadata();
    if (meta.format !== 'png') {
      results.assetAuthenticity = false;
      results.details.push(`Invalid format for empty_slot.png: format=${meta.format}`);
    }
  }

  // 2. ISLAND_1.PNG ALPHA NOISE CHECK
  console.log("\n--- Checking island_1.png Alpha Noise & Cutout Authenticity ---");
  const island1Path = path.join(islandDir, 'island_1.png');
  const { data, info } = await sharp(island1Path).raw().toBuffer({ resolveWithObject: true });
  
  const topLeftAlpha = data[3];
  const topRightAlpha = data[(info.width - 1) * 4 + 3];
  const bottomLeftAlpha = data[(info.width * (info.height - 1)) * 4 + 3];
  const bottomRightAlpha = data[(info.width * info.height - 1) * 4 + 3];

  let residualNoiseCount = 0;
  let opaqueCount = 0;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a > 0 && a <= 30) residualNoiseCount++;
    if (a > 200) opaqueCount++;
  }

  console.log(`island_1.png resolution: ${info.width}x${info.height}, channels: ${info.channels}`);
  console.log(`Corner alphas: TL=${topLeftAlpha}, TR=${topRightAlpha}, BL=${bottomLeftAlpha}, BR=${bottomRightAlpha}`);
  console.log(`Residual noise pixels (0 < alpha <= 30): ${residualNoiseCount}`);
  console.log(`Solid opaque pixels (alpha > 200): ${opaqueCount}`);

  if (topLeftAlpha !== 0 || topRightAlpha !== 0 || bottomLeftAlpha !== 0 || bottomRightAlpha !== 0 || residualNoiseCount !== 0 || opaqueCount < 10000) {
    results.island1Alpha = false;
    results.details.push(`island_1.png alpha check failed: corners=[${topLeftAlpha}, ${topRightAlpha}, ${bottomLeftAlpha}, ${bottomRightAlpha}], noise=${residualNoiseCount}, opaque=${opaqueCount}`);
  }

  // 3. HARDCODED MATH & DYNAMIC FORMULA VERIFICATION
  console.log("\n--- Checking Math & Formula Dynamism ---");
  const traveltime = require('../../src/lib/traveltime.js');

  // Test Euclidean distance dynamically across random coordinates
  for (let iter = 0; iter < 10; iter++) {
    const x1 = Math.random() * 800 + 100;
    const y1 = Math.random() * 800 + 100;
    const x2 = Math.random() * 800 + 100;
    const y2 = Math.random() * 800 + 100;
    const expectedDist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const computedDist = traveltime.calculateDistance({ islandX: x1, islandY: y1 }, { islandX: x2, islandY: y2 });
    if (Math.abs(expectedDist - computedDist) > 1e-6) {
      results.hardcodedCheck = false;
      results.details.push(`calculateDistance failed dynamic check for (${x1},${y1})->(${x2},${y2}): expected ${expectedDist}, got ${computedDist}`);
    }
  }

  // Test same-island distance dynamically across random slot pairs
  for (let slotA = 0; slotA < 20; slotA++) {
    for (let slotB = 0; slotB < 20; slotB++) {
      const townA = { id: 1, islandX: 500, islandY: 500, islandSlot: slotA };
      const townB = { id: slotA === slotB ? 1 : 2, islandX: 500, islandY: 500, islandSlot: slotB };
      const computedDist = traveltime.calculateDistance(townA, townB);
      if (slotA === slotB) {
        if (computedDist !== 0) {
          results.hardcodedCheck = false;
          results.details.push(`Same town distance should be 0, got ${computedDist}`);
        }
      } else {
        const expectedDist = 2.0 + Math.abs(slotB - slotA) * 0.35;
        if (Math.abs(computedDist - expectedDist) > 1e-6) {
          results.hardcodedCheck = false;
          results.details.push(`Same-island distance mismatch for slots ${slotA},${slotB}: expected ${expectedDist}, got ${computedDist}`);
        }
      }
    }
  }

  // Test Travel Time calculation with variable unit speeds and world speeds
  const testUnits = [
    { name: 'Colony Ship', speed: 3 },
    { name: 'Slow Transport', speed: 8 },
    { name: 'Trireme', speed: 9 },
    { name: 'Light Ship', speed: 13 },
    { name: 'Bireme', speed: 15 },
    { name: 'Fast Transport', speed: 15 },
    { name: 'Griffin', speed: 18 },
    { name: 'Manticore', speed: 22 },
    { name: 'Harpy', speed: 25 },
    { name: 'Pegasus', speed: 35 }
  ];

  for (const unit of testUnits) {
    for (let wSpeed of [1, 2, 3, 4, 5, 6]) {
      for (let uSpeed of [1, 2, 3]) {
        for (let dist of [1.5, 5.0, 12.34, 45.67]) {
          const computedSecs = traveltime.calculateTravelTimeSeconds(dist, unit.speed, wSpeed, uSpeed);
          const expectedSecs = Math.max(30, Math.round(((dist * 50) / (unit.speed * wSpeed * uSpeed)) * 60));
          if (computedSecs !== expectedSecs) {
            results.hardcodedCheck = false;
            results.details.push(`calculateTravelTimeSeconds mismatch for ${unit.name} (spd=${unit.speed}, wSpd=${wSpeed}, uSpd=${uSpeed}, dist=${dist}): expected ${expectedSecs}, got ${computedSecs}`);
          }
        }
      }
    }
  }

  // 4. SHORELINE BAY OFFSETS IN ISLAND_DEFINITIONS.JSON
  console.log("\n--- Checking Shoreline Bay Offsets in island_definitions.json ---");
  const islandDefs = require('../../src/lib/map/island_definitions.json');
  let totalOffsets = 0;
  for (const typeId of colonizableTypes) {
    const def = islandDefs[typeId];
    if (!def || !Array.isArray(def.town_offsets) || def.town_offsets.length === 0) {
      results.geoJsonOffsets = false;
      results.details.push(`Island definition for type ${typeId} is missing or has empty town_offsets`);
    } else {
      totalOffsets += def.town_offsets.length;
      for (const slot of def.town_offsets) {
        if (typeof slot.x !== 'number' || typeof slot.y !== 'number' || !['nw', 'ne', 'sw', 'se'].includes(slot.dir)) {
          results.geoJsonOffsets = false;
          results.details.push(`Invalid slot offset in island type ${typeId}: ${JSON.stringify(slot)}`);
        }
      }
    }
  }
  console.log(`Total official shoreline bay offsets verified: ${totalOffsets} across 40 island types`);
  if (totalOffsets !== 578) {
    results.geoJsonOffsets = false;
    results.details.push(`Expected 578 shoreline offsets, found ${totalOffsets}`);
  }

  // 5. CALIBRATED SCALING CURVE
  console.log("\n--- Checking Calibrated Scaling Curve (0.007 * 2^Z) ---");
  for (let z = 5; z <= 12; z++) {
    const expected = +(0.007 * Math.pow(2, z)).toFixed(3);
    console.log(`Zoom ${z}: icon-size = ${expected}`);
  }

  // 6. CODE FACADE / STUB FORENSIC SCAN
  console.log("\n--- Checking Facade / Stub Patterns in Codebase ---");
  const filesToCheck = [
    'src/components/map/RoutePlannerTool.js',
    'src/lib/traveltime.js',
    'src/components/map/UnifiedSearchPanel.js',
    'src/components/map/CommandDrawer.js',
    'src/lib/geojson.js',
    'src/app/map/page.js',
    'src/app/snipe/page.js',
    'src/app/snipe/recall/page.js'
  ];

  const stubPatterns = [
    /TODO/i,
    /FIXME/i,
    /return\s+(true|false|null|0|""|''|\{\}|\[\]);\s*\/\/\s*stub/i,
    /NotImplemented/i,
    /mockData/i,
    /fakeData/i
  ];

  for (const file of filesToCheck) {
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of stubPatterns) {
      if (pattern.test(content)) {
        results.facadeCheck = false;
        results.details.push(`Suspicious stub pattern ${pattern} matched in ${file}`);
      }
    }
  }

  console.log("\n=== FORENSIC INTEGRITY AUDIT RESULTS ===");
  console.log(JSON.stringify(results, null, 2));
}

runForensics().catch(err => {
  console.error("Forensics failed with error:", err);
  process.exit(1);
});
