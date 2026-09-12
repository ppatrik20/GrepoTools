import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PERMISSIONS,
  ALL_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  DEFAULT_ROLE_TEMPLATES,
  buildTeamMembershipPayload
} from '@/lib/auth/rbac';
import {
  generateAccessToken,
  verifyAccessToken,
  hasPermission
} from '@/lib/auth/tokens';
import { GET as getMembers } from '@/app/api/teams/[id]/members/route';
import { PUT as updateMember, DELETE as removeMember } from '@/app/api/teams/[id]/members/[memberId]/route';
import { GET as getRoles, POST as createRole } from '@/app/api/teams/[id]/roles/route';
import { PUT as updateRole, DELETE as deleteRole } from '@/app/api/teams/[id]/roles/[roleId]/route';
import { DELETE as revokeInvite } from '@/app/api/teams/[id]/invites/[inviteId]/route';
import { POST as createInvite } from '@/app/api/teams/[id]/invites/route';
import { prisma } from '@/lib/prisma';

// Mock prisma for route testing
vi.mock('@/lib/prisma', () => ({
  prisma: {
    team: {
      findUnique: vi.fn(),
      findFirst: vi.fn()
    },
    teamMember: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn()
    },
    teamCustomRole: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    teamMemberRoleAssignment: {
      deleteMany: vi.fn(),
      createMany: vi.fn()
    },
    invite: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn()
    },
    player: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    },
    auditLog: {
      create: vi.fn()
    },
    $transaction: vi.fn((cb) => typeof cb === 'function' ? cb(prisma) : Promise.all(cb))
  }
}));

// Mock requireAuth and logAuditEvent for isolated route handler unit verification
vi.mock('@/lib/auth/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue({})
}));

