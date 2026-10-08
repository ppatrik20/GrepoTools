import { describe, test, expect, vi } from 'vitest';
import {
  parseKillPoints,
  parseAlliances,
  parsePlayers,
  parseTowns,
  parseIslands,
  parseConquests
} from '../../src/lib/world/GrepolisDataParser.js';
import {
  computeAllianceDeltas,
  computePlayerDeltas,
  computeTownDeltas,
  computeIslandDeltas
} from '../../src/lib/world/WorldDeltaEngine.js';
import { WorldSyncPipeline } from '../../src/lib/world/WorldSyncPipeline.js';
import { WorldOperationsAdapter } from '../../src/lib/world/WorldOperationsAdapter.js';

describe('GrepolisDataParser: Pure Data Feed Parser', () => {
  test('parseKillPoints converts raw rows to numerical entity kill mapping', () => {
    const rawRows = [
      ['1', '101', '5500'],
      ['2', '102', '3200'],
      ['bad_row'],
      ['3', 'abc', 'not_a_num']
    ];
    const killMap = parseKillPoints(rawRows);
    expect(killMap.get(101)).toBe(5500);
    expect(killMap.get(102)).toBe(3200);
    expect(killMap.has('abc')).toBe(false);
  });

  test('parseAlliances parses rows and merges kill points', () => {
    const rawAlliances = [
      ['1', 'Spartans', '150000', '25', '10', '1'],
      ['2', 'Athenians', '95000', '18', '8', '2'],
      ['1', 'Spartans Duplicate', '150000', '25', '10', '1'] // Duplicate ID
    ];
    const killMaps = {
      aAttMap: new Map([[1, 4000], [2, 1200]]),
      aDefMap: new Map([[1, 2500], [2, 800]]),
      aAllMap: new Map([[1, 6500], [2, 2000]])
    };

    const alliances = parseAlliances(rawAlliances, killMaps, 'hu119');
    expect(alliances).toHaveLength(2);
    expect(alliances[0]).toEqual({
      id: 1,
      worldId: 'hu119',
      name: 'Spartans',
      points: 150000,
      towns: 25,
      members: 10,
      rank: 1,
      abp: 4000,
      dbp: 2500,
      allBp: 6500
    });
  });

  test('parsePlayers nullifies invalid foreign alliance IDs', () => {
    const rawPlayers = [
      ['10', 'Leonidas', '1', '45000', '1', '6'],
      ['11', 'Pericles', '999', '32000', '2', '4'] // alliance 999 does not exist
    ];
    const validAllianceIds = new Set([1]);
    const killMaps = {
      pAttMap: new Map([[10, 1500]]),
      pDefMap: new Map([[10, 900]]),
      pAllMap: new Map([[10, 2400]])
    };

    const players = parsePlayers(rawPlayers, killMaps, validAllianceIds, 'hu119');
    expect(players[0].allianceId).toBe(1);
    expect(players[1].allianceId).toBeNull();
  });

  test('parseTowns nullifies invalid player IDs', () => {
    const rawTowns = [
      ['501', '10', 'Sparta Town', '510', '505', '3', '10500'],
      ['502', '9999', 'Ghost Town', '512', '505', '4', '8000']
    ];
    const validPlayerIds = new Set([10]);

    const towns = parseTowns(rawTowns, validPlayerIds, 'hu119');
    expect(towns[0].playerId).toBe(10);
    expect(towns[1].playerId).toBeNull();
  });

  test('parseIslands filters out far coordinates and uninhabited rocks', () => {
    const rawIslands = [
      ['1', '505', '505', '1', '20', '+wood', '-iron'], // Valid playable island
      ['2', '800', '800', '1', '20', '', ''],           // Exceeds radius 250 from 500,500
      ['3', '510', '510', '1', '0', '', '']             // 0 towns, not in populated coords
    ];
    const populatedCoords = new Set(['505,505']);

    const islands = parseIslands(rawIslands, populatedCoords, 'hu119');
    expect(islands).toHaveLength(1);
    expect(islands[0].id).toBe(1);
  });

  test('parseConquests filters conquests older than or equal to last epoch', () => {
    const rawConquests = [
      ['501', '1700000050', '10', '11', '1', '2', '10000'],
      ['502', '1700000020', '10', '12', '1', '2', '8500']
    ];
    const conquests = parseConquests(rawConquests, 1700000030, 'hu119');
    expect(conquests).toHaveLength(1);
    expect(conquests[0].townId).toBe(501);
  });
});

