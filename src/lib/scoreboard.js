import { prisma } from './prisma.js';
import { getBaselineTime } from './constants.js';

function calcTrend(valA, valB) {
  if (valB === 0) return valA > 0 ? 100 : 0;
  const trend = ((valA - valB) / Math.abs(valB)) * 100;
  return Math.round(Math.max(-100, trend));
}

function toMap(mapOrObject) {
  if (!mapOrObject) return null;
  if (mapOrObject instanceof Map) return mapOrObject;
  if (Array.isArray(mapOrObject)) {
    return new Map(mapOrObject.map(item => [item.id, item]));
  }
  return new Map(Object.entries(mapOrObject).map(([k, v]) => [Number.isNaN(Number(k)) ? k : Number(k), v]));
}

/**
 * Shared pure helper that computes recentGain (points, attackPoints, defendPoints, towns)
 * and Window A vs Window B momentum trends for players or alliances.
 */
export function computeEntityMomentum({
  entities = [],
  historyByEntityId = null,
  conquests = [],
  entityType = 'player',
  nowMs = Date.now(),
  windowHours = 24,
  baselineTime = null
} = {}) {
  const entityList = entities instanceof Map ? Array.from(entities.values()) : (entities || []);
  const idField = entityType === 'alliance' ? 'allianceId' : 'playerId';
  const resolvedNowMs = nowMs instanceof Date ? nowMs.getTime() : Number(nowMs || Date.now());
  const windowDurationMs = windowHours * 60 * 60 * 1000;

  const windowAStartMs = baselineTime != null
    ? (baselineTime instanceof Date ? baselineTime.getTime() : new Date(baselineTime).getTime())
    : (resolvedNowMs - windowDurationMs);
  const windowBStartMs = windowAStartMs - windowDurationMs;
  const windowBEndMs = windowAStartMs;

  // Normalize history lookup by entity ID
  const historyMap = new Map();
  if (historyByEntityId instanceof Map) {
    for (const [k, rows] of historyByEntityId.entries()) {
      historyMap.set(Number(k), rows || []);
    }
  } else if (Array.isArray(historyByEntityId)) {
    for (const row of historyByEntityId) {
      const id = row[idField] ?? row.playerId ?? row.allianceId ?? row.entityId;
      if (id == null) continue;
      const numId = Number(id);
      if (!historyMap.has(numId)) historyMap.set(numId, []);
      historyMap.get(numId).push(row);
    }
  } else if (historyByEntityId && typeof historyByEntityId === 'object') {
    for (const [k, rows] of Object.entries(historyByEntityId)) {
      historyMap.set(Number(k), rows || []);
    }
  }

  // Count Window A conquests and losses per entity
  const conquestsCount = {};
  const lossesCount = {};
  for (const c of conquests || []) {
    if (c.timestamp != null) {
      const cTs = c.timestamp instanceof Date ? c.timestamp.getTime() : new Date(c.timestamp).getTime();
      if (cTs < windowAStartMs) continue;
    }
    const newId = entityType === 'alliance' ? c.newAllianceId : c.newPlayerId;
    const oldId = entityType === 'alliance' ? c.oldAllianceId : c.oldPlayerId;
    if (newId) conquestsCount[newId] = (conquestsCount[newId] || 0) + 1;
    if (oldId) lossesCount[oldId] = (lossesCount[oldId] || 0) + 1;
  }

  return entityList.map(entity => {
    const rows = historyMap.get(Number(entity.id)) || [];
    const gainsA = { pts: 0, abp: 0, dbp: 0 };
    const gainsB = { pts: 0, abp: 0, dbp: 0 };

    for (const h of rows) {
      const ts = h.timestamp instanceof Date ? h.timestamp.getTime() : new Date(h.timestamp).getTime();
      const ptsDelta = h.newPoints != null && h.oldPoints != null
        ? (h.newPoints - h.oldPoints)
        : (h.pointsDelta ?? 0);
      const abpDelta = h.abpDelta ?? h.attackPointsDelta ?? 0;
      const dbpDelta = h.dbpDelta ?? h.defendPointsDelta ?? 0;

      if (ts >= windowAStartMs) {
        gainsA.pts += ptsDelta;
        gainsA.abp += abpDelta;
        gainsA.dbp += dbpDelta;
      } else if (ts >= windowBStartMs && ts < windowBEndMs) {
        gainsB.pts += ptsDelta;
        gainsB.abp += abpDelta;
        gainsB.dbp += dbpDelta;
      }
    }

    const trendPts = calcTrend(gainsA.pts, gainsB.pts);
    const trendAbp = calcTrend(gainsA.abp, gainsB.abp);
    const trendDbp = calcTrend(gainsA.dbp, gainsB.dbp);
    const entityConquests = conquestsCount[entity.id] || 0;
    const entityLosses = lossesCount[entity.id] || 0;
    const netTowns = entityConquests - entityLosses;

    return {
      ...entity,
      recentGain: {
        points: gainsA.pts,
        attackPoints: gainsA.abp,
        defendPoints: gainsA.dbp,
        towns: netTowns,
        pts: gainsA.pts,
        abp: gainsA.abp,
        dbp: gainsA.dbp,
        conquests: entityConquests,
        losses: entityLosses
      },
      momentum: {
        points: trendPts,
        attackPoints: trendAbp,
        defendPoints: trendDbp,
        pts: trendPts,
        abp: trendAbp,
        dbp: trendDbp,
        windowA: {
          points: gainsA.pts,
          attackPoints: gainsA.abp,
          defendPoints: gainsA.dbp,
          towns: netTowns
        },
        windowB: {
          points: gainsB.pts,
          attackPoints: gainsB.abp,
          defendPoints: gainsB.dbp
        }
      },
      momentumPts: gainsA.pts,
      momentumAbp: gainsA.abp,
      momentumDbp: gainsA.dbp,
      trendPts,
      trendAbp,
      trendDbp,
      gainsAPts: gainsA.pts,
      gainsAAbp: gainsA.abp,
      gainsADbp: gainsA.dbp,
      gainsBPts: gainsB.pts,
      gainsBAbp: gainsB.abp,
      gainsBDbp: gainsB.dbp,
      conquests: entityConquests,
      losses: entityLosses
    };
  });
}

