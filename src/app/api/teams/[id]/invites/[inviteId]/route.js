import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireTeamAccess,
  PERMISSIONS,
  AUDIT_ACTIONS
} from '@/lib/auth/rbac';
import { logAuditEvent } from '@/lib/auth/audit';

export async function DELETE(request, { params }) {
  try {
    const { id: teamId, inviteId } = await params;

    const access = await requireTeamAccess(request, teamId, {
      requiredPermission: PERMISSIONS.INVITES_MANAGE
    });

    if (!access.authorized) {
      return access.response;
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
      userId: access.user.sub,
      actorUsername: access.user.username,
      action: AUDIT_ACTIONS.INVITE_REVOKED,
      targetResource: `team:${teamId}`,
      ipAddress: access.ipAddress,
      userAgent: access.userAgent,
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
