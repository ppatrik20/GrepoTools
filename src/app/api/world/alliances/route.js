import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const worldId = (searchParams.get('world') || 'hu119').toLowerCase();
  const search = (searchParams.get('search') || '').trim();

  try {
    const where = { worldId };
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const alliances = await prisma.alliance.findMany({
      where,
      orderBy: [
        { rank: 'asc' },
        { points: 'desc' }
      ],
      select: {
        id: true,
        name: true,
        points: true,
        towns: true,
        members: true,
        rank: true
      }
    });

    return NextResponse.json({
      success: true,
      worldId,
      count: alliances.length,
      alliances
    });
  } catch (error) {
    console.error("Alliances API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