/**
 * Shared helper that computes 7-day pointDelta / lastActive from history rows
 * and enriches conquests with oldPlayerObj, newPlayerObj, oldAllianceObj, newAllianceObj.
 */
export async function enrichConquestsAndActivity({
  conquests = [],
  historyRows = [],
  entityIds = [],
  entityField = 'playerId',
  prismaClient = prisma,
  worldId = 'hu119',
  preloadedPlayersMap = null,
  preloadedAlliancesMap = null
} = {}) {
  const groupedHistory = new Map();
  for (const h of historyRows || []) {
    const id = h[entityField];
    if (id == null) continue;
    if (!groupedHistory.has(id)) groupedHistory.set(id, []);
    groupedHistory.get(id).push(h);
  }

  const targetIds = entityIds && entityIds.length > 0
    ? entityIds
    : Array.from(groupedHistory.keys());

  const activityByEntityId = {};
  for (const id of targetIds) {
    const hist = (groupedHistory.get(id) || []).slice().sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    if (hist.length > 0) {
      const oldest = hist[0];
      const newest = hist[hist.length - 1];
      activityByEntityId[id] = {
        pointDelta: newest.newPoints - oldest.oldPoints,
        lastActive: newest.timestamp
      };
    } else {
      activityByEntityId[id] = { pointDelta: 0, lastActive: null };
    }
  }

  let activity = { pointDelta: 0, lastActive: null };
  if (entityIds && entityIds.length === 1) {
    activity = activityByEntityId[entityIds[0]] || { pointDelta: 0, lastActive: null };
  } else if (historyRows && historyRows.length > 0) {
    const sorted = historyRows.slice().sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const oldest = sorted[0];
    const newest = sorted[sorted.length - 1];
    activity = {
      pointDelta: newest.newPoints - oldest.oldPoints,
      lastActive: newest.timestamp
    };
  }

  let pMap = toMap(preloadedPlayersMap);
  let aMap = toMap(preloadedAlliancesMap);

  if (!pMap || !aMap) {
    const pIds = new Set();
    const aIds = new Set();
    for (const c of conquests || []) {
      if (c.oldPlayerId) pIds.add(c.oldPlayerId);
      if (c.newPlayerId) pIds.add(c.newPlayerId);
      if (c.oldAllianceId) aIds.add(c.oldAllianceId);
      if (c.newAllianceId) aIds.add(c.newAllianceId);
    }

    const [players, alliances] = await Promise.all([
      !pMap && pIds.size > 0 && prismaClient?.player?.findMany
        ? prismaClient.player.findMany({
            where: { worldId, id: { in: Array.from(pIds) } },
            select: { id: true, name: true }
          })
        : [],
      !aMap && aIds.size > 0 && prismaClient?.alliance?.findMany
        ? prismaClient.alliance.findMany({
            where: { worldId, id: { in: Array.from(aIds) } },
            select: { id: true, name: true }
          })
        : []
    ]);

    if (!pMap) pMap = new Map((players || []).map(p => [p.id, p]));
    if (!aMap) aMap = new Map((alliances || []).map(a => [a.id, a]));
  }

  const enrichedConquests = (conquests || []).map(c => ({
    ...c,
    oldPlayerObj: c.oldPlayerId ? (pMap.get(c.oldPlayerId) || null) : null,
    newPlayerObj: c.newPlayerId ? (pMap.get(c.newPlayerId) || null) : null,
    oldAllianceObj: c.oldAllianceId ? (aMap.get(c.oldAllianceId) || null) : null,
    newAllianceObj: c.newAllianceId ? (aMap.get(c.newAllianceId) || null) : null
  }));

  return {
    conquests: enrichedConquests,
    activity,
    activityMap: activityByEntityId,
    activityByEntityId
  };
}

