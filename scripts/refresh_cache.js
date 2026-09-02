const { PrismaClient } = require('@prisma/client');
const zlib = require('zlib');
const { generateGeoJSON } = require('../src/lib/geojson');

const prisma = new PrismaClient();

async function refreshCache() {
  console.log('Generating fresh GeoJSON for hu119...');
  const geojson = await generateGeoJSON('hu119');
  console.log(`Generated ${geojson.features.length} total features.`);

  const townsCount = geojson.features.filter(f => f.properties.renderType === 'town').length;
  const emptyCount = geojson.features.filter(f => f.properties.renderType === 'empty-slot').length;
  const islandsCount = geojson.features.filter(f => f.properties.renderType === 'island').length;
  console.log(`Breakdown: ${islandsCount} islands, ${townsCount} towns, ${emptyCount} empty slots`);

  const jsonBuffer = Buffer.from(JSON.stringify(geojson));
  const compressed = zlib.gzipSync(jsonBuffer);
  const base64Cache = compressed.toString('base64');

  await prisma.world.update({
    where: { id: 'hu119' },
    data: {
      geoJsonCache: base64Cache,
      lastSync: new Date()
    }
  });

  console.log('✅ World hu119 geoJsonCache updated successfully in database!');
}

refreshCache().finally(() => prisma.$disconnect());
