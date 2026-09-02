import { expect, test, describe } from 'vitest';
import { 
  calculateArcTrajectory, 
  getTransitProgress, 
  calculateSnipingSynchronization 
} from '../../src/lib/map/trajectories.js';

describe('Milestone 3: Trajectory & Animated Transit Engine Unit Tests', () => {
  describe('Bézier Arcing Flight Paths', () => {
    test('calculates smooth curved path between distant map points', () => {
      const origin = { islandX: 450, islandY: 450 };
      const target = { islandX: 550, islandY: 550 };
      const curve = calculateArcTrajectory(origin, target, 0.20, 30);

      expect(curve.length).toBe(31); // 0 to 30 inclusive
      expect(curve[0][0]).toBeCloseTo(((450 / 1000) * 360 - 180), 3);
      expect(curve[30][0]).toBeCloseTo(((550 / 1000) * 360 - 180), 3);

      // Arc peak should have higher latitude than straight midpoint
      const midPoint = curve[15];
      const straightLatMid = (curve[0][1] + curve[30][1]) / 2;
      expect(midPoint[1]).toBeGreaterThan(straightLatMid);
    });

    test('returns single point for identical origin and target', () => {
      const p = { islandX: 500, islandY: 500 };
      const curve = calculateArcTrajectory(p, p);
      expect(curve.length).toBe(1);
    });

    test('handles empty or undefined inputs safely', () => {
      expect(calculateArcTrajectory(null, null)).toEqual([]);
    });
  });

  describe('Transit Progress & Tangent Rotation', () => {
    const transit = {
      id: 'transit_1',
      startTime: 1000,
      landingTime: 2000,
      curveCoordinates: [
        [-10, -10],
        [0, 5],
        [10, 10]
      ]
    };

    test('returns starting position at startTime', () => {
      const p = getTransitProgress(transit, 1000);
      expect(p.currentLngLat).toEqual([-10, -10]);
      expect(p.isCompleted).toBe(false);
      expect(p.remainingSeconds).toBe(1);
    });

    test('interpolates midpoint and calculates positive tangent angle', () => {
      const p = getTransitProgress(transit, 1500);
      expect(p.currentLngLat).toEqual([0, 5]);
      expect(p.rotationDegrees).toBeGreaterThanOrEqual(0);
      expect(p.rotationDegrees).toBeLessThan(360);
      expect(p.isCompleted).toBe(false);
    });

    test('marks as completed when currentTime exceeds landingTime', () => {
      const p = getTransitProgress(transit, 2500);
      expect(p.isCompleted).toBe(true);
      expect(p.remainingSeconds).toBe(0);
      expect(p.currentLngLat).toEqual([10, 10]);
    });
  });

  describe('Multi-Origin Sniping Synchronization', () => {
    test('calculates synchronized launch times for multiple cities landing at exact landingTime', () => {
      const target = { id: 99, name: 'Siege Target', islandX: 500, islandY: 500 };
      const origins = [
        { id: 1, name: 'Close City', islandX: 503, islandY: 504 }, // dist 5.0
        { id: 2, name: 'Far City', islandX: 506, islandY: 508 }     // dist 10.0
      ];

      const landingTime = Date.now() + 3600000; // 1 hour in future
      const plans = calculateSnipingSynchronization(origins, target, landingTime, 3, 3, 1);

      expect(plans).toHaveLength(2);
      expect(plans[0].distance).toBe(5.0);
      expect(plans[1].distance).toBe(10.0);
      expect(plans[0].durationSeconds).toBe(1667);
      expect(plans[1].durationSeconds).toBe(3333);
      expect(plans[0].landingTimeMs).toBe(landingTime);
      expect(plans[1].landingTimeMs).toBe(landingTime);
      expect(plans[0].launchTimeMs).toBeGreaterThan(plans[1].launchTimeMs); // Far city must launch earlier
      expect(plans[0].isFeasible).toBe(true);
      expect(plans[1].isFeasible).toBe(true);
    });
  });
});
