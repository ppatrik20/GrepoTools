import { describe, it, expect, vi } from 'vitest';
import zlib from 'zlib';
import { WorldSyncPipeline, safeDecodeField } from '../../src/lib/world/WorldSyncPipeline.js';
import { WorldCacheCompiler } from '../../src/lib/world/WorldCacheCompiler.js';
import {
  compileGeoJsonSnapshot,
  compileOceanSummarySnapshot,
  generateGeoJSON
} from '../../src/lib/geojson.js';
import {
  computeEntityMomentum,
  enrichConquestsAndActivity,
  compileScoreboardSnapshot,
  generateScoreboardData
} from '../../src/lib/scoreboard.js';
import { PALETTE } from '../../src/lib/constants.js';

describe('Phase 5: WorldSyncPipeline & WorldCacheCompiler In-Process Projections', () => {
  describe('WorldSyncPipeline validation, decoding & freshness', () => {
    it('validates alphanumeric worldId and blocks injection characters', () => {
      expect(WorldSyncPipeline.validateWorldId('HU119')).toBe('hu119');
      expect(() => WorldSyncPipeline.validateWorldId("hu119'; DROP TABLE--")).toThrow(/Invalid worldId format/);
      expect(() => WorldSyncPipeline.validateWorldId('')).toThrow(/Invalid worldId format/);
    });

    it('safely decodes URL-encoded fields including malformed sequences', () => {
      expect(safeDecodeField('Alpha+Legion%21')).toBe('Alpha Legion!');
      expect(safeDecodeField('Broken%E0%A4%A+Name')).toBe('Broken%E0%A4%A Name');
    });

    it('throttles sync when lastSync is within 20 minutes unless force is true', async () => {
      const recentWorld = {
        id: 'hu119',
        lastSync: new Date(Date.now() - 5 * 60 * 1000)
      };

      const throttled = await WorldSyncPipeline.checkFreshness(recentWorld, 'hu119', false);
      expect(throttled.isFresh).toBe(true);
      expect(throttled.reason).toContain('Throttled');

      const forced = await WorldSyncPipeline.checkFreshness(recentWorld, 'hu119', true);
      expect(forced.isFresh).toBe(false);
    });
  });

  describe('WorldSyncPipeline.persistWorldDeltas history createMany optimization', () => {
    it('inserts AllianceHistory, PlayerHistory, and TownHistory via createMany instead of raw SQL concatenation', async () => {
      const mockPrisma = {
        alliance: { createMany: vi.fn().mockResolvedValue({ count: 1 }), deleteMany: vi.fn() },
        player: { createMany: vi.fn().mockResolvedValue({ count: 1 }), updateMany: vi.fn(), deleteMany: vi.fn() },
        town: { createMany: vi.fn().mockResolvedValue({ count: 1 }), updateMany: vi.fn(), deleteMany: vi.fn() },
        island: { createMany: vi.fn().mockResolvedValue({ count: 1 }), deleteMany: vi.fn() },
        allianceHistory: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        playerHistory: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        townHistory: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        conquest: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        $executeRawUnsafe: vi.fn().mockResolvedValue(1),
        $transaction: vi.fn(async (ops) => Promise.all(ops))
      };

      const allianceHistoryRow = {
        allianceId: 10,
        worldId: 'hu119',
        oldPoints: 1000,
        newPoints: 1500,
        abpDelta: 50,
        dbpDelta: 20,
        allBpDelta: 70
      };
      const playerHistoryRow = {
        playerId: 100,
        worldId: 'hu119',
        oldPoints: 500,
        newPoints: 750,
        abpDelta: 25,
        dbpDelta: 10,
        allBpDelta: 35
      };
      const townHistoryRow = {
        townId: 1000,
        worldId: 'hu119',
        oldPoints: 250,
        newPoints: 350
      };

      await WorldSyncPipeline.persistWorldDeltas(
        {
          worldId: 'hu119',
          allianceDeltas: { toCreate: [], toUpdate: [], toDelete: [], historyDeltas: [allianceHistoryRow] },
          playerDeltas: { toCreate: [], toUpdate: [], toDelete: [], historyDeltas: [playerHistoryRow] },
          townDeltas: { toCreate: [], toUpdate: [], toDelete: [], historyDeltas: [townHistoryRow] },
          islandDeltas: { toCreate: [], toUpdate: [], toDelete: [] },
          newConquers: []
        },
        mockPrisma
      );

      expect(mockPrisma.allianceHistory.createMany).toHaveBeenCalledWith({ data: [allianceHistoryRow] });
      expect(mockPrisma.playerHistory.createMany).toHaveBeenCalledWith({ data: [playerHistoryRow] });
      expect(mockPrisma.townHistory.createMany).toHaveBeenCalledWith({ data: [townHistoryRow] });
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('falls back to $executeRawUnsafe if history model createMany is not provided on a minimal mock client', async () => {
      const mockPrisma = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(1),
        $transaction: vi.fn(async (ops) => Promise.all(ops))
      };

      await WorldSyncPipeline.persistWorldDeltas(
        {
          worldId: 'hu119',
          allianceDeltas: {
            toCreate: [],
            toUpdate: [],
            toDelete: [],
            historyDeltas: [{ allianceId: 1, worldId: 'hu119', oldPoints: 10, newPoints: 20, abpDelta: 1, dbpDelta: 0, allBpDelta: 1 }]
          },
          playerDeltas: { toCreate: [], toUpdate: [], toDelete: [], historyDeltas: [] },
          townDeltas: { toCreate: [], toUpdate: [], toDelete: [], historyDeltas: [] },
          islandDeltas: { toCreate: [], toUpdate: [], toDelete: [] },
          newConquers: []
        },
        mockPrisma
      );

      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    });
  });

  describe('Pure GeoJSON & Ocean Projections (geojson.js)', () => {
    const sampleSnapshot = {
      alliances: [
        { id: 1, name: 'Spartans', towns: 25 },
        { id: 2, name: 'Athenians', towns: 15 }
      ],
      players: [
        { id: 101, name: 'Leonidas', allianceId: 1 },
        { id: 102, name: 'Pericles', allianceId: 2 }
      ],
      islands: [
        // Inside circular world border (500, 500 -> distSq = 0)
        { id: 5001, x: 500, y: 500, type: 1, availableTowns: 18, resourcePlus: 'wood', resourceMinus: 'silver' },
        // Outside circular world border (100, 100 -> distSq = 160000 + 160000 > 62500)
        { id: 9999, x: 100, y: 100, type: 1, availableTowns: 20, resourcePlus: 'iron', resourceMinus: 'wood' }
      ],
      towns: [
        { id: 2001, name: 'Sparta Prime', points: 10500, islandX: 500, islandY: 500, islandSlot: 0, playerId: 101 },
        { id: 2002, name: 'Sparta Outpost', points: 6000, islandX: 500, islandY: 500, islandSlot: 1, playerId: 101 },
        { id: 2003, name: 'Athens Port', points: 3000, islandX: 500, islandY: 500, islandSlot: 2, playerId: 102 }
      ]
    };

    it('compiles GeoJSON snapshot purely in memory with Top 10 PALETTE and circular border filtering', async () => {
      const geojson = compileGeoJsonSnapshot(sampleSnapshot);
      expect(geojson.type).toBe('FeatureCollection');

      const islandFeatures = geojson.features.filter(f => f.properties.renderType === 'island');
      expect(islandFeatures).toHaveLength(1);
      expect(islandFeatures[0].properties.id).toBe(5001);
      expect(islandFeatures[0].properties.dominantAlliance).toBe('Spartans');
      expect(islandFeatures[0].properties.islandColor).toBe(PALETTE[0]);

      const townFeatures = geojson.features.filter(f => f.properties.renderType === 'town');
      expect(townFeatures).toHaveLength(3);
      const spartaPrime = townFeatures.find(f => f.properties.id === 2001);
      expect(spartaPrime.properties.alliance).toBe('Spartans');
      expect(spartaPrime.properties.townColor).toBe(PALETTE[0]);
      expect(spartaPrime.properties.stage).toBe(5);

      // Verify generateGeoJSON with snapshot does not call prismaClient
      const brokenPrisma = {
        town: { findMany: vi.fn(() => { throw new Error('Should not query DB when snapshot is provided'); }) }
      };
      const fromGenerate = await generateGeoJSON('hu119', { snapshot: sampleSnapshot, prismaClient: brokenPrisma });
      expect(fromGenerate.features.length).toBe(geojson.features.length);
      expect(brokenPrisma.town.findMany).not.toHaveBeenCalled();
    });

    it('compiles Ocean summary snapshot sharing the same PALETTE, boundary filter, and dominant alliance logic', () => {
      const oceanSummary = compileOceanSummarySnapshot({
        oceanId: '55',
        ...sampleSnapshot
      });

      expect(oceanSummary.islands).toHaveLength(1);
      expect(oceanSummary.islands[0]).toMatchObject({
        id: 5001,
        x: 500,
        y: 500,
        colonizedCount: 3,
        color: PALETTE[0],
        alliance: 'Spartans'
      });
      expect(oceanSummary.towns).toHaveLength(3);
      expect(oceanSummary.towns[0]).toMatchObject({
        id: 2001,
        player: 'Leonidas',
        alliance: 'Spartans'
      });
    });
  });

  describe('Pure Scoreboard, Momentum & Enrichment Helpers (scoreboard.js)', () => {
    const fixedNow = new Date('2026-10-21T12:00:00.000Z');
    const nowMs = fixedNow.getTime();
    const hourMs = 60 * 60 * 1000;

    it('computes entity momentum trends (Window A vs Window B) and recentGain', () => {
      const entities = [
        { id: 101, name: 'Leonidas', points: 50000, abp: 20000, dbp: 10000, allBp: 30000 }
      ];
      const historyRows = [
        // Window A (2 hours ago): +3000 pts, +1200 abp, +400 dbp
        { playerId: 101, oldPoints: 47000, newPoints: 50000, abpDelta: 1200, dbpDelta: 400, timestamp: new Date(nowMs - 2 * hourMs) },
        // Window B (30 hours ago): +1500 pts, +600 abp, +400 dbp
        { playerId: 101, oldPoints: 45500, newPoints: 47000, abpDelta: 600, dbpDelta: 400, timestamp: new Date(nowMs - 30 * hourMs) }
      ];
      const conquests = [
        { townId: 1, newPlayerId: 101, oldPlayerId: 102, timestamp: new Date(nowMs - 3 * hourMs) }
      ];

      const results = computeEntityMomentum({
        entities,
        historyByEntityId: historyRows,
        conquests,
        entityType: 'player',
        nowMs,
        windowHours: 24
      });

      expect(results).toHaveLength(1);
      expect(results[0].recentGain).toMatchObject({
        points: 3000,
        attackPoints: 1200,
        defendPoints: 400,
        towns: 1
      });
      expect(results[0].trendPts).toBe(100); // (3000 - 1500) / 1500 * 100 = +100%
      expect(results[0].trendAbp).toBe(100);
      expect(results[0].trendDbp).toBe(0);
      expect(results[0].conquests).toBe(1);
      expect(results[0].losses).toBe(0);
    });

    it('enriches conquests and computes 7-day pointDelta and lastActive', async () => {
      const t1 = new Date('2026-10-16T00:00:00.000Z');
      const t2 = new Date('2026-10-20T00:00:00.000Z');
      const historyRows = [
        { playerId: 101, oldPoints: 10000, newPoints: 12000, timestamp: t1 },
        { playerId: 101, oldPoints: 12000, newPoints: 15500, timestamp: t2 }
      ];
      const conquests = [
        { id: 1, townId: 2001, oldPlayerId: 102, newPlayerId: 101, oldAllianceId: 2, newAllianceId: 1 }
      ];

      const { conquests: enriched, activity } = await enrichConquestsAndActivity({
        conquests,
        historyRows,
        entityIds: [101],
        entityField: 'playerId',
        worldId: 'hu119',
        preloadedPlayersMap: new Map([
          [101, { id: 101, name: 'Leonidas' }],
          [102, { id: 102, name: 'Pericles' }]
        ]),
        preloadedAlliancesMap: new Map([
          [1, { id: 1, name: 'Spartans' }],
          [2, { id: 2, name: 'Athenians' }]
        ])
      });

      expect(activity).toEqual({
        pointDelta: 5500,
        lastActive: t2
      });
      expect(enriched[0].newPlayerObj).toEqual({ id: 101, name: 'Leonidas' });
      expect(enriched[0].oldPlayerObj).toEqual({ id: 102, name: 'Pericles' });
      expect(enriched[0].newAllianceObj).toEqual({ id: 1, name: 'Spartans' });
      expect(enriched[0].oldAllianceObj).toEqual({ id: 2, name: 'Athenians' });
    });

    it('compiles scoreboard snapshot purely in memory without touching Prisma', async () => {
      const snapshot = {
        worldId: 'hu119',
        now: fixedNow,
        players: [
          { id: 101, name: 'Leonidas', allianceId: 1, points: 50000, abp: 20000, dbp: 10000, allBp: 30000 }
        ],
        alliances: [
          { id: 1, name: 'Spartans', points: 50000, abp: 20000, dbp: 10000, allBp: 30000 }
        ],
        towns: [
          { id: 2001, name: 'Sparta Prime', islandX: 500, islandY: 500 }
        ],
        conquests: [
          { id: 1, townId: 2001, newPlayerId: 101, oldPlayerId: null, newAllianceId: 1, oldAllianceId: null, timestamp: new Date(nowMs - 30 * 60 * 1000) }
        ],
        playerHistoryRows: [
          { playerId: 101, oldPoints: 48000, newPoints: 50000, abpDelta: 500, dbpDelta: 100, timestamp: new Date(nowMs - 30 * 60 * 1000) }
        ],
        allianceHistoryRows: [
          { allianceId: 1, oldPoints: 48000, newPoints: 50000, abpDelta: 500, dbpDelta: 100, timestamp: new Date(nowMs - 30 * 60 * 1000) }
        ]
      };

      const direct = compileScoreboardSnapshot(snapshot);
      expect(direct.worldId).toBe('hu119');
      expect(direct.players.pts[0]).toMatchObject({
        id: 101,
        name: 'Leonidas',
        gainsAPts: 2000
      });
      expect(direct.players.momentumPts[0]).toMatchObject({
        id: 101,
        momentum: 2000,
        recentGain: 2000
      });
      expect(direct.conquests[0]).toMatchObject({
        townName: 'Sparta Prime',
        newPlayer: 'Leonidas',
        newAlliance: 'Spartans'
      });

      const brokenPrisma = {
        world: { findUnique: vi.fn(() => { throw new Error('Should not query DB when snapshot is provided'); }) }
      };
      const viaGenerator = await generateScoreboardData('hu119', { snapshot, prismaClient: brokenPrisma });
      expect(viaGenerator.players.pts).toEqual(direct.players.pts);
      expect(brokenPrisma.world.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('WorldCacheCompiler per-world persistence & HTTP cache serving seam', () => {
    it('persists caches per-world via world.update without calling syncMetadata.upsert', async () => {
      const mockPrisma = {
        world: {
          update: vi.fn().mockResolvedValue({ id: 'hu119' })
        },
        syncMetadata: {
          upsert: vi.fn()
        }
      };

      await WorldCacheCompiler.persistWorldCaches(
        'hu119',
        { scoreboardGzip: 'sb-b64', geoJsonGzip: 'geo-b64' },
        mockPrisma
      );

      expect(mockPrisma.world.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.world.update).toHaveBeenCalledWith({
        where: { id: 'hu119' },
        data: {
          scoreboardCache: 'sb-b64',
          geoJsonCache: 'geo-b64'
        }
      });
      expect(mockPrisma.syncMetadata.upsert).not.toHaveBeenCalled();
    });

    it('serves ETag 304, compressed binary buffer on cache hit, and JSON fallback on cache miss', async () => {
      const lastSync = new Date('2026-10-21T12:00:00.000Z');
      const expectedEtag = `W/"hu119-${lastSync.getTime()}"`;
      const samplePayload = { worldId: 'hu119', ok: true };
      const gzipBase64 = zlib.gzipSync(JSON.stringify(samplePayload)).toString('base64');

      const mockPrisma = {
        world: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'hu119',
            lastSync,
            scoreboardCache: gzipBase64
          })
        }
      };

      // 1. ETag match -> 304 Not Modified
      const notModifiedRes = await WorldCacheCompiler.serveCompressedWorldCache({
        request: new Request('https://example.com/api/world/scoreboard?world=hu119', {
          headers: { 'if-none-match': expectedEtag }
        }),
        worldId: 'hu119',
        cacheField: 'scoreboardCache',
        prismaClient: mockPrisma
      });
      expect(notModifiedRes.status).toBe(304);

      // 2. Cache hit -> 200 gzipped binary stream
      const hitRes = await WorldCacheCompiler.serveCompressedWorldCache({
        request: new Request('https://example.com/api/world/scoreboard?world=hu119'),
        worldId: 'hu119',
        cacheField: 'scoreboardCache',
        prismaClient: mockPrisma
      });
      expect(hitRes.status).toBe(200);
      expect(hitRes.headers.get('Content-Encoding')).toBe('gzip');
      expect(hitRes.headers.get('ETag')).toBe(expectedEtag);
      const rawBytes = Buffer.from(await hitRes.arrayBuffer());
      const decompressed = JSON.parse(zlib.gunzipSync(rawBytes).toString('utf-8'));
      expect(decompressed).toEqual(samplePayload);

      // 3. Cache miss -> fallback generator
      mockPrisma.world.findUnique.mockResolvedValueOnce({ id: 'hu119', lastSync, scoreboardCache: null });
      const fallbackFn = vi.fn().mockResolvedValue({ fallback: true });
      const missRes = await WorldCacheCompiler.serveCompressedWorldCache({
        request: new Request('https://example.com/api/world/scoreboard?world=hu119'),
        worldId: 'hu119',
        cacheField: 'scoreboardCache',
        generateFallback: fallbackFn,
        prismaClient: mockPrisma
      });
      expect(missRes.status).toBe(200);
      expect(fallbackFn).toHaveBeenCalledWith('hu119', { prismaClient: mockPrisma });
      expect(await missRes.json()).toEqual({ fallback: true });
    });
  });
});
