import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';

const ACCESS_TOKEN_SECRET = process.env.AUTH_ACCESS_SECRET || 'fallback-secret-key-at-least-32-chars-long-grepolis-auth-2026';
const encodedSecret = new TextEncoder().encode(ACCESS_TOKEN_SECRET);

export const ACCESS_COOKIE_NAME = 'grepo_access';
export const REFRESH_COOKIE_NAME = 'grepo_refresh';

export const ACCESS_TOKEN_EXPIRY = '15m';
export const ACCESS_TOKEN_MAX_AGE = 15 * 60; // 15 minutes in seconds
export const REFRESH_TOKEN_MAX_AGE = 14 * 24 * 60 * 60; // 14 days in seconds

export const PERMISSIONS = Object.freeze({
  TARGETS_MANAGE: 'TARGETS_MANAGE',
  DEFENSE_COORDINATE: 'DEFENSE_COORDINATE',
  COALITIONS_MANAGE: 'COALITIONS_MANAGE',
  PINS_MANAGE: 'PINS_MANAGE',
  INVITES_MANAGE: 'INVITES_MANAGE',
  MEMBERS_MANAGE: 'MEMBERS_MANAGE',
  ROLES_MANAGE: 'ROLES_MANAGE',
  OPERATIONS_COORDINATE: 'OPERATIONS_COORDINATE',
  GHOST_RADAR_RESERVE: 'GHOST_RADAR_RESERVE'
});

export const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

/**
 * Evaluates whether an authenticated context holds a required capability.
 *
 * - Returns true if auth.user.globalRole === 'GLOBAL_ADMIN'.
 * - Returns true if member role is 'TEAM_ADMIN' (inherits full administrative capabilities).
 * - Returns true if any assigned custom role has requiredPermission or '*'.
 *
 * @param {object} auth
 * @param {string} [teamId]
 * @param {string} requiredPermission
 * @returns {boolean}
 */
export function hasPermission(auth, teamId, requiredPermission) {
  if (!auth) return false;

  // 1. Identify user and member from various calling conventions:
  // - auth = { user, member }
  // - auth = user (object with sub/globalRole/teams)
  // - auth = member (object with role/teamId/customRoles)
  let user = auth.user || (auth.sub || auth.globalRole || auth.teams ? auth : null);
  let member = auth.member || null;

  if (!user && (auth.role || auth.teamId || auth.membershipId || auth.customRoles)) {
    // auth itself was passed as a member object
    member = auth;
  }

  // 2. Global Admin always has superuser authority across all teams
  if (user?.globalRole === 'GLOBAL_ADMIN') {
    return true;
  }

  // If no specific permission requested, any authenticated user/member passes
  if (!requiredPermission) {
    return true;
  }

  // 3. Locate the member record for the target team
  const teams = Array.isArray(user?.teams) ? user.teams : [];

  if (teamId) {
    // If target teamId was specified:
    // First check user's team array
    const matchedTeam = teams.find(t => t.teamId === teamId || t.membershipId === teamId);
    if (matchedTeam) {
      member = matchedTeam;
    } else if (member && (member.teamId === teamId || member.membershipId === teamId || member.id === teamId)) {
      // member explicitly matches teamId
    } else {
      // Caller specified teamId, but user/member is NOT part of this team!
      // Strict multi-tenant isolation: Never leak permissions from another team!
      return false;
    }
  } else {
    // No teamId specified: fallback to member or first team
    member = member || (teams.length > 0 ? teams[0] : null);
  }

  // If still no member found:
  if (!member) {
    // Only check top-level ambient user.permissions if NO teamId was requested (global scope)
    if (!teamId && Array.isArray(user?.permissions)) {
      return user.permissions.includes('*') || user.permissions.includes(requiredPermission);
    }
    return false;
  }

  // 4. TEAM_ADMIN inherits full administrative capabilities
  if (member.role === 'TEAM_ADMIN') {
    return true;
  }

  // 5. Check assigned permissions on member or assigned custom roles
  const granted = new Set();

  if (Array.isArray(member.permissions)) {
    for (const p of member.permissions) granted.add(p);
  }

  if (Array.isArray(member.customRoles)) {
    for (const r of member.customRoles) {
      const perms = r.customRole?.permissions || r.permissions;
      if (Array.isArray(perms)) {
        for (const p of perms) granted.add(p);
      }
    }
  }

  if (Array.isArray(member.assignments)) {
    for (const a of member.assignments) {
      const perms = a.customRole?.permissions || a.permissions;
      if (Array.isArray(perms)) {
        for (const p of perms) granted.add(p);
      }
    }
  }

  return granted.has('*') || granted.has(requiredPermission);
}

