import https from 'https';
import zlib from 'zlib';
import { prisma } from './prisma.js';

export { prisma };

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

/**
 * Fetch and decompress a Grepolis gzip data file
 */
export async function fetchAndDecompress(server, filename) {
  return new Promise((resolve, reject) => {
    const url = `https://${server}.grepolis.com/data/${filename}`;
    
    https.get(url, (res) => {
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
        const lines = data.split('\n').filter(l => l.trim().length > 0);
        resolve(lines.map(line => decodeURIComponent(line.replace(/\+/g, ' ')).split(',')));
      });

      gunzip.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Synchronize a single game world
 */
export async function syncWorld(worldIdInput, options = {}) {
  const { force = false, skipCacheBuild = false } = options;
  if (!worldIdInput || typeof worldIdInput !== 'string') {
    throw new Error(`Invalid worldId format: "${worldIdInput}". Must match /^[a-z0-9]+$/`);
  }
  const rawId = worldIdInput.toLowerCase().trim();

  if (!/^[a-z0-9]+$/.test(rawId)) {
    throw new Error(`Invalid worldId format: "${worldIdInput}". Must match /^[a-z0-9]+$/`);
  }
  const worldId = rawId;

  try {
    // 1. Ensure World entry exists in DB
    let world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      world = await prisma.world.create({
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

    // 2. Throttling and Last-Modified check
    if (world.lastSync && !force) {
      const minutesSinceLastSync = (Date.now() - world.lastSync.getTime()) / (1000 * 60);
      if (minutesSinceLastSync < 20) {
        return { 
          success: true, 
          message: `Throttled: World ${worldId} sync ran ${Math.round(minutesSinceLastSync)} minutes ago. Waiting for 20 minutes interval.`,
          skipped: true,
          worldId,
          lastSync: world.lastSync
        };
      }

      // Check Last-Modified headers on remote server
      const filesToCheck = [
        'players.txt.gz', 'alliances.txt.gz', 'towns.txt.gz', 'islands.txt.gz',
        'player_kills_att.txt.gz', 'player_kills_def.txt.gz', 'player_kills_all.txt.gz',
        'alliance_kills_att.txt.gz', 'alliance_kills_def.txt.gz', 'alliance_kills_all.txt.gz',
        'conquers.txt.gz'
      ];
      
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
          success: true, 
          message: `Data is fresh. Latest server update: ${latestModifiedDate.toISOString()}. Last sync: ${world.lastSync.toISOString()}.`,
          skipped: true,
          worldId,
          lastSync: world.lastSync
        };
      }
    }

    console.log(`[SyncEngine] Starting full ingestion for world: ${worldId} (${server})...`);

    // 3. Fetch and decompress all 11 files
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

    // Map Kills
    const pAttMap = new Map(pAttRaw.map(row => [parseInt(row[1], 10), parseInt(row[2], 10)]));
    const pDefMap = new Map(pDefRaw.map(row => [parseInt(row[1], 10), parseInt(row[2], 10)]));
    const pAllMap = new Map(pAllRaw.map(row => [parseInt(row[1], 10), parseInt(row[2], 10)]));
    const aAttMap = new Map(aAttRaw.map(row => [parseInt(row[1], 10), parseInt(row[2], 10)]));
    const aDefMap = new Map(aDefRaw.map(row => [parseInt(row[1], 10), parseInt(row[2], 10)]));
    const aAllMap = new Map(aAllRaw.map(row => [parseInt(row[1], 10), parseInt(row[2], 10)]));

    // 4. Process Alliances
    const newAlliances = [];
    const alliancesToUpdate = [];
    const allianceHistory = [];
    const currentAlliances = await prisma.alliance.findMany({ where: { worldId } });
    const allianceMap = new Map(currentAlliances.map(a => [a.id, a]));
    const seenAllianceIds = new Set();

    for (const row of alliancesRaw) {
      const [idStr, name, pointsStr, townsStr, membersStr, rankStr] = row;
      const id = parseInt(idStr, 10);
      if (isNaN(id)) continue;
      
      if (seenAllianceIds.has(id)) continue;
      seenAllianceIds.add(id);

      const points = parseInt(pointsStr, 10) || 0;
      const abp = aAttMap.get(id) || 0;
      const dbp = aDefMap.get(id) || 0;
      const allBp = aAllMap.get(id) || 0;
      
      const newData = {
        id, worldId, name, points, 
        towns: parseInt(townsStr, 10) || 0, 
        members: parseInt(membersStr, 10) || 0, 
        rank: parseInt(rankStr, 10) || 0,
        abp, dbp, allBp
      };

      const existing = allianceMap.get(id);
      if (!existing) {
        newAlliances.push(newData);
      } else {
        let changed = false;
        if (existing.points !== points || existing.abp !== abp || existing.dbp !== dbp) {
          allianceHistory.push({
            worldId,
            allianceId: id,
            oldPoints: existing.points,
            newPoints: points,
            abpDelta: abp - existing.abp,
            dbpDelta: dbp - existing.dbp,
            allBpDelta: allBp - existing.allBp,
          });
          changed = true;
        }
        if (existing.name !== name || existing.towns !== newData.towns || existing.members !== newData.members || existing.rank !== newData.rank || existing.allBp !== allBp) changed = true;
        
        if (changed) alliancesToUpdate.push(newData);
      }
    }

    // 5. Process Players
    const newPlayers = [];
    const playersToUpdate = [];
    const playerHistory = [];
    const currentPlayers = await prisma.player.findMany({ where: { worldId } });
    const playerMap = new Map(currentPlayers.map(p => [p.id, p]));

    const validAllianceIds = new Set(seenAllianceIds);
    const seenPlayerIds = new Set();

    for (const row of playersRaw) {
      const [idStr, name, allianceIdStr, pointsStr, rankStr, townsStr] = row;
      const id = parseInt(idStr, 10);
      if (isNaN(id)) continue;
      
      if (seenPlayerIds.has(id)) continue;
      seenPlayerIds.add(id);

      const points = parseInt(pointsStr, 10) || 0;
      let allianceId = allianceIdStr ? parseInt(allianceIdStr, 10) : null;
      if (allianceId && !validAllianceIds.has(allianceId)) allianceId = null;

      const abp = pAttMap.get(id) || 0;
      const dbp = pDefMap.get(id) || 0;
      const allBp = pAllMap.get(id) || 0;

      const newData = {
        id, worldId, name, allianceId, points, 
        rank: parseInt(rankStr, 10) || 0, 
        towns: parseInt(townsStr, 10) || 0,
        abp, dbp, allBp
      };

      const existing = playerMap.get(id);
      if (!existing) {
        newPlayers.push(newData);
      } else {
        let changed = false;
        if (existing.points !== points || existing.abp !== abp || existing.dbp !== dbp) {
          playerHistory.push({
            worldId,
            playerId: id,
            oldPoints: existing.points,
            newPoints: points,
            abpDelta: abp - existing.abp,
            dbpDelta: dbp - existing.dbp,
            allBpDelta: allBp - existing.allBp,
          });
          changed = true;
        }
        if (existing.name !== name || existing.allianceId !== allianceId || existing.rank !== newData.rank || existing.towns !== newData.towns || existing.allBp !== allBp) changed = true;
        
        if (changed) playersToUpdate.push(newData);
      }
    }

    // 6. Process Towns
    const newTowns = [];
    const townsToUpdate = [];
    const townHistory = [];
    const currentTowns = await prisma.town.findMany({ 
      where: { worldId },
      select: { id: true, points: true, playerId: true, name: true, islandX: true, islandY: true } 
    });
    const townMap = new Map(currentTowns.map(t => [t.id, t]));

    const validPlayerIds = new Set(seenPlayerIds);
    const seenTownIds = new Set();

    for (const row of townsRaw) {
      const [idStr, playerIdStr, name, xStr, yStr, slotStr, pointsStr] = row;
      const id = parseInt(idStr, 10);
      if (isNaN(id)) continue;
      
      if (seenTownIds.has(id)) continue;
      seenTownIds.add(id);

      const points = parseInt(pointsStr, 10) || 0;
      let playerId = playerIdStr ? parseInt(playerIdStr, 10) : null;
      if (playerId && !validPlayerIds.has(playerId)) playerId = null;

      const newData = {
        id,
        worldId,
        playerId,
        name,
        islandX: parseInt(xStr, 10) || 0,
        islandY: parseInt(yStr, 10) || 0,
        islandSlot: parseInt(slotStr, 10) || 0,
        points
      };

      const existing = townMap.get(id);
      if (!existing) {
        newTowns.push(newData);
      } else {
        let changed = false;
        if (existing.points !== points) {
          townHistory.push({
            worldId,
            townId: id,
            oldPoints: existing.points,
            newPoints: points
          });
          changed = true;
        }
        if (existing.playerId !== playerId || existing.name !== name) changed = true;
        
        if (changed) townsToUpdate.push(newData);
      }
    }
    
    // 7. Process Islands
    const populatedSet = new Set();
    const townList = [...newTowns, ...townsToUpdate, ...currentTowns.filter(t => seenTownIds.has(t.id) && !townsToUpdate.some(u => u.id === t.id))];
    for (const t of townList) {
      if (t.islandX && t.islandY) populatedSet.add(`${t.islandX},${t.islandY}`);
    }

    const currentIslands = await prisma.island.findMany({ where: { worldId }, select: { id: true, availableTowns: true } });
    const islandMap = new Map(currentIslands.map(i => [i.id, i]));
    const newIslands = [];
    const islandsToUpdate = [];
    const seenIslandIds = new Set();

    for (const row of islandsRaw) {
      const [idStr, xStr, yStr, type, towns, rPlus, rMinus] = row;
      const id = parseInt(idStr, 10);
      if (isNaN(id)) continue;

      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);

      const distSq = Math.pow(x - 500, 2) + Math.pow(y - 500, 2);
      if (distSq > 250 * 250) continue;

      const availableTowns = parseInt(towns, 10) || 0;
      if (availableTowns === 0 && !populatedSet.has(`${x},${y}`)) continue;

      seenIslandIds.add(id);
      const newData = {
        id, worldId, x, y,
        type: parseInt(type, 10) || 0, 
        availableTowns,
        resourcePlus: rPlus || '', 
        resourceMinus: rMinus || ''
      };

      const existing = islandMap.get(id);
      if (!existing) {
        newIslands.push(newData);
      } else if (existing.availableTowns !== availableTowns) {
        islandsToUpdate.push(newData);
      }
    }

    // 8. Process Conquers
    const newConquers = [];
    const latestDbConquest = await prisma.conquest.findFirst({ 
      where: { worldId },
      orderBy: { timestamp: 'desc' } 
    });
    const lastConquestEpoch = latestDbConquest ? Math.floor(latestDbConquest.timestamp.getTime() / 1000) : 0;
    
    for (const row of conquersRaw) {
      const [townIdStr, tsStr, newPStr, oldPStr, newAStr, oldAStr, pointsStr] = row;
      const timestampSec = parseInt(tsStr, 10);
      if (isNaN(timestampSec)) continue;
      
      if (timestampSec > lastConquestEpoch) {
        newConquers.push({
          worldId,
          townId: parseInt(townIdStr, 10) || 0,
          townPoints: parseInt(pointsStr, 10) || 0,
          oldPlayerId: oldPStr && oldPStr !== '' ? parseInt(oldPStr, 10) : null,
          newPlayerId: newPStr && newPStr !== '' ? parseInt(newPStr, 10) : null,
          oldAllianceId: oldAStr && oldAStr !== '' ? parseInt(oldAStr, 10) : null,
          newAllianceId: newAStr && newAStr !== '' ? parseInt(newAStr, 10) : null,
          timestamp: new Date(timestampSec * 1000)
        });
      }
    }

    // 9. Execute Database Transactions
    const tx = [];

    // Removals for this world only
    const townsToRemove = currentTowns.filter(t => !seenTownIds.has(t.id)).map(t => t.id);
    const playersToRemove = currentPlayers.filter(p => !seenPlayerIds.has(p.id)).map(p => p.id);
    const alliancesToRemove = currentAlliances.filter(a => !seenAllianceIds.has(a.id)).map(a => a.id);
    const islandsToRemove = currentIslands.filter(i => !seenIslandIds.has(i.id)).map(i => i.id);

    // Unlink players from alliances that are being deleted
    if (alliancesToRemove.length > 0) {
      tx.push(prisma.player.updateMany({
        where: { worldId, allianceId: { in: alliancesToRemove } },
        data: { allianceId: null }
      }));
    }

    // Unlink towns from players that are being deleted (ghost towns)
    if (playersToRemove.length > 0) {
      tx.push(prisma.town.updateMany({
        where: { worldId, playerId: { in: playersToRemove } },
        data: { playerId: null }
      }));
    }

    // Execute deletions
    if (townsToRemove.length > 0) tx.push(prisma.town.deleteMany({ where: { worldId, id: { in: townsToRemove } } }));
    if (playersToRemove.length > 0) tx.push(prisma.player.deleteMany({ where: { worldId, id: { in: playersToRemove } } }));
    if (alliancesToRemove.length > 0) tx.push(prisma.alliance.deleteMany({ where: { worldId, id: { in: alliancesToRemove } } }));
    if (islandsToRemove.length > 0) tx.push(prisma.island.deleteMany({ where: { worldId, id: { in: islandsToRemove } } }));

    const chunkArray = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
      return chunks;
    };

    // Inserts
    if (newAlliances.length > 0) chunkArray(newAlliances, CREATE_BATCH_SIZE).forEach(chunk => tx.push(prisma.alliance.createMany({ data: chunk })));
    if (newPlayers.length > 0) chunkArray(newPlayers, CREATE_BATCH_SIZE).forEach(chunk => tx.push(prisma.player.createMany({ data: chunk })));
    if (newTowns.length > 0) chunkArray(newTowns, CREATE_BATCH_SIZE).forEach(chunk => tx.push(prisma.town.createMany({ data: chunk })));
    if (newIslands.length > 0) chunkArray(newIslands, CREATE_BATCH_SIZE).forEach(chunk => tx.push(prisma.island.createMany({ data: chunk })));

    // Updates with parameterized sanitization
    if (alliancesToUpdate.length > 0) {
      chunkArray(alliancesToUpdate, UPDATE_BATCH_SIZE).forEach(chunk => {
        const values = chunk.map(a => 
          `(${sanitizeInt(a.id)}, '${worldId}', ${escapeSqlString(a.name)}, ${sanitizeInt(a.points)}, ${sanitizeInt(a.towns)}, ${sanitizeInt(a.members)}, ${sanitizeInt(a.rank)}, ${sanitizeInt(a.abp)}, ${sanitizeInt(a.dbp)}, ${sanitizeInt(a.allBp)})`
        ).join(',');
        tx.push(prisma.$executeRawUnsafe(`
          UPDATE "Alliance" AS a SET
            "name" = v."name", "points" = v."points", "towns" = v."towns", "members" = v."members", "rank" = v."rank", "abp" = v."abp", "dbp" = v."dbp", "allBp" = v."allBp"
          FROM (VALUES ${values}) AS v("id", "worldId", "name", "points", "towns", "members", "rank", "abp", "dbp", "allBp")
          WHERE a."id" = v."id" AND a."worldId" = v."worldId"
        `));
      });
    }
    
    if (playersToUpdate.length > 0) {
      chunkArray(playersToUpdate, UPDATE_BATCH_SIZE).forEach(chunk => {
        const values = chunk.map(p => 
          `(${sanitizeInt(p.id)}, '${worldId}', ${escapeSqlString(p.name)}, ${sanitizeNullableInt(p.allianceId)}, ${sanitizeInt(p.points)}, ${sanitizeInt(p.rank)}, ${sanitizeInt(p.towns)}, ${sanitizeInt(p.abp)}, ${sanitizeInt(p.dbp)}, ${sanitizeInt(p.allBp)})`
        ).join(',');
        tx.push(prisma.$executeRawUnsafe(`
          UPDATE "Player" AS p SET
            "name" = v."name", "allianceId" = v."allianceId", "points" = v."points", "rank" = v."rank", "towns" = v."towns", "abp" = v."abp", "dbp" = v."dbp", "allBp" = v."allBp"
          FROM (VALUES ${values}) AS v("id", "worldId", "name", "allianceId", "points", "rank", "towns", "abp", "dbp", "allBp")
          WHERE p."id" = v."id" AND p."worldId" = v."worldId"
        `));
      });
    }

    if (townsToUpdate.length > 0) {
      chunkArray(townsToUpdate, UPDATE_BATCH_SIZE).forEach(chunk => {
        const values = chunk.map(t => 
          `(${sanitizeInt(t.id)}, '${worldId}', ${sanitizeNullableInt(t.playerId)}, ${escapeSqlString(t.name)}, ${sanitizeInt(t.islandX)}, ${sanitizeInt(t.islandY)}, ${sanitizeInt(t.islandSlot)}, ${sanitizeInt(t.points)})`
        ).join(',');
        tx.push(prisma.$executeRawUnsafe(`
          UPDATE "Town" AS t SET
            "playerId" = v."playerId", "name" = v."name", "islandX" = v."islandX", "islandY" = v."islandY", "islandSlot" = v."islandSlot", "points" = v."points"
          FROM (VALUES ${values}) AS v("id", "worldId", "playerId", "name", "islandX", "islandY", "islandSlot", "points")
          WHERE t."id" = v."id" AND t."worldId" = v."worldId"
        `));
      });
    }

    if (islandsToUpdate.length > 0) {
      chunkArray(islandsToUpdate, UPDATE_BATCH_SIZE).forEach(chunk => {
        const values = chunk.map(i => 
          `(${sanitizeInt(i.id)}, '${worldId}', ${sanitizeInt(i.availableTowns)})`
        ).join(',');
        tx.push(prisma.$executeRawUnsafe(`
          UPDATE "Island" AS i SET "availableTowns" = v."availableTowns"
          FROM (VALUES ${values}) AS v("id", "worldId", "availableTowns")
          WHERE i."id" = v."id" AND i."worldId" = v."worldId"
        `));
      });
    }

    // History & Conquers
    if (allianceHistory.length > 0) {
      chunkArray(allianceHistory, UPDATE_BATCH_SIZE).forEach(chunk => {
        const values = chunk.map(h => 
          `(${sanitizeInt(h.allianceId)}, '${worldId}', ${sanitizeInt(h.oldPoints)}, ${sanitizeInt(h.newPoints)}, ${sanitizeInt(h.abpDelta)}, ${sanitizeInt(h.dbpDelta)}, ${sanitizeInt(h.allBpDelta)}, NOW())`
        ).join(',');
        tx.push(prisma.$executeRawUnsafe(`
          INSERT INTO "AllianceHistory" ("allianceId", "worldId", "oldPoints", "newPoints", "abpDelta", "dbpDelta", "allBpDelta", "timestamp")
          VALUES ${values}
        `));
      });
    }
    
    if (playerHistory.length > 0) {
      chunkArray(playerHistory, UPDATE_BATCH_SIZE).forEach(chunk => {
        const values = chunk.map(h => 
          `(${sanitizeInt(h.playerId)}, '${worldId}', ${sanitizeInt(h.oldPoints)}, ${sanitizeInt(h.newPoints)}, ${sanitizeInt(h.abpDelta)}, ${sanitizeInt(h.dbpDelta)}, ${sanitizeInt(h.allBpDelta)}, NOW())`
        ).join(',');
        tx.push(prisma.$executeRawUnsafe(`
          INSERT INTO "PlayerHistory" ("playerId", "worldId", "oldPoints", "newPoints", "abpDelta", "dbpDelta", "allBpDelta", "timestamp")
          VALUES ${values}
        `));
      });
    }

    if (townHistory.length > 0) {
      chunkArray(townHistory, UPDATE_BATCH_SIZE).forEach(chunk => {
        const values = chunk.map(h => 
          `(${sanitizeInt(h.townId)}, '${worldId}', ${sanitizeInt(h.oldPoints)}, ${sanitizeInt(h.newPoints)}, NOW())`
        ).join(',');
        tx.push(prisma.$executeRawUnsafe(`
          INSERT INTO "TownHistory" ("townId", "worldId", "oldPoints", "newPoints", "timestamp")
          VALUES ${values}
        `));
      });
    }

    if (newConquers.length > 0) chunkArray(newConquers, CREATE_BATCH_SIZE).forEach(chunk => tx.push(prisma.conquest.createMany({ data: chunk })));

    // Explicit 60s transaction timeout
    await prisma.$transaction(tx, {
      timeout: 60000,
      maxWait: 10000
    });

    // 9.5 Automatic In-Game Town Rename Verification Check
    try {
      const unverifiedMembers = await prisma.teamMember.findMany({
        where: {
          worldId,
          verificationStatus: 'UNVERIFIED'
        },
        include: { user: true }
      });

      if (unverifiedMembers.length > 0) {
        for (const member of unverifiedMembers) {
          const matchingTown = await prisma.town.findFirst({
            where: {
              worldId,
              playerId: member.playerId,
              name: {
                contains: member.verificationCode
              }
            }
          });

          if (matchingTown) {
            await prisma.teamMember.update({
              where: { id: member.id },
              data: {
                verificationStatus: 'VERIFIED',
                verifiedAt: new Date()
              }
            });

            try {
              const { logAuditEvent } = await import('./auth/audit.js');
              await logAuditEvent({
                userId: member.userId,
                actorUsername: member.user?.username || member.playerName,
                action: 'TOWN_VERIFIED',
                targetResource: `town:${matchingTown.id}`,
                status: 'SUCCESS',
                details: {
                  worldId,
                  playerId: member.playerId,
                  townId: matchingTown.id,
                  townName: matchingTown.name,
                  verificationCode: member.verificationCode,
                  method: 'SYNC_AUTOMATIC'
                }
              });
            } catch (auditErr) {
              console.warn('[SyncEngine] Failed to log audit event for town verification:', auditErr);
            }
            console.log(`[SyncEngine] Verified player "${member.playerName}" on world [${worldId}] via town rename "${matchingTown.name}"!`);
          }
        }
      }
    } catch (verifyErr) {
      console.warn(`[SyncEngine] Warning: Automatic town verification scan failed for world ${worldId}:`, verifyErr.message);
    }

    const syncTime = new Date();

    // 10. Direct In-Memory Cache Generation (Zero HTTP loopback dependence)
    let geoJsonGzip = null;
    let scoreboardGzip = null;

    if (!skipCacheBuild) {
      try {
        console.log(`[SyncEngine] Generating atomic Scoreboard & GeoJSON caches for world [${worldId}]...`);
        const { generateScoreboardData } = await import('./scoreboard.js');
        const { generateGeoJSON } = await import('./geojson.js');
        const [scoreboardData, geoJsonData] = await Promise.all([
          generateScoreboardData(worldId),
          generateGeoJSON(worldId)
        ]);

        scoreboardGzip = zlib.gzipSync(JSON.stringify(scoreboardData)).toString('base64');
        geoJsonGzip = zlib.gzipSync(JSON.stringify(geoJsonData)).toString('base64');
      } catch (cacheErr) {
        console.warn(`[SyncEngine] Warning: Failed to pre-generate cache for world ${worldId}:`, cacheErr);
      }
    }

    // 11. Update World row with lastSync and caches
    const updateData = { lastSync: syncTime };
    if (scoreboardGzip) updateData.scoreboardCache = scoreboardGzip;
    if (geoJsonGzip) updateData.geoJsonCache = geoJsonGzip;

    await prisma.world.update({
      where: { id: worldId },
      data: updateData
    });

    console.log(`[SyncEngine] World ${worldId} sync complete! (+${newPlayers.length} new players, +${newTowns.length} new towns)`);

    return { 
      success: true, 
      worldId, 
      lastSync: syncTime,
      stats: {
        alliances: newAlliances.length,
        players: newPlayers.length,
        towns: newTowns.length,
        islands: newIslands.length,
        deltas: {
          alliances: allianceHistory.length,
          players: playerHistory.length,
          towns: townHistory.length
        },
        conquers: newConquers.length
      }
    };

  } catch (error) {
    console.error(`[SyncEngine] Sync Error for world ${worldId}:`, error);
    return { success: false, worldId, error: error.message };
  }
}

/**
 * Synchronize all active worlds sequentially
 */
export async function syncAllActiveWorlds(options = {}) {
  try {
    let activeWorlds = await prisma.world.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' }
    });

    if (!activeWorlds || activeWorlds.length === 0) {
      console.log('[SyncEngine] No active worlds found in database. Initializing default world hu119...');
      activeWorlds = [{ id: 'hu119', server: 'hu119' }];
    }

    console.log(`[SyncEngine] Starting scheduled synchronization for ${activeWorlds.length} active world(s): [${activeWorlds.map(w => w.id).join(', ')}]`);

    const results = [];
    for (const world of activeWorlds) {
      const res = await syncWorld(world.id, options);
      results.push(res);
    }

    return { 
      success: true, 
      timestamp: new Date(),
      totalWorlds: activeWorlds.length,
      results 
    };
  } catch (error) {
    console.error('[SyncEngine] Error in syncAllActiveWorlds:', error);
    return { 
      success: false, 
      timestamp: new Date(),
      error: error.message 
    };
  }
}
