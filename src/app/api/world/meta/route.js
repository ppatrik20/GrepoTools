import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PALETTE } from '@/lib/constants';
import { ensureDatabaseSchema } from '@/lib/dbBootstrap';

export const dynamic = 'force-dynamic';
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const worldId = (searchParams.get('world') || 'hu119').toLowerCase();

  try {
    await ensureDatabaseSchema();
    const world = await prisma.world.findUnique({
      where: { id: worldId }
    });

    if (world && world.lastSync) {
      const etag = `W/"${world.id}-${world.lastSync.getTime()}"`;
      if (request.headers.get('if-none-match') === etag) {
        return new NextResponse(null, { status: 304 });
      }
    }

    const [dbAlliances, dbPlayers, totalPlayers, totalAlliances, totalTowns, totalIslands, populatedIslandsCoords] = await Promise.all([
      prisma.alliance.findMany({ where: { worldId }, orderBy: { towns: 'desc' }, take: 10 }),
      prisma.player.findMany({ where: { worldId }, orderBy: { points: 'desc' }, take: 10, include: { alliance: true } }),
      prisma.player.count({ where: { worldId } }),
      prisma.alliance.count({ where: { worldId } }),
      prisma.town.count({ where: { worldId } }),
      prisma.island.count({ where: { worldId } }),
      prisma.town.groupBy({ where: { worldId }, by: ['islandX', 'islandY'] })
    ]);
    
    const topAlliancesData = dbAlliances.map((a, i) => ({
      ...a,
      color: PALETTE[i] || "#ffffff"
    }));

    const topPlayersData = dbPlayers.map(p => ({
      ...p,
      alliance: p.alliance ? p.alliance.name : 'None'
    }));

    const populatedIslands = populatedIslandsCoords.length;
    const lastSyncStr = world?.lastSync ? world.lastSync.toISOString() : new Date().toISOString();

    return NextResponse.json({
      worldId,
      worldName: world?.name || worldId.toUpperCase(),
      worldSpeed: world?.speed || 1.0,
      unitSpeed: world?.unitSpeed || 1.0,
      worldType: world?.worldType || 'siege',
      topAlliances: topAlliancesData,
      topPlayers: topPlayersData,
      stats: { 
        players: totalPlayers, 
        totalTowns, 
        totalIslands, 
        populatedIslands 
      },
      lastSync: lastSyncStr
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'ETag': world?.lastSync ? `W/"${world.id}-${world.lastSync.getTime()}"` : `W/"${Date.now()}"`
      }
    });

  } catch (error) {
    console.error("Meta API Error:", error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
