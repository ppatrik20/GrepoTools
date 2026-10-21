import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enrichConquestsAndActivity } from '@/lib/scoreboard';

export const dynamic = 'force-dynamic';

export async function GET(request, props) {
  const params = await props.params;
  const townId = parseInt(params.id, 10);
  const { searchParams } = new URL(request.url);
  const worldId = (searchParams.get('world') || 'hu119').toLowerCase();

  if (isNaN(townId)) {
    return NextResponse.json({ error: 'Invalid town ID' }, { status: 400 });
  }

  try {
    const town = await prisma.town.findFirst({
      where: { worldId, id: townId },
      include: {
        player: { include: { alliance: true } }
      }
    });

    if (!town) {
      return NextResponse.json({ error: 'Town not found' }, { status: 404 });
    }

    const [historyDb, conquestsDb] = await Promise.all([
      prisma.townHistory.findMany({
        where: {
          worldId,
          townId,
          timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        },
        orderBy: { timestamp: 'asc' }
      }),
      prisma.conquest.findMany({
        where: { worldId, townId },
        orderBy: { timestamp: 'desc' },
        take: 250
      })
    ]);

    const history = historyDb.map(h => ({
      date: new Date(h.timestamp).toLocaleDateString(),
      points: h.newPoints,
      delta: h.newPoints - h.oldPoints,
      timestamp: h.timestamp
    }));

    const { conquests, activity } = await enrichConquestsAndActivity({
      conquests: conquestsDb,
      historyRows: historyDb,
      entityIds: [townId],
      entityField: 'townId',
      prismaClient: prisma,
      worldId
    });

    return NextResponse.json({
      town,
      history,
      activity,
      conquests
    });

  } catch (error) {
    console.error("Town API Error:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