/**
 * Pure projection: compiles the Scoreboard data payload from in-memory world entities and history.
 */
export function compileScoreboardSnapshot({
  worldId = 'hu119',
  players = [],
  alliances = [],
  conquests = [],
  towns = [],
  playerHistoryRows = null,
  allianceHistoryRows = null,
  playerHistory = [],
  allianceHistory = [],
  now = new Date(),
  baselineTime = null
} = {}) {
  const syncNow = now instanceof Date ? now : new Date(now || Date.now());
  const defaultBaseline = getBaselineTime();
  // Use explicit baselineTime if provided; if `now` is synthetic (far from wall clock), anchor baseline to syncNow - 24h
  const baseline = baselineTime != null
    ? (baselineTime instanceof Date ? baselineTime : new Date(baselineTime))
    : (Math.abs(syncNow.getTime() - Date.now()) > 60 * 60 * 1000 || defaultBaseline > syncNow
        ? new Date(syncNow.getTime() - 24 * 60 * 60 * 1000)
        : defaultBaseline);

  const windowBStart = new Date(baseline.getTime() - 24 * 60 * 60 * 1000);
  const windowBEnd = baseline;
  const recentStart = new Date(syncNow.getTime() - 65 * 60 * 1000);

  const allPlayerHistory = playerHistoryRows ?? playerHistory ?? [];
  const allAllianceHistory = allianceHistoryRows ?? allianceHistory ?? [];

  const toDate = (ts) => (ts instanceof Date ? ts : new Date(ts));

  // Filter history in memory
  const playerHistoryA = allPlayerHistory.filter(h => toDate(h.timestamp) >= baseline);
  const playerHistoryB = allPlayerHistory.filter(h => {
    const d = toDate(h.timestamp);
    return d >= windowBStart && d < windowBEnd;
  });
  const recentPlayerHistory = allPlayerHistory.filter(h => toDate(h.timestamp) >= recentStart);

  const allianceHistoryA = allAllianceHistory.filter(h => toDate(h.timestamp) >= baseline);
  const allianceHistoryB = allAllianceHistory.filter(h => {
    const d = toDate(h.timestamp);
    return d >= windowBStart && d < windowBEnd;
  });
  const recentAllianceHistory = allAllianceHistory.filter(h => toDate(h.timestamp) >= recentStart);

  const gaMap = new Map();
  (alliances || []).forEach(a => gaMap.set(a.id, a));

  const gpMap = new Map();
  (players || []).forEach(p => {
    const resolvedPlayer = p.alliance === undefined && p.allianceId != null
      ? { ...p, alliance: gaMap.has(p.allianceId) ? { name: gaMap.get(p.allianceId).name } : null }
      : p;
    gpMap.set(p.id, resolvedPlayer);
  });

  const townMap = new Map((towns || []).map(t => [t.id, t]));

  // Enrich Conquests & Count
  const pConquests = {};
  const pLosses = {};
  const aConquests = {};
  const aLosses = {};

  const enrichedConquests = (conquests || []).map(c => {
    const np = gpMap.get(c.newPlayerId);
    const op = gpMap.get(c.oldPlayerId);
    const na = gaMap.get(c.newAllianceId);
    const oa = gaMap.get(c.oldAllianceId);
    const t = townMap.get(c.townId);

    if (c.newPlayerId) pConquests[c.newPlayerId] = (pConquests[c.newPlayerId] || 0) + 1;
    if (c.oldPlayerId) pLosses[c.oldPlayerId] = (pLosses[c.oldPlayerId] || 0) + 1;
    if (c.newAllianceId) aConquests[c.newAllianceId] = (aConquests[c.newAllianceId] || 0) + 1;
    if (c.oldAllianceId) aLosses[c.oldAllianceId] = (aLosses[c.oldAllianceId] || 0) + 1;

    return {
      ...c,
      townName: t ? t.name : (c.townName || `Ghost Town (${c.townId})`),
      townX: t ? t.islandX : (c.townX ?? null),
      townY: t ? t.islandY : (c.townY ?? null),
      newPlayer: np ? np.name : null,
      oldPlayer: op ? op.name : null,
      newAlliance: na ? na.name : null,
      oldAlliance: oa ? oa.name : null,
      newPlayerObj: np || null,
      oldPlayerObj: op || null,
      newAllianceObj: na || null,
      oldAllianceObj: oa || null,
    };
  });

  const calculateGains = (history) => {
    const gains = {};
    history.forEach(h => {
      const id = h.playerId || h.allianceId;
      if (!gains[id]) gains[id] = { pts: 0, abp: 0, dbp: 0 };
      gains[id].pts += (h.newPoints - h.oldPoints);
      gains[id].abp += h.abpDelta;
      gains[id].dbp += h.dbpDelta;
    });
    return gains;
  };

  const playerGainsA = calculateGains(playerHistoryA);
  const allianceGainsA = calculateGains(allianceHistoryA);
  const playerGainsB = calculateGains(playerHistoryB);
  const allianceGainsB = calculateGains(allianceHistoryB);
  const recentPlayerGains = calculateGains(recentPlayerHistory);
  const recentAllianceGains = calculateGains(recentAllianceHistory);

  const attachTrendsAndGetTop = (entitiesMap, gainsA, gainsB, sortKey) => {
    return Array.from(entitiesMap.values())
      .sort((a, b) => b[sortKey] - a[sortKey])
      .slice(0, 10)
      .map(e => ({
        ...e,
        trendPts: calcTrend(gainsA[e.id]?.pts || 0, gainsB[e.id]?.pts || 0),
        trendAbp: calcTrend(gainsA[e.id]?.abp || 0, gainsB[e.id]?.abp || 0),
        trendDbp: calcTrend(gainsA[e.id]?.dbp || 0, gainsB[e.id]?.dbp || 0),
        gainsAPts: gainsA[e.id]?.pts || 0,
        gainsAAbp: gainsA[e.id]?.abp || 0,
        gainsADbp: gainsA[e.id]?.dbp || 0,
        gainsBPts: gainsB[e.id]?.pts || 0,
        gainsBAbp: gainsB[e.id]?.abp || 0,
        gainsBDbp: gainsB[e.id]?.dbp || 0,
      }));
  };

  const formatGainerList = (gainsDict, entityMap, sortKey, recentGains) => {
    return Object.entries(gainsDict)
      .map(([id, gains]) => {
        const entity = entityMap.get(parseInt(id, 10));
        if (!entity) return null;
        return {
          ...entity,
          momentum: gains[sortKey],
          recentGain: recentGains[id] ? recentGains[id][sortKey] : 0
        };
      })
      .filter(item => item !== null && item.momentum > 0)
      .sort((a, b) => b.momentum - a.momentum)
      .slice(0, 15);
  };

  const formatCounts = (countsDict, entityMap) => {
    return Object.entries(countsDict)
      .map(([id, count]) => {
        const entity = entityMap.get(parseInt(id, 10));
        if (!entity) return null;
        return { ...entity, count };
      })
      .filter(item => item !== null)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  };

  return {
    worldId,
    players: {
      pts: attachTrendsAndGetTop(gpMap, playerGainsA, playerGainsB, 'points'),
      abp: attachTrendsAndGetTop(gpMap, playerGainsA, playerGainsB, 'abp'),
      dbp: attachTrendsAndGetTop(gpMap, playerGainsA, playerGainsB, 'dbp'),
      allbp: attachTrendsAndGetTop(gpMap, playerGainsA, playerGainsB, 'allBp'),
      momentumPts: formatGainerList(playerGainsA, gpMap, 'pts', recentPlayerGains),
      momentumAbp: formatGainerList(playerGainsA, gpMap, 'abp', recentPlayerGains),
      momentumDbp: formatGainerList(playerGainsA, gpMap, 'dbp', recentPlayerGains),
      conquests: formatCounts(pConquests, gpMap),
      losses: formatCounts(pLosses, gpMap)
    },
    alliances: {
      pts: attachTrendsAndGetTop(gaMap, allianceGainsA, allianceGainsB, 'points'),
      abp: attachTrendsAndGetTop(gaMap, allianceGainsA, allianceGainsB, 'abp'),
      dbp: attachTrendsAndGetTop(gaMap, allianceGainsA, allianceGainsB, 'dbp'),
      allbp: attachTrendsAndGetTop(gaMap, allianceGainsA, allianceGainsB, 'allBp'),
      momentumPts: formatGainerList(allianceGainsA, gaMap, 'pts', recentAllianceGains),
      momentumAbp: formatGainerList(allianceGainsA, gaMap, 'abp', recentAllianceGains),
      momentumDbp: formatGainerList(allianceGainsA, gaMap, 'dbp', recentAllianceGains),
      conquests: formatCounts(aConquests, gaMap),
      losses: formatCounts(aLosses, gaMap)
    },
    conquests: enrichedConquests,
  };
}

