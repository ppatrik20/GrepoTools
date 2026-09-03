const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const defs = require('../src/lib/map/island_definitions.json');

async function checkAll() {
  const islands = await prisma.island.findMany({ where: { worldId: 'hu119' } });
  const typeCounts = {};
  for (const isl of islands) {
    typeCounts[isl.type] = (typeCounts[isl.type] || 0) + 1;
  }
  console.log('All island types in DB:', typeCounts);
}
checkAll().catch(console.error).finally(() => prisma.$disconnect());
