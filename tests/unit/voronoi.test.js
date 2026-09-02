import { expect, test, describe } from 'vitest';
import { computeAllianceVoronoi, computeContestedFrontlines, VoronoiPoliticalEngine } from '../../src/lib/map/voronoi.js';

describe('Unit Test: src/lib/map/voronoi.js (Milestone 1)', () => {
  const sampleAlliances = [
    { id: 1, name: 'Olympian Guard', color: '#3b82f6' },
    { id: 2, name: 'Spartan Elite', color: '#ef4444' }
  ];

  const sampleTowns = [
    { id: 101, name: 'Olympus Alpha', islandX: 500, islandY: 500, allianceId: 1, points: 7000 },
    { id: 102, name: 'Olympus Beta', islandX: 505, islandY: 505, allianceId: 1, points: 6500 },
    { id: 103, name: 'Olympus Gamma', islandX: 510, islandY: 500, allianceId: 1, points: 8000 },
    { id: 201, name: 'Sparta Alpha', islandX: 520, islandY: 520, allianceId: 2, points: 9000 },
    { id: 202, name: 'Sparta Beta', islandX: 525, islandY: 525, allianceId: 2, points: 8500 }
  ];

  test('Module exports named and default functions', () => {
    expect(typeof computeAllianceVoronoi).toBe('function');
    expect(typeof computeContestedFrontlines).toBe('function');
    expect(typeof VoronoiPoliticalEngine.computeAllianceVoronoi).toBe('function');
    expect(typeof VoronoiPoliticalEngine.computeContestedFrontlines).toBe('function');
  });

  test('computeAllianceVoronoi generates valid GeoJSON FeatureCollection with polygons', () => {
    const res = computeAllianceVoronoi(sampleTowns, sampleAlliances);
    expect(res.type).toBe('FeatureCollection');
    expect(res.features.length).toBe(2);

    const ally1 = res.features.find(f => f.properties.allianceId === 1);
    const ally2 = res.features.find(f => f.properties.allianceId === 2);

    expect(ally1).toBeDefined();
    expect(ally1.properties.allianceName).toBe('Olympian Guard');
    expect(ally1.properties.color).toBe('#3b82f6');
    expect(ally1.properties.townCount).toBe(3);
    expect(ally1.properties.dominantShare).toBeCloseTo(0.60, 2);

    expect(ally2).toBeDefined();
    expect(ally2.properties.allianceName).toBe('Spartan Elite');
    expect(ally2.properties.color).toBe('#ef4444');
    expect(ally2.properties.townCount).toBe(2);
    expect(ally2.properties.dominantShare).toBeCloseTo(0.40, 2);
  });

  test('computeAllianceVoronoi respects customColors override', () => {
    const res = computeAllianceVoronoi(sampleTowns, sampleAlliances, {
      customColors: { 'Olympian Guard': '#10b981' }
    });
    const ally1 = res.features.find(f => f.properties.allianceId === 1);
    expect(ally1.properties.color).toBe('#10b981');
  });

  test('computeAllianceVoronoi filters by minTownCount', () => {
    const res = computeAllianceVoronoi(sampleTowns, sampleAlliances, { minTownCount: 3 });
    expect(res.features.length).toBe(1);
    expect(res.features[0].properties.allianceId).toBe(1);
  });

  test('computeAllianceVoronoi handles empty and boundary inputs safely', () => {
    expect(computeAllianceVoronoi([], []).features).toEqual([]);
    expect(computeAllianceVoronoi(null, []).features).toEqual([]);
    expect(computeAllianceVoronoi(undefined, []).features).toEqual([]);

    // Fallback alliance metadata when alliance list is empty
    const res = computeAllianceVoronoi(sampleTowns, []);
    expect(res.features.length).toBe(2);
    expect(res.features[0].properties.allianceName).toMatch(/Alliance #\d+/);
  });

  test('computeContestedFrontlines detects multi-alliance islands and inter-Voronoi borders', () => {
    const contestedIslandTowns = [
      { id: 1, islandX: 500, islandY: 500, allianceId: 1 },
      { id: 2, islandX: 500, islandY: 500, allianceId: 2 }
    ];

    const voronoi = computeAllianceVoronoi(sampleTowns, sampleAlliances);
    const frontlines = computeContestedFrontlines([...sampleTowns, ...contestedIslandTowns], voronoi);

    expect(frontlines.type).toBe('FeatureCollection');
    expect(frontlines.features.length).toBeGreaterThan(0);

    const islandClash = frontlines.features.find(f => f.properties.isContestedIsland);
    expect(islandClash).toBeDefined();
    expect(islandClash.properties.islandKey).toBe('500_500');
    expect(islandClash.properties.tension).toBeGreaterThan(0);
    expect(islandClash.geometry.type).toBe('LineString');
    expect(islandClash.geometry.coordinates.length).toBe(2);
  });

  test('computeContestedFrontlines handles empty inputs without throw', () => {
    expect(computeContestedFrontlines([], { features: [] }).features).toEqual([]);
    expect(computeContestedFrontlines(null, null).features).toEqual([]);
  });
});
