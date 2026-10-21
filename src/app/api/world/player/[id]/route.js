import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enrichConquestsAndActivity } from '@/lib/scoreboard';

export const dynamic = 'force-dynamic';

export async function GET(request, props) {
  const params = await props.params;
  const playerId = parseInt(params.id, 10);
  const { searchParams } = new URL(request.url);
  const worldId = (searchParams.get('world') || 'hu119').toLowerCase();

  if (isNaN(playerId)) {
    return NextResponse.json({ error: 'Invalid player ID' }, { status: 400 });
  }

  try {
    const player = await prisma.player.findFirst({
      where: { worldId, id: playerId },
      include: {
        alliance: true,
        townsList: {
          where: { worldId },
          orderBy: { points: 'desc' }
        }
      }
    });

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const [historyDb, conquestsDb] = await Promise.all([
      prisma.playerHistory.findMany({
        where: {
          worldId,
          playerId,
          timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        },
        orderBy: { timestamp: 'asc' }
      }),
      prisma.conquest.findMany({
        where: { worldId, OR: [{ oldPlayerId: playerId }, { newPlayerId: playerId }] },
        orderBy: { timestamp: 'desc' },
        take: 250
      })
    ]);

    const history = historyDb.map(h => ({
      date: new Date(h.timestamp).toLocaleDateString(),
      points: h.newPoints,
      delta: h.newPoints - h.oldPoints,
      abpDelta: h.abpDelta,
      dbpDelta: h.dbpDelta,
      timestamp: h.timestamp
    }));

    const { conquests, activity } = await enrichConquestsAndActivity({
      conquests: conquestsDb,
      historyRows: historyDb,
      entityIds: [playerId],
      entityField: 'playerId',
      prismaClient: prisma,
      worldId
    });

    return NextResponse.json({
      player,
      history,
      activity,
      conquests
    });

  } catch (error) {
    console.error("Player API Error:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
