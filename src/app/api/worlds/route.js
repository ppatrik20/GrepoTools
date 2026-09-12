import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminBearerAuth, requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const worlds = await prisma.world.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        server: true,
        speed: true,
        unitSpeed: true,
        worldType: true,
        isActive: true,
        lastSync: true,
        createdAt: true,
        _count: {
          select: {
            players: true,
            towns: true,
            alliances: true,
            islands: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      worlds: worlds.map(w => ({
        id: w.id,
        name: w.name,
        server: w.server,
        speed: w.speed,
        unitSpeed: w.unitSpeed,
        worldType: w.worldType,
        isActive: w.isActive,
        lastSync: w.lastSync,
        counts: w._count,
        createdAt: w.createdAt
      }))
    });
  } catch (error) {
    console.error("GET /api/worlds error:", error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request, { minGlobalRole: 'GLOBAL_ADMIN' });
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await request.json();
    const { id, name, server, speed, unitSpeed, worldType, isActive } = body;

    if (!id || !server) {
      return NextResponse.json({ success: false, error: 'World ID and Server are required' }, { status: 400 });
    }

    const worldId = id.trim().toLowerCase();
    const serverName = server.trim().toLowerCase();
    const displayName = name ? name.trim() : `${worldId.toUpperCase()} (${serverName})`;

    const world = await prisma.world.upsert({
      where: { id: worldId },
      update: {
        name: displayName,
        server: serverName,
        speed: parseFloat(speed) || 1.0,
        unitSpeed: parseFloat(unitSpeed) || 1.0,
        worldType: worldType || 'siege',
        isActive: isActive !== undefined ? Boolean(isActive) : true
      },
      create: {
        id: worldId,
        name: displayName,
        server: serverName,
        speed: parseFloat(speed) || 1.0,
        unitSpeed: parseFloat(unitSpeed) || 1.0,
        worldType: worldType || 'siege',
        isActive: isActive !== undefined ? Boolean(isActive) : true
      }
    });

    return NextResponse.json({ success: true, world });
  } catch (error) {
    console.error("POST /api/worlds error:", error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const auth = await requireAuth(request, { minGlobalRole: 'GLOBAL_ADMIN' });
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await request.json();
    const { id, name, server, speed, unitSpeed, worldType, isActive } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'World ID is required' }, { status: 400 });
    }

    const worldId = id.trim().toLowerCase();
    const updateData = {};

    if (name !== undefined) updateData.name = name.trim();
    if (server !== undefined) updateData.server = server.trim().toLowerCase();
    if (speed !== undefined) updateData.speed = parseFloat(speed) || 1.0;
    if (unitSpeed !== undefined) updateData.unitSpeed = parseFloat(unitSpeed) || 1.0;
    if (worldType !== undefined) updateData.worldType = worldType;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const world = await prisma.world.update({
      where: { id: worldId },
      data: updateData
    });

    return NextResponse.json({ success: true, world });
  } catch (error) {
    console.error("PUT /api/worlds error:", error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuth(request, { minGlobalRole: 'GLOBAL_ADMIN' });
    if (!auth.authorized) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing world ID' }, { status: 400 });
    }

    const cleanId = id.trim().toLowerCase();
    try {
      // Delete world (foreign keys will cascade)
      await prisma.world.delete({
        where: { id: cleanId }
      });
      return NextResponse.json({ success: true, message: `World ${id} deleted` });
    } catch (err) {
      if (err?.code === 'P2025') {
        return NextResponse.json({ success: false, error: `World ${id} not found` }, { status: 404 });
      }
      throw err;
    }
  } catch (error) {
    console.error("DELETE /api/worlds error:", error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
