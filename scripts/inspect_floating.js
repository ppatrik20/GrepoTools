const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const defs = require('../src/lib/map/island_definitions.json');

async function inspectFloating() {
  const islands = await prisma.island.findMany({ where: { worldId: 'hu119' } });
  const towns = await prisma.town.findMany({ where: { worldId: 'hu119' } });
  
  const townMap = {};
  for (const t of towns) {
    const key = `${t.islandX}_${t.islandY}`;
    if (!townMap[key]) townMap[key] = [];
    townMap[key].push(t);
  }

  console.log('Total islands in DB:', islands.length);
  console.log('Populated island coordinates:', Object.keys(townMap).length);

  // Check types of populated islands
  const popTypes = {};
  const unmappedPopulated = [];
  for (const key of Object.keys(townMap)) {
    const [x, y] = key.split('_').map(Number);
    const isl = islands.find(i => i.x === x && i.y === y);
    if (isl) {
      popTypes[isl.type] = (popTypes[isl.type] || 0) + 1;
      const def = defs[isl.type];
      if (!def || !def.town_offsets || def.town_offsets.length === 0) {
        unmappedPopulated.push(isl);
      }
    }
  }
  console.log('Populated island types count:', Object.keys(popTypes).length);
  console.log('Populated island types breakdown:', popTypes);
  console.log('Populated islands with NO official town_offsets:', unmappedPopulated.length);

  // Check empty slots generation in geojson
  // How many islands have availableTowns > 0 but NO island definition?
  let unmappedWithAvailableTowns = 0;
  for (const isl of islands) {
    const def = defs[isl.type];
    if ((!def || !def.town_offsets || def.town_offsets.length === 0) && isl.availableTowns > 0) {
      unmappedWithAvailableTowns++;
      if (unmappedWithAvailableTowns <= 5) {
        console.log('Sample rock with availableTowns:', { x: isl.x, y: isl.y, type: isl.type, available: isl.availableTowns });
      }
    }
  }
  console.log('Total rock/unmapped islands with availableTowns > 0:', unmappedWithAvailableTowns);
}

inspectFloating().catch(console.error).finally(() => prisma.$disconnect());
