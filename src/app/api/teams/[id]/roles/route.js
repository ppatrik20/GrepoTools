import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  hasPermission,
  PERMISSIONS,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_TEMPLATES
} from '@/lib/auth/rbac';
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
      include: { members: true }
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const isGlobalAdmin = auth.user.globalRole === 'GLOBAL_ADMIN';
    const isMember = team.members.some(m => m.userId === auth.user.sub);

    if (!isGlobalAdmin && !isMember) {
      return NextResponse.json(
        { error: 'Forbidden: You are not a member of this team' },
        { status: 403 }
      );
    }

    // Retrieve existing custom roles
    let roles = await prisma.teamCustomRole.findMany({
      where: { teamId },
      include: {
        _count: {
          select: { assignments: true }
        }
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
    });

    // Seed initial templates if team has none configured yet
    if (roles.length === 0) {
      for (const tpl of DEFAULT_ROLE_TEMPLATES) {
        await prisma.teamCustomRole.create({
          data: {
            teamId,
            name: tpl.name,
            description: tpl.description,
            color: tpl.color,
            icon: tpl.icon,
            priority: tpl.priority,
            permissions: tpl.permissions
          }
        }).catch(() => {});
      }

      roles = await prisma.teamCustomRole.findMany({
        where: { teamId },
        include: {
          _count: {
            select: { assignments: true }
          }
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
      });
    }

    const formattedRoles = roles.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      color: r.color,
      icon: r.icon,
      priority: r.priority,
      permissions: r.permissions,
      memberCount: r._count?.assignments ?? 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));

    return NextResponse.json({
      roles: formattedRoles
    });
  } catch (err) {
    console.error('Error fetching custom roles:', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
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

    const body = await request.json().catch(() => ({}));
    const {
      name,
      description = '',
      color = '#3B82F6',
      icon = 'shield',
      permissions = [],
      priority = 0
    } = body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { error: 'Role name must be at least 2 characters long' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    // Check duplicate role name within this team
    const existing = await prisma.teamCustomRole.findFirst({
      where: {
        teamId,
        name: { equals: trimmedName, mode: 'insensitive' }
      }
    });

    if (existing) {
      return NextResponse.json(
        { error: `A role named "${trimmedName}" already exists for this team` },
        { status: 409 }
      );
    }

    // Filter and sanitize permissions to valid unique keys
    const validPerms = Array.isArray(permissions)
      ? Array.from(new Set(permissions.filter(p => ALL_PERMISSIONS.includes(p) || p === '*')))
      : [];

    const parsedPriority = Number.isInteger(priority) ? priority : Number.parseInt(priority, 10);

    const newRole = await prisma.teamCustomRole.create({
      data: {
        teamId,
        name: trimmedName,
        description: description ? String(description).trim() : null,
        color: typeof color === 'string' && color.startsWith('#') ? color : '#3B82F6',
        icon: typeof icon === 'string' ? icon : 'shield',
        permissions: validPerms,
        priority: Number.isInteger(parsedPriority) ? parsedPriority : 0
      }
    });

    await logAuditEvent({
      userId: auth.user.sub,
      actorUsername: auth.user.username,
      action: 'CUSTOM_ROLE_CREATED',
      targetResource: `team:${teamId}:role:${newRole.id}`,
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
      status: 'SUCCESS',
      details: {
        roleId: newRole.id,
        roleName: newRole.name,
        permissions: validPerms,
        priority: newRole.priority
      }
    });

    return NextResponse.json({
      success: true,
      role: {
        ...newRole,
        memberCount: 0
      }
    }, { status: 201 });
  } catch (err) {
    console.error('Error creating custom role:', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}
