import { describe, it, expect, vi } from 'vitest';
import { resolveTeamAuthority } from '../../src/lib/team/teamAuthority.js';
import { TeamOperationsAdapter } from '../../src/lib/team/TeamOperationsAdapter.js';
import {
  TEAM_MEMBERSHIP_INCLUDE,
  buildTeamMembershipPayload
} from '../../src/lib/auth/rbac.js';

describe('Team Authority Engine & Membership Hydration', () => {
  it('exports frozen TEAM_MEMBERSHIP_INCLUDE with world and customRole relations', () => {
    expect(Object.isFrozen(TEAM_MEMBERSHIP_INCLUDE)).toBe(true);
    expect(TEAM_MEMBERSHIP_INCLUDE).toEqual({
      team: { include: { world: true } },
      customRoles: { include: { customRole: true } }
    });
  });

  it('buildTeamMembershipPayload hydrates worldName, verificationCode, and verifiedAt alongside permissions and customRoles', () => {
    const verifiedDate = new Date('2026-10-01T12:00:00Z');
    const memberships = [
      {
        id: 'mem-1',
        teamId: 'team-1',
        worldId: 'hu119',
        role: 'TEAM_MEMBER',
        playerId: 42,
        playerName: 'Leonidas',
        verificationCode: 'GP-123456',
        verificationStatus: 'VERIFIED',
        verifiedAt: verifiedDate,
        team: {
          name: 'Spartan Vanguard',
          world: { id: 'hu119', name: 'Dimale (hu119)' }
        },
        customRoles: [
          {
            customRole: {
              id: 'cr-1',
              name: 'Attack Coordinator',
              color: '#EF4444',
              icon: 'swords',
              priority: 90,
              permissions: ['TARGETS_MANAGE', 'OPERATIONS_COORDINATE']
            }
          }
        ]
      }
    ];

    const payload = buildTeamMembershipPayload(memberships);
    expect(payload).toHaveLength(1);
    expect(payload[0]).toEqual(
      expect.objectContaining({
        membershipId: 'mem-1',
        teamId: 'team-1',
        teamName: 'Spartan Vanguard',
        worldId: 'hu119',
        worldName: 'Dimale (hu119)',
        role: 'TEAM_MEMBER',
        playerId: 42,
        playerName: 'Leonidas',
        verificationCode: 'GP-123456',
        status: 'VERIFIED',
        verifiedAt: verifiedDate,
        permissions: ['TARGETS_MANAGE', 'OPERATIONS_COORDINATE']
      })
    );
    expect(payload[0].customRoles).toHaveLength(1);
  });

  it('returns guest defaults when user is null or undefined', () => {
    const authority = resolveTeamAuthority(null, 'hu119');
    expect(authority.isGlobalAdmin).toBe(false);
    expect(authority.isTeamAdmin).toBe(false);
    expect(authority.effectiveRole).toBe('GUEST');
    expect(authority.canManageMembers).toBe(false);
    expect(authority.canManageInvites).toBe(false);
    expect(authority.canManageRoles).toBe(false);
  });

  it('resolves Global Admin with universal permissions and all capabilities enabled', () => {
    const user = {
      id: 'usr_admin',
      username: 'SysAdmin',
      globalRole: 'GLOBAL_ADMIN',
      teams: []
    };

    const authority = resolveTeamAuthority(user, 'hu119');
    expect(authority.isGlobalAdmin).toBe(true);
    expect(authority.isTeamAdmin).toBe(true);
    expect(authority.effectiveRole).toBe('GLOBAL_ADMIN');
    expect(authority.userPermissions).toContain('*');
    expect(authority.canManageMembers).toBe(true);
    expect(authority.canManageInvites).toBe(true);
    expect(authority.canManageRoles).toBe(true);
  });
});

