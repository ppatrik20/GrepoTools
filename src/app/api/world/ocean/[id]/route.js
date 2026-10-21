import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { compileOceanSummarySnapshot } from '@/lib/geojson';

export const dynamic = 'force-dynamic';

export async function GET(request, props) {
  try {
    const params = await props.params;
    const oceanId = params.id;
    const { searchParams } = new URL(request.url);
    const worldId = (searchParams.get('world') || 'hu119').toLowerCase();

    if (!oceanId || oceanId.length !== 2) {
      return NextResponse.json({ error: "Invalid ocean ID" }, { status: 400 });
    }

    const oceanIds = [parseInt(oceanId, 10)];

    const orConditions = oceanIds.map(o => {
      const xStr = o.toString().padStart(2, '0');
      const oceanX = parseInt(xStr[0], 10);
      const oceanY = parseInt(xStr[1], 10);
      return {
        x: { gte: oceanX * 100, lt: (oceanX + 1) * 100 },
        y: { gte: oceanY * 100, lt: (oceanY + 1) * 100 }
      };
    });

    const townOrConditions = oceanIds.map(o => {
      const xStr = o.toString().padStart(2, '0');
      const oceanX = parseInt(xStr[0], 10);
      const oceanY = parseInt(xStr[1], 10);
      return {
        islandX: { gte: oceanX * 100, lt: (oceanX + 1) * 100 },
        islandY: { gte: oceanY * 100, lt: (oceanY + 1) * 100 }
      };
    });

    const [dbAlliances, islands, towns] = await Promise.all([
      prisma.alliance.findMany({
        where: { worldId },
        orderBy: { towns: 'desc' },
        take: 10,
        select: { name: true, towns: true }
      }),
      prisma.island.findMany({
        where: { worldId, OR: orConditions },
        select: { id: true, x: true, y: true, availableTowns: true, resourcePlus: true, resourceMinus: true }
      }),
      prisma.town.findMany({
        where: { worldId, OR: townOrConditions },
        select: {
          id: true, name: true, points: true, islandX: true, islandY: true, islandSlot: true,
          player: {
            select: { name: true, alliance: { select: { name: true } } }
          }
        }
      })
    ]);

    const { islands: outputIslands, towns: outputTowns } = compileOceanSummarySnapshot({
      oceanId,
      towns,
      alliances: dbAlliances,
      islands
    });

    return NextResponse.json({
      type: 'RawMapData',
      worldId,
      islands: outputIslands,
      towns: outputTowns
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
      }
    });

  } catch (error) {
    console.error("Ocean API Error:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
