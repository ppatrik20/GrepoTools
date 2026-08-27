const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const defs = require('../src/lib/map/island_definitions.json');

async function check() {
  const towns = await prisma.town.findMany({
    where: {
      worldId: 'hu119',
      name: { in: ['014 Black Lotus', '010 Dantsu Flame', '009 Kujinlawa Marsh', 'TS4 001 Rhulnos', '02 Prometheus'] }
    }
  });
  console.log('Found towns in Screenshot 4:', towns);
  if (towns.length > 0) {
    const t = towns[0];
    const isl = await prisma.island.findFirst({
      where: { worldId: 'hu119', x: t.islandX, y: t.islandY }
    });
    console.log(`Island at (${t.islandX}, ${t.islandY}):`, isl);
    console.log('Island def:', defs[isl.type]);
  }
}

check().finally(() => prisma.$disconnect());
