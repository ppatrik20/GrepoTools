import { NextResponse } from 'next/server';
import {
  extractTokensFromRequest,
  verifyAccessToken,
  PERMISSIONS,
  ALL_PERMISSIONS,
  hasPermission
} from './tokens.js';
import { verifyAdminBearerAuth } from '../auth.js';
import { prisma } from '../prisma.js';
import { resolveTeamAuthority } from '../team/teamAuthority.js';

export { PERMISSIONS, ALL_PERMISSIONS, hasPermission };

export const AUDIT_ACTIONS = Object.freeze({
  AUTH_LOGIN_SUCCESS: 'AUTH_LOGIN_SUCCESS',
  AUTH_LOGIN_FAILURE: 'AUTH_LOGIN_FAILURE',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILURE',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  AUTH_LOGIN_BLOCKED_LOCKOUT: 'AUTH_LOGIN_BLOCKED_LOCKOUT',
  AUTH_REGISTER: 'AUTH_REGISTER',
  USER_REGISTERED_VIA_INVITE: 'USER_REGISTERED_VIA_INVITE',
  AUTH_REFRESH: 'AUTH_REFRESH',
  AUTH_TOKEN_ROTATED: 'AUTH_TOKEN_ROTATED',
  AUTH_TOKEN_REUSE_DETECTED: 'AUTH_TOKEN_REUSE_DETECTED',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  TOWN_VERIFIED: 'TOWN_VERIFIED',
  TOWN_VERIFY_ATTEMPT: 'TOWN_VERIFY_ATTEMPT',
  TOWN_VERIFICATION_CHECK_FAILED: 'TOWN_VERIFICATION_CHECK_FAILED',
  TEAM_CREATED: 'TEAM_CREATED',
  TEAM_DELETED: 'TEAM_DELETED',
  TEAM_MEMBER_UPDATED: 'TEAM_MEMBER_UPDATED',
  TEAM_MEMBER_REMOVED: 'TEAM_MEMBER_REMOVED',
  TEAM_MEMBER_LEFT: 'TEAM_MEMBER_LEFT',
  TEAM_MEMBER_KICKED: 'TEAM_MEMBER_KICKED',
  ROLE_CREATED: 'ROLE_CREATED',
  ROLE_UPDATED: 'ROLE_UPDATED',
  ROLE_DELETED: 'ROLE_DELETED',
  CUSTOM_ROLE_CREATED: 'CUSTOM_ROLE_CREATED',
  CUSTOM_ROLE_UPDATED: 'CUSTOM_ROLE_UPDATED',
  CUSTOM_ROLE_DELETED: 'CUSTOM_ROLE_DELETED',
  INVITE_CREATED: 'INVITE_CREATED',
  INVITE_REVOKED: 'INVITE_REVOKED',
  WORLD_SYNC_TRIGGERED: 'WORLD_SYNC_TRIGGERED',
  WORLD_CREATED: 'WORLD_CREATED',
  WORLD_UPDATED: 'WORLD_UPDATED',
  WORLD_DELETED: 'WORLD_DELETED'
});

/**
 * Canonical Prisma include clause for hydrating a user's team memberships
 * with world metadata and custom role assignments.
 */
export const TEAM_MEMBERSHIP_INCLUDE = Object.freeze({
  team: {
    include: {
      world: true
    }
  },
  customRoles: {
    include: {
      customRole: true
    }
  }
});

/**
 * Descriptive definitions of each tactical RBAC capability.
 */
