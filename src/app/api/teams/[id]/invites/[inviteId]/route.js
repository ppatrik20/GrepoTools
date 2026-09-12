import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, hasPermission, PERMISSIONS } from '@/lib/auth/rbac';
import { logAuditEvent } from '@/lib/auth/audit';

export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, { allowUnverified: true });
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id: teamId, inviteId } = await params;

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
    const canRevoke = isGlobalAdmin || isTeamAdmin || hasPermission(auth, teamId, PERMISSIONS.INVITES_MANAGE);

    if (!canRevoke) {
      return NextResponse.json(
        { error: 'Forbidden: Team Administrator or INVITES_MANAGE capability required' },
        { status: 403 }
      );
    }

    const invite = await prisma.invite.findFirst({
      where: {
        id: inviteId,
        teamId
      }
    });

    if (!invite) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    await prisma.invite.delete({
      where: { id: inviteId }
    });

    await logAuditEvent({
      userId: auth.user.sub,
      actorUsername: auth.user.username,
      action: 'INVITE_REVOKED',
      targetResource: `team:${teamId}`,
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
      status: 'SUCCESS',
      details: {
        inviteId,
        teamId,
        targetPlayerName: invite.targetPlayerName
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Invitation revoked successfully'
    });
  } catch (err) {
    console.error('Error revoking invite:', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}
