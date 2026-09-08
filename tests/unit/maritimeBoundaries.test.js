import { describe, test, expect } from 'vitest';
import { classifyIslands, ISLAND_STATUS } from '../../src/lib/map/islandControl.js';
import { computeMaritimeBoundaries } from '../../src/lib/map/maritimeBoundaries.js';

describe('Maritime Ocean Territorial Boundaries Engine', () => {
  const mockIslands = [
    // Alliance Alpha Archipelago (3 islands close together)
    { id: 1, x: 500, y: 500, availableTowns: 5, islandType: 1 },
    { id: 2, x: 508, y: 502, availableTowns: 4, islandType: 1 },
    { id: 3, x: 504, y: 508, availableTowns: 3, islandType: 1 },
    // Alliance Beta Archipelago (Adjacent frontline islands)
    { id: 4, x: 518, y: 500, availableTowns: 2, islandType: 1 },
    { id: 5, x: 524, y: 504, availableTowns: 1, islandType: 1 }
  ];

  const mockTowns = [
    // Alpha towns on Islands 1, 2, 3
    { id: 101, islandX: 500, islandY: 500, alliance: 'ALPHA', player: 'P1' },
    { id: 102, islandX: 500, islandY: 500, alliance: 'ALPHA', player: 'P2' },
    { id: 103, islandX: 508, islandY: 502, alliance: 'ALPHA', player: 'P3' },
    { id: 104, islandX: 508, islandY: 502, alliance: 'ALPHA', player: 'P3b' },
    { id: 105, islandX: 508, islandY: 502, alliance: 'ALPHA', player: 'P3c' },
    { id: 106, islandX: 504, islandY: 508, alliance: 'ALPHA', player: 'P4' },
    // Beta towns on Islands 4, 5
    { id: 201, islandX: 518, islandY: 500, alliance: 'BETA', player: 'B1' },
    { id: 202, islandX: 518, islandY: 500, alliance: 'BETA', player: 'B2' },
    { id: 203, islandX: 524, islandY: 504, alliance: 'BETA', player: 'B3' }
  ];

  test('Generates continuous ocean basins for allied island archipelagos', () => {
    const classification = classifyIslands(mockIslands, mockTowns);
    const result = computeMaritimeBoundaries(classification.islandSummaryList);

    expect(result.oceanBasinsGeoJSON.type).toBe('FeatureCollection');
    expect(result.oceanBasinsGeoJSON.features.length).toBeGreaterThanOrEqual(2);

    const alphaBasin = result.oceanBasinsGeoJSON.features.find(f => f.properties.allianceName === 'ALPHA');
    const betaBasin = result.oceanBasinsGeoJSON.features.find(f => f.properties.allianceName === 'BETA');

    expect(alphaBasin).toBeDefined();
    expect(alphaBasin.properties.islandCount).toBe(3);
    expect(alphaBasin.properties.cleanIslandCount).toBe(3);
    expect(alphaBasin.geometry.type).toBe('Polygon');
    expect(alphaBasin.geometry.coordinates[0].length).toBeGreaterThan(4);

    expect(betaBasin).toBeDefined();
    expect(betaBasin.properties.islandCount).toBe(2);
  });

  test('Computes maritime frontline borders where opposing alliance waters meet', () => {
    const classification = classifyIslands(mockIslands, mockTowns);
    const result = computeMaritimeBoundaries(classification.islandSummaryList);

    expect(result.frontlinesGeoJSON.type).toBe('FeatureCollection');
    expect(result.frontlinesGeoJSON.features.length).toBeGreaterThan(0);

    const frontline = result.frontlinesGeoJSON.features[0];
    expect(frontline.geometry.type).toBe('LineString');
    expect(frontline.properties.isFrontline).toBe(true);
    expect(frontline.properties.tension).toBeGreaterThan(0);
  });

  test('Produces distinct island halos for clean, infiltrated, and contested islands', () => {
    // Add an enemy town to Island 2 to make it Infiltrated
    const modifiedTowns = [
      ...mockTowns,
      { id: 999, islandX: 508, islandY: 502, alliance: 'BETA', player: 'Spy' }
    ];

    const classification = classifyIslands(mockIslands, modifiedTowns);
    const result = computeMaritimeBoundaries(classification.islandSummaryList);

    const halos = result.islandHalosGeoJSON.features;
    expect(halos.length).toBe(5);

    const haloClean = halos.find(h => h.properties.islandKey === '500_500');
    const haloInfiltrated = halos.find(h => h.properties.islandKey === '508_502');

    expect(haloClean.properties.haloType).toBe('clean');
    expect(haloClean.properties.strokeColor).toBe('#10b981');

    expect(haloInfiltrated.properties.haloType).toBe('infiltrated');
    expect(haloInfiltrated.properties.haloColor).toBe('#f59e0b');
    expect(haloInfiltrated.properties.strokeColor).toBe('#ef4444');
  });

  test('Handles empty and null inputs safely', () => {
    const empty = computeMaritimeBoundaries([]);
    expect(empty.oceanBasinsGeoJSON.features).toHaveLength(0);
    expect(empty.frontlinesGeoJSON.features).toHaveLength(0);
    expect(empty.islandHalosGeoJSON.features).toHaveLength(0);
  });
});