export async function generateScoreboardData(worldId = 'hu119', { snapshot = null, prismaClient = prisma } = {}) {
  if (
    snapshot &&
    snapshot.players &&
    snapshot.alliances &&
    snapshot.conquests &&
    (snapshot.playerHistoryRows || snapshot.playerHistory) &&
    (snapshot.allianceHistoryRows || snapshot.allianceHistory)
  ) {
    return compileScoreboardSnapshot({
      worldId,
      ...snapshot
    });
  }

  const world = await prismaClient.world.findUnique({ where: { id: worldId } });
  const baselineSyncTime = snapshot?.now || world?.lastSync || new Date();

  const baseline = getBaselineTime();
  const windowBStart = new Date(baseline.getTime() - 24 * 60 * 60 * 1000);

  // Lock the rolling window to the exact time of the last successful data update
  const recentStart = new Date(baselineSyncTime.getTime() - 65 * 60 * 1000);
  const queryStart = new Date(Math.min(windowBStart.getTime(), recentStart.getTime()));

  const [
    players,
    alliances,
    conquests,
    allPlayerHistory,
    allAllianceHistory
  ] = await Promise.all([
    snapshot?.players ?? prismaClient.player.findMany({
      where: { worldId },
      select: { id: true, name: true, points: true, abp: true, dbp: true, allBp: true, alliance: { select: { name: true } } }
    }),
    snapshot?.alliances ?? prismaClient.alliance.findMany({
      where: { worldId },
      select: { id: true, name: true, points: true, abp: true, dbp: true, allBp: true }
    }),
    snapshot?.conquests ?? prismaClient.conquest.findMany({
      where: { worldId, timestamp: { gte: windowBStart } },
      orderBy: { timestamp: 'desc' },
      take: 50
    }),
    snapshot?.playerHistoryRows ?? snapshot?.playerHistory ?? prismaClient.playerHistory.findMany({
      where: { worldId, timestamp: { gte: queryStart } }
    }),
    snapshot?.allianceHistoryRows ?? snapshot?.allianceHistory ?? prismaClient.allianceHistory.findMany({
      where: { worldId, timestamp: { gte: queryStart } }
    })
  ]);

  const townIds = (conquests || []).map(c => c.townId);
  const towns = snapshot?.towns ?? (
    townIds.length > 0
      ? await prismaClient.town.findMany({
          where: { worldId, id: { in: townIds } },
          select: { id: true, name: true, islandX: true, islandY: true }
        })
      : []
  );

  return compileScoreboardSnapshot({
    worldId,
    players,
    alliances,
    conquests,
    towns,
    playerHistoryRows: allPlayerHistory,
    allianceHistoryRows: allAllianceHistory,
    now: baselineSyncTime,
    baselineTime: baseline
  });
}
