const { generateGeoJSON } = require('../src/lib/geojson');

async function test() {
  const geo = await generateGeoJSON('hu119');
  console.log('Total features:', geo.features.length);
  const islandTowns = geo.features.filter(f => f.properties.renderType === 'town' && f.properties.islandX === 509 && f.properties.islandY === 497);
  console.log(`Towns on island (509, 497): ${islandTowns.length}`);
  for (const t of islandTowns) {
    console.log(`Slot ${t.properties.islandSlot} (${t.properties.name}): lng=${t.geometry.coordinates[0]}, lat=${t.geometry.coordinates[1]}, dir=${t.properties.dir}`);
  }
  const island = geo.features.find(f => f.properties.renderType === 'island' && f.properties.x === 509 && f.properties.y === 497);
  console.log('Island feature:', island);
}

test().catch(console.error);
