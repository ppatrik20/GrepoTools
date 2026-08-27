const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🚀 Launching visible browser for Grepolis...');
  
  // Launch visible Chromium browser window
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    viewport: null
  });

  const page = await context.newPage();

  const outDir = path.join(__dirname, '..', 'src', 'lib', 'map');

  // Intercept scripts to analyze
  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (url.endsWith('.js') || url.includes('/js/') || url.includes('grepolis')) {
        const text = await response.text();
        if (text.includes('island_type') || text.includes('available_towns') || text.includes('town_spots') || text.includes('farm_towns') || text.includes('island_coordinates')) {
          console.log('🎯 Detected relevant map JS payload from:', url.substring(0, 90) + '...');
          
          const cleanName = 'script_' + Date.now() + '.js';
          fs.writeFileSync(path.join(outDir, cleanName), text, 'utf8');
          console.log(`💾 Saved relevant script to: ${cleanName}`);
        }
      }
    } catch (e) {
      // Ignore
    }
  });

  console.log('🌐 Navigating to https://hu.grepolis.com/ ...');
  await page.goto('https://hu.grepolis.com/', { waitUntil: 'domcontentloaded' });
  console.log('👉 Please log into your Grepolis account and enter a world.');

  // Wait until user enters game
  let inGame = false;
  while (!inGame) {
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    if (currentUrl.includes('/game') || currentUrl.includes('world=')) {
      inGame = true;
      console.log(`🎉 Detected in-game world at: ${currentUrl}`);
    }
  }

  console.log('⏳ Waiting 10s for game assets and map data to load completely...');
  await page.waitForTimeout(10000);

  // Function to inspect and extract map data from browser memory
  async function extractMapMemory() {
    return await page.evaluate(() => {
      const results = {};

      // 1. Check GameData
      if (typeof window.GameData !== 'undefined') {
        results.GameDataKeys = Object.keys(window.GameData);
        for (const key of Object.keys(window.GameData)) {
          try {
            const val = window.GameData[key];
            if (typeof val === 'object' && val !== null) {
              const str = JSON.stringify(val);
              if (str.includes('island') || str.includes('town') || str.includes('slot') || str.includes('spot')) {
                results[`GameData_${key}`] = val;
              }
            }
          } catch(e) {}
        }
      }

      // 2. Check WMap / Map related globals
      if (typeof window.WMap !== 'undefined') {
        results.WMapKeys = Object.keys(window.WMap);
        for (const key of Object.keys(window.WMap)) {
          try {
            const val = window.WMap[key];
            if (typeof val === 'object' && val !== null) {
              results[`WMap_${key}`] = val;
            }
          } catch(e) {}
        }
      }

      // 3. Check GPData
      if (typeof window.GPData !== 'undefined') {
        results.GPData = window.GPData;
      }

      // 4. Scan all window variables
      results.globalCandidates = {};
      for (const k of Object.getOwnPropertyNames(window)) {
        try {
          const item = window[k];
          if (item && typeof item === 'object') {
            if ((item['1'] && (item['1'].towns || item['1'].spots || item['1'].slots)) ||
                (item[1] && (item[1].towns || item[1].spots || item[1].slots))) {
              results.globalCandidates[k] = item;
            }
          }
        } catch(e) {}
      }

      return results;
    });
  }

  console.log('🔍 Extracting game memory structures...');
  const extracted = await extractMapMemory();
  
  const resultPath = path.join(outDir, 'extracted_grepolis_data.json');
  fs.writeFileSync(resultPath, JSON.stringify(extracted, null, 2), 'utf8');
  console.log(`✅ Extracted data saved to: ${resultPath}`);

  console.log('✨ Script will keep the browser open for you to play/explore for 5 minutes. Feel free to close when done.');
  await page.waitForTimeout(300000);

  await browser.close();
  console.log('Browser closed.');
})().catch(err => {
  console.error('Browser script error:', err);
});
