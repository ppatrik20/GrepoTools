import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateScoreboardData } from '@/lib/scoreboard';
import { ensureDatabaseSchema } from '@/lib/dbBootstrap';
import { WorldCacheCompiler } from '@/lib/world/WorldCacheCompiler';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const worldId = (searchParams.get('world') || 'hu119').toLowerCase();

  try {
    await ensureDatabaseSchema();
    return await WorldCacheCompiler.serveCompressedWorldCache({
      request,
      worldId,
      cacheField: 'scoreboardCache',
      generateFallback: (id, opts) => generateScoreboardData(id, opts),
      prismaClient: prisma
    });
  } catch (error) {
    console.error("Scoreboard API Error:", error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
