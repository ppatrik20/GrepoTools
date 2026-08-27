const fs = require('fs');
const cheerio = require('cheerio');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'src', 'lib', 'map', 'grepolis.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const $ = cheerio.load(html);

const islandTiles = {};
$('[id^="islandtile_"]').each((_, el) => {
  const id = $(el).attr('id');
  const parts = id.split('_');
  const ix = parts[1];
  const iy = parts[2];
  const style = $(el).attr('style') || '';
  const leftMatch = style.match(/left:\s*([0-9.]+)px/);
  const topMatch = style.match(/top:\s*([0-9.]+)px/);
  const widthMatch = style.match(/width:\s*([0-9.]+)px/);
  const heightMatch = style.match(/height:\s*([0-9.]+)px/);
  const left = leftMatch ? parseFloat(leftMatch[1]) : 0;
  const top = topMatch ? parseFloat(topMatch[1]) : 0;
  const width = widthMatch ? parseFloat(widthMatch[1]) : 0;
  const height = heightMatch ? parseFloat(heightMatch[1]) : 0;
  const bgMatch = style.match(/(island[0-9]+|uninhabited[0-9]+|rock[0-9]+)\.png/i);
  const img = bgMatch ? bgMatch[0] : '';
  islandTiles[`${ix}_${iy}`] = { ix: +ix, iy: +iy, left, top, width, height, img };
});

const islandInfos = {};
$('[id^="island_"]').each((_, el) => {
  const id = $(el).attr('id');
  const parts = id.split('_');
  if (parts.length === 3) {
    const ix = parts[1];
    const iy = parts[2];
    const cls = $(el).attr('class') || '';
    const typeMatch = cls.match(/islandinfo-([0-9]+)/);
    const islandType = typeMatch ? parseInt(typeMatch[1]) : null;
    islandInfos[`${ix}_${iy}`] = islandType;
  }
});

console.log('Found island tiles on map:', Object.keys(islandTiles).length);
console.log('Found island metadata on map:', Object.keys(islandInfos).length);

const slots = [];
$('a.tile').each((_, el) => {
  const href = $(el).attr('href') || '';
  if (href.startsWith('#')) {
    try {
      const jsonStr = Buffer.from(href.substring(1), 'base64').toString('utf8');
      const data = JSON.parse(jsonStr);
      if (data.ix !== undefined && data.iy !== undefined) {
        const style = $(el).attr('style') || '';
        const leftMatch = style.match(/left:\s*([0-9.]+)px/);
        const topMatch = style.match(/top:\s*([0-9.]+)px/);
        const left = leftMatch ? parseFloat(leftMatch[1]) : 0;
        const top = topMatch ? parseFloat(topMatch[1]) : 0;
        const islandKey = `${data.ix}_${data.iy}`;
        const islandType = islandInfos[islandKey];
        const island = islandTiles[islandKey];
        slots.push({
          ...data,
          islandType,
          slotLeft: left,
          slotTop: top,
          islandLeft: island ? island.left : null,
          islandTop: island ? island.top : null,
          relX: island ? left - island.left : null,
          relY: island ? top - island.top : null
        });
      }
    } catch(e) {}
  }
});

console.log('Total slots extracted from HTML:', slots.length);

const slotsByIslandType = {};
for (const s of slots) {
  if (!s.islandType) continue;
  if (!slotsByIslandType[s.islandType]) slotsByIslandType[s.islandType] = {};
  const slotNr = s.nr !== undefined ? s.nr : s.number_on_island;
  if (slotNr !== undefined && !slotsByIslandType[s.islandType][slotNr]) {
    slotsByIslandType[s.islandType][slotNr] = {
      slot: slotNr,
      relX: s.relX,
      relY: s.relY,
      type: s.tp
    };
  }
}

console.log('\n--- Slots per Island Type in this Snapshot ---');
for (const [type, slotMap] of Object.entries(slotsByIslandType)) {
  const count = Object.keys(slotMap).length;
  console.log(`Island Type ${type}: ${count} slots found`);
}

const outPath = path.join(__dirname, '..', 'src', 'lib', 'map', 'extracted_slots_from_html.json');
fs.writeFileSync(outPath, JSON.stringify({ islandTiles, slotsByIslandType, slots }, null, 2));
console.log(`\nSaved extracted slots to ${outPath}`);
