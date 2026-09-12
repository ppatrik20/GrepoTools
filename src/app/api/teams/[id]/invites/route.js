import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireAuth, hasPermission, PERMISSIONS } from '@/lib/auth/rbac';
import { logAuditEvent } from '@/lib/auth/audit';

export async function GET(request, { params }) {
  const auth = await requireAuth(request, { allowUnverified: true });
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id: teamId } = await params;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: true
      }
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const isGlobalAdmin = auth.user.globalRole === 'GLOBAL_ADMIN';
    const membership = team.members.find(m => m.userId === auth.user.sub);
    const isTeamAdmin = membership?.role === 'TEAM_ADMIN';
    const canManageInvites = isGlobalAdmin || isTeamAdmin || hasPermission(auth, teamId, PERMISSIONS.INVITES_MANAGE);

    if (!canManageInvites) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to view invites' },
        { status: 403 }
      );
    }

    const invites = await prisma.invite.findMany({
      where: {
        teamId,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      invites: invites.filter(inv => inv.usedCount < inv.maxUses)
    });
  } catch (err) {
    console.error('Error fetching invites:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const auth = await requireAuth(request, { allowUnverified: true });
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id: teamId } = await params;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: true
      }
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const isGlobalAdmin = auth.user.globalRole === 'GLOBAL_ADMIN';
    const membership = team.members.find(m => m.userId === auth.user.sub);

    if (!isGlobalAdmin && !membership) {
      return NextResponse.json(
        { error: 'Forbidden: You are not a member of this team' },
        { status: 403 }
      );
    }

    const isTeamAdmin = membership?.role === 'TEAM_ADMIN';
    const canInvite = isGlobalAdmin || isTeamAdmin || hasPermission(auth, teamId, PERMISSIONS.INVITES_MANAGE);

    // Must be Global Admin, Team Admin, or hold INVITES_MANAGE permission
    if (!canInvite) {
      return NextResponse.json(
        { error: 'Forbidden: Team Administrator, Global Administrator, or INVITES_MANAGE capability required' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      targetPlayerName,
      role = 'TEAM_MEMBER',
      customRoleIds = [],
      maxUses = 1,
      expiresInDays = 7
    } = body;

    if (!targetPlayerName || typeof targetPlayerName !== 'string' || targetPlayerName.trim() === '') {
      return NextResponse.json(
        { error: 'Target player name is required' },
        { status: 400 }
      );
    }

    const trimmedPlayerName = targetPlayerName.trim();

    // Validate role
    if (role !== 'TEAM_ADMIN' && role !== 'TEAM_MEMBER') {
      return NextResponse.json(
        { error: 'Role must be either TEAM_ADMIN or TEAM_MEMBER' },
        { status: 400 }
      );
    }

    // Only Global Admins can invite Team Admins
    if (role === 'TEAM_ADMIN' && !isGlobalAdmin) {
      return NextResponse.json(
        { error: 'Only Global Administrators can invite Team Admins' },
        { status: 403 }
      );
    }

    // Verify player exists in the game world
    const player = await prisma.player.findFirst({
      where: {
        worldId: team.worldId,
        name: { equals: trimmedPlayerName, mode: 'insensitive' }
      }
    });

    if (!player) {
      return NextResponse.json(
        {
          error: `Player "${trimmedPlayerName}" was not found in world "${team.worldId}". Please verify the Grepolis in-game username spelling.`
        },
        { status: 400 }
      );
    }

    // Check if the inviter is attempting to invite themselves
    if (auth.user.username && auth.user.username.toLowerCase() === trimmedPlayerName.toLowerCase()) {
      return NextResponse.json(
        {
          error: `You cannot invite yourself to a team you are already managing.`
        },
        { status: 400 }
      );
    }

    // Check if player is already a member of this team
    const isAlreadyMember = team.members.some(
      m => m.playerName?.toLowerCase() === trimmedPlayerName.toLowerCase()
    );

    if (isAlreadyMember) {
      return NextResponse.json(
        {
          error: `Player "${trimmedPlayerName}" is already a member of this team.`
        },
        { status: 400 }
      );
    }

    // Check if an active, unexpired invite already exists for this player on this team
    const existingInvite = await prisma.invite.findFirst({
      where: {
        teamId,
        targetPlayerName: { equals: trimmedPlayerName, mode: 'insensitive' },
        expiresAt: { gt: new Date() }
      }
    });

    if (existingInvite && existingInvite.usedCount < existingInvite.maxUses) {
      return NextResponse.json(
        {
          error: `An active invitation already exists for player "${trimmedPlayerName}". You can copy the existing link from the pending invites list.`
        },
        { status: 409 }
      );
    }

    // Validate pre-assigned custom role IDs if supplied
    let validCustomRoleIds = [];
    if (Array.isArray(customRoleIds) && customRoleIds.length > 0) {
      const dbRoles = await prisma.teamCustomRole.findMany({
        where: {
          teamId,
          id: { in: customRoleIds }
        },
        select: { id: true }
      });
      if (dbRoles.length !== customRoleIds.length) {
        return NextResponse.json(
          { error: 'One or more selected custom roles do not exist for this team' },
          { status: 400 }
        );
      }
      validCustomRoleIds = dbRoles.map(r => r.id);
    }

    // Generate secure random invite token
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + (Number(expiresInDays) || 7) * 24 * 60 * 60 * 1000);

    const invite = await prisma.invite.create({
      data: {
        token,
        teamId,
        worldId: team.worldId,
        role,
        targetPlayerName: trimmedPlayerName,
        createdById: auth.user.sub,
        customRoleIds: validCustomRoleIds,
        maxUses: Number(maxUses) || 1,
        expiresAt
      }
    });

    await logAuditEvent({
      userId: auth.user.sub,
      actorUsername: auth.user.username,
      action: 'INVITE_CREATED',
      targetResource: `team:${teamId}`,
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
      status: 'SUCCESS',
      details: {
        inviteId: invite.id,
        teamId,
        targetPlayerName: trimmedPlayerName,
        role,
        customRoleIds: validCustomRoleIds,
        expiresAt
      }
    });

    return NextResponse.json({
      success: true,
      invite: {
        id: invite.id,
        token: invite.token,
        inviteUrl: `/invite/${invite.token}`,
        targetPlayerName: invite.targetPlayerName,
        role: invite.role,
        customRoleIds: invite.customRoleIds,
        maxUses: invite.maxUses,
        expiresAt: invite.expiresAt
      }
    }, { status: 201 });
  } catch (err) {
    console.error('Error creating invite:', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}
