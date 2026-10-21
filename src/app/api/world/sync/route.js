import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { syncWorld, syncAllActiveWorlds } from '@/lib/syncEngine';
import { requireAuth } from '@/lib/auth/rbac';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max for multi-world sync

export async function GET(request) {
  const auth = await requireAuth(request, { allowUnverified: true });
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const worldParam = searchParams.get('world');
    const syncAll = searchParams.get('all') === 'true' || (!worldParam && searchParams.has('all'));
    const force = searchParams.get('force') === 'true';

    // If "all" is requested or no specific world specified when ?all flag is present
    if (syncAll) {
      const result = await syncAllActiveWorlds({ force });
      try {
        revalidatePath('/api/world');
        revalidateTag('sync-meta');
      } catch (e) {}
      return NextResponse.json(result);
    }

    // Single world sync (default to hu119 if nothing specified)
    const worldId = (worldParam || 'hu119').toLowerCase().trim();
    const result = await syncWorld(worldId, { force });

    try {
      revalidatePath('/api/world');
      revalidateTag('sync-meta');
    } catch (e) {}

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/world/sync error:", error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireAuth(request, { allowUnverified: true });
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {}

    const { world, all, force } = body;

    if (all || (!world && all !== false)) {
      const result = await syncAllActiveWorlds({ force: Boolean(force) });
      try {
        revalidatePath('/api/world');
        revalidateTag('sync-meta');
      } catch (e) {}
      return NextResponse.json(result);
    }

    const worldId = (world || 'hu119').toLowerCase().trim();
    const result = await syncWorld(worldId, { force: Boolean(force) });

    try {
      revalidatePath('/api/world');
      revalidateTag('sync-meta');
    } catch (e) {}

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/world/sync error:", error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
