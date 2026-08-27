const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkNearby() {
  const islands = await prisma.island.findMany({
    where: {
      worldId: 'hu119',
      x: { gte: 506, lte: 512 },
      y: { gte: 494, lte: 500 }
    }
  });
  console.log('Nearby islands:', islands);

  for (const isl of islands) {
    const towns = await prisma.town.findMany({
      where: { worldId: 'hu119', islandX: isl.x, islandY: isl.y },
      select: { id: true, name: true, islandSlot: true, points: true }
    });
    console.log(`Island (${isl.x}, ${isl.y}) type=${isl.type} has ${towns.length} towns:`, towns.map(t => t.name));
  }
}

checkNearby().finally(() => prisma.$disconnect());
