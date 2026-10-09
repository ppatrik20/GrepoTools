import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const worldId = searchParams.get('world')?.toLowerCase()?.trim();
    const status = searchParams.get('status')?.toUpperCase()?.trim();
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit'), 10) || 50));

    const where = {};
    if (worldId) where.worldId = worldId;
    if (status) where.status = status;

    const [logs, total] = await Promise.all([
      prisma.syncLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          world: {
            select: { id: true, name: true }
          }
        }
      }),
      prisma.syncLog.count({ where })
    ]);

    return NextResponse.json({
      success: true,
      total,
      limit,
      logs
    });
  } catch (error) {
    console.error("GET /api/world/sync-logs error:", error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