describe('WorldDeltaEngine: Pure Historical Delta & Mutation Engine', () => {
  test('computeAllianceDeltas calculates changes, deletions, and history deltas', () => {
    const incomingAlliances = [
      { id: 1, worldId: 'hu119', name: 'Spartans', points: 160000, towns: 26, members: 10, rank: 1, abp: 5000, dbp: 2600, allBp: 7600 },
      { id: 3, worldId: 'hu119', name: 'Corinthians', points: 40000, towns: 5, members: 3, rank: 5, abp: 500, dbp: 200, allBp: 700 }
    ];
    const currentAlliances = [
      { id: 1, worldId: 'hu119', name: 'Spartans', points: 150000, towns: 25, members: 10, rank: 1, abp: 4000, dbp: 2500, allBp: 6500 },
      { id: 2, worldId: 'hu119', name: 'Disbanded Alliance', points: 20000, towns: 2, members: 1, rank: 10, abp: 100, dbp: 50, allBp: 150 }
    ];

    const deltas = computeAllianceDeltas(incomingAlliances, currentAlliances, 'hu119');
    expect(deltas.toCreate).toHaveLength(1);
    expect(deltas.toCreate[0].id).toBe(3);
    expect(deltas.toDelete).toEqual([2]);
    expect(deltas.toUpdate).toHaveLength(1);
    expect(deltas.historyDeltas).toHaveLength(1);
    expect(deltas.historyDeltas[0]).toEqual({
      worldId: 'hu119',
      allianceId: 1,
      oldPoints: 150000,
      newPoints: 160000,
      abpDelta: 1000,
      dbpDelta: 100,
      allBpDelta: 1100
    });
  });

  test('computePlayerDeltas computes player point & BP deltas', () => {
    const incomingPlayers = [
      { id: 10, worldId: 'hu119', name: 'Leonidas', allianceId: 1, points: 50000, rank: 1, towns: 7, abp: 2000, dbp: 1000, allBp: 3000 }
    ];
    const currentPlayers = [
      { id: 10, worldId: 'hu119', name: 'Leonidas', allianceId: 1, points: 45000, rank: 1, towns: 6, abp: 1500, dbp: 900, allBp: 2400 }
    ];

    const deltas = computePlayerDeltas(incomingPlayers, currentPlayers, 'hu119');
    expect(deltas.toCreate).toHaveLength(0);
    expect(deltas.toUpdate).toHaveLength(1);
    expect(deltas.historyDeltas).toHaveLength(1);
    expect(deltas.historyDeltas[0].oldPoints).toBe(45000);
    expect(deltas.historyDeltas[0].newPoints).toBe(50000);
    expect(deltas.historyDeltas[0].abpDelta).toBe(500);
  });

  test('computeTownDeltas detects point increases and new towns', () => {
    const incomingTowns = [
      { id: 101, worldId: 'hu119', playerId: 10, name: 'Sparta Alpha', islandX: 500, islandY: 500, islandSlot: 1, points: 11000 },
      { id: 102, worldId: 'hu119', playerId: 10, name: 'Sparta Beta', islandX: 500, islandY: 500, islandSlot: 2, points: 4000 }
    ];
    const currentTowns = [
      { id: 101, worldId: 'hu119', playerId: 10, name: 'Sparta Alpha', islandX: 500, islandY: 500, islandSlot: 1, points: 10000 }
    ];

    const deltas = computeTownDeltas(incomingTowns, currentTowns, 'hu119');
    expect(deltas.toCreate).toHaveLength(1);
    expect(deltas.toCreate[0].id).toBe(102);
    expect(deltas.toUpdate).toHaveLength(1);
    expect(deltas.historyDeltas).toHaveLength(1);
    expect(deltas.historyDeltas[0].newPoints).toBe(11000);
  });

  test('computeIslandDeltas tracks availableTowns updates and removed islands', () => {
    const incomingIslands = [
      { id: 1, worldId: 'hu119', x: 500, y: 500, type: 1, availableTowns: 18, resourcePlus: '', resourceMinus: '' }
    ];
    const currentIslands = [
      { id: 1, worldId: 'hu119', availableTowns: 20 },
      { id: 2, worldId: 'hu119', availableTowns: 15 }
    ];

    const deltas = computeIslandDeltas(incomingIslands, currentIslands, 'hu119');
    expect(deltas.toUpdate).toHaveLength(1);
    expect(deltas.toUpdate[0].availableTowns).toBe(18);
    expect(deltas.toDelete).toEqual([2]);
  });
});

