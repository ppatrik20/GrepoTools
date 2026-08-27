const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const defs = require('../src/lib/map/island_definitions.json');

async function find() {
  const towns = await prisma.town.findMany({
    where: { name: { in: ['05. Sanyi', 'Ivar városa', '023 NED', 'catland012', 'The Eagle', 'Lenár 02'] } },
    select: { id: true, name: true, islandX: true, islandY: true, islandSlot: true, points: true }
  });
  console.log('Found towns in DB:', towns);
  if (towns.length > 0) {
    const ix = towns[0].islandX;
    const iy = towns[0].islandY;
    const island = await prisma.island.findFirst({
      where: { worldId: 'hu119', x: ix, y: iy }
    });
    console.log(`Island at (${ix}, ${iy}):`, island);
    if (island) {
      console.log('Island type in definitions:', defs[island.type]);
    }
  }
}

find().finally(() => prisma.$disconnect());
