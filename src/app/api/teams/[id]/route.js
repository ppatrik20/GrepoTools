import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, hasPermission, PERMISSIONS } from '@/lib/auth/rbac';
import { logAuditEvent } from '@/lib/auth/audit';

export async function GET(request, { params }) {
  const auth = await requireAuth(request, { allowUnverified: true });
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } = await params;

    const team = await prisma.team.findUnique({
      where: { id },
      include: {
        world: {
          select: { id: true, name: true, server: true }
        },
        customRoles: {
          include: {
            _count: { select: { assignments: true } }
          },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
        },
        members: {
          include: {
            user: {
              select: { id: true, username: true, globalRole: true, isActive: true }
            },
            customRoles: {
              include: {
                customRole: true
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        },
        invites: {
          where: {
            expiresAt: { gt: new Date() }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    const isGlobalAdmin = auth.user.globalRole === 'GLOBAL_ADMIN';
    const membership = team.members.find(m => m.userId === auth.user.sub);
    const isTeamAdmin = membership?.role === 'TEAM_ADMIN';
    const canManageInvites = isGlobalAdmin || isTeamAdmin || hasPermission(auth, team.id, PERMISSIONS.INVITES_MANAGE);

    // Authorization: User must be Global Admin or Member of the team
    if (!isGlobalAdmin && !membership) {
      return NextResponse.json(
        { error: 'Forbidden: You are not a member of this team' },
        { status: 403 }
      );
    }

    // Permitted users can view pending invites (where usedCount < maxUses)
    const invites = canManageInvites
      ? (team.invites || []).filter(inv => inv.usedCount < inv.maxUses)
      : [];

    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        worldId: team.worldId,
        world: team.world,
        members: team.members,
        customRoles: team.customRoles,
        invites,
        currentUserRole: isGlobalAdmin ? 'GLOBAL_ADMIN' : membership?.role
      }
    });
  } catch (err) {
    console.error('Error fetching team by id:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, { minGlobalRole: 'GLOBAL_ADMIN' });
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } = await params;

    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    await prisma.team.delete({ where: { id } });

    await logAuditEvent({
      userId: auth.user.sub,
      actorUsername: auth.user.username,
      action: 'TEAM_DELETED',
      targetResource: `team:${id}`,
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
      status: 'SUCCESS',
      details: { teamName: team.name, worldId: team.worldId }
    });

    return NextResponse.json({ success: true, message: 'Team deleted' });
  } catch (err) {
    console.error('Error deleting team:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
