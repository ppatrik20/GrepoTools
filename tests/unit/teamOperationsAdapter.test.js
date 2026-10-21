import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveTeamAuthority } from '../../src/lib/team/teamAuthority.js';
import { TeamOperationsAdapter } from '../../src/lib/team/TeamOperationsAdapter.js';

describe('Team Authority Engine (teamAuthority.js)', () => {
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

  it('resolves Team Admin with full management authority for the active world', () => {
    const user = {
      id: 'usr_leader',
      username: 'AllianceCommander',
      teams: [
        { teamId: 'team_alpha', worldId: 'hu119', role: 'TEAM_ADMIN', permissions: [] }
      ]
    };

    const authority = resolveTeamAuthority(user, 'hu119');
    expect(authority.isGlobalAdmin).toBe(false);
    expect(authority.isTeamAdmin).toBe(true);
    expect(authority.effectiveRole).toBe('TEAM_ADMIN');
    expect(authority.canManageMembers).toBe(true);
    expect(authority.canManageInvites).toBe(true);
    expect(authority.canManageRoles).toBe(true);
  });

  it('resolves Team Member with specific capability grant (e.g. INVITES_MANAGE, ENDGAME_STRATEGIST)', () => {
    const user = {
      id: 'usr_recruiter',
      username: 'Recruiter',
      teams: [
        {
          teamId: 'team_alpha',
          worldId: 'hu119',
          role: 'TEAM_MEMBER',
          permissions: ['INVITES_MANAGE', 'ENDGAME_STRATEGIST']
        }
      ]
    };

    const authority = resolveTeamAuthority(user, 'hu119');
    expect(authority.canManageInvites).toBe(true);
    expect(authority.canCoordinateEndgame).toBe(true);
    expect(authority.canManageWonderLogistics).toBe(false);
    expect(authority.isGlobalAdmin).toBe(false);
    expect(authority.isTeamAdmin).toBe(false);
    expect(authority.effectiveRole).toBe('TEAM_MEMBER');
    expect(authority.canManageMembers).toBe(false);
    expect(authority.canManageRoles).toBe(false);
  });

  it('updates membership role if live team members list contains user', () => {
    const user = {
      id: 'usr_promoted',
      sub: 'usr_promoted',
      username: 'PromotedPlayer',
      teams: [{ teamId: 'team_beta', worldId: 'hu119', role: 'TEAM_MEMBER' }]
    };

    const liveTeam = {
      id: 'team_beta',
      worldId: 'hu119',
      members: [
        { userId: 'usr_promoted', role: 'TEAM_ADMIN' }
      ]
    };

    const authority = resolveTeamAuthority(user, 'hu119', liveTeam);
    expect(authority.isTeamAdmin).toBe(true);
    expect(authority.effectiveRole).toBe('TEAM_ADMIN');
  });
});

describe('TeamOperationsAdapter', () => {
  it('loadTeamBundle performs parallel fetch and unboxes entities cleanly', async () => {
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

    // Create role (POST)
    await TeamOperationsAdapter.saveRole({
      teamId: 't1',
      roleData: { name: 'Defender', color: '#3B82F6', permissions: ['DEFENSE_COORDINATE'] },
      fetchImpl: mockFetch
    });

    expect(mockFetch).toHaveBeenLastCalledWith(
      '/api/teams/t1/roles',
      expect.objectContaining({ method: 'POST' })
    );

    // Edit role (PUT)
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

  it('throws an error with message when API responds with error status', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden: Insufficient permissions' })
    });

    await expect(
      TeamOperationsAdapter.deleteRole({
        teamId: 't1',
        roleId: 'r1',
        fetchImpl: mockFetch
      })
    ).rejects.toThrow('Forbidden: Insufficient permissions');
  });

  it('coordinates endgame lifecycle: load, update wonder project, add contributions, and update temple state', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url, init) => {
      if (url.includes('/api/teams/t1/endgame') && (!init || init.method === 'GET')) {
        return {
          ok: true,
          json: async () => ({
            worldId: 'hu119',
            endgameType: 'WORLD_WONDERS',
            endgamePhase: 'ACTIVE_ERA',
            wonders: { projects: [] }
          })
        };
      }

      if (url.includes('/api/teams/t1/endgame') && init?.method === 'POST') {
        const payload = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({ success: true, action: payload.action, received: payload })
        };
      }

      return { ok: false, json: async () => ({ error: 'Not found' }) };
    });

    // 1. Load endgame state
    const state = await TeamOperationsAdapter.loadEndgameState({ teamId: 't1', fetchImpl: mockFetch });
    expect(state.endgameType).toBe('WORLD_WONDERS');
    expect(state.endgamePhase).toBe('ACTIVE_ERA');

    // 2. Update wonder project
    const projRes = await TeamOperationsAdapter.updateWonderProject({
      teamId: 't1',
      projectData: { islandId: 105, wonderType: 'COLOSSUS', currentStage: 3 },
      fetchImpl: mockFetch
    });
    expect(projRes.success).toBe(true);
    expect(projRes.action).toBe('UPSERT_WONDER_PROJECT');

    // 3. Record wonder contribution
    const contribRes = await TeamOperationsAdapter.recordWonderContribution({
      teamId: 't1',
      contributionData: { projectId: 'p1', memberId: 'm1', resourceWood: 50000, favorCastsCount: 2 },
      fetchImpl: mockFetch
    });
    expect(contribRes.success).toBe(true);
    expect(contribRes.action).toBe('ADD_WONDER_CONTRIBUTION');

    // 4. Update member endgame status
    const statusRes = await TeamOperationsAdapter.updateMemberEndgameStatus({
      teamId: 't1',
      memberData: { memberId: 'm1', vacationModeActive: true },
      fetchImpl: mockFetch
    });
    expect(statusRes.success).toBe(true);
    expect(statusRes.action).toBe('UPDATE_MEMBER_STATUS');

    // 5. Toggle domination island
    const domRes = await TeamOperationsAdapter.toggleDominationIsland({
      teamId: 't1',
      islandData: { islandKey: '500_500', isValid: true },
      fetchImpl: mockFetch
    });
    expect(domRes.success).toBe(true);
    expect(domRes.action).toBe('TOGGLE_DOMINATION_ISLAND');

    // 6. Update temple state
    const templeRes = await TeamOperationsAdapter.updateTempleState({
      teamId: 't1',
      templeData: { islandKey: '450_550', templeCategory: 'LARGE', god: 'athena' },
      fetchImpl: mockFetch
    });
    expect(templeRes.success).toBe(true);
    expect(templeRes.action).toBe('UPSERT_TEMPLE_STATE');
  });
});
