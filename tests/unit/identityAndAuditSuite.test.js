import { describe, test, expect, vi } from 'vitest';
import { AUDIT_ACTIONS } from '../../src/lib/auth/audit.js';
import { TownVerificationEngine } from '../../src/lib/auth/TownVerificationEngine.js';
import { AuditLogAdapter } from '../../src/lib/auth/AuditLogAdapter.js';
import { IdentityVerificationAdapter } from '../../src/lib/auth/IdentityVerificationAdapter.js';

describe('AUDIT_ACTIONS Catalog', () => {
  test('is immutable and contains canonical security and domain actions', () => {
    expect(AUDIT_ACTIONS).toBeDefined();
    expect(Object.isFrozen(AUDIT_ACTIONS)).toBe(true);

    expect(AUDIT_ACTIONS.AUTH_LOGIN_SUCCESS).toBe('AUTH_LOGIN_SUCCESS');
    expect(AUDIT_ACTIONS.AUTH_LOGIN_FAILURE).toBe('AUTH_LOGIN_FAILURE');
    expect(AUDIT_ACTIONS.TOWN_VERIFIED).toBe('TOWN_VERIFIED');
    expect(AUDIT_ACTIONS.TEAM_CREATED).toBe('TEAM_CREATED');
    expect(AUDIT_ACTIONS.TEAM_MEMBER_UPDATED).toBe('TEAM_MEMBER_UPDATED');
    expect(AUDIT_ACTIONS.TEAM_MEMBER_REMOVED).toBe('TEAM_MEMBER_REMOVED');
    expect(AUDIT_ACTIONS.ROLE_CREATED).toBe('ROLE_CREATED');
    expect(AUDIT_ACTIONS.WORLD_SYNC_TRIGGERED).toBe('WORLD_SYNC_TRIGGERED');
  });
});

describe('TownVerificationEngine: Pure Substring Evaluator & Coordination Seam', () => {
  test('isTownVerificationMatch validates token presence case-insensitively', () => {
    expect(TownVerificationEngine.isTownVerificationMatch('My City [GP-VERIFY-42]', 'GP-VERIFY-42')).toBe(true);
    expect(TownVerificationEngine.isTownVerificationMatch('Athens [gp-verify-42]', 'GP-VERIFY-42')).toBe(true);
    expect(TownVerificationEngine.isTownVerificationMatch('Athens [GP-VERIFY-42]', 'gp-verify-42')).toBe(true);

    expect(TownVerificationEngine.isTownVerificationMatch('Athens City', 'GP-VERIFY-42')).toBe(false);
    expect(TownVerificationEngine.isTownVerificationMatch('', 'GP-VERIFY-42')).toBe(false);
    expect(TownVerificationEngine.isTownVerificationMatch('Athens', '')).toBe(false);
    expect(TownVerificationEngine.isTownVerificationMatch(null, 'GP-VERIFY-42')).toBe(false);
  });

  test('executeTownVerificationCheck handles empty unverified roster gracefully', async () => {
    const mockPrisma = {
      teamMember: {
        findMany: vi.fn().mockResolvedValue([])
      }
    };

    const result = await TownVerificationEngine.executeTownVerificationCheck({
      worldId: 'hu119',
      prismaClient: mockPrisma
    });

    expect(result.verifiedCount).toBe(0);
    expect(result.verifiedTowns).toEqual([]);
    expect(mockPrisma.teamMember.findMany).toHaveBeenCalled();
  });

  test('executeTownVerificationCheck promotes operative when matching town is found', async () => {
    const mockMember = {
      id: 'member-1',
      userId: 'user-1',
      playerName: 'Leonidas',
      playerId: 101,
      worldId: 'hu119',
      verificationCode: 'GP-SEC-77',
      verificationStatus: 'UNVERIFIED',
      user: { username: 'leonidas_king' }
    };

    const mockTown = {
      id: 5001,
      name: 'Sparta [GP-SEC-77]'
    };

    const mockPrisma = {
      teamMember: {
        findMany: vi.fn().mockResolvedValue([mockMember]),
        update: vi.fn().mockResolvedValue({ ...mockMember, verificationStatus: 'VERIFIED' })
      },
      town: {
        findFirst: vi.fn().mockResolvedValue(mockTown)
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' })
      }
    };

    const result = await TownVerificationEngine.executeTownVerificationCheck({
      worldId: 'hu119',
      userId: 'user-1',
      prismaClient: mockPrisma,
      method: 'ON_DEMAND_CHECK',
      actorContext: {
        ipAddress: '127.0.0.1',
        userAgent: 'Vitest Agent',
        actorUsername: 'leonidas_king'
      }
    });

    expect(result.verifiedCount).toBe(1);
    expect(result.verifiedTowns).toHaveLength(1);
    expect(result.verifiedTowns[0]).toEqual({
      id: 5001,
      name: 'Sparta [GP-SEC-77]',
      worldId: 'hu119',
      playerId: 101
    });

    expect(mockPrisma.teamMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'member-1' },
        data: expect.objectContaining({ verificationStatus: 'VERIFIED' })
      })
    );
  });
});

describe('AuditLogAdapter: Client Seam', () => {
  test('fetchAuditLogs serializes pagination and filters into query string', async () => {
    const mockLogs = [
      { id: '1', action: 'AUTH_LOGIN_SUCCESS', actorUsername: 'Leonidas', status: 'SUCCESS' }
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ logs: mockLogs, total: 1 })
    });

    const result = await AuditLogAdapter.fetchAuditLogs({
      limit: 25,
      offset: 10,
      action: 'AUTH_LOGIN_SUCCESS',
      actorUsername: 'Leonidas',
      status: 'SUCCESS',
      targetResource: 'user:123'
    }, { fetchImpl: mockFetch });

    expect(result.logs).toEqual(mockLogs);
    expect(result.total).toBe(1);

    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain('limit=25');
    expect(callUrl).toContain('offset=10');
    expect(callUrl).toContain('action=AUTH_LOGIN_SUCCESS');
    expect(callUrl).toContain('actorUsername=Leonidas');
    expect(callUrl).toContain('status=SUCCESS');
    expect(callUrl).toContain('targetResource=user%3A123');
  });

  test('fetchAuditLogs throws descriptive error on HTTP failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' })
    });

    await expect(AuditLogAdapter.fetchAuditLogs({}, { fetchImpl: mockFetch }))
      .rejects.toThrow(/Forbidden/);
  });
});

describe('IdentityVerificationAdapter: Client Seam', () => {
  test('verifyTownOwnership executes POST handshake and normalizes response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        verified: true,
        message: 'Verified!',
        town: { id: 5001, name: 'Sparta [GP-123]' }
      })
    });

    const result = await IdentityVerificationAdapter.verifyTownOwnership(
      { worldId: 'hu119' },
      { fetchImpl: mockFetch }
    );

    expect(result.verified).toBe(true);
    expect(result.town.name).toBe('Sparta [GP-123]');
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/verify-town', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ worldId: 'hu119' })
    }));
  });

  test('fetchMasterPlayer formats query parameters and retrieves tactical profile', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        player: { id: 101, name: 'Leonidas' },
        worldId: 'hu119',
        recentConquers: [],
        recentLosses: []
      })
    });

    const result = await IdentityVerificationAdapter.fetchMasterPlayer(
      { worldId: 'hu119', playerName: 'Leonidas', playerId: 101 },
      { fetchImpl: mockFetch }
    );

    expect(result.player.name).toBe('Leonidas');
    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain('world=hu119');
    expect(callUrl).toContain('playerId=101');
    expect(callUrl).toContain('playerName=Leonidas');
  });
});
