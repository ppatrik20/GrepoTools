import { describe, test, expect, vi } from 'vitest';
import { AUDIT_ACTIONS } from '../../src/lib/auth/audit.js';
import { TownVerificationEngine } from '../../src/lib/auth/TownVerificationEngine.js';

describe('AUDIT_ACTIONS Catalog', () => {
  test('is immutable and contains canonical security and domain actions', () => {
    expect(AUDIT_ACTIONS).toBeDefined();
    expect(Object.isFrozen(AUDIT_ACTIONS)).toBe(true);

    expect(AUDIT_ACTIONS.AUTH_LOGIN_SUCCESS).toBe('AUTH_LOGIN_SUCCESS');
    expect(AUDIT_ACTIONS.AUTH_LOGIN_FAILURE).toBe('AUTH_LOGIN_FAILURE');
    expect(AUDIT_ACTIONS.AUTH_LOGIN_FAILED).toBe('AUTH_LOGIN_FAILURE');
    expect(AUDIT_ACTIONS.AUTH_ACCOUNT_LOCKED).toBe('AUTH_ACCOUNT_LOCKED');
    expect(AUDIT_ACTIONS.AUTH_TOKEN_ROTATED).toBe('AUTH_TOKEN_ROTATED');
    expect(AUDIT_ACTIONS.USER_REGISTERED_VIA_INVITE).toBe('USER_REGISTERED_VIA_INVITE');
    expect(AUDIT_ACTIONS.TOWN_VERIFICATION_CHECK_FAILED).toBe('TOWN_VERIFICATION_CHECK_FAILED');
    expect(AUDIT_ACTIONS.TOWN_VERIFIED).toBe('TOWN_VERIFIED');
    expect(AUDIT_ACTIONS.TEAM_CREATED).toBe('TEAM_CREATED');
    expect(AUDIT_ACTIONS.TEAM_DELETED).toBe('TEAM_DELETED');
    expect(AUDIT_ACTIONS.TEAM_MEMBER_UPDATED).toBe('TEAM_MEMBER_UPDATED');
    expect(AUDIT_ACTIONS.TEAM_MEMBER_REMOVED).toBe('TEAM_MEMBER_REMOVED');
    expect(AUDIT_ACTIONS.TEAM_MEMBER_LEFT).toBe('TEAM_MEMBER_LEFT');
    expect(AUDIT_ACTIONS.TEAM_MEMBER_KICKED).toBe('TEAM_MEMBER_KICKED');
    expect(AUDIT_ACTIONS.CUSTOM_ROLE_CREATED).toBe('CUSTOM_ROLE_CREATED');
    expect(AUDIT_ACTIONS.CUSTOM_ROLE_UPDATED).toBe('CUSTOM_ROLE_UPDATED');
    expect(AUDIT_ACTIONS.CUSTOM_ROLE_DELETED).toBe('CUSTOM_ROLE_DELETED');
    expect(AUDIT_ACTIONS.WORLD_SYNC_TRIGGERED).toBe('WORLD_SYNC_TRIGGERED');
  });
});

describe('TownVerificationEngine: Batch Town Scanning & Fallback', () => {
  test('isTownVerificationMatch validates token presence case-insensitively', () => {
    expect(TownVerificationEngine.isTownVerificationMatch('My City [GP-VERIFY-42]', 'GP-VERIFY-42')).toBe(true);
    expect(TownVerificationEngine.isTownVerificationMatch('Athens [gp-verify-42]', 'GP-VERIFY-42')).toBe(true);
    expect(TownVerificationEngine.isTownVerificationMatch('Athens [GP-VERIFY-42]', 'gp-verify-42')).toBe(true);

    expect(TownVerificationEngine.isTownVerificationMatch('Athens City', 'GP-VERIFY-42')).toBe(false);
    expect(TownVerificationEngine.isTownVerificationMatch('', 'GP-VERIFY-42')).toBe(false);
    expect(TownVerificationEngine.isTownVerificationMatch('Athens', '')).toBe(false);
    expect(TownVerificationEngine.isTownVerificationMatch(null, 'GP-VERIFY-42')).toBe(false);
  });

  test('batch-fetches candidate towns via town.findMany in a single query when multiple unverified members exist', async () => {
    const unverifiedMembers = [
      {
        id: 'member-1',
        userId: 'user-1',
        playerName: 'Leonidas',
        playerId: 101,
        worldId: 'hu119',
        verificationCode: 'GP-SEC-101',
        verificationStatus: 'UNVERIFIED',
        user: { username: 'leonidas' }
      },
      {
        id: 'member-2',
        userId: 'user-2',
        playerName: 'Themistocles',
        playerId: 102,
        worldId: 'hu119',
        verificationCode: 'GP-SEC-102',
        verificationStatus: 'UNVERIFIED',
        user: { username: 'themistocles' }
      }
    ];

    const mockPrisma = {
      teamMember: {
        findMany: vi.fn().mockResolvedValue(unverifiedMembers),
        update: vi.fn().mockResolvedValue({ verificationStatus: 'VERIFIED' })
      },
      town: {
        findMany: vi.fn().mockResolvedValue([
          { id: 5001, name: 'Sparta [gp-sec-101]', points: 10000, worldId: 'hu119', playerId: 101 },
          { id: 5002, name: 'Athens Harbor', points: 8500, worldId: 'hu119', playerId: 102 }
        ]),
        findFirst: vi.fn()
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' })
      }
    };

    const result = await TownVerificationEngine.scanWorldForVerifiedTowns('hu119', mockPrisma);

    expect(mockPrisma.town.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.town.findFirst).not.toHaveBeenCalled();
    expect(result.verifiedCount).toBe(1);
    expect(result.verifiedTowns).toEqual([
      {
        id: 5001,
        name: 'Sparta [gp-sec-101]',
        worldId: 'hu119',
        playerId: 101
      }
    ]);
  });

  test('falls back to town.findFirst when town.findMany is not defined on minimal test mock', async () => {
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
      method: 'ON_DEMAND_CHECK'
    });

    expect(mockPrisma.town.findFirst).toHaveBeenCalledTimes(1);
    expect(result.verifiedCount).toBe(1);
    expect(result.verifiedTowns).toHaveLength(1);
  });
});
