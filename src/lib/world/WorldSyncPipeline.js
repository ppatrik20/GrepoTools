import https from 'https';
import zlib from 'zlib';
import { prisma as defaultPrisma } from '../prisma.js';
import {
  parseKillPoints,
  parseAlliances,
  parsePlayers,
  parseTowns,
  parseIslands,
  parseConquests
} from './GrepolisDataParser.js';
import {
  computeAllianceDeltas,
  computePlayerDeltas,
  computeTownDeltas,
  computeIslandDeltas
} from './WorldDeltaEngine.js';
import { WorldCacheCompiler } from './WorldCacheCompiler.js';
import { TownVerificationEngine } from '../auth/TownVerificationEngine.js';
import { logAuditEvent, AUDIT_ACTIONS } from '../auth/audit.js';
import { ensureDatabaseSchema } from '../dbBootstrap.js';

const CREATE_BATCH_SIZE = 5000;
const UPDATE_BATCH_SIZE = 50000;

function escapeSqlString(str) {
  if (str === null || str === undefined) return "''";
  return "'" + String(str).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\0/g, '') + "'";
}

function sanitizeInt(val, defaultVal = 0) {
  const num = parseInt(val, 10);
  return isNaN(num) ? defaultVal : num;
}

function sanitizeNullableInt(val) {
  if (val === null || val === undefined || val === '') return 'NULL::int';
  const num = parseInt(val, 10);
  return isNaN(num) ? 'NULL::int' : num;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Safely decodes URL encoded string fields with fallback on malformed URI sequences.
 */
export function safeDecodeField(str) {
  if (!str) return '';
  try {
    return decodeURIComponent(str.replace(/\+/g, ' '));
  } catch {
    return str.replace(/\+/g, ' ');
  }
}

/**
 * Fetches and decompresses a Grepolis gzip data file from the remote game server.
 */
export async function fetchAndDecompress(server, filename) {
  return new Promise((resolve, reject) => {
    const url = `https://${server}.grepolis.com/data/${filename}`;

    const req = https.get(url, {
      headers: {
        'User-Agent': 'GrepoTools-Sync/1.0 (+https://github.com/perfi20/GrepoTools)'
      },
      timeout: 30000
    }, (res) => {
      if (res.statusCode !== 200) {
        if (res.statusCode === 404) return resolve([]);
        return reject(new Error(`Failed to fetch ${url}: ${res.statusCode}`));
      }

      const gunzip = zlib.createGunzip();
      res.pipe(gunzip);

      let data = '';
      gunzip.on('data', (chunk) => {
        data += chunk.toString('utf-8');
      });

      gunzip.on('end', () => {
        try {
          const lines = data.split('\n').filter(l => l.trim().length > 0);
          resolve(lines.map(line => line.split(',').map(safeDecodeField)));
        } catch (err) {
          reject(err);
        }
      });

      gunzip.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Timeout fetching ${url}`));
    });

    req.on('error', reject);
  });
}

/**
 * WorldSyncPipeline: Multi-Stage Domain Orchestrator for World Ingestion
 */
export const WorldSyncPipeline = {
  /**
   * Validates world ID format strictly against SQL injection vectors and illegal characters.
   */
  validateWorldId(worldIdInput) {
    if (!worldIdInput || typeof worldIdInput !== 'string') {
      throw new Error(`Invalid worldId format: "${worldIdInput}". Must match /^[a-z0-9]+$/`);
    }
    const rawId = worldIdInput.toLowerCase().trim();
    if (!/^[a-z0-9]+$/.test(rawId)) {
      throw new Error(`Invalid worldId format: "${worldIdInput}". Must match /^[a-z0-9]+$/`);
    }
    return rawId;
  },

  /**
   * Evaluates throttle intervals and remote Last-Modified headers.
   */
  async checkFreshness(world, server, force) {
    if (!world.lastSync || force) {
      return { isFresh: false };
    }

    const minutesSinceLastSync = (Date.now() - world.lastSync.getTime()) / (1000 * 60);
    if (minutesSinceLastSync < 20) {
      return {
        isFresh: true,
        reason: `Throttled: World ${world.id} sync ran ${Math.round(minutesSinceLastSync)} minutes ago. Waiting for 20 minutes interval.`
      };
    }

    const filesToCheck = [
      'players.txt.gz', 'alliances.txt.gz', 'towns.txt.gz', 'islands.txt.gz',
      'player_kills_att.txt.gz', 'player_kills_def.txt.gz', 'player_kills_all.txt.gz',
      'alliance_kills_att.txt.gz', 'alliance_kills_def.txt.gz', 'alliance_kills_all.txt.gz',
      'conquers.txt.gz'
    ];

    try {
      const headRequests = filesToCheck.map(filename =>
        fetch(`https://${server}.grepolis.com/data/${filename}`, { method: 'HEAD' })
          .then(res => res.headers.get('last-modified'))
          .catch(() => null)
      );

      const lastModifiedHeaders = await Promise.all(headRequests);
      let latestModifiedDate = new Date(0);
      for (const headerStr of lastModifiedHeaders) {
        if (headerStr) {
          const modDate = new Date(headerStr);
          if (modDate > latestModifiedDate) latestModifiedDate = modDate;
        }
      }

      if (latestModifiedDate.getTime() > 0 && world.lastSync >= latestModifiedDate) {
        return {
          isFresh: true,
          reason: `Data is fresh. Latest server update: ${latestModifiedDate.toISOString()}. Last sync: ${world.lastSync.toISOString()}.`
        };
      }
    } catch {
      // Proceed on network header failure
    }

    return { isFresh: false };
  },

  /**
   * Scans unverified team members and confirms identities if an in-game town rename matches.
   */
  async scanTownRenames(worldId, prismaClient) {
    try {
      await TownVerificationEngine.executeTownVerificationCheck({
        worldId,
        prismaClient,
        method: 'SYNC_AUTOMATIC'
      });
    } catch (verifyErr) {
      console.warn(`[WorldSyncPipeline] Warning: Automatic town verification scan failed for world ${worldId}:`, verifyErr.message);
    }
  },

  /**
   * Dispatches failure notifications to external webhooks (e.g., Discord/Slack/custom) if configured.
   */
  async notifySyncFailure({ worldId, trigger, durationMs, error }) {
    const webhookUrl = process.env.SYNC_ALERT_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
      const payload = {
        content: `🚨 **[GrepoTools Alert] World Sync Failed**`,
        embeds: [
          {
            title: `World Sync Failure: ${worldId.toUpperCase()}`,
            color: 0xef4444,
            fields: [
              { name: 'World', value: worldId, inline: true },
              { name: 'Trigger', value: trigger || 'CRON', inline: true },
              { name: 'Duration', value: `${durationMs || 0}ms`, inline: true },
              { name: 'Error', value: String(error?.message || error || 'Unknown error').slice(0, 1000) },
              { name: 'Timestamp', value: new Date().toISOString() }
            ]
          }
        ],
        event: 'WORLD_SYNC_FAILURE',
        worldId,
        trigger: trigger || 'CRON',
        durationMs: durationMs || 0,
        error: error?.message || String(error),
        timestamp: new Date().toISOString()
      };

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000)
      });
    } catch (notifyErr) {
      console.warn(`[WorldSyncPipeline] Failed to dispatch failure webhook notification:`, notifyErr.message);
    }
  },

  /**
   * Executes full synchronization for a world through all pipeline stages.
   * 
   * @param {string} worldIdInput
   * @param {object} [options]
   * @param {boolean} [options.force=false]
   * @param {boolean} [options.skipCacheBuild=false]
   * @param {string} [options.trigger='CRON'] 'CRON' | 'MANUAL' | 'CLI'
   * @param {object} [dependencies]
   * @param {object} [dependencies.prismaClient=defaultPrisma]
   * @returns {Promise<object>}
   */
  async executeSync(worldIdInput, options = {}, dependencies = {}) {
    const { force = false, skipCacheBuild = false, trigger = 'CRON' } = options;
    const prismaClient = dependencies.prismaClient || defaultPrisma;
    const startTime = Date.now();

    const worldId = this.validateWorldId(worldIdInput);

    try {
      await ensureDatabaseSchema(prismaClient);

      // 1. Ensure World entry exists in DB
      let world = await prismaClient.world.findUnique({ where: { id: worldId } });
      if (!world) {
        world = await prismaClient.world.create({
          data: {
            id: worldId,
            name: worldId.toUpperCase(),
            server: worldId,
            speed: 1.0,
            unitSpeed: 1.0,
            worldType: 'siege',
            isActive: true
          }
        });
      }

      const server = world.server || worldId;

      // 2. Freshness Gate
      const freshness = await this.checkFreshness(world, server, force);
      if (freshness.isFresh) {
        return {
          success: true,
          message: freshness.reason,
          skipped: true,
          worldId,
          lastSync: world.lastSync
        };
      }

      console.log(`[WorldSyncPipeline] Starting full ingestion for world: ${worldId} (${server})...`);

      // 3. Remote Ingestion: Fetch 11 Grepolis feeds in parallel
      const [
        playersRaw, alliancesRaw, townsRaw, islandsRaw,
        pAttRaw, pDefRaw, pAllRaw,
        aAttRaw, aDefRaw, aAllRaw, conquersRaw
      ] = await Promise.all([
        fetchAndDecompress(server, 'players.txt.gz'),
        fetchAndDecompress(server, 'alliances.txt.gz'),
        fetchAndDecompress(server, 'towns.txt.gz'),
        fetchAndDecompress(server, 'islands.txt.gz'),
        fetchAndDecompress(server, 'player_kills_att.txt.gz'),
        fetchAndDecompress(server, 'player_kills_def.txt.gz'),
        fetchAndDecompress(server, 'player_kills_all.txt.gz'),
        fetchAndDecompress(server, 'alliance_kills_att.txt.gz'),
        fetchAndDecompress(server, 'alliance_kills_def.txt.gz'),
        fetchAndDecompress(server, 'alliance_kills_all.txt.gz'),
        fetchAndDecompress(server, 'conquers.txt.gz')
      ]);

      // Parse Kills
      const pAttMap = parseKillPoints(pAttRaw);
      const pDefMap = parseKillPoints(pDefRaw);
      const pAllMap = parseKillPoints(pAllRaw);
      const aAttMap = parseKillPoints(aAttRaw);
      const aDefMap = parseKillPoints(aDefRaw);
      const aAllMap = parseKillPoints(aAllRaw);

      // Parse Entities via pure GrepolisDataParser
      const incomingAlliances = parseAlliances(alliancesRaw, { aAttMap, aDefMap, aAllMap }, worldId);
      const validAllianceIds = new Set(incomingAlliances.map(a => a.id));

      const incomingPlayers = parsePlayers(playersRaw, { pAttMap, pDefMap, pAllMap }, validAllianceIds, worldId);
      const validPlayerIds = new Set(incomingPlayers.map(p => p.id));

      const incomingTowns = parseTowns(townsRaw, validPlayerIds, worldId);

      const populatedCoords = new Set(incomingTowns.map(t => `${t.islandX},${t.islandY}`));
      const incomingIslands = parseIslands(islandsRaw, populatedCoords, worldId);

      // Latest conquest timestamp
      const latestDbConquest = await prismaClient.conquest.findFirst({
        where: { worldId },
        orderBy: { timestamp: 'desc' }
      });
      const lastConquestEpoch = latestDbConquest ? Math.floor(latestDbConquest.timestamp.getTime() / 1000) : 0;
      const newConquers = parseConquests(conquersRaw, lastConquestEpoch, worldId);

      // 4. Query current database snapshots for pure delta computation
      const [currentAlliances, currentPlayers, currentTowns, currentIslands] = await Promise.all([
        prismaClient.alliance.findMany({ where: { worldId } }),
        prismaClient.player.findMany({ where: { worldId } }),
        prismaClient.town.findMany({
          where: { worldId },
          select: { id: true, points: true, playerId: true, name: true, islandX: true, islandY: true }
        }),
        prismaClient.island.findMany({
          where: { worldId },
          select: { id: true, availableTowns: true }
        })
      ]);

      // 5. Compute deltas via pure WorldDeltaEngine
      const allianceDeltas = computeAllianceDeltas(incomingAlliances, currentAlliances, worldId);
      const playerDeltas = computePlayerDeltas(incomingPlayers, currentPlayers, worldId);
      const townDeltas = computeTownDeltas(incomingTowns, currentTowns, worldId);
      const islandDeltas = computeIslandDeltas(incomingIslands, currentIslands, worldId);

      // 6. Build atomic database transaction
      const tx = [];

      // Unlink orphaned foreign keys
      if (allianceDeltas.toDelete.length > 0) {
        tx.push(prismaClient.player.updateMany({
          where: { worldId, allianceId: { in: allianceDeltas.toDelete } },
          data: { allianceId: null }
        }));
      }

      if (playerDeltas.toDelete.length > 0) {
        tx.push(prismaClient.town.updateMany({
          where: { worldId, playerId: { in: playerDeltas.toDelete } },
          data: { playerId: null }
        }));
      }

      // Removals
      if (townDeltas.toDelete.length > 0) {
        tx.push(prismaClient.town.deleteMany({ where: { worldId, id: { in: townDeltas.toDelete } } }));
      }
      if (playerDeltas.toDelete.length > 0) {
        tx.push(prismaClient.player.deleteMany({ where: { worldId, id: { in: playerDeltas.toDelete } } }));
      }
      if (allianceDeltas.toDelete.length > 0) {
        tx.push(prismaClient.alliance.deleteMany({ where: { worldId, id: { in: allianceDeltas.toDelete } } }));
      }
      if (islandDeltas.toDelete.length > 0) {
        tx.push(prismaClient.island.deleteMany({ where: { worldId, id: { in: islandDeltas.toDelete } } }));
      }

      // Inserts
      if (allianceDeltas.toCreate.length > 0) {
        chunkArray(allianceDeltas.toCreate, CREATE_BATCH_SIZE).forEach(chunk => {
          tx.push(prismaClient.alliance.createMany({ data: chunk }));
        });
      }
      if (playerDeltas.toCreate.length > 0) {
        chunkArray(playerDeltas.toCreate, CREATE_BATCH_SIZE).forEach(chunk => {
          tx.push(prismaClient.player.createMany({ data: chunk }));
        });
      }
      if (townDeltas.toCreate.length > 0) {
        chunkArray(townDeltas.toCreate, CREATE_BATCH_SIZE).forEach(chunk => {
          tx.push(prismaClient.town.createMany({ data: chunk }));
        });
      }
      if (islandDeltas.toCreate.length > 0) {
        chunkArray(islandDeltas.toCreate, CREATE_BATCH_SIZE).forEach(chunk => {
          tx.push(prismaClient.island.createMany({ data: chunk }));
        });
      }

      // Chunked Updates
      if (allianceDeltas.toUpdate.length > 0) {
        chunkArray(allianceDeltas.toUpdate, UPDATE_BATCH_SIZE).forEach(chunk => {
          const values = chunk.map(a =>
            `(${sanitizeInt(a.id)}, '${worldId}', ${escapeSqlString(a.name)}, ${sanitizeInt(a.points)}, ${sanitizeInt(a.towns)}, ${sanitizeInt(a.members)}, ${sanitizeInt(a.rank)}, ${sanitizeInt(a.abp)}, ${sanitizeInt(a.dbp)}, ${sanitizeInt(a.allBp)})`
          ).join(',');
          tx.push(prismaClient.$executeRawUnsafe(`
            UPDATE "Alliance" AS a SET
              "name" = v."name", "points" = v."points", "towns" = v."towns", "members" = v."members", "rank" = v."rank", "abp" = v."abp", "dbp" = v."dbp", "allBp" = v."allBp"
            FROM (VALUES ${values}) AS v("id", "worldId", "name", "points", "towns", "members", "rank", "abp", "dbp", "allBp")
            WHERE a."id" = v."id" AND a."worldId" = v."worldId"
          `));
        });
      }

      if (playerDeltas.toUpdate.length > 0) {
        chunkArray(playerDeltas.toUpdate, UPDATE_BATCH_SIZE).forEach(chunk => {
          const values = chunk.map(p =>
            `(${sanitizeInt(p.id)}, '${worldId}', ${escapeSqlString(p.name)}, ${sanitizeNullableInt(p.allianceId)}, ${sanitizeInt(p.points)}, ${sanitizeInt(p.rank)}, ${sanitizeInt(p.towns)}, ${sanitizeInt(p.abp)}, ${sanitizeInt(p.dbp)}, ${sanitizeInt(p.allBp)})`
          ).join(',');
          tx.push(prismaClient.$executeRawUnsafe(`
            UPDATE "Player" AS p SET
              "name" = v."name", "allianceId" = v."allianceId", "points" = v."points", "rank" = v."rank", "towns" = v."towns", "abp" = v."abp", "dbp" = v."dbp", "allBp" = v."allBp"
            FROM (VALUES ${values}) AS v("id", "worldId", "name", "allianceId", "points", "rank", "towns", "abp", "dbp", "allBp")
            WHERE p."id" = v."id" AND p."worldId" = v."worldId"
          `));
        });
      }

      if (townDeltas.toUpdate.length > 0) {
        chunkArray(townDeltas.toUpdate, UPDATE_BATCH_SIZE).forEach(chunk => {
          const values = chunk.map(t =>
            `(${sanitizeInt(t.id)}, '${worldId}', ${sanitizeNullableInt(t.playerId)}, ${escapeSqlString(t.name)}, ${sanitizeInt(t.islandX)}, ${sanitizeInt(t.islandY)}, ${sanitizeInt(t.islandSlot)}, ${sanitizeInt(t.points)})`
          ).join(',');
          tx.push(prismaClient.$executeRawUnsafe(`
            UPDATE "Town" AS t SET
              "playerId" = v."playerId", "name" = v."name", "islandX" = v."islandX", "islandY" = v."islandY", "islandSlot" = v."islandSlot", "points" = v."points"
            FROM (VALUES ${values}) AS v("id", "worldId", "playerId", "name", "islandX", "islandY", "islandSlot", "points")
            WHERE t."id" = v."id" AND t."worldId" = v."worldId"
          `));
        });
      }

      if (islandDeltas.toUpdate.length > 0) {
        chunkArray(islandDeltas.toUpdate, UPDATE_BATCH_SIZE).forEach(chunk => {
          const values = chunk.map(i =>
            `(${sanitizeInt(i.id)}, '${worldId}', ${sanitizeInt(i.availableTowns)})`
          ).join(',');
          tx.push(prismaClient.$executeRawUnsafe(`
            UPDATE "Island" AS i SET "availableTowns" = v."availableTowns"
            FROM (VALUES ${values}) AS v("id", "worldId", "availableTowns")
            WHERE i."id" = v."id" AND i."worldId" = v."worldId"
          `));
        });
      }

      // History & Conquers
      if (allianceDeltas.historyDeltas.length > 0) {
        chunkArray(allianceDeltas.historyDeltas, UPDATE_BATCH_SIZE).forEach(chunk => {
          const values = chunk.map(h =>
            `(${sanitizeInt(h.allianceId)}, '${worldId}', ${sanitizeInt(h.oldPoints)}, ${sanitizeInt(h.newPoints)}, ${sanitizeInt(h.abpDelta)}, ${sanitizeInt(h.dbpDelta)}, ${sanitizeInt(h.allBpDelta)}, NOW())`
          ).join(',');
          tx.push(prismaClient.$executeRawUnsafe(`
            INSERT INTO "AllianceHistory" ("allianceId", "worldId", "oldPoints", "newPoints", "abpDelta", "dbpDelta", "allBpDelta", "timestamp")
            VALUES ${values}
          `));
        });
      }

      if (playerDeltas.historyDeltas.length > 0) {
        chunkArray(playerDeltas.historyDeltas, UPDATE_BATCH_SIZE).forEach(chunk => {
          const values = chunk.map(h =>
            `(${sanitizeInt(h.playerId)}, '${worldId}', ${sanitizeInt(h.oldPoints)}, ${sanitizeInt(h.newPoints)}, ${sanitizeInt(h.abpDelta)}, ${sanitizeInt(h.dbpDelta)}, ${sanitizeInt(h.allBpDelta)}, NOW())`
          ).join(',');
          tx.push(prismaClient.$executeRawUnsafe(`
            INSERT INTO "PlayerHistory" ("playerId", "worldId", "oldPoints", "newPoints", "abpDelta", "dbpDelta", "allBpDelta", "timestamp")
            VALUES ${values}
          `));
        });
      }

      if (townDeltas.historyDeltas.length > 0) {
        chunkArray(townDeltas.historyDeltas, UPDATE_BATCH_SIZE).forEach(chunk => {
          const values = chunk.map(h =>
            `(${sanitizeInt(h.townId)}, '${worldId}', ${sanitizeInt(h.oldPoints)}, ${sanitizeInt(h.newPoints)}, NOW())`
          ).join(',');
          tx.push(prismaClient.$executeRawUnsafe(`
            INSERT INTO "TownHistory" ("townId", "worldId", "oldPoints", "newPoints", "timestamp")
            VALUES ${values}
          `));
        });
      }

      if (newConquers.length > 0) {
        chunkArray(newConquers, CREATE_BATCH_SIZE).forEach(chunk => {
          tx.push(prismaClient.conquest.createMany({ data: chunk }));
        });
      }

      // Execute transaction with 60s timeout
      await prismaClient.$transaction(tx, {
        timeout: 60000,
        maxWait: 10000
      });

      // 7. Automatic In-Game Town Rename Verification Check
      await this.scanTownRenames(worldId, prismaClient);

      const syncTime = new Date();

      // 8. Compile and persist Scoreboard & GeoJSON caches via WorldCacheCompiler
      let scoreboardGzip = null;
      let geoJsonGzip = null;

      if (!skipCacheBuild) {
        try {
          console.log(`[WorldSyncPipeline] Generating atomic Scoreboard & GeoJSON caches for world [${worldId}]...`);
          const compiled = await WorldCacheCompiler.compileWorldCaches(worldId);
          scoreboardGzip = compiled.scoreboardGzip;
          geoJsonGzip = compiled.geoJsonGzip;
          await WorldCacheCompiler.persistWorldCaches(worldId, compiled, prismaClient);
        } catch (cacheErr) {
          console.warn(`[WorldSyncPipeline] Warning: Failed to pre-generate cache for world ${worldId}:`, cacheErr);
        }
      }

      const durationMs = Date.now() - startTime;
      const statsPayload = {
        alliances: allianceDeltas.toCreate.length,
        players: playerDeltas.toCreate.length,
        towns: townDeltas.toCreate.length,
        islands: islandDeltas.toCreate.length,
        deltas: {
          alliances: allianceDeltas.historyDeltas.length,
          players: playerDeltas.historyDeltas.length,
          towns: townDeltas.historyDeltas.length
        },
        conquers: newConquers.length
      };

      // Update world lastSync and status
      await prismaClient.world.update({
        where: { id: worldId },
        data: {
          lastSync: syncTime,
          lastSyncStatus: 'SUCCESS',
          lastSyncError: null,
          lastSyncDurationMs: durationMs,
          ...(scoreboardGzip ? { scoreboardCache: scoreboardGzip } : {}),
          ...(geoJsonGzip ? { geoJsonCache: geoJsonGzip } : {})
        }
      });

      // Record detailed SyncLog entry
      try {
        await prismaClient.syncLog.create({
          data: {
            worldId,
            status: 'SUCCESS',
            trigger,
            durationMs,
            errorMessage: null,
            stats: statsPayload
          }
        });
      } catch (logErr) {
        console.warn(`[WorldSyncPipeline] Warning: Failed to record sync log:`, logErr.message);
      }

      // Record system AuditLog entry
      try {
        await logAuditEvent({
          action: AUDIT_ACTIONS.WORLD_SYNC_TRIGGERED,
          targetResource: `world:${worldId}`,
          status: 'SUCCESS',
          prismaClient,
          details: {
            worldId,
            trigger,
            durationMs,
            stats: statsPayload
          }
        });
      } catch (auditErr) {
        console.warn(`[WorldSyncPipeline] Warning: Failed to record audit log:`, auditErr.message);
      }

      console.log(`[WorldSyncPipeline] World ${worldId} sync complete in ${durationMs}ms! (+${playerDeltas.toCreate.length} new players, +${townDeltas.toCreate.length} new towns)`);

      return {
        success: true,
        worldId,
        lastSync: syncTime,
        durationMs,
        stats: statsPayload
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error(`[WorldSyncPipeline] Sync Error for world ${worldId} (${durationMs}ms):`, error);

      try {
        await prismaClient.world.update({
          where: { id: worldId },
          data: {
            lastSyncStatus: 'FAILURE',
            lastSyncError: error.message,
            lastSyncDurationMs: durationMs
          }
        });
      } catch (dbErr) {
        console.warn(`[WorldSyncPipeline] Failed to update world failure status:`, dbErr.message);
      }

      try {
        await prismaClient.syncLog.create({
          data: {
            worldId,
            status: 'FAILURE',
            trigger,
            durationMs,
            errorMessage: error.message
          }
        });
      } catch (logErr) {
        console.warn(`[WorldSyncPipeline] Failed to record failure sync log:`, logErr.message);
      }

      try {
        await logAuditEvent({
          action: AUDIT_ACTIONS.WORLD_SYNC_TRIGGERED,
          targetResource: `world:${worldId}`,
          status: 'FAILURE',
          prismaClient,
          details: {
            worldId,
            trigger,
            durationMs,
            error: error.message,
            stack: error.stack
          }
        });
      } catch (auditErr) {
        console.warn(`[WorldSyncPipeline] Failed to record failure audit log:`, auditErr.message);
      }

      await this.notifySyncFailure({
        worldId,
        trigger,
        durationMs,
        error
      });

      return {
        success: false,
        worldId,
        durationMs,
        error: error.message
      };
    }
  },

  /**
   * Synchronize all active worlds sequentially.
   */
  async syncAllActiveWorlds(options = {}, dependencies = {}) {
    const prismaClient = dependencies.prismaClient || defaultPrisma;
    try {
      let activeWorlds = await prismaClient.world.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' }
      });

      if (!activeWorlds || activeWorlds.length === 0) {
        console.log('[WorldSyncPipeline] No active worlds found in database. Initializing default world hu119...');
        activeWorlds = [{ id: 'hu119', server: 'hu119' }];
      }

      console.log(`[WorldSyncPipeline] Starting scheduled synchronization for ${activeWorlds.length} active world(s): [${activeWorlds.map(w => w.id).join(', ')}]`);

      const results = [];
      for (const world of activeWorlds) {
        const res = await this.executeSync(world.id, options, dependencies);
        results.push(res);
      }

      return {
        success: true,
        timestamp: new Date(),
        totalWorlds: activeWorlds.length,
        results
      };
    } catch (error) {
      console.error('[WorldSyncPipeline] Error in syncAllActiveWorlds:', error);
      return {
        success: false,
        timestamp: new Date(),
        error: error.message
      };
    }
  }
};
