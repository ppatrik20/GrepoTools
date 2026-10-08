import zlib from 'zlib';
import { prisma as defaultPrisma } from '@/lib/prisma';
import { generateGeoJSON } from '@/lib/geojson';
import { generateScoreboardData } from '@/lib/scoreboard';

/**
 * WorldCacheCompiler: Unified Compilation & Persistence Seam for World Caches
 * Generates base64-gzipped MapLibre GeoJSON and tactical Scoreboards with atomic persistence.
 */
export const WorldCacheCompiler = {
  /**
   * Compiles Scoreboard and GeoJSON payloads and compresses them into base64 gzip buffers.
   * 
   * @param {string} worldId
   * @returns {Promise<object>} { scoreboardData, geoJsonData, scoreboardGzip, geoJsonGzip }
   */
  async compileWorldCaches(worldId) {
    const [scoreboardData, geoJsonData] = await Promise.all([
      generateScoreboardData(worldId),
      generateGeoJSON(worldId)
    ]);

    const scoreboardGzip = zlib.gzipSync(JSON.stringify(scoreboardData)).toString('base64');
    const geoJsonGzip = zlib.gzipSync(JSON.stringify(geoJsonData)).toString('base64');

    return {
      scoreboardData,
      geoJsonData,
      scoreboardGzip,
      geoJsonGzip
    };
  },

  /**
   * Atomically writes compressed caches to World and SyncMetadata tables.
   * 
   * @param {string} worldId
   * @param {object} caches { scoreboardGzip, geoJsonGzip }
   * @param {object} [prismaClient=defaultPrisma]
   * @returns {Promise<void>}
   */
  async persistWorldCaches(worldId, { scoreboardGzip, geoJsonGzip }, prismaClient = defaultPrisma) {
    const now = new Date();

    const worldUpdate = prismaClient.world.update({
      where: { id: worldId },
      data: {
        scoreboardCache: scoreboardGzip,
        geoJsonCache: geoJsonGzip
      }
    });

    const metaUpsert = prismaClient.syncMetadata.upsert({
      where: { id: 1 },
      update: {
        worldId,
        scoreboardCache: scoreboardGzip,
        geoJsonCache: geoJsonGzip,
        lastSync: now
      },
      create: {
        id: 1,
        worldId,
        scoreboardCache: scoreboardGzip,
        geoJsonCache: geoJsonGzip,
        lastSync: now
      }
    });

    await Promise.all([worldUpdate, metaUpsert]);
  },

  /**
   * Convenience coordinator to compile and persist world caches in one atomic invocation.
   * 
   * @param {string} worldId
   * @param {object} [prismaClient=defaultPrisma]
   * @returns {Promise<object>}
   */
  async rebuildWorldCaches(worldId, prismaClient = defaultPrisma) {
    const compiled = await this.compileWorldCaches(worldId);
    await this.persistWorldCaches(worldId, compiled, prismaClient);
    return {
      success: true,
      worldId,
      message: `Caches rebuilt for world ${worldId}`
    };
  }
};
