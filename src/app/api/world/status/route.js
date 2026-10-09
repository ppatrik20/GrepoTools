import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseSchema } from '@/lib/dbBootstrap';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const worldId = (searchParams.get('world') || 'hu119').toLowerCase();

  try {
    await ensureDatabaseSchema();
    const [world, recentLogs] = await Promise.all([
      prisma.world.findUnique({
        where: { id: worldId },
        select: {
          id: true,
          name: true,
          speed: true,
          worldType: true,
          lastSync: true,
          lastSyncStatus: true,
          lastSyncError: true,
          lastSyncDurationMs: true
        }
      }),
      prisma.syncLog.findMany({
        where: { worldId },
        orderBy: { createdAt: 'desc' },
        take: 5
      })
    ]);

    if (!world || !world.lastSync) {
      return NextResponse.json({
        success: true,
        worldId,
        lastSync: null,
        lastSyncStatus: world?.lastSyncStatus || null,
        lastSyncError: world?.lastSyncError || null,
        world,
        recentLogs: recentLogs || []
      });
    }
    return NextResponse.json({
      success: true,
      worldId,
      lastSync: world.lastSync,
      lastSyncStatus: world.lastSyncStatus,
      lastSyncError: world.lastSyncError,
      lastSyncDurationMs: world.lastSyncDurationMs,
      world,
      recentLogs: recentLogs || []
    });
  } catch (error) {
    console.error("World Status API Error:", error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
