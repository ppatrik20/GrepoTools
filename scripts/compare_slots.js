const fs = require('fs');
const path = require('path');
const extracted = require('../src/lib/map/extracted_slots_from_html.json');
const defs = require('../src/lib/map/island_definitions.json');

// Let's inspect Island Type 7 from the HTML snapshot
console.log('Sample extracted slots for Island Type 7:');
const t7Slots = extracted.filter(s => s.islandType === 7);
console.log(t7Slots.slice(0, 5));

// Check island tile style for this island in grepolis.html
const cheerio = require('cheerio');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'map', 'grepolis.html'), 'utf8');
const $ = cheerio.load(html);

const ix = t7Slots[0].ix;
const iy = t7Slots[0].iy;
const tileStyle = $(`#islandtile_${ix}_${iy}`).attr('style');
console.log(`Islandtile_${ix}_${iy} style:`, tileStyle);

// Print town offsets from island_definitions.json for Type 7
console.log('Type 7 in island_definitions.json:');
console.log({
  width: defs[7].width,
  height: defs[7].height,
  centering_offset_x: defs[7].centering_offset_x,
  centering_offset_y: defs[7].centering_offset_y,
  town0: defs[7].town_offsets[0],
  town1: defs[7].town_offsets[1]
});
