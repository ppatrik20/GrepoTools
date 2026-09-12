import { NextResponse } from 'next/server';
import {
  extractTokensFromRequest,
  verifyAccessToken,
  PERMISSIONS,
  ALL_PERMISSIONS,
  hasPermission
} from './tokens.js';
import { verifyAdminBearerAuth } from '../auth.js';

export { PERMISSIONS, ALL_PERMISSIONS, hasPermission };

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
      role: m.role,
      playerId: m.playerId,
      playerName: m.playerName,
      status: m.verificationStatus,
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
