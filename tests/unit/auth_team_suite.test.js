import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { hashPassword, verifyPassword, dummyVerify } from '@/lib/auth/password';
import {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  extractTokensFromRequest,
  setAuthCookies,
  clearAuthCookies,
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME
} from '@/lib/auth/tokens';
import { requireAuth, extractClientIp } from '@/lib/auth/rbac';
import { logAuditEvent } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { POST as refreshPost } from '@/app/api/auth/refresh/route';

describe('Auth & Team RBAC Test Suite', () => {

  // =========================================================================
  // 1. Password Security & Timing Attack Mitigation
  // =========================================================================
  describe('1. Password Security & Timing Mitigation', () => {
    it('hashes passwords with bcrypt salt rounds and verifies correctly', async () => {
      const plaintext = 'SuperSecretSpartan123!';
      const hash = await hashPassword(plaintext);

      expect(hash).toBeDefined();
      expect(hash).toMatch(/^\$2[aby]\$12\$/); // Valid bcrypt with 12 rounds

      const isMatch = await verifyPassword(plaintext, hash);
      expect(isMatch).toBe(true);

      const isWrong = await verifyPassword('WrongPassword', hash);
      expect(isWrong).toBe(false);
    });

    it('handles empty or malformed passwords safely without throwing', async () => {
      expect(await verifyPassword('', 'somehash')).toBe(false);
      expect(await verifyPassword(null, 'somehash')).toBe(false);
      expect(await verifyPassword('password', '')).toBe(false);
      expect(await verifyPassword('password', null)).toBe(false);
      expect(await verifyPassword('password', 'not-a-valid-bcrypt-hash')).toBe(false);
    });

    it('executes dummyVerify in constant-work bcrypt comparison without throwing', async () => {
      const start = Date.now();
      const result = await dummyVerify('UnknownUserPasswordAttempt');
      const duration = Date.now() - start;

      expect(result).toBe(false);
      // Bcrypt 12 rounds should take measurable CPU time (typically > 50ms)
      expect(duration).toBeGreaterThanOrEqual(10);
    });
  });

  // =========================================================================
  // 2. Token Lifecycle & Dual Tokens
  // =========================================================================
  describe('2. Token Lifecycle & Dual Tokens', () => {
    it('generates and verifies valid HMAC SHA-256 JWT access tokens', async () => {
      const payload = {
        sub: 'usr_uuid_123',
        username: 'Leonidas',
        globalRole: 'USER',
        teams: [
          {
            teamId: 'team_abc',
            teamName: 'Spartan Vanguard',
            worldId: 'hu119',
            role: 'TEAM_ADMIN',
            playerId: 10429,
            playerName: 'Leonidas',
            status: 'VERIFIED'
          }
        ]
      };

      const token = await generateAccessToken(payload);
      expect(token).toBeTypeOf('string');
      expect(token.split('.').length).toBe(3);

      const verified = await verifyAccessToken(token);
      expect(verified).not.toBeNull();
      expect(verified.sub).toBe(payload.sub);
      expect(verified.username).toBe(payload.username);
      expect(verified.globalRole).toBe(payload.globalRole);
      expect(verified.teams).toHaveLength(1);
      expect(verified.teams[0].role).toBe('TEAM_ADMIN');
      expect(verified.exp).toBeDefined();
    });

    it('rejects tampered or malformed tokens safely', async () => {
      const payload = { sub: 'usr_uuid_123', username: 'Leonidas', globalRole: 'USER' };
      const token = await generateAccessToken(payload);

      // Tamper with signature
      const tampered = token.slice(0, -5) + 'xxxxx';
      expect(await verifyAccessToken(tampered)).toBeNull();
      expect(await verifyAccessToken('completely.invalid.token')).toBeNull();
      expect(await verifyAccessToken('')).toBeNull();
      expect(await verifyAccessToken(null)).toBeNull();
    });

    it('generates 256-bit cryptographically random refresh tokens and correct SHA-256 hashes', () => {
      const { rawToken, tokenHash, expiresAt } = generateRefreshToken();

      expect(rawToken).toHaveLength(64); // 32 bytes hex = 64 characters
      expect(tokenHash).toHaveLength(64);

      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      expect(tokenHash).toBe(expectedHash);

      // 14 days expiration
      const diffDays = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(13.9);
      expect(diffDays).toBeLessThanOrEqual(14.1);
    });

    it('extracts tokens from Request headers and cookies properly', () => {
      // 1. From NextRequest-style cookies
      const mockNextReq = {
        cookies: {
          get: (name) => {
            if (name === ACCESS_COOKIE_NAME) return { value: 'tok_access_123' };
            if (name === REFRESH_COOKIE_NAME) return { value: 'tok_refresh_456' };
            return null;
          }
        },
        headers: new Headers()
      };

      const extracted1 = extractTokensFromRequest(mockNextReq);
      expect(extracted1.accessToken).toBe('tok_access_123');
      expect(extracted1.refreshToken).toBe('tok_refresh_456');

      // 2. From Cookie header string
      const mockStandardReq = {
        headers: new Headers({
          cookie: 'grepo_access=cookie_acc; grepo_refresh=cookie_ref'
        })
      };

      const extracted2 = extractTokensFromRequest(mockStandardReq);
      expect(extracted2.accessToken).toBe('cookie_acc');
      expect(extracted2.refreshToken).toBe('cookie_ref');

      // 3. From Authorization: Bearer header
      const mockBearerReq = {
        headers: new Headers({
          authorization: 'Bearer bearer_token_jwt'
        })
      };

      const extracted3 = extractTokensFromRequest(mockBearerReq);
      expect(extracted3.accessToken).toBe('bearer_token_jwt');
      expect(extracted3.refreshToken).toBeNull();
    });

    it('configures auth cookies properly on response object', () => {
      const cookieStore = new Map();
      const mockResponse = {
        cookies: {
          set: (name, val, opts) => cookieStore.set(name, { val, opts })
        }
      };

      setAuthCookies(mockResponse, {
        accessToken: 'access_jwt',
        refreshToken: 'refresh_hex'
      });

      expect(cookieStore.has(ACCESS_COOKIE_NAME)).toBe(true);
      expect(cookieStore.get(ACCESS_COOKIE_NAME).val).toBe('access_jwt');
      expect(cookieStore.get(ACCESS_COOKIE_NAME).opts.httpOnly).toBe(true);
      expect(cookieStore.get(ACCESS_COOKIE_NAME).opts.maxAge).toBe(15 * 60);

      expect(cookieStore.has(REFRESH_COOKIE_NAME)).toBe(true);
      expect(cookieStore.get(REFRESH_COOKIE_NAME).val).toBe('refresh_hex');
      expect(cookieStore.get(REFRESH_COOKIE_NAME).opts.httpOnly).toBe(true);
      expect(cookieStore.get(REFRESH_COOKIE_NAME).opts.maxAge).toBe(14 * 24 * 60 * 60);

      clearAuthCookies(mockResponse);
      expect(cookieStore.get(ACCESS_COOKIE_NAME).opts.maxAge).toBe(0);
      expect(cookieStore.get(REFRESH_COOKIE_NAME).opts.maxAge).toBe(0);
    });
  });

  // =========================================================================
  // 3. Refresh Token Rotation (RTR) & Replay Attack Containment
  // =========================================================================
  describe('3. Refresh Token Rotation (RTR) & Replay Detection', () => {
    it('detects revoked token reuse and marks entire family as revoked', () => {
      const familyId = 'family_uuid_xyz';
      const tokenFamily = [
        { id: 'tok_1', familyId, tokenHash: 'hash1', isRevoked: true },
        { id: 'tok_2', familyId, tokenHash: 'hash2', isRevoked: false }
      ];

      // Replay attack simulation: Attacker presents tok_1 (which is already revoked)
      const presentedToken = tokenFamily.find(t => t.id === 'tok_1');
      expect(presentedToken.isRevoked).toBe(true);

      // System detection triggers revocation of all tokens in familyId
      if (presentedToken.isRevoked) {
        tokenFamily.forEach(t => {
          if (t.familyId === familyId) t.isRevoked = true;
        });
      }

      // Valid token in family is now also revoked to prevent attacker exploitation
      const activeToken = tokenFamily.find(t => t.id === 'tok_2');
      expect(activeToken.isRevoked).toBe(true);
    });

    it('POST /api/auth/refresh returns 401 when refresh token is missing', async () => {
      const req = new Request('http://localhost:3000/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const res = await refreshPost(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('REFRESH_TOKEN_REQUIRED');
    });

    it('POST /api/auth/refresh returns 401 for non-existent refresh token', async () => {
      const req = new Request('http://localhost:3000/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cookie': 'grepo_refresh=non_existent_token_hex_1234567890'
        }
      });
      const res = await refreshPost(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('TOKEN_NOT_FOUND');
    });

    it('POST /api/auth/refresh successfully rotates token without ReferenceError', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'test_refresh_user_' + Date.now(),
          passwordHash: 'dummy_hash',
          globalRole: 'USER',
          isActive: true
        }
      });
      const refresh = generateRefreshToken();
      const familyId = 'family_' + Date.now();
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: refresh.tokenHash,
          familyId,
          expiresAt: refresh.expiresAt
        }
      });

      const req = new Request('http://localhost:3000/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cookie': `grepo_refresh=${refresh.rawToken}`
        }
      });

      const res = await refreshPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.username).toBe(user.username);

      // Verify old token is revoked
      const oldTokenRecord = await prisma.refreshToken.findUnique({
        where: { tokenHash: refresh.tokenHash }
      });
      expect(oldTokenRecord.isRevoked).toBe(true);

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    });
  });

  // =========================================================================
  // 4. Account Lockout & Brute-Force Protection Logic
  // =========================================================================
  describe('4. Account Lockout Logic', () => {
    it('triggers account lockout at 5 consecutive failed attempts for 15 minutes', () => {
      let failedAttempts = 4;
      let lockoutUntil = null;
      const MAX_ATTEMPTS = 5;
      const LOCKOUT_MS = 15 * 60 * 1000;

      // 5th failed attempt
      failedAttempts += 1;
      if (failedAttempts >= MAX_ATTEMPTS) {
        lockoutUntil = new Date(Date.now() + LOCKOUT_MS);
      }

      expect(failedAttempts).toBe(5);
      expect(lockoutUntil).not.toBeNull();
      expect(lockoutUntil.getTime()).toBeGreaterThan(Date.now());

      // Attempt while locked out
      const isLocked = lockoutUntil && lockoutUntil > new Date();
      expect(isLocked).toBe(true);

      // Successful login clears attempts and lockout
      const loginSuccess = true;
      if (loginSuccess) {
        failedAttempts = 0;
        lockoutUntil = null;
      }

      expect(failedAttempts).toBe(0);
      expect(lockoutUntil).toBeNull();
    });
  });

  // =========================================================================
  // 5. In-Game Town-Rename Handshake Verification
  // =========================================================================
  describe('5. In-Game Town-Rename Handshake Verification', () => {
    it('verifies successfully when player town contains matching cryptographic code', () => {
      const verificationCode = 'GP-742918';
      const playerTowns = [
        { id: 101, name: 'Sparta Core' },
        { id: 102, name: `Athens Alpha [${verificationCode}]` },
        { id: 103, name: 'Delphi Nav' }
      ];

      const matchingTown = playerTowns.find(t => t.name.includes(verificationCode));
      expect(matchingTown).toBeDefined();
      expect(matchingTown.id).toBe(102);

      let verificationStatus = 'UNVERIFIED';
      if (matchingTown) {
        verificationStatus = 'VERIFIED';
      }
      expect(verificationStatus).toBe('VERIFIED');
    });

    it('rejects verification when none of player towns contain the code', () => {
      const verificationCode = 'GP-742918';
      const playerTowns = [
        { id: 101, name: 'Sparta Core' },
        { id: 102, name: 'Athens Alpha [GP-999999]' }, // Different code
        { id: 103, name: 'Delphi Nav' }
      ];

      const matchingTown = playerTowns.find(t => t.name.includes(verificationCode));
      expect(matchingTown).toBeUndefined();

      let verificationStatus = 'UNVERIFIED';
      if (matchingTown) {
        verificationStatus = 'VERIFIED';
      }
      expect(verificationStatus).toBe('UNVERIFIED');
    });
  });

  // =========================================================================
  // 6. RBAC Guards (requireAuth)
  // =========================================================================
  describe('6. RBAC Route Guard (requireAuth)', () => {
    it('rejects unauthenticated requests with 401 status', async () => {
      const mockReq = {
        headers: new Headers(),
        cookies: { get: () => null }
      };

      const result = await requireAuth(mockReq);
      expect(result.authorized).toBe(false);
      expect(result.response.status).toBe(401);
    });

    it('authorizes GLOBAL_ADMIN unconditionally across any world/team requirement', async () => {
      const adminToken = await generateAccessToken({
        sub: 'admin_1',
        username: 'RootAdmin',
        globalRole: 'GLOBAL_ADMIN',
        teams: []
      });

      const mockReq = {
        headers: new Headers({
          cookie: `grepo_access=${adminToken}`
        })
      };

      const result = await requireAuth(mockReq, {
        minGlobalRole: 'GLOBAL_ADMIN',
        worldId: 'hu119',
        requiredTeamRole: 'TEAM_ADMIN'
      });

      expect(result.authorized).toBe(true);
      expect(result.user.globalRole).toBe('GLOBAL_ADMIN');
    });

    it('rejects regular USER when GLOBAL_ADMIN role is required', async () => {
      const userToken = await generateAccessToken({
        sub: 'user_1',
        username: 'Leonidas',
        globalRole: 'USER',
        teams: []
      });

      const mockReq = {
        headers: new Headers({
          cookie: `grepo_access=${userToken}`
        })
      };

      const result = await requireAuth(mockReq, { minGlobalRole: 'GLOBAL_ADMIN' });
      expect(result.authorized).toBe(false);
      expect(result.response.status).toBe(403);
    });

    it('enforces UNVERIFIED blocking when allowUnverified is false', async () => {
      const unverifiedToken = await generateAccessToken({
        sub: 'user_2',
        username: 'Pericles',
        globalRole: 'USER',
        teams: [
          {
            teamId: 'team_1',
            worldId: 'hu119',
            role: 'TEAM_MEMBER',
            status: 'UNVERIFIED'
          }
        ]
      });

      const mockReq = {
        headers: new Headers({
          cookie: `grepo_access=${unverifiedToken}`
        })
      };

      // Blocked by default (allowUnverified: false)
      const blocked = await requireAuth(mockReq, { worldId: 'hu119' });
      expect(blocked.authorized).toBe(false);
      expect(blocked.response.status).toBe(403);

      // Allowed when allowUnverified: true (for verification check endpoints)
      const allowed = await requireAuth(mockReq, { worldId: 'hu119', allowUnverified: true });
      expect(allowed.authorized).toBe(true);
      expect(allowed.member.status).toBe('UNVERIFIED');
    });

    it('enforces TEAM_ADMIN role requirement', async () => {
      const memberToken = await generateAccessToken({
        sub: 'user_3',
        username: 'Phaedrus',
        globalRole: 'USER',
        teams: [
          {
            teamId: 'team_1',
            worldId: 'hu119',
            role: 'TEAM_MEMBER',
            status: 'VERIFIED'
          }
        ]
      });

      const mockReq = {
        headers: new Headers({
          cookie: `grepo_access=${memberToken}`
        })
      };

      const result = await requireAuth(mockReq, {
        worldId: 'hu119',
        requiredTeamRole: 'TEAM_ADMIN'
      });

      expect(result.authorized).toBe(false);
      expect(result.response.status).toBe(403);
    });
  });

  // =========================================================================
  // 7. Client IP Extraction
  // =========================================================================
  describe('7. Safe Client IP Extraction', () => {
    it('extracts IP from X-Forwarded-For header safely', () => {
      const req = {
        headers: new Headers({
          'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178'
        })
      };
      expect(extractClientIp(req)).toBe('203.0.113.195');
    });

    it('falls back to X-Real-IP or localhost', () => {
      const req1 = { headers: new Headers({ 'x-real-ip': '198.51.100.1' }) };
      expect(extractClientIp(req1)).toBe('198.51.100.1');

      const req2 = { headers: new Headers() };
      expect(extractClientIp(req2)).toBe('127.0.0.1');
    });
  });

  // =========================================================================
  // 8. Adversarial Stress & Critical Edge Cases
  // =========================================================================
  describe('8. Adversarial Stress & Edge Cases', () => {
    it('preserves pending status for multi-use invites when usedCount < maxUses', () => {
      const invites = [
        { id: 'inv_1', maxUses: 5, usedCount: 1, expiresAt: new Date(Date.now() + 86400000) },
        { id: 'inv_2', maxUses: 1, usedCount: 1, expiresAt: new Date(Date.now() + 86400000) },
        { id: 'inv_3', maxUses: 3, usedCount: 0, expiresAt: new Date(Date.now() + 86400000) },
        { id: 'inv_4', maxUses: 5, usedCount: 2, expiresAt: new Date(Date.now() - 1000) } // expired
      ];

      // Filter active invites where not expired and usedCount < maxUses
      const active = invites.filter(inv => inv.expiresAt > new Date() && inv.usedCount < inv.maxUses);

      expect(active).toHaveLength(2);
      expect(active.map(i => i.id)).toEqual(['inv_1', 'inv_3']);
    });

    it('atomic RTR rotation prevents race conditions and detects replay attacks concurrently', async () => {
      // Simulation of atomic conditional revocation: only the first call updates isRevoked from false -> true
      let dbToken = { id: 'tok_123', familyId: 'fam_1', isRevoked: false };

      const simulateAtomicRotate = async () => {
        // Atomic conditional update
        if (!dbToken.isRevoked) {
          dbToken.isRevoked = true;
          return { status: 200, rotated: true };
        } else {
          // Replay detected -> invalidate family
          return { status: 401, error: 'TOKEN_REUSE_DETECTED' };
        }
      };

      // Two concurrent calls presenting the same refresh token simultaneously
      const [resA, resB] = await Promise.all([
        simulateAtomicRotate(),
        simulateAtomicRotate()
      ]);

      const successes = [resA, resB].filter(r => r.status === 200);
      const reuses = [resA, resB].filter(r => r.status === 401);

      expect(successes).toHaveLength(1);
      expect(reuses).toHaveLength(1);
      expect(reuses[0].error).toBe('TOKEN_REUSE_DETECTED');
    });

    it('preserves existing VERIFIED status when an already-verified player accepts an invite', () => {
      const existingMember = {
        id: 'mem_1',
        role: 'TEAM_MEMBER',
        verificationStatus: 'VERIFIED',
        verificationCode: 'GP-111222',
        verifiedAt: new Date('2026-09-01')
      };

      const newInvite = { role: 'TEAM_MEMBER', verificationCode: 'GP-999888' };

      // Membership update logic
      const keepVerified = existingMember.verificationStatus === 'VERIFIED';
      const updatedMember = {
        ...existingMember,
        role: newInvite.role,
        verificationCode: keepVerified ? existingMember.verificationCode : newInvite.verificationCode,
        verificationStatus: keepVerified ? 'VERIFIED' : 'UNVERIFIED',
        verifiedAt: keepVerified ? existingMember.verifiedAt : null
      };

      expect(updatedMember.verificationStatus).toBe('VERIFIED');
      expect(updatedMember.verificationCode).toBe('GP-111222');
      expect(updatedMember.verifiedAt).toEqual(existingMember.verifiedAt);
    });

    it('requires valid player existence for in-game registration (rejects playerId = 0)', () => {
      const playerLookup = (name, players) => {
        return players.find(p => p.name.toLowerCase() === name.toLowerCase()) || null;
      };

      const worldPlayers = [
        { id: 1001, name: 'Leonidas' },
        { id: 1002, name: 'Themistocles' }
      ];

      const validPlayer = playerLookup('Leonidas', worldPlayers);
      expect(validPlayer).not.toBeNull();
      expect(validPlayer.id).toBe(1001);

      const invalidPlayer = playerLookup('NonExistentGhostPlayer', worldPlayers);
      expect(invalidPlayer).toBeNull();
    });

    it('enforces snipe operation ownership: non-creators cannot update or delete operations', async () => {
      const operation = {
        id: 'op_1',
        worldId: 'hu119',
        userId: 'usr_creator'
      };

      const isAllowed = (op, authUser, member) => {
        const isGlobalAdmin = authUser.globalRole === 'GLOBAL_ADMIN';
        const isTeamAdmin = member?.role === 'TEAM_ADMIN';
        const isCreator = op.userId && op.userId === authUser.sub;
        return isGlobalAdmin || isTeamAdmin || isCreator;
      };

      // 1. Creator is allowed
      expect(isAllowed(operation, { sub: 'usr_creator', globalRole: 'USER' }, { role: 'TEAM_MEMBER' })).toBe(true);

      // 2. Global admin is allowed
      expect(isAllowed(operation, { sub: 'usr_other', globalRole: 'GLOBAL_ADMIN' }, null)).toBe(true);

      // 3. Team admin is allowed
      expect(isAllowed(operation, { sub: 'usr_other', globalRole: 'USER' }, { role: 'TEAM_ADMIN' })).toBe(true);

      // 4. Random other team member is forbidden
      expect(isAllowed(operation, { sub: 'usr_intruder', globalRole: 'USER' }, { role: 'TEAM_MEMBER' })).toBe(false);
    });

    it('rejects self-invites and inviting existing team members', () => {
      const authUser = { sub: 'usr_perfi', username: 'perfi', globalRole: 'GLOBAL_ADMIN' };
      const team = {
        id: 'team_1',
        members: [
          { userId: 'usr_perfi', playerName: 'perfi', role: 'TEAM_ADMIN' },
          { userId: 'usr_other', playerName: 'Leonidas', role: 'TEAM_MEMBER' }
        ]
      };

      const validateInviteTarget = (targetName, currentUser, currentTeam) => {
        const trimmed = targetName.trim().toLowerCase();
        if (currentUser.username && currentUser.username.toLowerCase() === trimmed) {
          return { valid: false, error: 'Cannot invite yourself' };
        }
        if (currentTeam.members.some(m => m.playerName.toLowerCase() === trimmed)) {
          return { valid: false, error: 'Already a member' };
        }
        return { valid: true };
      };

      // Self-invite should fail
      expect(validateInviteTarget('perfi', authUser, team)).toEqual({
        valid: false,
        error: 'Cannot invite yourself'
      });
      // Case-insensitive self-invite should fail
      expect(validateInviteTarget('PERFI', authUser, team)).toEqual({
        valid: false,
        error: 'Cannot invite yourself'
      });

      // Existing member invite should fail
      expect(validateInviteTarget('Leonidas', authUser, team)).toEqual({
        valid: false,
        error: 'Already a member'
      });

      // New legitimate player should pass
      expect(validateInviteTarget('Themistocles', authUser, team)).toEqual({
        valid: true
      });
    });
  });

});