describe('TeamOperationsAdapter', () => {
  it('loadTeamBundle resolves full bundle in a single HTTP request when GET /api/teams/[id] returns members, customRoles, and invites', async () => {
    const mockMembers = [{ id: 'm1', playerName: 'Leonidas', role: 'TEAM_ADMIN', points: 250000, rank: 1 }];
    const mockRoles = [{ id: 'r1', name: 'Attack Coordinator', priority: 90 }];
    const mockInvites = [{ id: 'inv1', targetPlayerName: 'Brasidas' }];
    const mockTeam = {
      id: 't1',
      name: 'Spartan Command',
      worldId: 'hu119',
      members: mockMembers,
      customRoles: mockRoles,
      invites: mockInvites
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        team: mockTeam,
        members: mockMembers,
        customRoles: mockRoles,
        invites: mockInvites
      })
    });

    const bundle = await TeamOperationsAdapter.loadTeamBundle({
      teamId: 't1',
      activeWorldId: 'hu119',
      canManageInvites: true,
      fetchImpl: mockFetch
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1');
    expect(bundle.team.id).toBe('t1');
    expect(bundle.members).toEqual(mockMembers);
    expect(bundle.customRoles).toEqual(mockRoles);
    expect(bundle.invites).toEqual(mockInvites);
  });

  it('loadTeamBundle falls back to secondary endpoints when mock fixture omits bundled arrays', async () => {
    const mockTeam = { id: 't1', name: 'Spartan Command', worldId: 'hu119' };
    const mockMembers = [{ id: 'm1', playerName: 'Leonidas', role: 'TEAM_ADMIN' }];
    const mockRoles = [{ id: 'r1', name: 'Vanguard', priority: 100 }];
    const mockInvites = [{ id: 'inv1', targetPlayerName: 'Xerxes' }];

    const mockFetch = vi.fn((url) => {
      if (url.includes('/invites')) {
        return Promise.resolve({ ok: true, json: async () => ({ invites: mockInvites }) });
      }
      if (url.includes('/members')) {
        return Promise.resolve({ ok: true, json: async () => ({ members: mockMembers }) });
      }
      if (url.includes('/roles')) {
        return Promise.resolve({ ok: true, json: async () => ({ roles: mockRoles }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ team: mockTeam }) });
    });

    const bundle = await TeamOperationsAdapter.loadTeamBundle({
      teamId: 't1',
      activeWorldId: 'hu119',
      canManageInvites: true,
      fetchImpl: mockFetch
    });

    expect(bundle.team.id).toBe('t1');
    expect(bundle.members.length).toBe(1);
    expect(bundle.members[0].playerName).toBe('Leonidas');
    expect(bundle.customRoles.length).toBe(1);
    expect(bundle.invites.length).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('updateMember dispatches PUT request with proper payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    });

    await TeamOperationsAdapter.updateMember({
      teamId: 't1',
      memberId: 'm1',
      role: 'TEAM_ADMIN',
      customRoleIds: ['r1', 'r2'],
      fetchImpl: mockFetch
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/teams/t1/members/m1',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'TEAM_ADMIN', customRoleIds: ['r1', 'r2'] })
      })
    );
  });

  it('removeMember dispatches DELETE request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Member removed' })
    });

    await TeamOperationsAdapter.removeMember({
      teamId: 't1',
      memberId: 'm1',
      fetchImpl: mockFetch
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/teams/t1/members/m1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('saveRole dispatches POST when roleId is omitted, and PUT when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ role: { id: 'new_role' } })
    });

    await TeamOperationsAdapter.saveRole({
      teamId: 't1',
      roleData: { name: 'Defender', color: '#3B82F6', permissions: ['DEFENSE_COORDINATE'] },
      fetchImpl: mockFetch
    });

    expect(mockFetch).toHaveBeenLastCalledWith(
      '/api/teams/t1/roles',
      expect.objectContaining({ method: 'POST' })
    );

    await TeamOperationsAdapter.saveRole({
      teamId: 't1',
      roleId: 'role_123',
      roleData: { name: 'Lead Defender' },
      fetchImpl: mockFetch
    });

    expect(mockFetch).toHaveBeenLastCalledWith(
      '/api/teams/t1/roles/role_123',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('createInvite and revokeInvite dispatch correct HTTP calls', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invite: { id: 'inv_10' } })
    });

    await TeamOperationsAdapter.createInvite({
      teamId: 't1',
      inviteData: { targetPlayerName: 'Hector', role: 'TEAM_MEMBER', expiresInDays: 7 },
      fetchImpl: mockFetch
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/teams/t1/invites',
      expect.objectContaining({ method: 'POST' })
    );

    await TeamOperationsAdapter.revokeInvite({
      teamId: 't1',
      inviteId: 'inv_10',
      fetchImpl: mockFetch
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/teams/t1/invites/inv_10',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
