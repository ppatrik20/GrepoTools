import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getBaselineTime } from '@/lib/constants';
import { computeEntityMomentum } from '@/lib/scoreboard';

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
    const baseline = getBaselineTime();
    const windowBStart = new Date(baseline.getTime() - 24 * 60 * 60 * 1000);
    let results = [];

    if (type === 'player') {
      const playerWhere = ids && ids.length > 0
        ? { worldId, id: { in: ids } }
        : { worldId, name: { contains: q, mode: 'insensitive' } };

      const players = await prisma.player.findMany({
        where: playerWhere,
        take: ids && ids.length > 0 ? undefined : 10,
        select: { id: true, name: true, points: true, rank: true, abp: true, dbp: true, allBp: true, alliance: { select: { id: true, name: true } } }
      });

      if (players.length > 0) {
        const pIds = players.map(p => p.id);
        const [historyRows, conquests] = await Promise.all([
          prisma.playerHistory.findMany({
            where: { worldId, playerId: { in: pIds }, timestamp: { gte: windowBStart } }
          }),
          prisma.conquest.findMany({
            where: {
              worldId,
              timestamp: { gte: baseline },
              OR: [
                { newPlayerId: { in: pIds } },
                { oldPlayerId: { in: pIds } }
              ]
            },
            select: { newPlayerId: true, oldPlayerId: true, timestamp: true }
          })
        ]);

        results = computeEntityMomentum({
          entities: players,
          historyByEntityId: historyRows,
          conquests,
          entityType: 'player',
          baselineTime: baseline
        });
      }
    } else {
      const allianceWhere = ids && ids.length > 0
        ? { worldId, id: { in: ids } }
        : { worldId, name: { contains: q, mode: 'insensitive' } };

      const alliances = await prisma.alliance.findMany({
        where: allianceWhere,
        take: ids && ids.length > 0 ? undefined : 10,
        select: { id: true, name: true, points: true, rank: true, towns: true, members: true, abp: true, dbp: true, allBp: true }
      });

      if (alliances.length > 0) {
        const aIds = alliances.map(a => a.id);
        const [historyRows, conquests] = await Promise.all([
          prisma.allianceHistory.findMany({
            where: { worldId, allianceId: { in: aIds }, timestamp: { gte: windowBStart } }
          }),
          prisma.conquest.findMany({
            where: {
              worldId,
              timestamp: { gte: baseline },
              OR: [
                { newAllianceId: { in: aIds } },
                { oldAllianceId: { in: aIds } }
              ]
            },
            select: { newAllianceId: true, oldAllianceId: true, timestamp: true }
          })
        ]);

        results = computeEntityMomentum({
          entities: alliances,
          historyByEntityId: historyRows,
          conquests,
          entityType: 'alliance',
          baselineTime: baseline
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Momentum Search API Error:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
