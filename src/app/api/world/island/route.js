import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enrichConquestsAndActivity } from '@/lib/scoreboard';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const x = parseInt(searchParams.get('x'), 10);
  const y = parseInt(searchParams.get('y'), 10);
  const worldId = (searchParams.get('world') || 'hu119').toLowerCase();

  if (isNaN(x) || isNaN(y)) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
  }

  try {
    const island = await prisma.island.findFirst({
      where: { worldId, x, y }
    });

    if (!island) {
      return NextResponse.json({ error: 'Island not found' }, { status: 404 });
    }

    const towns = await prisma.town.findMany({
      where: { worldId, islandX: x, islandY: y },
      include: {
        player: {
          include: {
            alliance: true
          }
        }
      },
      orderBy: { islandSlot: 'asc' }
    });

    const townIds = towns.map(t => t.id);
    const [townHistories, conquestsDb] = townIds.length > 0
      ? await Promise.all([
          prisma.townHistory.findMany({
            where: {
              worldId,
              townId: { in: townIds },
              timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            },
            orderBy: { timestamp: 'asc' }
          }),
          prisma.conquest.findMany({
            where: {
              worldId,
              townId: { in: townIds },
              timestamp: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }
            },
            orderBy: { timestamp: 'desc' },
            take: 250
          })
        ])
      : [[], []];

    const { conquests, activityMap } = await enrichConquestsAndActivity({
      conquests: conquestsDb,
      historyRows: townHistories,
      entityIds: townIds,
      entityField: 'townId',
      prismaClient: prisma,
      worldId
    });

    return NextResponse.json({
      island,
      towns: towns.map(t => ({
        ...t,
        activity: activityMap[t.id] || { pointDelta: 0, lastActive: null }
      })),
      conquests
    });

  } catch (error) {
    console.error("Island Details API Error:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
