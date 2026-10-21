import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  requireTeamAccess,
  PERMISSIONS,
  DEFAULT_ROLE_TEMPLATES,
  AUDIT_ACTIONS
} from '@/lib/auth/rbac';
import { logAuditEvent } from '@/lib/auth/audit';

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const access = await requireTeamAccess(request, id, {
      allowUnverified: true,
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
        invites: {
          where: {
            expiresAt: { gt: new Date() }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!access.authorized) {
      return access.response;
    }

    const { team, callerMember, isGlobalAdmin, isTeamAdmin, authority, user } = access;

    // Auto-seed DEFAULT_ROLE_TEMPLATES if team has no customRoles yet
    let customRoles = Array.isArray(team.customRoles) ? team.customRoles : [];
    if (customRoles.length === 0) {
      if (typeof prisma.teamCustomRole?.createMany === 'function') {
        await prisma.teamCustomRole.createMany({
          data: DEFAULT_ROLE_TEMPLATES.map(tpl => ({
            teamId: team.id,
            name: tpl.name,
            description: tpl.description,
            color: tpl.color,
            icon: tpl.icon,
            priority: tpl.priority,
            permissions: tpl.permissions
          })),
          skipDuplicates: true
        }).catch(() => {});
      }
      if (typeof prisma.teamCustomRole?.findMany === 'function') {
        customRoles = await prisma.teamCustomRole.findMany({
          where: { teamId: team.id },
          include: {
            _count: { select: { assignments: true } }
          },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
        });
      }
    }

    const formattedRoles = customRoles.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      color: r.color,
      icon: r.icon,
      priority: r.priority,
      permissions: r.permissions,
      memberCount: r._count?.assignments ?? r.memberCount ?? 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));

    // Batch-enrich team.members with in-game player points/rank
    const rawMembers = Array.isArray(team.members) ? team.members : [];
    const playerIds = rawMembers.map(m => m.playerId).filter(Boolean);
    const players = playerIds.length > 0 && typeof prisma.player?.findMany === 'function'
      ? await prisma.player.findMany({
          where: {
            worldId: team.worldId,
            id: { in: playerIds }
          },
          include: {
            alliance: {
              select: { id: true, name: true }
            }
          }
        })
      : [];

    const playerMap = new Map((players || []).map(p => [p.id, p]));

    const enrichedMembers = rawMembers.map(m => {
      const pStats = playerMap.get(m.playerId);
      const isSelf = m.userId === user.sub;

      const roles = (m.customRoles || [])
        .map(r => {
          const roleObj = r.customRole || r;
          if (!roleObj || (!roleObj.id && !roleObj.name)) return null;
          return {
            id: roleObj.id,
            assignmentId: r.id,
            name: roleObj.name,
            description: roleObj.description,
            color: roleObj.color || '#3B82F6',
            icon: roleObj.icon || 'shield',
            priority: roleObj.priority || 0,
            permissions: roleObj.permissions || []
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.priority - a.priority);

      return {
        id: m.id,
        userId: m.userId,
        user: m.user,
        username: m.user?.username || m.username || 'Unknown',
        playerId: m.playerId,
        playerName: m.playerName,
        role: m.role,
        verificationStatus: m.verificationStatus,
        verificationCode: (isTeamAdmin || isSelf) ? m.verificationCode : undefined,
        verifiedAt: m.verifiedAt,
        createdAt: m.createdAt,
        points: pStats?.points ?? m.points ?? 0,
        townsCount: pStats?.towns ?? m.townsCount ?? 0,
        rank: pStats?.rank ?? m.rank ?? null,
        allianceName: pStats?.alliance?.name ?? m.allianceName ?? 'No Alliance',
        allianceId: pStats?.allianceId ?? m.allianceId ?? null,
        customRoles: roles
      };
    });

    const canManageInvites = authority.hasCapability(PERMISSIONS.INVITES_MANAGE);
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
        members: enrichedMembers,
        customRoles: formattedRoles,
        invites,
        currentUserRole: isGlobalAdmin ? 'GLOBAL_ADMIN' : callerMember?.role
      },
      members: enrichedMembers,
      customRoles: formattedRoles,
      invites
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
      action: AUDIT_ACTIONS.TEAM_DELETED,
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