export const PERMISSION_DEFINITIONS = Object.freeze([
  {
    key: PERMISSIONS.TARGETS_MANAGE,
    label: 'Target Coordination',
    category: 'Offense',
    description: 'Designate strategic city assault targets, prioritize sieges, and assign strike squads.'
  },
  {
    key: PERMISSIONS.DEFENSE_COORDINATE,
    label: 'Defense Coordination',
    category: 'Defense',
    description: 'Coordinate emergency defense requests, bireme walls, and calculate defensive stack thresholds.'
  },
  {
    key: PERMISSIONS.COALITIONS_MANAGE,
    label: 'Coalitions & Diplomacy',
    category: 'Diplomacy',
    description: 'Manage confederate alliances, non-aggression treaties, and coalition frontline channels.'
  },
  {
    key: PERMISSIONS.PINS_MANAGE,
    label: 'Tactical Pinboard',
    category: 'Intelligence',
    description: 'Create, reposition, and purge tactical map pins and strategic markers.'
  },
  {
    key: PERMISSIONS.INVITES_MANAGE,
    label: 'Invitations Management',
    category: 'Administration',
    description: 'Issue cryptographic team invitation links with pre-assigned operational roles and revoke invites.'
  },
  {
    key: PERMISSIONS.MEMBERS_MANAGE,
    label: 'Member Roster & Roles',
    category: 'Administration',
    description: 'Promote/demote members, assign specialized custom roles, and remove members.'
  },
  {
    key: PERMISSIONS.ROLES_MANAGE,
    label: 'Custom Role Architecture',
    category: 'Administration',
    description: 'Create, configure, modify, and delete custom capability-based team roles.'
  },
  {
    key: PERMISSIONS.OPERATIONS_COORDINATE,
    label: 'Operations Dispatch',
    category: 'Tactical',
    description: 'Schedule synchronous landing windows, timing calculations, and tactical operation rooms.'
  },
  {
    key: PERMISSIONS.GHOST_RADAR_RESERVE,
    label: 'Ghost Radar & Claims',
    category: 'Intelligence',
    description: 'Track abandoned ghost cities, reserve strategic re-colonization slots, and notify allies.'
  }
]);

/**
 * Default seeded tactical custom roles for teams.
 */
export const DEFAULT_ROLE_TEMPLATES = Object.freeze([
  {
    name: 'Attack Coordinator',
    description: 'Directs strategic offensive strikes, timing schedules, and target assignments.',
    color: '#EF4444',
    icon: 'swords',
    priority: 90,
    permissions: [
      PERMISSIONS.TARGETS_MANAGE,
      PERMISSIONS.OPERATIONS_COORDINATE,
      PERMISSIONS.PINS_MANAGE
    ]
  },
  {
    name: 'Defense Coordinator',
    description: 'Organizes defensive walls, bireme dispatches, and emergency counter-snipe coordination.',
    color: '#3B82F6',
    icon: 'shield',
    priority: 85,
    permissions: [
      PERMISSIONS.DEFENSE_COORDINATE,
      PERMISSIONS.OPERATIONS_COORDINATE,
      PERMISSIONS.PINS_MANAGE
    ]
  },
  {
    name: 'Intel Officer',
    description: 'Maintains map markers, tracks player movement, and reserves lucrative ghost cities.',
    color: '#8B5CF6',
    icon: 'radar',
    priority: 70,
    permissions: [
      PERMISSIONS.GHOST_RADAR_RESERVE,
      PERMISSIONS.PINS_MANAGE
    ]
  },
  {
    name: 'Diplomat',
    description: 'Handles coalition treaties, alliance relationships, and recruits verified allies.',
    color: '#10B981',
    icon: 'handshake',
    priority: 60,
    permissions: [
      PERMISSIONS.COALITIONS_MANAGE,
      PERMISSIONS.INVITES_MANAGE
    ]
  }
]);

/**
 * Builds normalized team membership structures with encoded permissions.
 *
 * @param {Array} memberships
 * @returns {Array}
 */
export function buildTeamMembershipPayload(memberships) {
  if (!Array.isArray(memberships)) return [];

  return memberships.map(m => {
    const rawRoles = m.customRoles || [];
    const customRoles = [];
    const permSet = new Set();

    for (const item of rawRoles) {
      const roleObj = item.customRole || item;
      if (roleObj && (roleObj.id || roleObj.name)) {
        customRoles.push({
          id: roleObj.id || item.customRoleId,
          name: roleObj.name,
          color: roleObj.color || '#3B82F6',
          icon: roleObj.icon || 'shield',
          priority: roleObj.priority || 0,
          permissions: Array.isArray(roleObj.permissions) ? roleObj.permissions : []
        });

        if (Array.isArray(roleObj.permissions)) {
          for (const p of roleObj.permissions) permSet.add(p);
        }
      }
    }

    // TEAM_ADMIN inherits full administrative capabilities
    if (m.role === 'TEAM_ADMIN') {
      for (const p of ALL_PERMISSIONS) permSet.add(p);
      permSet.add('*');
    }

    return {
      membershipId: m.id,
      teamId: m.teamId,
      teamName: m.team?.name || 'Unknown Team',
      worldId: m.worldId,
      worldName: m.team?.world?.name || m.world?.name || m.worldId,
      role: m.role,
      playerId: m.playerId,
      playerName: m.playerName,
      verificationCode: m.verificationCode ?? null,
      status: m.verificationStatus,
      verifiedAt: m.verifiedAt ?? null,
      permissions: Array.from(permSet),
      customRoles
    };
  });
}



