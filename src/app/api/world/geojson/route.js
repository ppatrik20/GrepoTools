import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateGeoJSON } from '@/lib/geojson';
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
      cacheField: 'geoJsonCache',
      generateFallback: (id, opts) => generateGeoJSON(id, opts),
      prismaClient: prisma
    });
  } catch (error) {
    console.error("GeoJSON generation error:", error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