describe('Capability-Based Custom Roles & RBAC Suite', () => {

  // =========================================================================
  // 1. Standard Capability Keys & Architecture Definitions
  // =========================================================================
  describe('1. Standard Capability Keys & Constants', () => {
    it('defines all 9 required capability keys exactly', () => {
      const expectedKeys = [
        'TARGETS_MANAGE',
        'DEFENSE_COORDINATE',
        'COALITIONS_MANAGE',
        'PINS_MANAGE',
        'INVITES_MANAGE',
        'MEMBERS_MANAGE',
        'ROLES_MANAGE',
        'OPERATIONS_COORDINATE',
        'GHOST_RADAR_RESERVE'
      ];

      for (const key of expectedKeys) {
        expect(PERMISSIONS[key]).toBe(key);
      }
      expect(Object.keys(PERMISSIONS)).toHaveLength(9);
    });

    it('contains all capability keys in ALL_PERMISSIONS array', () => {
      expect(ALL_PERMISSIONS).toHaveLength(9);
      for (const key of Object.values(PERMISSIONS)) {
        expect(ALL_PERMISSIONS).toContain(key);
      }
    });

    it('has descriptive definitions for each capability', () => {
      expect(PERMISSION_DEFINITIONS).toHaveLength(9);
      for (const def of PERMISSION_DEFINITIONS) {
        expect(def.key).toBeDefined();
        expect(def.label).toBeTypeOf('string');
        expect(def.category).toBeTypeOf('string');
        expect(def.description).toBeTypeOf('string');
        expect(ALL_PERMISSIONS).toContain(def.key);
      }
    });

    it('defines all 4 default tactical role templates with appropriate permissions', () => {
      expect(DEFAULT_ROLE_TEMPLATES).toHaveLength(4);
      const names = DEFAULT_ROLE_TEMPLATES.map(t => t.name);
      expect(names).toContain('Attack Coordinator');
      expect(names).toContain('Defense Coordinator');
      expect(names).toContain('Intel Officer');
      expect(names).toContain('Diplomat');

      const attackCoord = DEFAULT_ROLE_TEMPLATES.find(t => t.name === 'Attack Coordinator');
      expect(attackCoord.permissions).toContain(PERMISSIONS.TARGETS_MANAGE);
      expect(attackCoord.permissions).toContain(PERMISSIONS.OPERATIONS_COORDINATE);
      expect(attackCoord.permissions).toContain(PERMISSIONS.PINS_MANAGE);
      expect(attackCoord.color).toMatch(/^#[0-9A-Fa-f]{6}$/);

      const defCoord = DEFAULT_ROLE_TEMPLATES.find(t => t.name === 'Defense Coordinator');
      expect(defCoord.permissions).toContain(PERMISSIONS.DEFENSE_COORDINATE);
      expect(defCoord.permissions).toContain(PERMISSIONS.OPERATIONS_COORDINATE);

      const intelOfficer = DEFAULT_ROLE_TEMPLATES.find(t => t.name === 'Intel Officer');
      expect(intelOfficer.permissions).toContain(PERMISSIONS.GHOST_RADAR_RESERVE);

      const diplomat = DEFAULT_ROLE_TEMPLATES.find(t => t.name === 'Diplomat');
      expect(diplomat.permissions).toContain(PERMISSIONS.COALITIONS_MANAGE);
      expect(diplomat.permissions).toContain(PERMISSIONS.INVITES_MANAGE);
    });
  });

  // =========================================================================
  // 2. hasPermission() Core Evaluation Engine
  // =========================================================================
  describe('2. hasPermission() Core Evaluation', () => {
    const globalAdminAuth = {
      user: {
        sub: 'usr-admin-1',
        username: 'Overlord',
        globalRole: 'GLOBAL_ADMIN',
        teams: []
      }
    };

    const teamAdminAuth = {
      user: {
        sub: 'usr-spartan-1',
        username: 'Leonidas',
        globalRole: 'USER',
        teams: [
          {
            teamId: 'team-alpha',
            role: 'TEAM_ADMIN',
            permissions: ALL_PERMISSIONS
          }
        ]
      }
    };

    const memberWithAttackRole = {
      user: {
        sub: 'usr-attacker-1',
        username: 'Achilles',
        globalRole: 'USER',
        teams: [
          {
            teamId: 'team-alpha',
            role: 'TEAM_MEMBER',
            permissions: [PERMISSIONS.TARGETS_MANAGE, PERMISSIONS.OPERATIONS_COORDINATE],
            customRoles: [
              {
                id: 'role-atk',
                name: 'Attack Coordinator',
                permissions: [PERMISSIONS.TARGETS_MANAGE, PERMISSIONS.OPERATIONS_COORDINATE]
              }
            ]
          }
        ]
      }
    };

    const regularMemberAuth = {
      user: {
        sub: 'usr-regular-1',
        username: 'Pekka',
        globalRole: 'USER',
        teams: [
          {
            teamId: 'team-alpha',
            role: 'TEAM_MEMBER',
            permissions: [],
            customRoles: []
          }
        ]
      }
    };

    it('returns true for GLOBAL_ADMIN regardless of teamId or required permission', () => {
      expect(hasPermission(globalAdminAuth, 'team-alpha', PERMISSIONS.TARGETS_MANAGE)).toBe(true);
      expect(hasPermission(globalAdminAuth, 'team-beta', PERMISSIONS.ROLES_MANAGE)).toBe(true);
      expect(hasPermission(globalAdminAuth, 'non-existent-team', 'ANY_ARBITRARY_PERMISSION')).toBe(true);
    });

    it('returns true for TEAM_ADMIN inheriting full administrative capabilities', () => {
      expect(hasPermission(teamAdminAuth, 'team-alpha', PERMISSIONS.TARGETS_MANAGE)).toBe(true);
      expect(hasPermission(teamAdminAuth, 'team-alpha', PERMISSIONS.MEMBERS_MANAGE)).toBe(true);
      expect(hasPermission(teamAdminAuth, 'team-alpha', PERMISSIONS.ROLES_MANAGE)).toBe(true);
      expect(hasPermission(teamAdminAuth, 'team-alpha', PERMISSIONS.GHOST_RADAR_RESERVE)).toBe(true);
    });

    it('returns false when TEAM_ADMIN checks an unrelated team they do not manage', () => {
      expect(hasPermission(teamAdminAuth, 'team-other', PERMISSIONS.TARGETS_MANAGE)).toBe(false);
    });

    it('returns true when a custom role holds the specific requested capability', () => {
      expect(hasPermission(memberWithAttackRole, 'team-alpha', PERMISSIONS.TARGETS_MANAGE)).toBe(true);
      expect(hasPermission(memberWithAttackRole, 'team-alpha', PERMISSIONS.OPERATIONS_COORDINATE)).toBe(true);
    });

    it('returns false when a custom role lacks the requested capability', () => {
      expect(hasPermission(memberWithAttackRole, 'team-alpha', PERMISSIONS.ROLES_MANAGE)).toBe(false);
      expect(hasPermission(memberWithAttackRole, 'team-alpha', PERMISSIONS.DEFENSE_COORDINATE)).toBe(false);
      expect(hasPermission(memberWithAttackRole, 'team-alpha', PERMISSIONS.MEMBERS_MANAGE)).toBe(false);
    });

    it('returns false for regular member with no roles assigned', () => {
      expect(hasPermission(regularMemberAuth, 'team-alpha', PERMISSIONS.TARGETS_MANAGE)).toBe(false);
      expect(hasPermission(regularMemberAuth, 'team-alpha', PERMISSIONS.INVITES_MANAGE)).toBe(false);
    });

    it('returns true if custom role has wildcard "*" permission', () => {
      const wildcardAuth = {
        user: {
          sub: 'usr-wildcard',
          globalRole: 'USER',
          teams: [
            {
              teamId: 'team-alpha',
              role: 'TEAM_MEMBER',
              permissions: ['*'],
              customRoles: [{ id: 'role-all', permissions: ['*'] }]
            }
          ]
        }
      };

      expect(hasPermission(wildcardAuth, 'team-alpha', PERMISSIONS.TARGETS_MANAGE)).toBe(true);
      expect(hasPermission(wildcardAuth, 'team-alpha', PERMISSIONS.ROLES_MANAGE)).toBe(true);
    });

    it('handles direct user object passing and empty/null values gracefully', () => {
      expect(hasPermission(null, 'team-alpha', PERMISSIONS.TARGETS_MANAGE)).toBe(false);
      expect(hasPermission(undefined, 'team-alpha', PERMISSIONS.TARGETS_MANAGE)).toBe(false);
      expect(hasPermission({}, 'team-alpha', PERMISSIONS.TARGETS_MANAGE)).toBe(false);

      // User object passed directly (not nested under .user)
      const directUser = memberWithAttackRole.user;
      expect(hasPermission(directUser, 'team-alpha', PERMISSIONS.TARGETS_MANAGE)).toBe(true);
      expect(hasPermission(directUser, 'team-alpha', PERMISSIONS.ROLES_MANAGE)).toBe(false);
    });
  });

  // =========================================================================
  // 3. JWT Access Token Payload Capability Encoding
  // =========================================================================
  describe('3. JWT Access Token Capability Encoding (Zero-DB Check)', () => {
    it('encodes capabilities into JWT access token payload and validates without DB hit', async () => {
      const tokenPayload = {
        sub: 'usr-coord-123',
        username: 'Patroclus',
        globalRole: 'USER',
        teams: [
          {
            teamId: 'team-sparta',
            teamName: 'Sparta Core',
            worldId: 'hu119',
            role: 'TEAM_MEMBER',
            playerId: 9988,
            playerName: 'Patroclus',
            status: 'VERIFIED',
            permissions: [PERMISSIONS.DEFENSE_COORDINATE, PERMISSIONS.PINS_MANAGE]
          }
        ]
      };

      const rawToken = await generateAccessToken(tokenPayload);
      expect(rawToken).toBeTypeOf('string');

      const verified = await verifyAccessToken(rawToken);
      expect(verified).not.toBeNull();
      expect(verified.permissions).toBeDefined();
      expect(Array.isArray(verified.permissions)).toBe(true);
      expect(verified.permissions).toContain(PERMISSIONS.DEFENSE_COORDINATE);
      expect(verified.permissions).toContain(PERMISSIONS.PINS_MANAGE);

      // Fast zero-DB authorization verification using decoded token
      expect(hasPermission({ user: verified }, 'team-sparta', PERMISSIONS.DEFENSE_COORDINATE)).toBe(true);
      expect(hasPermission({ user: verified }, 'team-sparta', PERMISSIONS.TARGETS_MANAGE)).toBe(false);
    });

    it('automatically grants wildcard to GLOBAL_ADMIN in JWT payload', async () => {
      const adminPayload = {
        sub: 'usr-admin-root',
        username: 'Zeus',
        globalRole: 'GLOBAL_ADMIN',
        teams: []
      };

      const token = await generateAccessToken(adminPayload);
      const verified = await verifyAccessToken(token);

      expect(verified.permissions).toContain('*');
      for (const p of ALL_PERMISSIONS) {
        expect(verified.permissions).toContain(p);
      }
    });

    it('automatically grants wildcard to TEAM_ADMIN in JWT payload', async () => {
      const teamAdminPayload = {
        sub: 'usr-team-lead',
        username: 'Agamemnon',
        globalRole: 'USER',
        teams: [
          {
            teamId: 'team-mycenae',
            role: 'TEAM_ADMIN',
            permissions: []
          }
        ]
      };

      const token = await generateAccessToken(teamAdminPayload);
      const verified = await verifyAccessToken(token);

      expect(verified.permissions).toContain('*');
      expect(hasPermission({ user: verified }, 'team-mycenae', PERMISSIONS.MEMBERS_MANAGE)).toBe(true);
    });
  });

  // =========================================================================
  // 4. buildTeamMembershipPayload Helper
  // =========================================================================
  describe('4. buildTeamMembershipPayload', () => {
    it('aggregates permissions from multiple assigned custom roles', () => {
      const dbMemberships = [
        {
          id: 'mem-1',
          teamId: 'team-1',
          worldId: 'hu119',
          role: 'TEAM_MEMBER',
          playerId: 1234,
          playerName: 'Odysseus',
          verificationStatus: 'VERIFIED',
          team: { name: 'Ithaca Fleet' },
          customRoles: [
            {
              id: 'assign-1',
              customRole: {
                id: 'role-intel',
                name: 'Intel Officer',
                color: '#8B5CF6',
                icon: 'radar',
                priority: 70,
                permissions: [PERMISSIONS.GHOST_RADAR_RESERVE, PERMISSIONS.PINS_MANAGE]
              }
            },
            {
              id: 'assign-2',
              customRole: {
                id: 'role-diplo',
                name: 'Diplomat',
                color: '#10B981',
                icon: 'handshake',
                priority: 60,
                permissions: [PERMISSIONS.COALITIONS_MANAGE, PERMISSIONS.INVITES_MANAGE]
              }
            }
          ]
        }
      ];

      const result = buildTeamMembershipPayload(dbMemberships);
      expect(result).toHaveLength(1);
      const m = result[0];

      expect(m.membershipId).toBe('mem-1');
      expect(m.teamName).toBe('Ithaca Fleet');
      expect(m.customRoles).toHaveLength(2);

      // Aggregated deduplicated permissions
      expect(m.permissions).toContain(PERMISSIONS.GHOST_RADAR_RESERVE);
      expect(m.permissions).toContain(PERMISSIONS.PINS_MANAGE);
      expect(m.permissions).toContain(PERMISSIONS.COALITIONS_MANAGE);
      expect(m.permissions).toContain(PERMISSIONS.INVITES_MANAGE);
      expect(m.permissions).not.toContain(PERMISSIONS.ROLES_MANAGE);
    });

    it('gives full administrative capabilities and wildcard to TEAM_ADMIN', () => {
      const adminMembership = [
        {
          id: 'mem-admin',
          teamId: 'team-1',
          worldId: 'hu119',
          role: 'TEAM_ADMIN',
          playerId: 1111,
          playerName: 'KingMenelaus',
          verificationStatus: 'VERIFIED',
          team: { name: 'Sparta' },
          customRoles: []
        }
      ];

      const result = buildTeamMembershipPayload(adminMembership);
      expect(result[0].permissions).toContain('*');
      for (const p of ALL_PERMISSIONS) {
        expect(result[0].permissions).toContain(p);
      }
    });
  });

  // =========================================================================
  // 5. API Route Handlers Integration & Guards
  // =========================================================================
  describe('5. API Route Handlers & Guards', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    // --- GET /api/teams/[id]/members ---
    it('GET /api/teams/[id]/members returns enriched members with Grepolis stats', async () => {
      const adminToken = await generateAccessToken({
        sub: 'usr-admin-1',
        username: 'GlobalAdmin',
        globalRole: 'GLOBAL_ADMIN',
        teams: []
      });

      const mockTeam = {
        id: 'team-corinth',
        worldId: 'hu119',
        name: 'Corinthian Guard',
        members: [
          {
            id: 'mem-101',
            userId: 'usr-1',
            playerId: 5555,
            playerName: 'Bellerophon',
            role: 'TEAM_MEMBER',
            verificationStatus: 'VERIFIED',
            verificationCode: 'GP-1111',
            verifiedAt: new Date(),
            createdAt: new Date(),
            user: { id: 'usr-1', username: 'Bellerophon', globalRole: 'USER' },
            customRoles: [
              {
                id: 'asgn-1',
                customRole: {
                  id: 'r-1',
                  name: 'Air Recon',
                  color: '#06B6D4',
                  icon: 'radar',
                  priority: 50,
                  permissions: [PERMISSIONS.PINS_MANAGE]
                }
              }
            ]
          }
        ]
      };

      const mockPlayers = [
        {
          id: 5555,
          points: 125000,
          towns: 14,
          rank: 22,
          allianceId: 77,
          alliance: { id: 77, name: 'Pegasus League' }
        }
      ];

      prisma.team.findUnique.mockResolvedValue(mockTeam);
      prisma.player.findMany.mockResolvedValue(mockPlayers);

      const req = new Request('http://localhost:3000/api/teams/team-corinth/members', {
        headers: { authorization: `Bearer ${adminToken}` }
      });

      const res = await getMembers(req, { params: Promise.resolve({ id: 'team-corinth' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.members).toHaveLength(1);
      const member = json.members[0];
      expect(member.playerName).toBe('Bellerophon');
      expect(member.points).toBe(125000);
      expect(member.townsCount).toBe(14);
      expect(member.rank).toBe(22);
      expect(member.allianceName).toBe('Pegasus League');
      expect(member.customRoles).toHaveLength(1);
      expect(member.customRoles[0].name).toBe('Air Recon');
    });

    // --- Sole Admin Guard on Demotion / Kick ---
    it('PUT /api/teams/[id]/members/[memberId] blocks demoting the sole Team Administrator', async () => {
      const adminToken = await generateAccessToken({
        sub: 'usr-admin',
        username: 'SoleCommander',
        globalRole: 'GLOBAL_ADMIN',
        teams: [{ teamId: 'team-solo', role: 'TEAM_ADMIN', permissions: ALL_PERMISSIONS }]
      });

      const mockTeam = {
        id: 'team-solo',
        worldId: 'hu119',
        members: [
          { id: 'mem-admin-sole', userId: 'usr-admin', role: 'TEAM_ADMIN', playerName: 'SoleCommander' }
        ]
      };

      prisma.team.findUnique.mockResolvedValue(mockTeam);
      prisma.teamMember.findFirst.mockResolvedValue(mockTeam.members[0]);
      prisma.teamMember.count.mockResolvedValue(0); // 0 other admins

      const req = new Request('http://localhost:3000/api/teams/team-solo/members/mem-admin-sole', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ role: 'TEAM_MEMBER' })
      });

      const res = await updateMember(req, {
        params: Promise.resolve({ id: 'team-solo', memberId: 'mem-admin-sole' })
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/sole Team Administrator/i);
    });

    it('DELETE /api/teams/[id]/members/[memberId] blocks kicking the sole Team Administrator', async () => {
      const adminToken = await generateAccessToken({
        sub: 'usr-admin',
        username: 'SoleCommander',
        globalRole: 'GLOBAL_ADMIN',
        teams: [{ teamId: 'team-solo', role: 'TEAM_ADMIN', permissions: ALL_PERMISSIONS }]
      });

      const mockTeam = {
        id: 'team-solo',
        worldId: 'hu119',
        members: [
          { id: 'mem-admin-sole', userId: 'usr-admin', role: 'TEAM_ADMIN', playerName: 'SoleCommander' }
        ]
      };

      prisma.team.findUnique.mockResolvedValue(mockTeam);
      prisma.teamMember.findFirst.mockResolvedValue(mockTeam.members[0]);
      prisma.teamMember.count.mockResolvedValue(0); // 0 other admins

      const req = new Request('http://localhost:3000/api/teams/team-solo/members/mem-admin-sole', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${adminToken}` }
      });

      const res = await removeMember(req, {
        params: Promise.resolve({ id: 'team-solo', memberId: 'mem-admin-sole' })
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/sole Team Administrator/i);
    });

    // --- Custom Roles Seed & CRUD ---
    it('GET /api/teams/[id]/roles seeds initial templates when team has no roles', async () => {
      const adminToken = await generateAccessToken({
        sub: 'usr-test',
        username: 'Tester',
        globalRole: 'GLOBAL_ADMIN',
        teams: [{ teamId: 'team-new', role: 'TEAM_ADMIN', permissions: ALL_PERMISSIONS }]
      });

      const mockTeam = {
        id: 'team-new',
        worldId: 'hu119',
        members: [{ userId: 'usr-test' }]
      };

      prisma.team.findUnique.mockResolvedValue(mockTeam);
      // First call returns 0 roles, second call returns seeded roles
      prisma.teamCustomRole.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'r1', name: 'Attack Coordinator', permissions: [PERMISSIONS.TARGETS_MANAGE], _count: { assignments: 0 } },
          { id: 'r2', name: 'Defense Coordinator', permissions: [PERMISSIONS.DEFENSE_COORDINATE], _count: { assignments: 0 } }
        ]);

      prisma.teamCustomRole.create.mockResolvedValue({});

      const req = new Request('http://localhost:3000/api/teams/team-new/roles', {
        headers: { authorization: `Bearer ${adminToken}` }
      });

      const res = await getRoles(req, { params: Promise.resolve({ id: 'team-new' }) });
      expect(res.status).toBe(200);

      // Verify seeding was executed
      expect(prisma.teamCustomRole.create).toHaveBeenCalled();
      const json = await res.json();
      expect(json.roles).toHaveLength(2);
    });

    it('POST /api/teams/[id]/roles prevents duplicate role names within the same team', async () => {
      const adminToken = await generateAccessToken({
        sub: 'usr-test',
        username: 'Tester',
        globalRole: 'GLOBAL_ADMIN',
        teams: [{ teamId: 'team-dupe', role: 'TEAM_ADMIN', permissions: ALL_PERMISSIONS }]
      });

      const mockTeam = {
        id: 'team-dupe',
        worldId: 'hu119',
        members: [{ userId: 'usr-test', role: 'TEAM_ADMIN' }]
      };

      prisma.team.findUnique.mockResolvedValue(mockTeam);
      prisma.teamCustomRole.findFirst.mockResolvedValue({
        id: 'r-existing',
        name: 'Strike Lead'
      });

      const req = new Request('http://localhost:3000/api/teams/team-dupe/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          name: 'Strike Lead',
          permissions: [PERMISSIONS.TARGETS_MANAGE]
        })
      });

      const res = await createRole(req, { params: Promise.resolve({ id: 'team-dupe' }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toMatch(/already exists/i);
    });

    it('DELETE /api/teams/[id]/invites/[inviteId] revokes invite successfully', async () => {
      const adminToken = await generateAccessToken({
        sub: 'usr-admin',
        username: 'Tester',
        globalRole: 'GLOBAL_ADMIN',
        teams: [{ teamId: 'team-inv', role: 'TEAM_ADMIN', permissions: ALL_PERMISSIONS }]
      });

      const mockTeam = {
        id: 'team-inv',
        worldId: 'hu119',
        members: [{ userId: 'usr-admin', role: 'TEAM_ADMIN' }]
      };

      const mockInvite = {
        id: 'inv-123',
        teamId: 'team-inv',
        targetPlayerName: 'TargetLeonidas'
      };

      prisma.team.findUnique.mockResolvedValue(mockTeam);
      prisma.invite.findFirst.mockResolvedValue(mockInvite);
      prisma.invite.delete.mockResolvedValue(mockInvite);

      const req = new Request('http://localhost:3000/api/teams/team-inv/invites/inv-123', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${adminToken}` }
      });

      const res = await revokeInvite(req, {
        params: Promise.resolve({ id: 'team-inv', inviteId: 'inv-123' })
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(prisma.invite.delete).toHaveBeenCalledWith({ where: { id: 'inv-123' } });
    });

    // --- Role Edit & Delete ---
    it('PUT /api/teams/[id]/roles/[roleId] successfully updates role properties', async () => {
      const adminToken = await generateAccessToken({
        sub: 'usr-admin',
        username: 'Lead',
        globalRole: 'GLOBAL_ADMIN',
        teams: [{ teamId: 'team-roles', role: 'TEAM_ADMIN', permissions: ALL_PERMISSIONS }]
      });

      const mockTeam = {
        id: 'team-roles',
        worldId: 'hu119',
        members: [{ userId: 'usr-admin', role: 'TEAM_ADMIN' }]
      };

      const existingRole = {
        id: 'role-edit-1',
        teamId: 'team-roles',
        name: 'Old Role Name',
        color: '#3B82F6',
        priority: 10,
        permissions: [PERMISSIONS.PINS_MANAGE]
      };

      prisma.team.findUnique.mockResolvedValue(mockTeam);
      prisma.teamCustomRole.findFirst
        .mockResolvedValueOnce(existingRole)
        .mockResolvedValueOnce(null);
      prisma.teamCustomRole.update.mockResolvedValue({
        ...existingRole,
        name: 'New Role Name',
        color: '#EF4444',
        _count: { assignments: 3 }
      });

      const req = new Request('http://localhost:3000/api/teams/team-roles/roles/role-edit-1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          name: 'New Role Name',
          color: '#EF4444',
          priority: 80
        })
      });

      const res = await updateRole(req, {
        params: Promise.resolve({ id: 'team-roles', roleId: 'role-edit-1' })
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.role.name).toBe('New Role Name');
      expect(json.role.color).toBe('#EF4444');
    });

    it('DELETE /api/teams/[id]/roles/[roleId] successfully deletes role', async () => {
      const adminToken = await generateAccessToken({
        sub: 'usr-admin',
        username: 'Lead',
        globalRole: 'GLOBAL_ADMIN',
        teams: [{ teamId: 'team-roles', role: 'TEAM_ADMIN', permissions: ALL_PERMISSIONS }]
      });

      const mockTeam = {
        id: 'team-roles',
        worldId: 'hu119',
        members: [{ userId: 'usr-admin', role: 'TEAM_ADMIN' }]
      };

      const existingRole = {
        id: 'role-del-1',
        teamId: 'team-roles',
        name: 'Obsolete Role'
      };

      prisma.team.findUnique.mockResolvedValue(mockTeam);
      prisma.teamCustomRole.findFirst.mockResolvedValue(existingRole);
      prisma.teamCustomRole.delete.mockResolvedValue(existingRole);

      const req = new Request('http://localhost:3000/api/teams/team-roles/roles/role-del-1', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${adminToken}` }
      });

      const res = await deleteRole(req, {
        params: Promise.resolve({ id: 'team-roles', roleId: 'role-del-1' })
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toMatch(/deleted successfully/i);
    });

    // --- Multi-Tenant Isolation ---
    it('strictly isolates capabilities across different teams for the same user', async () => {
      const multiTeamUser = {
        sub: 'usr-multi-1',
        username: 'Mercenary',
        globalRole: 'USER',
        teams: [
          {
            teamId: 'team-sparta',
            role: 'TEAM_MEMBER',
            permissions: [PERMISSIONS.TARGETS_MANAGE, PERMISSIONS.OPERATIONS_COORDINATE]
          },
          {
            teamId: 'team-athens',
            role: 'TEAM_MEMBER',
            permissions: [PERMISSIONS.DEFENSE_COORDINATE]
          }
        ]
      };

      // On team-sparta: has TARGETS_MANAGE and OPERATIONS_COORDINATE, lacks DEFENSE_COORDINATE
      expect(hasPermission(multiTeamUser, 'team-sparta', PERMISSIONS.TARGETS_MANAGE)).toBe(true);
      expect(hasPermission(multiTeamUser, 'team-sparta', PERMISSIONS.OPERATIONS_COORDINATE)).toBe(true);
      expect(hasPermission(multiTeamUser, 'team-sparta', PERMISSIONS.DEFENSE_COORDINATE)).toBe(false);

      // On team-athens: has DEFENSE_COORDINATE, lacks TARGETS_MANAGE and OPERATIONS_COORDINATE
      expect(hasPermission(multiTeamUser, 'team-athens', PERMISSIONS.DEFENSE_COORDINATE)).toBe(true);
      expect(hasPermission(multiTeamUser, 'team-athens', PERMISSIONS.TARGETS_MANAGE)).toBe(false);
      expect(hasPermission(multiTeamUser, 'team-athens', PERMISSIONS.OPERATIONS_COORDINATE)).toBe(false);
    });

    // --- Demoting admin when multiple admins exist ---
    it('PUT /api/teams/[id]/members/[memberId] allows demoting when another admin is present', async () => {
      const adminToken = await generateAccessToken({
        sub: 'usr-admin-1',
        username: 'FirstCommander',
        globalRole: 'USER',
        teams: [{ teamId: 'team-multi-adm', role: 'TEAM_ADMIN', permissions: ALL_PERMISSIONS }]
      });

      const mockTeam = {
        id: 'team-multi-adm',
        worldId: 'hu119',
        members: [
          { id: 'mem-admin-1', userId: 'usr-admin-1', role: 'TEAM_ADMIN', playerName: 'FirstCommander' },
          { id: 'mem-admin-2', userId: 'usr-admin-2', role: 'TEAM_ADMIN', playerName: 'SecondCommander' }
        ]
      };

      prisma.team.findUnique.mockResolvedValue(mockTeam);
      prisma.teamMember.findFirst.mockResolvedValue(mockTeam.members[1]);
      prisma.teamMember.count.mockResolvedValue(1); // 1 other admin exists!
      prisma.teamMember.update.mockResolvedValue({ ...mockTeam.members[1], role: 'TEAM_MEMBER' });
      prisma.teamMember.findUnique.mockResolvedValue({ ...mockTeam.members[1], role: 'TEAM_MEMBER', customRoles: [] });

      const req = new Request('http://localhost:3000/api/teams/team-multi-adm/members/mem-admin-2', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ role: 'TEAM_MEMBER' })
      });

      const res = await updateMember(req, {
        params: Promise.resolve({ id: 'team-multi-adm', memberId: 'mem-admin-2' })
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    // --- Strict Multi-Tenant Zero-DB Token Isolation ---
    it('strictly prevents cross-team privilege escalation when using real decoded JWT tokens', async () => {
      // User is TEAM_ADMIN in Sparta, which gives them '*' in JWT top-level permissions.
      // But they are NOT a member of Athens.
      const tokenPayload = {
        sub: 'usr-spartan-leader',
        username: 'Leonidas',
        globalRole: 'USER',
        teams: [
          {
            teamId: 'team-sparta',
            role: 'TEAM_ADMIN',
            permissions: ALL_PERMISSIONS
          }
        ]
      };

      const rawToken = await generateAccessToken(tokenPayload);
      const verified = await verifyAccessToken(rawToken);

      // Verify the JWT payload contains top-level permissions
      expect(verified.permissions).toContain('*');

      // But hasPermission for an unrelated team MUST be false!
      expect(hasPermission({ user: verified }, 'team-athens', PERMISSIONS.TARGETS_MANAGE)).toBe(false);
      expect(hasPermission({ user: verified }, 'team-athens', PERMISSIONS.MEMBERS_MANAGE)).toBe(false);
      expect(hasPermission({ user: verified }, 'team-athens', PERMISSIONS.ROLES_MANAGE)).toBe(false);

      // However, on team-sparta, they have full access
      expect(hasPermission({ user: verified }, 'team-sparta', PERMISSIONS.TARGETS_MANAGE)).toBe(true);
    });

    // --- Direct Member Object Evaluation in hasPermission ---
    it('evaluates permissions when passed a raw member object directly', () => {
      const directMember = {
        id: 'mem-custom-1',
        teamId: 'team-corinth',
        role: 'TEAM_MEMBER',
        permissions: [PERMISSIONS.PINS_MANAGE],
        customRoles: [
          {
            id: 'cr-1',
            permissions: [PERMISSIONS.DEFENSE_COORDINATE]
          }
        ]
      };

      expect(hasPermission(directMember, 'team-corinth', PERMISSIONS.PINS_MANAGE)).toBe(true);
      expect(hasPermission(directMember, 'team-corinth', PERMISSIONS.DEFENSE_COORDINATE)).toBe(true);
      expect(hasPermission(directMember, 'team-corinth', PERMISSIONS.TARGETS_MANAGE)).toBe(false);

      // When teamId does not match the member's teamId
      expect(hasPermission(directMember, 'team-thebes', PERMISSIONS.PINS_MANAGE)).toBe(false);
    });

    // --- Subordinate with MEMBERS_MANAGE cannot demote TEAM_ADMIN ---
    it('PUT /api/teams/[id]/members/[memberId] forbids a non-admin member with MEMBERS_MANAGE from demoting a TEAM_ADMIN', async () => {
      const managerToken = await generateAccessToken({
        sub: 'usr-manager',
        username: 'HRLead',
        globalRole: 'USER',
        teams: [{ teamId: 'team-guard', role: 'TEAM_MEMBER', permissions: [PERMISSIONS.MEMBERS_MANAGE] }]
      });

      const mockTeam = {
        id: 'team-guard',
        worldId: 'hu119',
        members: [
          { id: 'mem-mgr', userId: 'usr-manager', role: 'TEAM_MEMBER', permissions: [PERMISSIONS.MEMBERS_MANAGE] },
          { id: 'mem-adm', userId: 'usr-adm', role: 'TEAM_ADMIN', playerName: 'ChiefCommander' }
        ]
      };

      prisma.team.findUnique.mockResolvedValue(mockTeam);
      prisma.teamMember.findFirst.mockResolvedValue(mockTeam.members[1]); // target is admin

      const req = new Request('http://localhost:3000/api/teams/team-guard/members/mem-adm', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${managerToken}`
        },
        body: JSON.stringify({ role: 'TEAM_MEMBER' })
      });

      const res = await updateMember(req, {
        params: Promise.resolve({ id: 'team-guard', memberId: 'mem-adm' })
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/Only Team Administrators or Global Administrators/i);
    });

    // --- Subordinate with MEMBERS_MANAGE cannot kick TEAM_ADMIN ---
    it('DELETE /api/teams/[id]/members/[memberId] forbids a non-admin member with MEMBERS_MANAGE from kicking a TEAM_ADMIN', async () => {
      const managerToken = await generateAccessToken({
        sub: 'usr-manager',
        username: 'HRLead',
        globalRole: 'USER',
        teams: [{ teamId: 'team-guard', role: 'TEAM_MEMBER', permissions: [PERMISSIONS.MEMBERS_MANAGE] }]
      });

      const mockTeam = {
        id: 'team-guard',
        worldId: 'hu119',
        members: [
          { id: 'mem-mgr', userId: 'usr-manager', role: 'TEAM_MEMBER', permissions: [PERMISSIONS.MEMBERS_MANAGE] },
          { id: 'mem-adm', userId: 'usr-adm', role: 'TEAM_ADMIN', playerName: 'ChiefCommander' }
        ]
      };

      prisma.team.findUnique.mockResolvedValue(mockTeam);
      prisma.teamMember.findFirst.mockResolvedValue(mockTeam.members[1]);

      const req = new Request('http://localhost:3000/api/teams/team-guard/members/mem-adm', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${managerToken}` }
      });

      const res = await removeMember(req, {
        params: Promise.resolve({ id: 'team-guard', memberId: 'mem-adm' })
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/Only Team Administrators or Global Administrators/i);
    });

    // --- Reject invalid customRoleIds in PUT ---
    it('PUT /api/teams/[id]/members/[memberId] rejects invalid customRoleIds with 400', async () => {
      const adminToken = await generateAccessToken({
        sub: 'usr-admin',
        username: 'Admin',
        globalRole: 'GLOBAL_ADMIN',
        teams: [{ teamId: 'team-roles-test', role: 'TEAM_ADMIN', permissions: ALL_PERMISSIONS }]
      });

      const mockTeam = {
        id: 'team-roles-test',
        worldId: 'hu119',
        members: [{ id: 'mem-target', userId: 'usr-target', role: 'TEAM_MEMBER', playerName: 'Target' }]
      };

      prisma.team.findUnique.mockResolvedValue(mockTeam);
      prisma.teamMember.findFirst.mockResolvedValue(mockTeam.members[0]);
      // DB only finds 0 of the 2 requested IDs
      prisma.teamCustomRole.findMany.mockResolvedValue([]);

      const req = new Request('http://localhost:3000/api/teams/team-roles-test/members/mem-target', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ customRoleIds: ['nonexistent-1', 'nonexistent-2'] })
      });

      const res = await updateMember(req, {
        params: Promise.resolve({ id: 'team-roles-test', memberId: 'mem-target' })
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/One or more custom roles were not found/i);
    });

    // --- Rejection of Outsider Caller on Member Management ---
    it('rejects users who are not members of the team on member management routes', async () => {
      const outsiderToken = await generateAccessToken({
        sub: 'usr-outsider',
        username: 'Outsider',
        globalRole: 'USER',
        teams: [{ teamId: 'team-other', role: 'TEAM_ADMIN', permissions: ALL_PERMISSIONS }]
      });

      const mockTeam = {
        id: 'team-protected',
        worldId: 'hu119',
        members: [{ id: 'mem-insider', userId: 'usr-insider', role: 'TEAM_ADMIN' }]
      };

      prisma.team.findUnique.mockResolvedValue(mockTeam);

      const req = new Request('http://localhost:3000/api/teams/team-protected/members/mem-insider', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${outsiderToken}` }
      });

      const res = await removeMember(req, {
        params: Promise.resolve({ id: 'team-protected', memberId: 'mem-insider' })
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/not a member of this team/i);
    });

    // --- Role Deletion Cascade ---
    it('DELETE /api/teams/[id]/roles/[roleId] atomically cleans up role assignments', async () => {
      const adminToken = await generateAccessToken({
        sub: 'usr-admin',
        username: 'Lead',
        globalRole: 'GLOBAL_ADMIN',
        teams: [{ teamId: 'team-roles', role: 'TEAM_ADMIN', permissions: ALL_PERMISSIONS }]
      });

      const mockTeam = {
        id: 'team-roles',
        worldId: 'hu119',
        members: [{ userId: 'usr-admin', role: 'TEAM_ADMIN' }]
      };

      const existingRole = {
        id: 'role-del-clean',
        teamId: 'team-roles',
        name: 'Obsolete Role'
      };

      prisma.team.findUnique.mockResolvedValue(mockTeam);
      prisma.teamCustomRole.findFirst.mockResolvedValue(existingRole);
      prisma.teamMemberRoleAssignment.deleteMany.mockResolvedValue({ count: 5 });
      prisma.teamCustomRole.delete.mockResolvedValue(existingRole);

      const req = new Request('http://localhost:3000/api/teams/team-roles/roles/role-del-clean', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${adminToken}` }
      });

      const res = await deleteRole(req, {
        params: Promise.resolve({ id: 'team-roles', roleId: 'role-del-clean' })
      });

      expect(res.status).toBe(200);
      expect(prisma.teamMemberRoleAssignment.deleteMany).toHaveBeenCalledWith({
        where: { customRoleId: 'role-del-clean' }
      });
      expect(prisma.teamCustomRole.delete).toHaveBeenCalledWith({
        where: { id: 'role-del-clean' }
      });
    });

    // --- POST /api/teams/[id]/invites Custom Roles Validation ---
    it('POST /api/teams/[id]/invites rejects invalid customRoleIds with 400', async () => {
      const adminToken = await generateAccessToken({
        sub: 'usr-admin',
        username: 'Lead',
        globalRole: 'GLOBAL_ADMIN',
        teams: [{ teamId: 'team-invites', role: 'TEAM_ADMIN', permissions: ALL_PERMISSIONS }]
      });

      const mockTeam = {
        id: 'team-invites',
        worldId: 'hu119',
        members: [{ userId: 'usr-admin', role: 'TEAM_ADMIN' }]
      };

      prisma.team.findUnique.mockResolvedValue(mockTeam);
      prisma.player.findFirst.mockResolvedValue({ id: 1234, name: 'Hercules', worldId: 'hu119' });
      prisma.invite.findFirst.mockResolvedValue(null);
      prisma.teamCustomRole.findMany.mockResolvedValue([]); // 0 roles found

      const req = new Request('http://localhost:3000/api/teams/team-invites/invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          targetPlayerName: 'Hercules',
          customRoleIds: ['bogus-role-id']
        })
      });

      const res = await createInvite(req, {
        params: Promise.resolve({ id: 'team-invites' })
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/One or more selected custom roles do not exist/i);
    });
  });
});

