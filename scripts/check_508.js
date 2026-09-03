const { PrismaClient } = require('@prisma/client');
const zlib = require('zlib');
const prisma = new PrismaClient();

async function check508() {
  const world = await prisma.world.findUnique({ where: { id: 'hu119' }, select: { geoJsonCache: true } });
  let jsonStr = world.geoJsonCache;
  if (jsonStr.startsWith('H4sI')) {
    jsonStr = zlib.gunzipSync(Buffer.from(jsonStr, 'base64')).toString('utf-8');
  }
  const data = JSON.parse(jsonStr);
  const isl = data.features.filter(f => (f.properties.renderType === 'island' || f.properties.renderType === 'rock') && f.properties.x === 508 && f.properties.y === 516);
  console.log('Island at 508, 516:', JSON.stringify(isl, null, 2));

  // Check the empty slots island at 510, 515:
  const isl510 = data.features.filter(f => (f.properties.renderType === 'island' || f.properties.renderType === 'rock') && f.properties.x === 510 && f.properties.y === 515);
  console.log('Island at 510, 515:', JSON.stringify(isl510, null, 2));

  const towns508 = data.features.filter(f => f.properties.renderType === 'town' && f.properties.islandX === 508 && f.properties.islandY === 516);
  console.log('Towns at 508, 516:');
  towns508.forEach(t => console.log(t.properties.name, t.geometry.coordinates));
}

check508().catch(console.error).finally(() => prisma.$disconnect());
