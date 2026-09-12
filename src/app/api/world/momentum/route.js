import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCachedSyncEpoch } from '@/lib/syncMetadata';
import { getBaselineTime } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const idsParam = searchParams.get('ids');
  const idParam = searchParams.get('id');
  const type = searchParams.get('type'); // 'player' or 'alliance'
  const worldId = (searchParams.get('world') || 'hu119').toLowerCase();
  
  if (!['player', 'alliance'].includes(type)) {
    return NextResponse.json({ results: [] });
  }

  const ids = idsParam 
    ? idsParam.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0)
    : idParam 
      ? [parseInt(idParam.trim(), 10)].filter(n => !isNaN(n) && n > 0)
      : null;

  if ((!ids || ids.length === 0) && (!q || q.length < 2)) {
    return NextResponse.json({ results: [] });
  }

  try {
    const epoch = await getCachedSyncEpoch(worldId);
    const baseline = getBaselineTime();
    const windowBStart = new Date(baseline.getTime() - 24 * 60 * 60 * 1000);
    const windowBEnd = baseline;
    let results = [];

    const calculateGains = (history, idKey) => {
      const gains = {};
      history.forEach(h => {
        const id = h[idKey];
        if (!gains[id]) gains[id] = { pts: 0, abp: 0, dbp: 0 };
        gains[id].pts += (h.newPoints - h.oldPoints);
        gains[id].abp += h.abpDelta;
        gains[id].dbp += h.dbpDelta;
      });
      return gains;
    };

    const calcTrend = (valA, valB) => {
      if (valB === 0) return valA > 0 ? 100 : 0;
      let trend = ((valA - valB) / Math.abs(valB)) * 100;
      return Math.round(Math.max(-100, trend));
    };

    if (type === 'player') {
      const playerWhere = ids && ids.length > 0
        ? { worldId, id: { in: ids, not: -epoch } }
        : { worldId, name: { contains: q, mode: 'insensitive' }, id: { not: -epoch } };

      const players = await prisma.player.findMany({
        where: playerWhere,
        take: ids && ids.length > 0 ? undefined : 10,
        select: { id: true, name: true, points: true, rank: true, abp: true, dbp: true, allBp: true, alliance: { select: { id: true, name: true } } }
      });

      if (players.length > 0) {
        const pIds = players.map(p => p.id);
        const [historyA, historyB, conquests] = await Promise.all([
          prisma.playerHistory.findMany({ where: { worldId, playerId: { in: pIds }, timestamp: { gte: baseline }, id: { not: -epoch } } }),
          prisma.playerHistory.findMany({ where: { worldId, playerId: { in: pIds }, timestamp: { gte: windowBStart, lt: windowBEnd }, id: { not: -epoch } } }),
          prisma.conquest.findMany({
            where: {
              worldId,
              timestamp: { gte: baseline },
              OR: [
                { newPlayerId: { in: pIds } },
                { oldPlayerId: { in: pIds } }
              ]
            },
            select: { newPlayerId: true, oldPlayerId: true }
          })
        ]);

        const gainsA = calculateGains(historyA, 'playerId');
        const gainsB = calculateGains(historyB, 'playerId');

        const conquestsCount = {};
        const lossesCount = {};
        conquests.forEach(c => {
          if (c.newPlayerId) conquestsCount[c.newPlayerId] = (conquestsCount[c.newPlayerId] || 0) + 1;
          if (c.oldPlayerId) lossesCount[c.oldPlayerId] = (lossesCount[c.oldPlayerId] || 0) + 1;
        });

        results = players.map(p => ({
          ...p,
          momentumPts: gainsA[p.id]?.pts || 0,
          momentumAbp: gainsA[p.id]?.abp || 0,
          momentumDbp: gainsA[p.id]?.dbp || 0,
          trendPts: calcTrend(gainsA[p.id]?.pts || 0, gainsB[p.id]?.pts || 0),
          trendAbp: calcTrend(gainsA[p.id]?.abp || 0, gainsB[p.id]?.abp || 0),
          trendDbp: calcTrend(gainsA[p.id]?.dbp || 0, gainsB[p.id]?.dbp || 0),
          gainsAPts: gainsA[p.id]?.pts || 0,
          gainsAAbp: gainsA[p.id]?.abp || 0,
          gainsADbp: gainsA[p.id]?.dbp || 0,
          gainsBPts: gainsB[p.id]?.pts || 0,
          gainsBAbp: gainsB[p.id]?.abp || 0,
          gainsBDbp: gainsB[p.id]?.dbp || 0,
          conquests: conquestsCount[p.id] || 0,
          losses: lossesCount[p.id] || 0,
        }));
      }
    } else {
      const allianceWhere = ids && ids.length > 0
        ? { worldId, id: { in: ids, not: -epoch } }
        : { worldId, name: { contains: q, mode: 'insensitive' }, id: { not: -epoch } };

      const alliances = await prisma.alliance.findMany({
        where: allianceWhere,
        take: ids && ids.length > 0 ? undefined : 10,
        select: { id: true, name: true, points: true, rank: true, towns: true, members: true, abp: true, dbp: true, allBp: true }
      });

      if (alliances.length > 0) {
        const aIds = alliances.map(a => a.id);
        const [historyA, historyB, conquests] = await Promise.all([
          prisma.allianceHistory.findMany({ where: { worldId, allianceId: { in: aIds }, timestamp: { gte: baseline }, id: { not: -epoch } } }),
          prisma.allianceHistory.findMany({ where: { worldId, allianceId: { in: aIds }, timestamp: { gte: windowBStart, lt: windowBEnd }, id: { not: -epoch } } }),
          prisma.conquest.findMany({
            where: {
              worldId,
              timestamp: { gte: baseline },
              OR: [
                { newAllianceId: { in: aIds } },
                { oldAllianceId: { in: aIds } }
              ]
            },
            select: { newAllianceId: true, oldAllianceId: true }
          })
        ]);

        const gainsA = calculateGains(historyA, 'allianceId');
        const gainsB = calculateGains(historyB, 'allianceId');

        const conquestsCount = {};
        const lossesCount = {};
        conquests.forEach(c => {
          if (c.newAllianceId) conquestsCount[c.newAllianceId] = (conquestsCount[c.newAllianceId] || 0) + 1;
          if (c.oldAllianceId) lossesCount[c.oldAllianceId] = (lossesCount[c.oldAllianceId] || 0) + 1;
        });

        results = alliances.map(a => ({
          ...a,
          momentumPts: gainsA[a.id]?.pts || 0,
          momentumAbp: gainsA[a.id]?.abp || 0,
          momentumDbp: gainsA[a.id]?.dbp || 0,
          trendPts: calcTrend(gainsA[a.id]?.pts || 0, gainsB[a.id]?.pts || 0),
          trendAbp: calcTrend(gainsA[a.id]?.abp || 0, gainsB[a.id]?.abp || 0),
          trendDbp: calcTrend(gainsA[a.id]?.dbp || 0, gainsB[a.id]?.dbp || 0),
          gainsAPts: gainsA[a.id]?.pts || 0,
          gainsAAbp: gainsA[a.id]?.abp || 0,
          gainsADbp: gainsA[a.id]?.dbp || 0,
          gainsBPts: gainsB[a.id]?.pts || 0,
          gainsBAbp: gainsB[a.id]?.abp || 0,
          gainsBDbp: gainsB[a.id]?.dbp || 0,
          conquests: conquestsCount[a.id] || 0,
          losses: lossesCount[a.id] || 0,
        }));
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Momentum Search API Error:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
