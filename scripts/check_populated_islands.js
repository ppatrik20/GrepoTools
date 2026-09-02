const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const defs = require('../src/lib/map/island_definitions.json');

async function checkPopulatedIslands() {
  const towns = await prisma.town.findMany({
    where: { worldId: 'hu119' },
    select: { islandX: true, islandY: true, name: true, points: true, id: true }
  });

  const islandCoordMap = new Map();
  for (const t of towns) {
    const key = `${t.islandX}_${t.islandY}`;
    if (!islandCoordMap.has(key)) islandCoordMap.set(key, []);
    islandCoordMap.get(key).push(t);
  }

  console.log(`Total populated islands in hu119: ${islandCoordMap.size}`);

  const populatedIslands = await prisma.island.findMany({
    where: {
      worldId: 'hu119',
      OR: Array.from(islandCoordMap.keys()).map(k => {
        const [x, y] = k.split('_').map(Number);
        return { x, y };
      })
    }
  });

  const typeCounts = {};
  const missingDefs = [];
  const rockIslandsWithTowns = [];

  for (const isl of populatedIslands) {
    typeCounts[isl.type] = (typeCounts[isl.type] || 0) + 1;
    const def = defs[isl.type];
    if (!def) {
      missingDefs.push(isl);
    } else if (isl.type >= 17 && isl.type <= 36 || isl.type > 60 || def.town_offsets.length === 0) {
      rockIslandsWithTowns.push({
        id: isl.id,
        x: isl.x,
        y: isl.y,
        type: isl.type,
        defImg: def.img,
        townCount: islandCoordMap.get(`${isl.x}_${isl.y}`)?.length
      });
    }
  }

  console.log('Populated island types breakdown:');
  console.log(typeCounts);
  console.log(`Missing definitions: ${missingDefs.length}`);
  console.log(`Rock islands with towns (no official town_offsets): ${rockIslandsWithTowns.length}`);
  if (rockIslandsWithTowns.length > 0) {
    console.log('Sample rock islands with towns:', rockIslandsWithTowns.slice(0, 10));
  }
}

checkPopulatedIslands().finally(() => prisma.$disconnect());