describe('WorldSyncPipeline: Orchestration and Freshness Engine', () => {
  test('validateWorldId strictly enforces lowercase alphanumeric pattern', () => {
    expect(WorldSyncPipeline.validateWorldId('hu119')).toBe('hu119');
    expect(WorldSyncPipeline.validateWorldId('EN125')).toBe('en125');

    expect(() => WorldSyncPipeline.validateWorldId("hu119' OR 1=1--")).toThrow(/Invalid worldId format/);
    expect(() => WorldSyncPipeline.validateWorldId('../../etc/passwd')).toThrow(/Invalid worldId format/);
    expect(() => WorldSyncPipeline.validateWorldId('')).toThrow(/Invalid worldId format/);
    expect(() => WorldSyncPipeline.validateWorldId(null)).toThrow(/Invalid worldId format/);
  });

  test('checkFreshness gates synchronizations younger than 20 minutes unless forced', async () => {
    const worldRecent = {
      id: 'hu119',
      lastSync: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
    };

    const throttled = await WorldSyncPipeline.checkFreshness(worldRecent, 'hu119', false);
    expect(throttled.isFresh).toBe(true);
    expect(throttled.reason).toContain('Throttled');

    const forced = await WorldSyncPipeline.checkFreshness(worldRecent, 'hu119', true);
    expect(forced.isFresh).toBe(false);
  });
});

describe('WorldOperationsAdapter: Unified Client Seam', () => {
  test('triggerWorldSync builds correct query parameters for single world force sync', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, worldId: 'hu119' })
    });

    const result = await WorldOperationsAdapter.triggerWorldSync({
      worldId: 'hu119',
      force: true,
      fetchImpl: mockFetch
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/world/sync?world=hu119&force=true'));
  });

  test('triggerWorldSync formats ?all=true parameter when syncAll is requested', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, totalWorlds: 3 })
    });

    await WorldOperationsAdapter.triggerWorldSync({
      syncAll: true,
      force: false,
      fetchImpl: mockFetch
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/world/sync?all=true');
  });

  test('rebuildWorldCaches sends POST request to /api/world/sync-cache', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, worldId: 'hu119' })
    });

    await WorldOperationsAdapter.rebuildWorldCaches('hu119', { fetchImpl: mockFetch });
    expect(mockFetch).toHaveBeenCalledWith('/api/world/sync-cache?world=hu119', { method: 'POST' });
  });

  test('cleanWorldIslands sends DELETE request with worldId and islandId', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, deleted: 1 })
    });

    await WorldOperationsAdapter.cleanWorldIslands({ worldId: 'hu119', islandId: 42, fetchImpl: mockFetch });
    expect(mockFetch).toHaveBeenCalledWith('/api/world/clean?worldId=hu119&islandId=42', { method: 'DELETE' });
  });

  test('saveWorld branches between POST (create) and PUT (edit)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    });

    // Create
    await WorldOperationsAdapter.saveWorld({ id: 'hu120', name: 'HU 120', isEditing: false }, { fetchImpl: mockFetch });
    expect(mockFetch).toHaveBeenLastCalledWith('/api/worlds', expect.objectContaining({ method: 'POST' }));

    // Edit
    await WorldOperationsAdapter.saveWorld({ id: 'hu120', name: 'HU 120', isEditing: true }, { fetchImpl: mockFetch });
    expect(mockFetch).toHaveBeenLastCalledWith('/api/worlds', expect.objectContaining({ method: 'PUT' }));
  });

  test('verifyAdminPassword passes passcode in request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    });

    await WorldOperationsAdapter.verifyAdminPassword('secret123', { fetchImpl: mockFetch });
    expect(mockFetch).toHaveBeenCalledWith('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'secret123' })
    });
  });
});
