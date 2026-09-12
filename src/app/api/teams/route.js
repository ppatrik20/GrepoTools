import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/rbac';
import { logAuditEvent } from '@/lib/auth/audit';

export async function GET(request) {
  const auth = await requireAuth(request, { allowUnverified: true });
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const worldId = searchParams.get('worldId');

    const where = {};
    if (worldId) where.worldId = worldId;

    const isGlobalAdmin = auth.user.globalRole === 'GLOBAL_ADMIN';

    // If not global admin, return teams user is associated with or all teams on world
    const teams = await prisma.team.findMany({
      where,
      include: {
        world: {
          select: { id: true, name: true, server: true }
        },
        _count: {
          select: { members: true, invites: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ teams });
  } catch (err) {
    console.error('Error fetching teams:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  // Creating teams requires GLOBAL_ADMIN role
  const auth = await requireAuth(request, { minGlobalRole: 'GLOBAL_ADMIN' });
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { name, worldId, description } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: 'Team name is required' },
        { status: 400 }
      );
    }

    if (!worldId || typeof worldId !== 'string' || worldId.trim() === '') {
      return NextResponse.json(
        { error: 'World ID is required' },
        { status: 400 }
      );
    }

    const trimmedWorldId = worldId.trim().toLowerCase();
    const world = await prisma.world.findUnique({
      where: { id: trimmedWorldId }
    });

    if (!world) {
      return NextResponse.json(
        { error: `World "${trimmedWorldId}" does not exist` },
        { status: 404 }
      );
    }

    const trimmedName = name.trim();

    // Check unique constraint on worldId + name
    const existingTeam = await prisma.team.findUnique({
      where: {
        worldId_name: {
          worldId: trimmedWorldId,
          name: trimmedName
        }
      }
    });

    if (existingTeam) {
      return NextResponse.json(
        { error: `Team "${trimmedName}" already exists on world "${trimmedWorldId}"` },
        { status: 409 }
      );
    }

    const team = await prisma.team.create({
      data: {
        name: trimmedName,
        worldId: trimmedWorldId,
        description: description ? description.trim() : null
      },
      include: {
        world: {
          select: { id: true, name: true }
        }
      }
    });

    await logAuditEvent({
      userId: auth.user.sub,
      actorUsername: auth.user.username,
      action: 'TEAM_CREATED',
      targetResource: `team:${team.id}`,
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
      status: 'SUCCESS',
      details: {
        teamId: team.id,
        teamName: team.name,
        worldId: team.worldId
      }
    });

    return NextResponse.json({ success: true, team }, { status: 201 });
  } catch (err) {
    console.error('Error creating team:', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}
