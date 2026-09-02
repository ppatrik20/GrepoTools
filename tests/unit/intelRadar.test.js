import { expect, test, describe } from 'vitest';
import { 
  filterIntelOverlays, 
  estimateGhostVacancyDays, 
  calculateFarmActivityScore, 
  getFarmRating,
  IntelRadarEngine
} from '../../src/lib/map/intelRadar.js';

describe('Milestone 2: Intel Radar Engine Unit Tests', () => {
  describe('Ghost Hunter Vacancy Calculation', () => {
    test('calculates 1 day for maximum point town (13,716 pts)', () => {
      expect(estimateGhostVacancyDays(13716)).toBe(1);
    });

    test('calculates ~90 days for minimum point town (175 pts)', () => {
      const days = estimateGhostVacancyDays(175);
      expect(days).toBeGreaterThanOrEqual(89);
      expect(days).toBeLessThanOrEqual(91);
    });

    test('clamps negative and zero points safely', () => {
      expect(estimateGhostVacancyDays(0)).toBe(91);
      expect(estimateGhostVacancyDays(-500)).toBe(91);
    });

    test('handles non-numeric inputs gracefully', () => {
      expect(estimateGhostVacancyDays(null)).toBe(91);
      expect(estimateGhostVacancyDays(undefined)).toBe(91);
      expect(estimateGhostVacancyDays('invalid')).toBe(91);
    });
  });

  describe('Inactive Farm Finder Activity Scoring', () => {
    test('calculates correct activity score for collapsing player', () => {
      // 10,000 pts with -50,000 momentum drop: 10000*0.1 - (-50000)*2 = 1000 + 100000 = 101,000
      const score = calculateFarmActivityScore(10000, -50000);
      expect(score).toBe(101000);
    });

    test('handles stagnant player with 0 momentum change', () => {
      const score = calculateFarmActivityScore(5000, 0);
      expect(score).toBe(500);
    });

    test('clamps negative scores to zero', () => {
      const score = calculateFarmActivityScore(100, 5000);
      expect(score).toBe(0);
    });

    test('assigns accurate farm rating tiers', () => {
      expect(getFarmRating(9500)).toBe('HIGH');
      expect(getFarmRating(8001)).toBe('HIGH');
      expect(getFarmRating(8000)).toBe('MEDIUM');
      expect(getFarmRating(5000)).toBe('MEDIUM');
      expect(getFarmRating(3001)).toBe('MEDIUM');
      expect(getFarmRating(3000)).toBe('LOW');
      expect(getFarmRating(500)).toBe('LOW');
      expect(getFarmRating(0)).toBe('LOW');
    });
  });

  describe('filterIntelOverlays Aggregation & Filtering', () => {
    const towns = [
      { id: 1, name: 'Ghost Alpha', islandX: 500, islandY: 500, isGhost: true, points: 9000 },
      { id: 2, name: 'Ghost Beta', islandX: 510, islandY: 510, player: 'Ghost Town', points: 2000 },
      { id: 3, name: 'Active Fortress', islandX: 520, islandY: 520, playerId: 10, player: 'Ares', points: 12000 },
      { id: 4, name: 'Inactive Empire', islandX: 530, islandY: 530, playerId: 20, player: 'Sloth', points: 8500 },
      { id: 5, name: 'Besieged Haven', islandX: 540, islandY: 540, playerId: 30, player: 'Defender', isBesieged: true, points: 6000 }
    ];

    const players = [
      { id: 10, name: 'Ares', momentumDelta: 1500 },
      { id: 20, name: 'Sloth', momentumDelta: -2000 },
      { id: 30, name: 'Defender', momentumDelta: -100 }
    ];

    const conquests = [
      { townId: 5, time: Date.now() - 3600000 } // 1 hour ago
    ];

    test('returns empty collections when all radars are inactive', () => {
      const res = filterIntelOverlays(towns, players, conquests, { ghostHunter: false, activeSiege: false, inactiveFarms: false });
      expect(res.ghosts.features).toHaveLength(0);
      expect(res.sieges.features).toHaveLength(0);
      expect(res.inactiveFarms.features).toHaveLength(0);
    });

    test('filters ghost towns and respects minGhostPoints threshold', () => {
      const res1 = filterIntelOverlays(towns, players, conquests, { ghostHunter: true, minGhostPoints: 0 });
      expect(res1.ghosts.features).toHaveLength(2);
      expect(res1.ghosts.features.map(f => f.properties.townId)).toContain(1);
      expect(res1.ghosts.features.map(f => f.properties.townId)).toContain(2);

      const res2 = filterIntelOverlays(towns, players, conquests, { ghostHunter: true, minGhostPoints: 5000 });
      expect(res2.ghosts.features).toHaveLength(1);
      expect(res2.ghosts.features[0].properties.townId).toBe(1);
    });

    test('identifies active sieges and conquests within recency window', () => {
      const res = filterIntelOverlays(towns, players, conquests, { activeSiege: true, recentHours: 48 });
      expect(res.sieges.features).toHaveLength(1);
      expect(res.sieges.features[0].properties.townId).toBe(5);
      expect(res.sieges.features[0].properties.recentConquestCount).toBe(1);
      expect(res.sieges.features[0].properties.isContested).toBe(true);
    });

    test('identifies inactive farms and excludes active players', () => {
      const res = filterIntelOverlays(towns, players, conquests, { inactiveFarms: true, maxMomentumDelta: 0 });
      expect(res.inactiveFarms.features).toHaveLength(2); // Sloth (-2000) and Defender (-100)
      const slothFarm = res.inactiveFarms.features.find(f => f.properties.townId === 4);
      expect(slothFarm).toBeDefined();
      expect(slothFarm.properties.farmRating).toBe('HIGH');
      expect(slothFarm.properties.momentumDelta).toBe(-2000);

      // Ares (momentum +1500) must be excluded
      const aresFarm = res.inactiveFarms.features.find(f => f.properties.townId === 3);
      expect(aresFarm).toBeUndefined();
    });

    test('handles empty and malformed inputs with 100% resilience', () => {
      const res = filterIntelOverlays(null, null, null, null);
      expect(res.ghosts.type).toBe('FeatureCollection');
      expect(res.sieges.type).toBe('FeatureCollection');
      expect(res.inactiveFarms.type).toBe('FeatureCollection');
    });
  });
});