/**
 * Safely extracts client IP address from request headers.
 *
 * @param {Request} request
 * @returns {string}
 */
export function extractClientIp(request) {
  if (!request || !request.headers || typeof request.headers.get !== 'function') {
    return '127.0.0.1';
  }
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded && typeof forwarded === 'string') {
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp) return firstIp;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp && typeof realIp === 'string') {
    return realIp.trim();
  }
  return '127.0.0.1';
}

/**
 * Safely extracts User-Agent string from request.
 *
 * @param {Request} request
 * @returns {string}
 */
export function extractUserAgent(request) {
  if (!request || !request.headers || typeof request.headers.get !== 'function') {
    return 'Unknown';
  }
  return request.headers.get('user-agent') || 'Unknown';
}

/**
 * RBAC Guard for Route Handlers.
 *
 * Options:
 * - minGlobalRole: "GLOBAL_ADMIN" | "USER"
 * - requiredTeamRole: "TEAM_ADMIN" | "TEAM_MEMBER"
 * - requiredPermission: string (capability key, e.g. PERMISSIONS.MEMBERS_MANAGE)
 * - teamId: string (team context for capability checks)
 * - worldId: string (required when requiredTeamRole is specified)
 * - allowUnverified: boolean (default: false)
 * - allowLegacyAdminBearer: boolean (default: true)
 *
 * @param {Request} request
 * @param {object} [options]
 * @returns {Promise<{ authorized: boolean, user?: object, member?: object, response?: NextResponse, ipAddress: string, userAgent: string }>}
 */
