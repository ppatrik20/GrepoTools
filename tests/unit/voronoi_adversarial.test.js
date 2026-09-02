import { expect, test, describe } from 'vitest';
import { computeAllianceVoronoi, computeContestedFrontlines, VoronoiPoliticalEngine } from '../../src/lib/map/voronoi.js';

describe('Voronoi Adversarial Suite: Empirical Stress & Edge Case Verification', () => {

  // 1. Scale Stress: 1,000+ towns across 50 alliances
  test('Scale: 1,000+ towns across 50 alliances throughput and polygon generation', () => {
    const alliances = [];
    const towns = [];
    for (let a = 1; a <= 50; a++) {
      alliances.push({ id: a, name: `Coalition ${a}`, color: '#3b82f6' });
      for (let t = 1; t <= 25; t++) {
        towns.push({
          id: a * 1000 + t,
          name: `Town ${a}-${t}`,
          islandX: 250 + (a % 10) * 50 + (t % 5) * 5,
          islandY: 250 + Math.floor(a / 10) * 80 + Math.floor(t / 5) * 5,
          allianceId: a,
          points: 5000
        });
      }
    }
    const t0 = performance.now();
    const voronoi = computeAllianceVoronoi(towns, alliances);
    const frontlines = computeContestedFrontlines(towns, voronoi);
    const elapsed = performance.now() - t0;

    expect(voronoi.features.length).toBe(50);
    expect(frontlines.features.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(300);
  });

  // 2. Collinear Towns
  test('Geometry: Collinear towns in 1D alignments', () => {
    const collinear = [
      { id: 1, islandX: 100, islandY: 500, allianceId: 1 },
      { id: 2, islandX: 300, islandY: 500, allianceId: 1 },
      { id: 3, islandX: 500, islandY: 500, allianceId: 1 },
      { id: 4, islandX: 500, islandY: 100, allianceId: 2 },
      { id: 5, islandX: 500, islandY: 300, allianceId: 2 },
      { id: 6, islandX: 500, islandY: 500, allianceId: 2 }
    ];
    const voronoi = computeAllianceVoronoi(collinear, []);
    expect(voronoi.features.length).toBe(2);
    for (const f of voronoi.features) {
      for (const pt of f.geometry.coordinates[0]) {
        expect(Number.isFinite(pt[0])).toBe(true);
        expect(Number.isFinite(pt[1])).toBe(true);
      }
    }
  });

  // 3. Coincident Island Coordinates
  test('Geometry: Coincident coordinates across multiple alliances', () => {
    const towns = [
      { id: 1, islandX: 500, islandY: 500, allianceId: 1 },
      { id: 2, islandX: 500, islandY: 500, allianceId: 1 },
      { id: 3, islandX: 500, islandY: 500, allianceId: 2 },
      { id: 4, islandX: 500, islandY: 500, allianceId: 2 }
    ];
    const voronoi = computeAllianceVoronoi(towns, []);
    const frontlines = computeContestedFrontlines(towns, voronoi);
    const islandLine = frontlines.features.find(f => f.properties.isContestedIsland);
    expect(islandLine).toBeDefined();
    expect(islandLine.properties.tension).toBeGreaterThan(0);
  });

  // 4. Extreme Coordinates (Negative and Large)
  test('Coordinates: Negative and out-of-bounds coordinates produce finite GeoJSON', () => {
    const extremeTowns = [
      { id: 1, islandX: -500, islandY: -500, allianceId: 1 },
      { id: 2, islandX: -100, islandY: -100, allianceId: 1 },
      { id: 3, islandX: 5000, islandY: 5000, allianceId: 2 },
      { id: 4, islandX: 6000, islandY: 6000, allianceId: 2 }
    ];
    const voronoi = computeAllianceVoronoi(extremeTowns, []);
    expect(voronoi.features.length).toBe(2);
    for (const f of voronoi.features) {
      for (const pt of f.geometry.coordinates[0]) {
        expect(Number.isFinite(pt[0])).toBe(true);
        expect(Number.isFinite(pt[1])).toBe(true);
      }
    }
  });

  // 5. Disconnected Oceans
  test('Oceans: Disconnected far-corner ocean placement', () => {
    const towns = [
      { id: 1, islandX: 10, islandY: 10, allianceId: 1 },
      { id: 2, islandX: 990, islandY: 990, allianceId: 1 }
    ];
    const voronoi = computeAllianceVoronoi(towns, []);
    expect(voronoi.features.length).toBe(1);
    expect(voronoi.features[0].geometry.type).toBe('Polygon');
  });

  // 6. High-Frequency Iterations & Memory Profiling
  test('Performance: 5,000 iterations execute under 1 second without heap runaway', () => {
    const sampleTowns = [
      { id: 1, islandX: 500, islandY: 500, allianceId: 1 },
      { id: 2, islandX: 510, islandY: 510, allianceId: 1 },
      { id: 3, islandX: 520, islandY: 520, allianceId: 2 },
      { id: 4, islandX: 530, islandY: 530, allianceId: 2 }
    ];
    const sampleAlliances = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];

    const initialHeap = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    for (let i = 0; i < 5000; i++) {
      const v = computeAllianceVoronoi(sampleTowns, sampleAlliances);
      computeContestedFrontlines(sampleTowns, v);
    }
    const elapsed = performance.now() - t0;
    const finalHeap = process.memoryUsage().heapUsed;
    const heapDiffMB = (finalHeap - initialHeap) / (1024 * 1024);

    expect(elapsed).toBeLessThan(1000);
    expect(heapDiffMB).toBeLessThan(50);
  });

  // 7. Coordinate Sanitization: NaN and non-numeric coordinates produce valid finite GeoJSON
  test('Coordinates: NaN and non-numeric coordinates produce valid finite GeoJSON', () => {
    const badCoordsTowns = [
      { id: 1, islandX: NaN, islandY: NaN, allianceId: 1 },
      { id: 2, islandX: 'invalid', islandY: 'bad', allianceId: 1 }
    ];
    const voronoi = computeAllianceVoronoi(badCoordsTowns, []);
    expect(voronoi.features.length).toBe(1);
    const feature = voronoi.features[0];
    const sampleCoord = feature.geometry.coordinates[0][0];
    
    expect(Number.isFinite(sampleCoord[0])).toBe(true);
    expect(Number.isFinite(sampleCoord[1])).toBe(true);
    const jsonStr = JSON.stringify(voronoi);
    expect(jsonStr).not.toContain('null,null');
    expect(jsonStr).not.toContain('[null,null]');
  });

  // 8. Null Element Safety: null or undefined inside towns array handled safely without throwing
  test('Null Safety: null or undefined inside towns array handled safely', () => {
    expect(() => {
      const v = computeAllianceVoronoi([null, undefined, { id: 1, islandX: 500, islandY: 500, allianceId: 1 }, { id: 2, islandX: 510, islandY: 510, allianceId: 1 }], []);
      expect(v.features.length).toBe(1);
    }).not.toThrow();

    expect(() => {
      const f = computeContestedFrontlines([null, undefined, { id: 1, islandX: 500, islandY: 500, allianceId: 1 }], { features: [] });
      expect(f.type).toBe('FeatureCollection');
    }).not.toThrow();
  });

  // 9. Safe Options Handling: null options argument handled safely
  test('Options: null options argument handled safely without throwing', () => {
    const sampleTowns = [
      { id: 1, islandX: 500, islandY: 500, allianceId: 1 },
      { id: 2, islandX: 510, islandY: 510, allianceId: 1 }
    ];
    expect(() => {
      const v = computeAllianceVoronoi(sampleTowns, [], null);
      expect(v.features.length).toBe(1);
    }).not.toThrow();
  });

  // 10. Defensive GeoJSON Parsing: empty coordinates or null feature in voronoiData handled safely
  test('GeoJSON: empty coordinates or null feature in voronoiData handled safely', () => {
    const malformedData = {
      features: [
        null,
        { properties: { allianceId: 1, allianceName: 'A' }, geometry: { coordinates: [] } },
        { properties: { allianceId: 2, allianceName: 'B' }, geometry: { coordinates: [] } },
        { properties: null, geometry: null }
      ]
    };
    expect(() => {
      const f = computeContestedFrontlines([{ id: 1, islandX: 500, islandY: 500, allianceId: 1 }], malformedData);
      expect(f.type).toBe('FeatureCollection');
    }).not.toThrow();
  });

});
