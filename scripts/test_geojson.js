const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const islandDefinitions = require('../src/lib/map/island_definitions.json');

const TOWN_DIR_OFFSETS = {
  nw: { x: 9, y: 14 },
  ne: { x: 17, y: 11 },
  sw: { x: 10, y: 13 },
  se: { x: 15, y: 13 }
};
const FREE_SLOT_OFFSET = { x: 18, y: 18 };

const pixelToLng = (px) => (px / 128000) * 360 - 180;
const pixelToLat = (py) => -((py / 128000) * 180 - 90);

function getTownStage(points) {
  if (!points || points < 600) return 1;
  if (points < 2400) return 2;
  if (points < 5500) return 3;
  if (points < 10000) return 4;
  return 5;
}

async function run() {
  const worldId = 'hu119';
  console.time('GeoJSON generation');
  
  const towns = await prisma.town.findMany({
    where: { worldId },
    select: {
      id: true, name: true, points: true, islandX: true, islandY: true, islandSlot: true,
      player: { select: { id: true, name: true, alliance: { select: { id: true, name: true } } } }
    }
  });
  
  const islands = await prisma.island.findMany({
    where: { worldId, x: { gte: 250, lte: 750 }, y: { gte: 250, lte: 750 } },
    select: { id: true, x: true, y: true, type: true, availableTowns: true, resourcePlus: true, resourceMinus: true }
  });
  
  console.log(`World hu119: Found ${towns.length} towns, ${islands.length} islands`);
  
  const townLookup = {};
  for (const t of towns) {
    const key = `${t.islandX},${t.islandY}`;
    if (!townLookup[key]) townLookup[key] = [];
    townLookup[key].push(t);
  }
  
  const stages = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let emptySlots = 0;
  let populatedIslands = 0;
  
  for (const t of towns) {
    const s = getTownStage(t.points);
    stages[s]++;
  }

  for (const island of islands) {
    const islandTowns = townLookup[`${island.x},${island.y}`] || [];
    if (islandTowns.length > 0) populatedIslands++;
    const islandDef = islandDefinitions[island.type];
    const totalSlots = islandDef?.town_offsets?.length || island.availableTowns || 0;
    emptySlots += Math.max(0, totalSlots - islandTowns.length);
  }
  
  console.log('🏛️ Town Stage Distribution:');
  console.table([
    { Stage: '1 (Hamlet)', Points: '175 - 599', Count: stages[1] },
    { Stage: '2 (Village)', Points: '600 - 2,399', Count: stages[2] },
    { Stage: '3 (Town)', Points: '2,400 - 5,499', Count: stages[3] },
    { Stage: '4 (City)', Points: '5,500 - 9,999', Count: stages[4] },
    { Stage: '5 (Metropolis)', Points: '10,000+', Count: stages[5] }
  ]);
  
  console.log(`🏝️ Populated Islands: ${populatedIslands} / ${islands.length}`);
  console.log(`⚓ Available Colonization Slots: ${emptySlots}`);
  
  console.timeEnd('GeoJSON generation');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
