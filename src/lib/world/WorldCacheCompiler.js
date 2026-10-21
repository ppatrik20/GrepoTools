import zlib from 'zlib';
import { prisma as defaultPrisma } from '../prisma.js';
import { generateGeoJSON } from '../geojson.js';
import { generateScoreboardData } from '../scoreboard.js';

/**
 * WorldCacheCompiler: Unified Compilation & Persistence Seam for World Caches
 * Generates base64-gzipped MapLibre GeoJSON and tactical Scoreboards with atomic persistence.
 */
export const WorldCacheCompiler = {
  /**
   * Compiles Scoreboard and GeoJSON payloads and compresses them into base64 gzip buffers.
   *
   * @param {string} worldId
   * @param {object} [options]
   * @param {object|null} [options.snapshot=null]
   * @param {object} [options.prismaClient=defaultPrisma]
   * @returns {Promise<object>} { scoreboardData, geoJsonData, scoreboardGzip, geoJsonGzip }
   */
  async compileWorldCaches(worldId, { snapshot = null, prismaClient = defaultPrisma } = {}) {
    const [scoreboardData, geoJsonData] = await Promise.all([
      generateScoreboardData(worldId, { snapshot, prismaClient }),
      generateGeoJSON(worldId, { snapshot, prismaClient })
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
   * Atomically writes compressed caches to the per-world World record.
   *
   * @param {string} worldId
   * @param {object} caches { scoreboardGzip, geoJsonGzip }
   * @param {object} [prismaClient=defaultPrisma]
   * @returns {Promise<void>}
   */
  async persistWorldCaches(worldId, { scoreboardGzip, geoJsonGzip }, prismaClient = defaultPrisma) {
    await prismaClient.world.update({
      where: { id: worldId },
      data: {
        scoreboardCache: scoreboardGzip,
        geoJsonCache: geoJsonGzip
      }
    });
  },

  /**
   * Convenience coordinator to compile and persist world caches in one atomic invocation.
   *
   * @param {string} worldId
   * @param {object} [prismaClient=defaultPrisma]
   * @param {object} [options]
   * @param {object|null} [options.snapshot=null]
   * @returns {Promise<object>}
   */
  async rebuildWorldCaches(worldId, prismaClient = defaultPrisma, { snapshot = null } = {}) {
    const compiled = await this.compileWorldCaches(worldId, { snapshot, prismaClient });
    await this.persistWorldCaches(worldId, compiled, prismaClient);
    return {
      success: true,
      worldId,
      message: `Caches rebuilt for world ${worldId}`
    };
  },

  /**
   * Serves pre-compressed base64-gzipped world cache with ETag conditional request handling,
   * falling back to on-demand compilation when cache is absent.
   *
   * @param {object} params
   * @param {Request} params.request
   * @param {string} params.worldId
   * @param {'geoJsonCache'|'scoreboardCache'} params.cacheField
   * @param {Function} [params.generateFallback]
   * @param {object} [params.prismaClient=defaultPrisma]
   * @returns {Promise<Response>}
   */
  async serveCompressedWorldCache({
    request,
    worldId,
    cacheField,
    generateFallback = null,
    prismaClient = defaultPrisma
  }) {
    const normalizedWorldId = (worldId || 'hu119').toLowerCase();
    const world = await prismaClient.world.findUnique({ where: { id: normalizedWorldId } });

    if (world && world[cacheField] && world.lastSync) {
      const lastSyncDate = world.lastSync instanceof Date ? world.lastSync : new Date(world.lastSync);
      const etag = `W/"${world.id}-${lastSyncDate.getTime()}"`;
      const ifNoneMatch = request?.headers?.get?.('if-none-match');
      if (ifNoneMatch === etag) {
        return new Response(null, { status: 304 });
      }

      const gzipBuffer = Buffer.from(world[cacheField], 'base64');
      const uint8Array = new Uint8Array(gzipBuffer);

      return new Response(uint8Array, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'Cache-Control': 'public, s-maxage=31536000, stale-while-revalidate=86400',
          'ETag': etag,
          'X-Last-Sync': lastSyncDate.toISOString(),
        },
      });
    }

    const fallbackGenerator = generateFallback || (
      cacheField === 'geoJsonCache'
        ? (id) => generateGeoJSON(id, { prismaClient })
        : (id) => generateScoreboardData(id, { prismaClient })
    );
    const data = await fallbackGenerator(normalizedWorldId, { prismaClient });

    const lastSyncDate = world?.lastSync
      ? (world.lastSync instanceof Date ? world.lastSync : new Date(world.lastSync))
      : null;

    return Response.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=31536000, stale-while-revalidate=86400',
        'ETag': lastSyncDate ? `W/"${world.id}-${lastSyncDate.getTime()}"` : `W/"${Date.now()}"`,
        'X-Last-Sync': lastSyncDate ? lastSyncDate.toISOString() : new Date().toISOString(),
      },
    });
  }
};
