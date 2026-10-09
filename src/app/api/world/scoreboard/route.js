import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateScoreboardData } from '@/lib/scoreboard';
import { ensureDatabaseSchema } from '@/lib/dbBootstrap';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const worldId = (searchParams.get('world') || 'hu119').toLowerCase();

  try {
    await ensureDatabaseSchema();
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    
    if (world && world.scoreboardCache && world.lastSync) {
      const etag = `W/"${world.id}-${world.lastSync.getTime()}"`;
      if (request.headers.get('if-none-match') === etag) {
        return new NextResponse(null, { status: 304 });
      }

      const gzipBuffer = Buffer.from(world.scoreboardCache, 'base64');
      const uint8Array = new Uint8Array(gzipBuffer);
      
      return new NextResponse(uint8Array, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'Cache-Control': 'public, s-maxage=31536000, stale-while-revalidate=86400',
          'ETag': etag,
          'X-Last-Sync': world.lastSync.toISOString(),
        },
      });
    }

    const data = await generateScoreboardData(worldId);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=31536000, stale-while-revalidate=86400',
        'ETag': world?.lastSync ? `W/"${world.id}-${world.lastSync.getTime()}"` : `W/"${Date.now()}"`,
        'X-Last-Sync': world?.lastSync ? world.lastSync.toISOString() : new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Scoreboard API Error:", error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
