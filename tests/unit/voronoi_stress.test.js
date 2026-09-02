import { expect, test, describe } from 'vitest';
import { computeAllianceVoronoi, computeContestedFrontlines, VoronoiPoliticalEngine } from '../../src/lib/map/voronoi.js';

describe('Adversarial Stress & Resilience Suite: src/lib/map/voronoi.js', () => {

  function validateGeoJSONStructure(featureCollection) {
    expect(featureCollection).toBeDefined();
    expect(featureCollection.type).toBe('FeatureCollection');
    expect(Array.isArray(featureCollection.features)).toBe(true);
  }

  function validateNoNaNOrNullCoords(featureCollection) {
    for (const f of featureCollection.features) {
      expect(f.geometry).toBeDefined();
      const checkCoords = (coords) => {
        if (typeof coords[0] === 'number') {
          expect(Number.isFinite(coords[0])).toBe(true);
          expect(Number.isFinite(coords[1])).toBe(true);
        } else if (Array.isArray(coords)) {
          coords.forEach(checkCoords);
        }
      };
      checkCoords(f.geometry.coordinates);
    }
  }

  // -------------------------------------------------------------
  // Benchmark 1: 1,000+ towns across 50 alliances
  // -------------------------------------------------------------
  test('Benchmark: 1,000+ towns across 50 alliances throughput', () => {
    const allianceCount = 50;
    const townsPerAlliance = 25; // 1,250 towns total
    const alliances = [];
    const towns = [];

    for (let a = 1; a <= allianceCount; a++) {
      alliances.push({ id: a, name: 'Coalition ' + a, color: '#3b82f6' });
      for (let t = 1; t <= townsPerAlliance; t++) {
        towns.push({
          id: a * 1000 + t,
          name: 'City ' + a + '-' + t,
          islandX: 250 + (a % 10) * 50 + (t % 5) * 5,
          islandY: 250 + Math.floor(a / 10) * 80 + Math.floor(t / 5) * 5,
          allianceId: a,
          points: 5000 + (t * 100)
        });
      }
    }

    const t0 = performance.now();
    const voronoi = computeAllianceVoronoi(towns, alliances);
    const tVoronoi = performance.now();
    const frontlines = computeContestedFrontlines(towns, voronoi);
    const tFrontlines = performance.now();

    expect(voronoi.features.length).toBe(allianceCount);
    validateNoNaNOrNullCoords(voronoi);
    validateNoNaNOrNullCoords(frontlines);

    expect(tVoronoi - t0).toBeLessThan(100);
    expect(tFrontlines - tVoronoi).toBeLessThan(200);
  });

  // -------------------------------------------------------------
  // Benchmark 2: 5,000 towns across 100 alliances
  // -------------------------------------------------------------
  test('Benchmark: 5,000 towns across 100 alliances throughput', () => {
    const allianceCount = 100;
    const townsPerAlliance = 50;
    const alliances = [];
    const towns = [];

    for (let a = 1; a <= allianceCount; a++) {
      alliances.push({ id: a, name: 'Empire ' + a, color: '#ff0000' });
      for (let t = 1; t <= townsPerAlliance; t++) {
        towns.push({
          id: a * 10000 + t,
          islandX: 100 + (t % 10) * 80,
          islandY: 100 + (a % 10) * 80,
          allianceId: a
        });
      }
    }

    const t0 = performance.now();
    const voronoi = computeAllianceVoronoi(towns, alliances);
    const frontlines = computeContestedFrontlines(towns, voronoi);
    const totalDuration = performance.now() - t0;

    expect(voronoi.features.length).toBe(allianceCount);
    validateNoNaNOrNullCoords(voronoi);
    validateNoNaNOrNullCoords(frontlines);
    expect(totalDuration).toBeLessThan(500);
  });

  // -------------------------------------------------------------
  // Benchmark 3: Collinear Towns (Horizontal, Vertical, Diagonal)
  // -------------------------------------------------------------
  test('Degenerate Geometry: Collinear town alignment', () => {
    const collinear = [
      { id: 1, islandX: 100, islandY: 500, allianceId: 1 },
      { id: 2, islandX: 300, islandY: 500, allianceId: 1 },
      { id: 3, islandX: 500, islandY: 500, allianceId: 1 },
      { id: 4, islandX: 500, islandY: 100, allianceId: 2 },
      { id: 5, islandX: 500, islandY: 300, allianceId: 2 },
      { id: 6, islandX: 500, islandY: 500, allianceId: 2 },
      { id: 7, islandX: 200, islandY: 200, allianceId: 3 },
      { id: 8, islandX: 400, islandY: 400, allianceId: 3 }
    ];

    const voronoi = computeAllianceVoronoi(collinear, []);
    expect(voronoi.features.length).toBe(3);
    validateNoNaNOrNullCoords(voronoi);

    const frontlines = computeContestedFrontlines(collinear, voronoi);
    validateNoNaNOrNullCoords(frontlines);
  });

  // -------------------------------------------------------------
  // Benchmark 4: Coincident Coordinates
  // -------------------------------------------------------------
  test('Degenerate Geometry: Coincident identical coordinates', () => {
    const towns = [];
    const alliances = [];
    for (let a = 1; a <= 10; a++) {
      alliances.push({ id: a, name: 'Alliance ' + a });
      for (let t = 1; t <= 5; t++) {
        towns.push({ id: a * 100 + t, islandX: 500, islandY: 500, allianceId: a });
      }
    }
    const voronoi = computeAllianceVoronoi(towns, alliances);
    expect(voronoi.features.length).toBe(10);
    validateNoNaNOrNullCoords(voronoi);

    const frontlines = computeContestedFrontlines(towns, voronoi);
    expect(frontlines.features.length).toBeGreaterThan(0);
    validateNoNaNOrNullCoords(frontlines);
  });

  // -------------------------------------------------------------
  // Benchmark 5: Disconnected Ocean Clusters
  // -------------------------------------------------------------
  test('Spatial Distribution: Far disconnected ocean corners', () => {
    const towns = [
      { id: 1, islandX: 10, islandY: 10, allianceId: 1 },
      { id: 2, islandX: 990, islandY: 10, allianceId: 1 },
      { id: 3, islandX: 10, islandY: 990, allianceId: 1 },
      { id: 4, islandX: 990, islandY: 990, allianceId: 1 }
    ];

    const voronoi = computeAllianceVoronoi(towns, []);
    expect(voronoi.features.length).toBe(1);
    validateNoNaNOrNullCoords(voronoi);
  });

  // -------------------------------------------------------------
  // Benchmark 6: High Frequency Loop & Memory Stability
  // -------------------------------------------------------------
  test('Memory & Loop Stability: 5,000 iterations', () => {
    const sampleTowns = [
      { id: 1, islandX: 500, islandY: 500, allianceId: 1 },
      { id: 2, islandX: 510, islandY: 510, allianceId: 1 },
      { id: 3, islandX: 520, islandY: 520, allianceId: 2 },
      { id: 4, islandX: 530, islandY: 530, allianceId: 2 }
    ];
    const sampleAlliances = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];

    const initialMemory = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    for (let i = 0; i < 5000; i++) {
      const v = computeAllianceVoronoi(sampleTowns, sampleAlliances);
      computeContestedFrontlines(sampleTowns, v);
    }
    const elapsed = performance.now() - t0;
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowthMB = (finalMemory - initialMemory) / (1024 * 1024);

    expect(elapsed).toBeLessThan(1000);
    expect(memoryGrowthMB).toBeLessThan(50);
  });

});
