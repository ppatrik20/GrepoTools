import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireTeamAccess,
  PERMISSIONS,
  ALL_PERMISSIONS,
  AUDIT_ACTIONS
} from '@/lib/auth/rbac';
import { logAuditEvent } from '@/lib/auth/audit';

export async function PUT(request, { params }) {
  try {
    const { id: teamId, roleId } = await params;

    const access = await requireTeamAccess(request, teamId, {
      requiredPermission: PERMISSIONS.ROLES_MANAGE
    });

    if (!access.authorized) {
      return access.response;
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
      userId: access.user.sub,
      actorUsername: access.user.username,
      action: AUDIT_ACTIONS.CUSTOM_ROLE_UPDATED,
      targetResource: `team:${teamId}:role:${roleId}`,
      ipAddress: access.ipAddress,
      userAgent: access.userAgent,
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
  try {
    const { id: teamId, roleId } = await params;

    const access = await requireTeamAccess(request, teamId, {
      requiredPermission: PERMISSIONS.ROLES_MANAGE
    });

    if (!access.authorized) {
      return access.response;
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
      userId: access.user.sub,
      actorUsername: access.user.username,
      action: AUDIT_ACTIONS.CUSTOM_ROLE_DELETED,
      targetResource: `team:${teamId}:role:${roleId}`,
      ipAddress: access.ipAddress,
      userAgent: access.userAgent,
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