export async function requireAuth(request, options = {}) {
  const ipAddress = extractClientIp(request);
  const userAgent = extractUserAgent(request);

  const {
    minGlobalRole = null,
    requiredTeamRole = null,
    requiredPermission = null,
    teamId = null,
    worldId = null,
    allowUnverified = false,
    allowLegacyAdminBearer = true
  } = options;

  // 1. Check legacy admin bearer password if permitted and present
  if (allowLegacyAdminBearer && verifyAdminBearerAuth(request)) {
    let adminId = 'system-global-admin';
    try {
      const { prisma } = await import('../prisma.js');
      const { ensureSuperAdmin } = await import('./bootstrap.js');
      const seeded = await ensureSuperAdmin();
      if (seeded?.id) {
        adminId = seeded.id;
      } else {
        const existingAdmin = await prisma.user.findFirst({
          where: { globalRole: 'GLOBAL_ADMIN' }
        });
        if (existingAdmin?.id) {
          adminId = existingAdmin.id;
        }
      }
    } catch {
      // Suppress DB lookup errors during fallback auth
    }

    const legacyAdminUser = {
      sub: adminId,
      username: 'GlobalAdmin',
      globalRole: 'GLOBAL_ADMIN',
      permissions: ['*'],
      teams: []
    };
    return {
      authorized: true,
      user: legacyAdminUser,
      member: null,
      ipAddress,
      userAgent
    };
  }

  // 2. Extract & verify JWT access token
  const { accessToken } = extractTokensFromRequest(request);
  if (!accessToken) {
    return {
      authorized: false,
      ipAddress,
      userAgent,
      response: NextResponse.json(
        { error: 'Authentication required', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    };
  }

  const user = await verifyAccessToken(accessToken);
  if (!user || !user.sub) {
    return {
      authorized: false,
      ipAddress,
      userAgent,
      response: NextResponse.json(
        { error: 'Invalid or expired session token', code: 'TOKEN_INVALID' },
        { status: 401 }
      )
    };
  }

  // 3. Global role checks
  const isGlobalAdmin = user.globalRole === 'GLOBAL_ADMIN';

  if (minGlobalRole === 'GLOBAL_ADMIN' && !isGlobalAdmin) {
    return {
      authorized: false,
      user,
      ipAddress,
      userAgent,
      response: NextResponse.json(
        { error: 'Global Administrator privileges required', code: 'GLOBAL_ADMIN_REQUIRED' },
        { status: 403 }
      )
    };
  }

  // 4. Team-level & capability checks
  let member = null;
  if (worldId || teamId || requiredTeamRole || requiredPermission) {
    if (!isGlobalAdmin) {
      const teams = Array.isArray(user.teams) ? user.teams : [];
      if (teamId) {
        member = teams.find(t => t.teamId === teamId || t.membershipId === teamId);
      } else if (worldId) {
        member = teams.find(t => t.worldId === worldId);
      } else {
        member = teams[0] || null;
      }

      if (!member && (teamId || worldId || requiredTeamRole)) {
        return {
          authorized: false,
          user,
          ipAddress,
          userAgent,
          response: NextResponse.json(
            {
              error: `Team membership required${worldId ? ` for world ${worldId}` : ''}`,
              code: 'TEAM_MEMBER_REQUIRED'
            },
            { status: 403 }
          )
        };
      }

      // Verification check
      if (member && !allowUnverified && member.status !== 'VERIFIED') {
        return {
          authorized: false,
          user,
          member,
          ipAddress,
          userAgent,
          response: NextResponse.json(
            { error: 'In-game town rename verification required', code: 'VERIFICATION_REQUIRED' },
            { status: 403 }
          )
        };
      }

      // Team role check
      if (requiredTeamRole === 'TEAM_ADMIN' && member?.role !== 'TEAM_ADMIN') {
        return {
          authorized: false,
          user,
          member,
          ipAddress,
          userAgent,
          response: NextResponse.json(
            { error: 'Team Administrator role required', code: 'TEAM_ADMIN_REQUIRED' },
            { status: 403 }
          )
        };
      }

      // Capability permission check
      if (requiredPermission) {
        const targetTeamId = teamId || member?.teamId;
        const permitted = hasPermission({ user, member }, targetTeamId, requiredPermission);
        if (!permitted) {
          return {
            authorized: false,
            user,
            member,
            ipAddress,
            userAgent,
            response: NextResponse.json(
              {
                error: `Permission denied: '${requiredPermission}' capability required`,
                code: 'INSUFFICIENT_PERMISSIONS',
                requiredPermission
              },
              { status: 403 }
            )
          };
        }
      }
    }
  }

  return {
    authorized: true,
    user,
    member,
    ipAddress,
    userAgent
  };
}

/**
 * Server-Side Team Authority Guard for Team Route Handlers.
 * Evaluates live database membership, verification status, and custom role capabilities
 * rather than relying solely on potentially stale JWT claims.
 *
 * @param {Request} request
 * @param {string} teamId
 * @param {object} [options]
 * @param {boolean} [options.allowUnverified=false]
 * @param {boolean} [options.allowLegacyAdminBearer=true]
 * @param {boolean} [options.requireAdmin=false]
 * @param {string} [options.requiredPermission]
 * @param {object} [options.include]
 * @returns {Promise<{ authorized: boolean, user?: object, team?: object, callerMember?: object, isGlobalAdmin?: boolean, isTeamAdmin?: boolean, authority?: object, response?: NextResponse, ipAddress: string, userAgent: string }>}
 */
export async function requireTeamAccess(request, teamId, options = {}) {
  const {
    allowUnverified = false,
    allowLegacyAdminBearer = true,
    requireAdmin = false,
    requiredPermission = null,
    include = {}
  } = options;

  const auth = await requireAuth(request, {
    allowUnverified: true,
    allowLegacyAdminBearer
  });

  if (!auth.authorized) {
    return auth;
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
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
      ...include
    }
  });

  if (!team) {
    return {
      authorized: false,
      user: auth.user,
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
      response: NextResponse.json(
        { error: 'Team not found', code: 'TEAM_NOT_FOUND' },
        { status: 404 }
      )
    };
  }

  const membersList = Array.isArray(team.members) ? team.members : [];
  const callerMember = membersList.find(
    m => m.userId === auth.user.sub || m.userId === auth.user.id
  ) || null;

  const jwtTeams = Array.isArray(auth.user?.teams) ? auth.user.teams : [];
  const jwtTeamMember = jwtTeams.find(t => t.teamId === teamId || t.membershipId === teamId) || null;

  // Hydrate live permissions from DB callerMember.customRoles (falling back to direct permissions on mock fixtures)
  const livePermSet = new Set();
  if (callerMember) {
    if (Array.isArray(callerMember.customRoles)) {
      const [normalized] = buildTeamMembershipPayload([
        { ...callerMember, teamId: team.id || teamId, worldId: team.worldId }
      ]);
      for (const p of normalized?.permissions || []) {
        livePermSet.add(p);
      }
    } else if (Array.isArray(callerMember.permissions)) {
      for (const p of callerMember.permissions) {
        livePermSet.add(p);
      }
    } else if (Array.isArray(jwtTeamMember?.permissions)) {
      for (const p of jwtTeamMember.permissions) {
        livePermSet.add(p);
      }
    }

    if (callerMember.role === 'TEAM_ADMIN') {
      for (const p of ALL_PERMISSIONS) livePermSet.add(p);
      livePermSet.add('*');
    }
  }

  const hydratedUser = {
    ...auth.user,
    permissions: auth.user.globalRole === 'GLOBAL_ADMIN' ? ['*'] : [],
    teams: callerMember
      ? [
          {
            teamId: team.id || teamId,
            worldId: team.worldId,
            role: callerMember.role || 'TEAM_MEMBER',
            status: callerMember.verificationStatus ?? jwtTeamMember?.status ?? 'VERIFIED',
            permissions: Array.from(livePermSet)
          }
        ]
      : []
  };

  const baseAuthority = resolveTeamAuthority(hydratedUser, team.worldId, team);
  const authority = Object.freeze({
    ...baseAuthority,
    callerMember,
    verificationStatus: callerMember?.verificationStatus ?? jwtTeamMember?.status ?? null,
    hasCapability(permissionKey) {
      if (!permissionKey) return true;
      if (baseAuthority.isGlobalAdmin || baseAuthority.isTeamAdmin) return true;
      if (baseAuthority.userPermissions.includes('*')) return true;
      return baseAuthority.userPermissions.includes(permissionKey);
    }
  });

  if (!authority.isGlobalAdmin && !callerMember) {
    return {
      authorized: false,
      user: auth.user,
      team,
      callerMember: null,
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
      response: NextResponse.json(
        { error: 'Forbidden: You are not a member of this team', code: 'TEAM_MEMBER_REQUIRED' },
        { status: 403 }
      )
    };
  }

  const rawVerificationStatus = callerMember?.verificationStatus !== undefined
    ? callerMember.verificationStatus
    : jwtTeamMember?.status;
  const isVerifiedMember = rawVerificationStatus === undefined
    ? true
    : rawVerificationStatus === 'VERIFIED';

  if (!authority.isGlobalAdmin && !allowUnverified && !isVerifiedMember) {
    return {
      authorized: false,
      user: auth.user,
      team,
      callerMember,
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
      response: NextResponse.json(
        { error: 'In-game town rename verification required', code: 'VERIFICATION_REQUIRED' },
        { status: 403 }
      )
    };
  }

  if (requireAdmin && !authority.isTeamAdmin) {
    return {
      authorized: false,
      user: auth.user,
      team,
      callerMember,
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
      response: NextResponse.json(
        { error: 'Forbidden: Team Administrator role required', code: 'TEAM_ADMIN_REQUIRED' },
        { status: 403 }
      )
    };
  }

  if (requiredPermission && !authority.hasCapability(requiredPermission)) {
    return {
      authorized: false,
      user: auth.user,
      team,
      callerMember,
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
      response: NextResponse.json(
        {
          error: `Forbidden: Team Administrator or ${requiredPermission} capability required`,
          code: 'INSUFFICIENT_PERMISSIONS',
          requiredPermission
        },
        { status: 403 }
      )
    };
  }

  return {
    authorized: true,
    user: auth.user,
    team,
    callerMember,
    isGlobalAdmin: authority.isGlobalAdmin,
    isTeamAdmin: authority.isTeamAdmin,
    authority,
    ipAddress: auth.ipAddress,
    userAgent: auth.userAgent
  };
}
