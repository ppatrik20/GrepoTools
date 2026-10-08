import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { WorldCacheCompiler } from '@/lib/world/WorldCacheCompiler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    let worldId = searchParams.get('world');

    if (!worldId) {
      try {
        const body = await request.json();
        if (body.world) worldId = body.world;
      } catch (e) {}
    }
    worldId = (worldId || 'hu119').toLowerCase();

    console.log(`Generating scoreboard and geoJson caches for world [${worldId}] via WorldCacheCompiler...`);
    const result = await WorldCacheCompiler.rebuildWorldCaches(worldId);

    revalidatePath('/api/world/scoreboard');
    revalidatePath('/api/world/geojson');
    revalidatePath('/api/world/meta');

    return NextResponse.json(result);
  } catch (error) {
    console.error("Cache Sync Error:", error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
