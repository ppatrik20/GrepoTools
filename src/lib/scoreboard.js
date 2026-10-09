import { prisma } from './prisma.js';
import { getBaselineTime } from './constants.js';

export async function generateScoreboardData(worldId = 'hu119') {
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  const baselineSyncTime = world?.lastSync || new Date();
  
  const baseline = getBaselineTime();
  const windowBStart = new Date(baseline.getTime() - 24 * 60 * 60 * 1000);
  const windowBEnd = baseline;
  
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
    prisma.player.findMany({
      where: { worldId },
      select: { id: true, name: true, points: true, abp: true, dbp: true, allBp: true, alliance: { select: { name: true } } }
    }),
    prisma.alliance.findMany({
      where: { worldId },
      select: { id: true, name: true, points: true, abp: true, dbp: true, allBp: true }
    }),
    prisma.conquest.findMany({
      where: { worldId, timestamp: { gte: windowBStart } },
      orderBy: { timestamp: 'desc' },
      take: 50
    }),
    prisma.playerHistory.findMany({ where: { worldId, timestamp: { gte: queryStart } } }),
    prisma.allianceHistory.findMany({ where: { worldId, timestamp: { gte: queryStart } } })
  ]);

  // Filter history in memory
  const playerHistoryA = allPlayerHistory.filter(h => h.timestamp >= baseline);
  const playerHistoryB = allPlayerHistory.filter(h => h.timestamp >= windowBStart && h.timestamp < windowBEnd);
  const recentPlayerHistory = allPlayerHistory.filter(h => h.timestamp >= recentStart);

  const allianceHistoryA = allAllianceHistory.filter(h => h.timestamp >= baseline);
  const allianceHistoryB = allAllianceHistory.filter(h => h.timestamp >= windowBStart && h.timestamp < windowBEnd);
  const recentAllianceHistory = allAllianceHistory.filter(h => h.timestamp >= recentStart);

  // Fast lookups
  const gpMap = new Map();
  players.forEach(p => gpMap.set(p.id, p));

  const gaMap = new Map();
  alliances.forEach(a => gaMap.set(a.id, a));

  // Fetch Towns for Conquests
  const townIds = conquests.map(c => c.townId);
  const towns = townIds.length > 0 ? await prisma.town.findMany({
    where: { worldId, id: { in: townIds } },
    select: { id: true, name: true, islandX: true, islandY: true }
  }) : [];
  const townMap = new Map(towns.map(t => [t.id, t]));

  // Enrich Conquests & Count
  const pConquests = {};
  const pLosses = {};
  const aConquests = {};
  const aLosses = {};

  const enrichedConquests = conquests.map(c => {
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
      townName: t ? t.name : `Ghost Town (${c.townId})`,
      townX: t ? t.islandX : null,
      townY: t ? t.islandY : null,
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

  const calcTrend = (valA, valB) => {
    if (valB === 0) return valA > 0 ? 100 : 0;
    let trend = ((valA - valB) / Math.abs(valB)) * 100;
    return Math.round(Math.max(-100, trend));
  };

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
        const entity = entityMap.get(parseInt(id));
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
          const entity = entityMap.get(parseInt(id));
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
