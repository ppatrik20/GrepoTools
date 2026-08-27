import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCachedSyncEpoch } from '@/lib/syncMetadata';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const worldId = (searchParams.get('world') || 'hu119').toLowerCase();
  
  if (!q || q.length < 2) {
    return NextResponse.json({ players: [], alliances: [], towns: [] });
  }

  try {
    const epoch = await getCachedSyncEpoch(worldId);

    // Check if query is coordinate format: X,Y or X Y or X|Y
    const coordMatch = q.match(/^(\d{1,4})[,\s|]+(\d{1,4})$/);
    let matchedIsland = null;

    if (coordMatch) {
      const x = parseInt(coordMatch[1]);
      const y = parseInt(coordMatch[2]);
      matchedIsland = await prisma.island.findFirst({
        where: { worldId, x, y },
        select: {
          id: true, x: true, y: true, type: true, availableTowns: true, resourcePlus: true, resourceMinus: true
        }
      });
    }

    const [players, alliances, towns] = await Promise.all([
      prisma.player.findMany({
        where: { worldId, name: { contains: q, mode: 'insensitive' }, id: { not: -epoch } },
        take: 8,
        select: { id: true, name: true, points: true, rank: true, abp: true, dbp: true, allBp: true, alliance: { select: { id: true, name: true } } }
      }),
      prisma.alliance.findMany({
        where: { worldId, name: { contains: q, mode: 'insensitive' }, id: { not: -epoch } },
        take: 8,
        select: { id: true, name: true, points: true, rank: true, towns: true, members: true, abp: true, dbp: true, allBp: true }
      }),
      prisma.town.findMany({
        where: { worldId, name: { contains: q, mode: 'insensitive' }, id: { not: -epoch } },
        take: 8,
        select: { id: true, name: true, points: true, islandX: true, islandY: true, islandSlot: true, player: { select: { id: true, name: true, alliance: { select: { name: true } } } } }
      })
    ]);

    return NextResponse.json({ 
      players, 
      alliances, 
      towns,
      island: matchedIsland 
    });
  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