/**
 * Generates an HMAC SHA-256 JWT access token with 15 minutes lifespan.
 * Encodes user's team capabilities into JWT access token payload (permissions: string[]).
 *
 * @param {object} payload
 * @returns {Promise<string>}
 */
export async function generateAccessToken(payload) {
  const permissionsSet = new Set(Array.isArray(payload.permissions) ? payload.permissions : []);

  if (payload.globalRole === 'GLOBAL_ADMIN') {
    permissionsSet.add('*');
    for (const p of ALL_PERMISSIONS) permissionsSet.add(p);
  }

  if (Array.isArray(payload.teams)) {
    for (const team of payload.teams) {
      if (team.role === 'TEAM_ADMIN') {
        permissionsSet.add('*');
        for (const p of ALL_PERMISSIONS) permissionsSet.add(p);
      }
      if (Array.isArray(team.permissions)) {
        for (const p of team.permissions) permissionsSet.add(p);
      }
    }
  }

  const finalPayload = {
    ...payload,
    permissions: Array.from(permissionsSet)
  };

  const jwt = new SignJWT(finalPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY);

  return jwt.sign(encodedSecret);
}

/**
 * Verifies an access token and returns its decoded payload.
 *
 * @param {string} token
 * @returns {Promise<object|null>}
 */
export async function verifyAccessToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const { payload } = await jwtVerify(token, encodedSecret, {
      algorithms: ['HS256']
    });
    return payload;
  } catch {
    return null;
  }
}

/**
 * Generates a 256-bit cryptographically random refresh token.
 *
 * @returns {{ rawToken: string, tokenHash: string, expiresAt: Date }}
 */
export function generateRefreshToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE * 1000);
  return { rawToken, tokenHash, expiresAt };
}

/**
 * Computes the SHA-256 hash of a raw refresh token.
 *
 * @param {string} rawToken
 * @returns {string}
 */
export function hashRefreshToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return '';
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Parses cookies from a cookie header string.
 *
 * @param {string} cookieHeader
 * @returns {Record<string, string>}
 */
export function parseCookieHeader(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return {};
  const cookies = {};
  const items = cookieHeader.split(';');
  for (const item of items) {
    const [name, ...val] = item.trim().split('=');
    if (name) {
      cookies[name.trim()] = decodeURIComponent(val.join('=').trim());
    }
  }
  return cookies;
}

/**
 * Extracts access and refresh tokens from Request (headers or cookies).
 *
 * @param {Request} request
 * @returns {{ accessToken: string|null, refreshToken: string|null }}
 */
export function extractTokensFromRequest(request) {
  if (!request) return { accessToken: null, refreshToken: null };

  let accessToken = null;
  let refreshToken = null;

  // 1. Try NextRequest .cookies API if available
  if (request.cookies && typeof request.cookies.get === 'function') {
    accessToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value || null;
    refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value || null;
  }

  // 2. Parse from Cookie header if not yet found
  if (!accessToken || !refreshToken) {
    const cookieHeader = request.headers?.get?.('cookie') || '';
    const parsed = parseCookieHeader(cookieHeader);
    if (!accessToken && parsed[ACCESS_COOKIE_NAME]) {
      accessToken = parsed[ACCESS_COOKIE_NAME];
    }
    if (!refreshToken && parsed[REFRESH_COOKIE_NAME]) {
      refreshToken = parsed[REFRESH_COOKIE_NAME];
    }
  }

  // 3. Fallback for access token from Authorization Bearer header
  if (!accessToken) {
    const authHeader = request.headers?.get?.('authorization') || '';
    if (/^bearer\s+/i.test(authHeader.trim())) {
      accessToken = authHeader.trim().replace(/^bearer\s+/i, '').trim();
    }
  }

  return { accessToken, refreshToken };
}

/**
 * Sets dual-token authentication cookies on a NextResponse or response object.
 *
 * @param {any} response - NextResponse or response with cookies API
 * @param {{ accessToken?: string, refreshToken?: string }} tokens
 */
export function setAuthCookies(response, { accessToken, refreshToken }) {
  const isProd = process.env.NODE_ENV === 'production';

  if (accessToken && response?.cookies?.set) {
    response.cookies.set(ACCESS_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS_TOKEN_MAX_AGE
    });
  }

  if (refreshToken && response?.cookies?.set) {
    response.cookies.set(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: REFRESH_TOKEN_MAX_AGE
    });
  }
}

/**
 * Clears authentication cookies on a NextResponse or response object.
 *
 * @param {any} response
 */
export function clearAuthCookies(response) {
  const isProd = process.env.NODE_ENV === 'production';

  if (response?.cookies?.set) {
    response.cookies.set(ACCESS_COOKIE_NAME, '', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 0
    });
    response.cookies.set(REFRESH_COOKIE_NAME, '', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 0
    });
  }
}
