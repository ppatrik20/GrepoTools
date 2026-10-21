import { describe, it, expect, vi } from 'vitest';
import { WorldOperationsAdapter } from '../../src/lib/world/WorldOperationsAdapter.js';

function createMockFetch(responsePayload, { ok = true, status = 200 } = {}) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => responsePayload
  });
}

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, val) => store.set(key, String(val))),
    removeItem: vi.fn((key) => store.delete(key)),
    _store: store
  };
}

describe('WorldOperationsAdapter', () => {
  describe('backwards-compatible world management methods', () => {
    it('fetchWorldOverview loads worlds and active world status in parallel', async () => {
      const fetchImpl = vi.fn(async (url) => {
        if (url === '/api/worlds') {
          return { ok: true, json: async () => ({ success: true, worlds: [{ id: 'hu119', name: 'HU119' }] }) };
        }
        return { ok: true, json: async () => ({ lastSync: '2026-10-21T08:00:00Z' }) };
      });

      const res = await WorldOperationsAdapter.fetchWorldOverview('hu119', { fetchImpl });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(res.worlds).toHaveLength(1);
      expect(res.activeWorldStatus).toEqual({ lastSync: '2026-10-21T08:00:00Z' });
    });

    it('triggerWorldSync builds query params for world and force flag', async () => {
      const fetchImpl = createMockFetch({ success: true, synced: 'hu119' });
      const res = await WorldOperationsAdapter.triggerWorldSync({
        worldId: 'HU119',
        force: true,
        fetchImpl
      });

      expect(fetchImpl).toHaveBeenCalledWith('/api/world/sync?world=hu119&force=true');
      expect(res.success).toBe(true);
    });
  });

  describe('fetchEntityIntel', () => {
    it('fetches and normalizes town intelligence while preserving raw response fields', async () => {
      const rawResponse = {
        town: {
          id: 42,
          name: 'Sparta',
          points: 11250,
          islandX: 500,
          islandY: 500,
          islandSlot: 3,
          player: {
            id: 7,
            name: 'Leonidas',
            alliance: { id: 9, name: 'Lacedaemon' }
          }
        },
        activity: { pointDelta: 420 },
        history: [{ date: '2026-10-20', points: 10830, delta: 420 }],
        conquests: [{ id: 1, townId: 42, townPoints: 11250 }]
      };
      const fetchImpl = createMockFetch(rawResponse);

      const intel = await WorldOperationsAdapter.fetchEntityIntel({
        worldId: 'hu119',
        type: 'town',
        id: 42,
        fetchImpl
      });

      expect(fetchImpl).toHaveBeenCalledWith('/api/world/town/42?world=hu119');
      expect(intel.entityType).toBe('town');
      expect(intel.entityData).toEqual(rawResponse.town);
      expect(intel.displayName).toBe('Sparta');
      expect(intel.allianceName).toBe('Lacedaemon');
      expect(intel.points).toBe(11250);
      expect(intel.conquests).toEqual(rawResponse.conquests);
      expect(intel.history).toEqual(rawResponse.history);
      expect(intel.town).toEqual(rawResponse.town);
      expect(intel.activity).toEqual({ pointDelta: 420 });
    });

    it('fetches and normalizes player intelligence', async () => {
      const rawResponse = {
        player: {
          id: 7,
          name: 'Leonidas',
          points: 85000,
          rank: 3,
          abp: 45000,
          dbp: 12000,
          alliance: { id: 9, name: 'Lacedaemon' }
        },
        towns: [{ id: 42, name: 'Sparta', points: 11250 }],
        conquests: [],
        history: []
      };
      const fetchImpl = createMockFetch(rawResponse);

      const intel = await WorldOperationsAdapter.fetchEntityIntel({
        worldId: 'hu119',
        type: 'player',
        id: 7,
        fetchImpl
      });

      expect(fetchImpl).toHaveBeenCalledWith('/api/world/player/7?world=hu119');
      expect(intel.entityType).toBe('player');
      expect(intel.displayName).toBe('Leonidas');
      expect(intel.allianceName).toBe('Lacedaemon');
      expect(intel.points).toBe(85000);
      expect(intel.towns).toHaveLength(1);
      expect(intel.player.rank).toBe(3);
    });

    it('fetches and normalizes alliance intelligence', async () => {
      const rawResponse = {
        alliance: {
          id: 9,
          name: 'Lacedaemon',
          points: 1250000,
          rank: 1
        },
        members: [{ id: 7, name: 'Leonidas', points: 85000 }],
        conquests: [{ id: 10, townId: 99 }]
      };
      const fetchImpl = createMockFetch(rawResponse);

      const intel = await WorldOperationsAdapter.fetchEntityIntel({
        worldId: 'hu119',
        type: 'alliance',
        id: 9,
        fetchImpl
      });

      expect(fetchImpl).toHaveBeenCalledWith('/api/world/alliance/9?world=hu119');
      expect(intel.entityType).toBe('alliance');
      expect(intel.displayName).toBe('Lacedaemon');
      expect(intel.allianceName).toBe('Lacedaemon');
      expect(intel.points).toBe(1250000);
      expect(intel.members).toHaveLength(1);
      expect(intel.conquests).toHaveLength(1);
    });

    it('fetches and normalizes island intelligence by coordinates', async () => {
      const rawResponse = {
        towns: [
          { id: 1, name: 'Alpha', points: 5000 },
          { id: 2, name: 'Beta', points: 7500 }
        ]
      };
      const fetchImpl = createMockFetch(rawResponse);

      const intel = await WorldOperationsAdapter.fetchEntityIntel({
        worldId: 'hu119',
        type: 'island',
        x: 512,
        y: 488,
        fetchImpl
      });

      expect(fetchImpl).toHaveBeenCalledWith('/api/world/island?world=hu119&x=512&y=488');
      expect(intel.entityType).toBe('island');
      expect(intel.displayName).toBe('Island (512, 488)');
      expect(intel.points).toBe(12500);
      expect(intel.towns).toHaveLength(2);
    });

    it('throws on unsupported entity type or missing id', async () => {
      await expect(
        WorldOperationsAdapter.fetchEntityIntel({ type: 'unknown', id: 1 })
      ).rejects.toThrow('Unsupported entity type: unknown');

      await expect(
        WorldOperationsAdapter.fetchEntityIntel({ type: 'town' })
      ).rejects.toThrow('Entity id is required for town intelligence');
    });
  });

  describe('fetchScoreboardData & fetchMomentumData', () => {
    it('fetches scoreboard data for a given world', async () => {
      const payload = {
        alliances: { pts: [{ id: 1, name: 'Argos', points: 50000 }] },
        players: { pts: [{ id: 2, name: 'Perseus', points: 25000 }] },
        conquests: []
      };
      const fetchImpl = createMockFetch(payload);

      const res = await WorldOperationsAdapter.fetchScoreboardData('HU119', { fetchImpl });
      expect(fetchImpl).toHaveBeenCalledWith('/api/world/scoreboard?world=hu119');
      expect(res.alliances.pts).toHaveLength(1);
      expect(res.players.pts).toHaveLength(1);
    });

    it('fetches momentum data with playerIds, allianceIds, windowHours, and search', async () => {
      const fetchImpl = createMockFetch({
        results: [{ id: 10, name: 'Achilles', trendPts: 14, gainsAPts: 3200 }]
      });

      const res = await WorldOperationsAdapter.fetchMomentumData({
        worldId: 'hu119',
        windowHours: 24,
        playerIds: [10, 20],
        search: 'Ach',
        type: 'player',
        fetchImpl
      });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const calledUrl = fetchImpl.mock.calls[0][0];
      expect(calledUrl).toContain('/api/world/momentum?');
      expect(calledUrl).toContain('world=hu119');
      expect(calledUrl).toContain('windowHours=24');
      expect(calledUrl).toContain('playerIds=10%2C20');
      expect(calledUrl).toContain('ids=10%2C20');
      expect(calledUrl).toContain('q=Ach');
      expect(res.results).toHaveLength(1);
      expect(res.results[0].name).toBe('Achilles');
    });
  });

  describe('searchWorldEntities & fetchHourlyHistory', () => {
    it('searches world entities and normalizes result arrays', async () => {
      const fetchImpl = createMockFetch({
        players: [{ id: 5, name: 'Odysseus', points: 42000 }],
        alliances: [{ id: 2, name: 'Ithaca', points: 120000 }]
      });

      const res = await WorldOperationsAdapter.searchWorldEntities({
        worldId: 'HU119',
        query: '  Ody ',
        type: 'player',
        fetchImpl
      });

      expect(fetchImpl).toHaveBeenCalledWith('/api/world/search?world=hu119&q=Ody&type=player', undefined);
      expect(res.players).toHaveLength(1);
      expect(res.alliances).toHaveLength(1);
      expect(res.towns).toEqual([]);
    });

    it('fetches hourly history for an entity', async () => {
      const fetchImpl = createMockFetch({
        history: [{ time: '03:00', ptsDelta: 500, cumulativePts: 500 }]
      });

      const res = await WorldOperationsAdapter.fetchHourlyHistory({
        worldId: 'hu119',
        type: 'player',
        id: 5,
        fetchImpl
      });

      expect(fetchImpl).toHaveBeenCalledWith('/api/world/history/hourly?world=hu119&type=player&id=5');
      expect(res.history).toHaveLength(1);
    });
  });

  describe('loadPinnedEntities & savePinnedEntities', () => {
    it('persists and loads world-scoped pinned players and alliances', () => {
      const storage = createMemoryStorage();
      const pinnedPlayers = [{ id: 1, name: 'Ajax' }];
      const pinnedAlliances = [{ id: 9, name: 'Achaea' }];

      WorldOperationsAdapter.savePinnedEntities(
        'HU119',
        { pinnedPlayers, pinnedAlliances },
        { storage }
      );

      expect(storage.setItem).toHaveBeenCalledWith(
        'grepoPinnedPlayers_hu119',
        JSON.stringify(pinnedPlayers)
      );
      expect(storage.setItem).toHaveBeenCalledWith(
        'grepoPinnedAlliances_hu119',
        JSON.stringify(pinnedAlliances)
      );

      const loaded = WorldOperationsAdapter.loadPinnedEntities('hu119', { storage });
      expect(loaded).toEqual({ pinnedPlayers, pinnedAlliances });
    });

    it('gracefully handles corrupt storage JSON', () => {
      const storage = createMemoryStorage({
        grepoPinnedPlayers_hu119: '{broken-json',
        grepoPinnedAlliances_hu119: 'null'
      });

      const loaded = WorldOperationsAdapter.loadPinnedEntities('hu119', { storage });
      expect(loaded).toEqual({ pinnedPlayers: [], pinnedAlliances: [] });
    });
  });

  describe('saveTownConfiguration, fetchTownRoster, and fetchTroopCatalog', () => {
    it('always sends worldId in PUT /api/towns when saving town configuration', async () => {
      const fetchImpl = createMockFetch({ success: true, townId: 777 });

      const result = await WorldOperationsAdapter.saveTownConfiguration({
        worldId: 'HU119',
        townId: 777,
        specialization: 'ls_nuke',
        buildings: { harbor: 30, farm: 45 },
        plowResearched: true,
        hasThermalBaths: true,
        bunksResearched: false,
        fetchImpl
      });

      expect(fetchImpl).toHaveBeenCalledWith('/api/towns', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worldId: 'hu119',
          townId: 777,
          specialization: 'ls_nuke',
          buildings: { harbor: 30, farm: 45 },
          plowResearched: true,
          hasThermalBaths: true,
          bunksResearched: false
        })
      });
      expect(result.success).toBe(true);
    });

    it('rejects saveTownConfiguration when townId is missing', async () => {
      await expect(
        WorldOperationsAdapter.saveTownConfiguration({ worldId: 'hu119' })
      ).rejects.toThrow('townId is required to save town configuration');
    });
  });
});
