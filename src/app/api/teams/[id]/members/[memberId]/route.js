import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireTeamAccess,
  PERMISSIONS,
  AUDIT_ACTIONS
} from '@/lib/auth/rbac';
import { logAuditEvent } from '@/lib/auth/audit';

export async function PUT(request, { params }) {
  try {
    const { id: teamId, memberId } = await params;

    const access = await requireTeamAccess(request, teamId, {
      requiredPermission: PERMISSIONS.MEMBERS_MANAGE
    });

    if (!access.authorized) {
      return access.response;
    }

    const { isGlobalAdmin, isTeamAdmin } = access;

    const targetMember = await prisma.teamMember.findFirst({
      where: {
        id: memberId,
        teamId
      }
    });

    if (!targetMember) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    // Guard: Only Global Admin or existing Team Admin can modify a Team Administrator
    if (targetMember.role === 'TEAM_ADMIN' && !isGlobalAdmin && !isTeamAdmin) {
      return NextResponse.json(
        { error: 'Only Team Administrators or Global Administrators can modify Team Administrator roles' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { role, customRoleIds } = body;

    // Validate role change if requested
    if (role !== undefined) {
      if (role !== 'TEAM_ADMIN' && role !== 'TEAM_MEMBER') {
        return NextResponse.json(
          { error: 'Role must be either TEAM_ADMIN or TEAM_MEMBER' },
          { status: 400 }
        );
      }

      // Guard: Only Global Admin or existing Team Admin can grant TEAM_ADMIN status
      if (role === 'TEAM_ADMIN' && !isGlobalAdmin && !isTeamAdmin) {
        return NextResponse.json(
          { error: 'Only Team Administrators or Global Administrators can promote members to Team Administrator' },
          { status: 403 }
        );
      }
    }

    // Validate customRoleIds if requested
    let validCustomRoleIds = null;
    if (Array.isArray(customRoleIds)) {
      if (customRoleIds.length > 0) {
        const dbRoles = await prisma.teamCustomRole.findMany({
          where: {
            teamId,
            id: { in: customRoleIds }
          },
          select: { id: true }
        });
        if (dbRoles.length !== customRoleIds.length) {
          return NextResponse.json(
            { error: 'One or more custom roles were not found for this team' },
            { status: 400 }
          );
        }
        validCustomRoleIds = dbRoles.map(r => r.id);
      } else {
        validCustomRoleIds = [];
      }
    }

    // Apply updates atomically with race-condition protected sole-admin check
    try {
      await prisma.$transaction(async (tx) => {
        if (role !== undefined) {
          // Guard: Demoting sole Team Administrator is forbidden
          if (targetMember.role === 'TEAM_ADMIN' && role === 'TEAM_MEMBER') {
            const otherAdminsCount = await tx.teamMember.count({
              where: {
                teamId,
                role: 'TEAM_ADMIN',
                NOT: { id: memberId }
              }
            });

            if (otherAdminsCount === 0) {
              const err = new Error('Cannot demote the sole Team Administrator. Promote another member to Team Administrator first.');
              err.code = 'SOLE_ADMIN_DEMOTE';
              throw err;
            }
          }

          await tx.teamMember.update({
            where: { id: memberId },
            data: { role }
          });
        }

        if (validCustomRoleIds !== null) {
          await tx.teamMemberRoleAssignment.deleteMany({
            where: { memberId }
          });

          if (validCustomRoleIds.length > 0) {
            await tx.teamMemberRoleAssignment.createMany({
              data: validCustomRoleIds.map(customRoleId => ({
                memberId,
                customRoleId
              }))
            });
          }
        }
      });
    } catch (txErr) {
      if (txErr.code === 'SOLE_ADMIN_DEMOTE') {
        return NextResponse.json(
          { error: txErr.message },
          { status: 400 }
        );
      }
      throw txErr;
    }

    const updatedMember = await prisma.teamMember.findUnique({
      where: { id: memberId },
      include: {
        customRoles: {
          include: {
            customRole: true
          }
        }
      }
    });

    await logAuditEvent({
      userId: access.user.sub,
      actorUsername: access.user.username,
      action: AUDIT_ACTIONS.TEAM_MEMBER_UPDATED,
      targetResource: `team:${teamId}:member:${memberId}`,
      ipAddress: access.ipAddress,
      userAgent: access.userAgent,
      status: 'SUCCESS',
      details: {
        memberId,
        targetPlayerName: targetMember.playerName,
        newRole: role,
        assignedCustomRoleIds: validCustomRoleIds
      }
    });

    return NextResponse.json({
      success: true,
      member: updatedMember
    });
  } catch (err) {
    console.error('Error updating team member:', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id: teamId, memberId } = await params;

    const access = await requireTeamAccess(request, teamId, {
      allowUnverified: true
    });

    if (!access.authorized) {
      return access.response;
    }

    const { isGlobalAdmin, isTeamAdmin, callerMember, authority } = access;

    const targetMember = await prisma.teamMember.findFirst({
      where: {
        id: memberId,
        teamId
      }
    });

    if (!targetMember) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    const isSelfLeave = targetMember.userId === access.user.sub;
    const canManageMembers = authority.hasCapability(PERMISSIONS.MEMBERS_MANAGE);

    // Caller must either be leaving themselves or hold member management rights
    if (!isSelfLeave && !canManageMembers) {
      return NextResponse.json(
        { error: 'Forbidden: Team Administrator or MEMBERS_MANAGE capability required to remove members' },
        { status: 403 }
      );
    }

    // If not self-leave, require verification when verificationStatus is UNVERIFIED
    if (!isSelfLeave && !isGlobalAdmin && callerMember?.verificationStatus === 'UNVERIFIED') {
      return NextResponse.json(
        { error: 'In-game town rename verification required', code: 'VERIFICATION_REQUIRED' },
        { status: 403 }
      );
    }

    // Guard: Only Global Admin or existing Team Admin can kick another Team Administrator
    if (targetMember.role === 'TEAM_ADMIN' && !isSelfLeave && !isGlobalAdmin && !isTeamAdmin) {
      return NextResponse.json(
        { error: 'Only Team Administrators or Global Administrators can remove a Team Administrator' },
        { status: 403 }
      );
    }

    // Critical Guard: Cannot remove or leave as the sole Team Administrator (atomic inside transaction)
    try {
      await prisma.$transaction(async (tx) => {
        if (targetMember.role === 'TEAM_ADMIN') {
          const otherAdminsCount = await tx.teamMember.count({
            where: {
              teamId,
              role: 'TEAM_ADMIN',
              NOT: { id: memberId }
            }
          });

          if (otherAdminsCount === 0) {
            const err = new Error('Cannot remove the sole Team Administrator from the team. Promote another member first.');
            err.code = 'SOLE_ADMIN_REMOVE';
            throw err;
          }
        }

        await tx.teamMemberRoleAssignment.deleteMany({
          where: { memberId }
        });

        await tx.teamMember.delete({
          where: { id: memberId }
        });
      });
    } catch (txErr) {
      if (txErr.code === 'SOLE_ADMIN_REMOVE') {
        return NextResponse.json(
          { error: txErr.message },
          { status: 400 }
        );
      }
      throw txErr;
    }

    await logAuditEvent({
      userId: access.user.sub,
      actorUsername: access.user.username,
      action: isSelfLeave ? AUDIT_ACTIONS.TEAM_MEMBER_LEFT : AUDIT_ACTIONS.TEAM_MEMBER_KICKED,
      targetResource: `team:${teamId}:member:${memberId}`,
      ipAddress: access.ipAddress,
      userAgent: access.userAgent,
      status: 'SUCCESS',
      details: {
        memberId,
        playerName: targetMember.playerName,
        isSelfLeave
      }
    });

    return NextResponse.json({
      success: true,
      message: `${targetMember.playerName} has been removed from the team`
    });
  } catch (err) {
    console.error('Error removing team member:', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}
