const defs = require('../src/lib/map/island_definitions.json');

console.log('Analysis of All 40 Colonizable Islands:');
for (let type = 1; type <= 60; type++) {
  const def = defs[type];
  if (!def || !def.town_offsets || def.town_offsets.length === 0) continue;

  const boxW = def.width * 128;
  const boxH = def.height * 128;
  const boxCenterX = boxW / 2;
  const boxCenterY = boxH / 2;

  const minX = Math.min(...def.town_offsets.map(t => t.x));
  const maxX = Math.max(...def.town_offsets.map(t => t.x));
  const minY = Math.min(...def.town_offsets.map(t => t.y));
  const maxY = Math.max(...def.town_offsets.map(t => t.y));

  const townCenterX = (minX + maxX) / 2;
  const townCenterY = (minY + maxY) / 2;

  const deltaX = townCenterX - boxCenterX;
  const deltaY = townCenterY - boxCenterY;

  console.log(`Type ${type} (${def.width}x${def.height} tiles = ${boxW}x${boxH}px): ${def.town_offsets.length} towns. BoundingCenter=(${boxCenterX}, ${boxCenterY}), TownCenter=(${townCenterX}, ${townCenterY}), diff=(${deltaX.toFixed(1)}, ${deltaY.toFixed(1)})`);
}
