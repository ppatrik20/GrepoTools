const defs = require('../src/lib/map/island_definitions.json');

console.log('Definitions for types 17 to 36 in island_definitions.json:');
for (let i = 17; i <= 36; i++) {
  console.log(`Type ${i}:`, defs[i]);
}
