const { PrismaClient } = require('@prisma/client');
const zlib = require('zlib');
const prisma = new PrismaClient();

async function findSynthetic() {
  const world = await prisma.world.findUnique({ where: { id: 'hu119' }, select: { geoJsonCache: true } });
  let jsonStr = world.geoJsonCache;
  if (jsonStr.startsWith('H4sI')) {
    jsonStr = zlib.gunzipSync(Buffer.from(jsonStr, 'base64')).toString('utf-8');
  }
  const data = JSON.parse(jsonStr);
  const emptySlots = data.features.filter(f => f.properties.renderType === 'empty-slot');
  console.log('Total empty slots in cache:', emptySlots.length);
  
  const islands = data.features.filter(f => f.properties.renderType === 'island');
  console.log('Total islands in cache:', islands.length);

  const rocks = data.features.filter(f => f.properties.renderType === 'rock');
  console.log('Total rocks in cache:', rocks.length);

  // Look at Screenshot 4 coordinates!
  // In Screenshot 4, town names: Vlckk, O2 Cart Mavis, etc.
  // Let's find towns near (504, 516):
  const nearbyTowns = data.features.filter(f => f.properties.renderType === 'town' && Math.abs(f.properties.islandX - 504) <= 6 && Math.abs(f.properties.islandY - 516) <= 6);
  console.log('Nearby towns:', nearbyTowns.map(f => ({
    name: f.properties.name,
    islandX: f.properties.islandX,
    islandY: f.properties.islandY,
    type: f.properties.islandType,
    slot: f.properties.islandSlot
  })));

  // Find the island features at those coordinates!
  const nearbyIslands = data.features.filter(f => (f.properties.renderType === 'island' || f.properties.renderType === 'rock') && Math.abs(f.properties.x - 504) <= 6 && Math.abs(f.properties.y - 516) <= 6);
  console.log('Nearby islands:', nearbyIslands.map(f => ({
    renderType: f.properties.renderType,
    x: f.properties.x,
    y: f.properties.y,
    type: f.properties.islandType,
    available: f.properties.availableTowns,
    colonized: f.properties.colonizedCount
  })));

  // Check if there are any empty slots near (504, 516):
  const nearbySlots = data.features.filter(f => f.properties.renderType === 'empty-slot' && Math.abs(f.properties.islandX - 504) <= 6 && Math.abs(f.properties.islandY - 516) <= 6);
  console.log('Nearby empty slots count:', nearbySlots.length);
  console.log('Nearby empty slots islands:', [...new Set(nearbySlots.map(s => `${s.properties.islandX},${s.properties.islandY} (type ${s.properties.islandType})`))]);
}

findSynthetic().catch(console.error).finally(() => prisma.$disconnect());
