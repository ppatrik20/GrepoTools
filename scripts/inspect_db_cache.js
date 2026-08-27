const { PrismaClient } = require('@prisma/client');
const zlib = require('zlib');
const prisma = new PrismaClient();

async function inspect() {
  const world = await prisma.world.findUnique({
    where: { id: 'hu119' },
    select: { id: true, lastSync: true, geoJsonCache: true }
  });
  if (!world || !world.geoJsonCache) {
    console.log('No cache found in DB!');
    return;
  }
  const buf = Buffer.from(world.geoJsonCache, 'base64');
  const jsonStr = zlib.gunzipSync(buf).toString('utf-8');
  const geojson = JSON.parse(jsonStr);
  console.log(`Total features in DB geoJsonCache: ${geojson.features.length}`);

  // Find Island (509, 497)
  const island = geojson.features.find(f => f.properties.renderType === 'island' && f.properties.x === 509 && f.properties.y === 497);
  console.log('Island in DB Cache:', island);

  const towns = geojson.features.filter(f => f.properties.renderType === 'town' && f.properties.islandX === 509 && f.properties.islandY === 497);
  console.log(`Towns on island in DB Cache: ${towns.length}`);
  for (const t of towns) {
    console.log(`Town ${t.properties.name}: coords=[${t.geometry.coordinates}], slot=${t.properties.islandSlot}, dir=${t.properties.dir}`);
  }
}

inspect().finally(() => prisma.$disconnect());
