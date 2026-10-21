import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enrichConquestsAndActivity } from '@/lib/scoreboard';

export const dynamic = 'force-dynamic';

export async function GET(request, props) {
  const params = await props.params;
  const allianceId = parseInt(params.id, 10);
  const { searchParams } = new URL(request.url);
  const worldId = (searchParams.get('world') || 'hu119').toLowerCase();

  if (isNaN(allianceId)) {
    return NextResponse.json({ error: 'Invalid alliance ID' }, { status: 400 });
  }

  try {
    const alliance = await prisma.alliance.findFirst({
      where: { worldId, id: allianceId },
      include: {
        players: {
          where: { worldId },
          orderBy: { points: 'desc' }
        }
      }
    });

    if (!alliance) {
      return NextResponse.json({ error: 'Alliance not found' }, { status: 404 });
    }

    const [historyDb, conquestsDb] = await Promise.all([
      prisma.allianceHistory.findMany({
        where: {
          worldId,
          allianceId,
          timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        },
        orderBy: { timestamp: 'asc' }
      }),
      prisma.conquest.findMany({
        where: { worldId, OR: [{ oldAllianceId: allianceId }, { newAllianceId: allianceId }] },
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
      entityIds: [allianceId],
      entityField: 'allianceId',
      prismaClient: prisma,
      worldId
    });

    return NextResponse.json({
      alliance,
      history,
      activity,
      conquests
    });

  } catch (error) {
    console.error("Alliance API Error:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
