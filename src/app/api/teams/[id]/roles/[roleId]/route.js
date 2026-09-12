import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, hasPermission, PERMISSIONS, ALL_PERMISSIONS } from '@/lib/auth/rbac';
import { logAuditEvent } from '@/lib/auth/audit';

export async function PUT(request, { params }) {
  const auth = await requireAuth(request, { allowUnverified: true });
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id: teamId, roleId } = await params;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { members: true }
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const isGlobalAdmin = auth.user.globalRole === 'GLOBAL_ADMIN';
    const callerMember = team.members.find(m => m.userId === auth.user.sub);

    if (!isGlobalAdmin && !callerMember) {
      return NextResponse.json(
        { error: 'Forbidden: You are not a member of this team' },
        { status: 403 }
      );
    }

    const isTeamAdmin = callerMember?.role === 'TEAM_ADMIN';
    const canManageRoles = isGlobalAdmin || isTeamAdmin || hasPermission(auth, teamId, PERMISSIONS.ROLES_MANAGE);

    if (!canManageRoles) {
      return NextResponse.json(
        { error: 'Forbidden: Team Administrator or ROLES_MANAGE capability required' },
        { status: 403 }
      );
    }

    const existingRole = await prisma.teamCustomRole.findFirst({
      where: {
        id: roleId,
        teamId
      }
    });

    if (!existingRole) {
      return NextResponse.json({ error: 'Custom role not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { name, description, color, icon, permissions, priority } = body;

    const dataToUpdate = {};

    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (trimmedName.length < 2) {
        return NextResponse.json(
          { error: 'Role name must be at least 2 characters long' },
          { status: 400 }
        );
      }

      // Check name uniqueness if changed
      if (trimmedName.toLowerCase() !== existingRole.name.toLowerCase()) {
        const duplicate = await prisma.teamCustomRole.findFirst({
          where: {
            teamId,
            name: { equals: trimmedName, mode: 'insensitive' },
            NOT: { id: roleId }
          }
        });

        if (duplicate) {
          return NextResponse.json(
            { error: `A role named "${trimmedName}" already exists for this team` },
            { status: 409 }
          );
        }
      }

      dataToUpdate.name = trimmedName;
    }

    if (description !== undefined) {
      dataToUpdate.description = description ? String(description).trim() : null;
    }

    if (color !== undefined && typeof color === 'string') {
      dataToUpdate.color = color.startsWith('#') ? color : '#3B82F6';
    }

    if (icon !== undefined && typeof icon === 'string') {
      dataToUpdate.icon = icon;
    }

    if (priority !== undefined) {
      const parsedPriority = Number.isInteger(priority) ? priority : Number.parseInt(priority, 10);
      dataToUpdate.priority = Number.isInteger(parsedPriority) ? parsedPriority : 0;
    }

    if (Array.isArray(permissions)) {
      dataToUpdate.permissions = Array.from(new Set(permissions.filter(p => ALL_PERMISSIONS.includes(p) || p === '*')));
    }

    const updatedRole = await prisma.teamCustomRole.update({
      where: { id: roleId },
      data: dataToUpdate,
      include: {
        _count: {
          select: { assignments: true }
        }
      }
    });

    await logAuditEvent({
      userId: auth.user.sub,
      actorUsername: auth.user.username,
      action: 'CUSTOM_ROLE_UPDATED',
      targetResource: `team:${teamId}:role:${roleId}`,
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
      status: 'SUCCESS',
      details: {
        roleId,
        updatedFields: Object.keys(dataToUpdate)
      }
    });

    return NextResponse.json({
      success: true,
      role: {
        ...updatedRole,
        memberCount: updatedRole._count?.assignments ?? 0
      }
    });
  } catch (err) {
    console.error('Error updating custom role:', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, { allowUnverified: true });
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id: teamId, roleId } = await params;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { members: true }
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const isGlobalAdmin = auth.user.globalRole === 'GLOBAL_ADMIN';
    const callerMember = team.members.find(m => m.userId === auth.user.sub);

    if (!isGlobalAdmin && !callerMember) {
      return NextResponse.json(
        { error: 'Forbidden: You are not a member of this team' },
        { status: 403 }
      );
    }

    const isTeamAdmin = callerMember?.role === 'TEAM_ADMIN';
    const canManageRoles = isGlobalAdmin || isTeamAdmin || hasPermission(auth, teamId, PERMISSIONS.ROLES_MANAGE);

    if (!canManageRoles) {
      return NextResponse.json(
        { error: 'Forbidden: Team Administrator or ROLES_MANAGE capability required' },
        { status: 403 }
      );
    }

    const existingRole = await prisma.teamCustomRole.findFirst({
      where: {
        id: roleId,
        teamId
      }
    });

    if (!existingRole) {
      return NextResponse.json({ error: 'Custom role not found' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.teamMemberRoleAssignment.deleteMany({
        where: { customRoleId: roleId }
      });
      await tx.teamCustomRole.delete({
        where: { id: roleId }
      });
    });

    await logAuditEvent({
      userId: auth.user.sub,
      actorUsername: auth.user.username,
      action: 'CUSTOM_ROLE_DELETED',
      targetResource: `team:${teamId}:role:${roleId}`,
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
      status: 'SUCCESS',
      details: {
        roleId,
        roleName: existingRole.name
      }
    });

    return NextResponse.json({
      success: true,
      message: `Custom role "${existingRole.name}" deleted successfully`
    });
  } catch (err) {
    console.error('Error deleting custom role:', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}
