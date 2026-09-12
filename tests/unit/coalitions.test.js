import { describe, test, expect } from 'vitest';
import { classifyIslands, buildCoalitionLookup, ISLAND_STATUS } from '../../src/lib/map/islandControl.js';
import { computeAllianceVoronoi, computeContestedFrontlines } from '../../src/lib/map/voronoi.js';
import { computeAllianceDominions } from '../../src/lib/map/dominions.js';

describe('Alliance Families & Coalitions Integration', () => {
  const mockIslands = [
    { id: 1, x: 500, y: 500, availableTowns: 0, islandType: 1 },
    { id: 2, x: 510, y: 500, availableTowns: 0, islandType: 1 },
    { id: 3, x: 520, y: 500, availableTowns: 0, islandType: 1 }
  ];

  const testCoalition = {
    id: 'coalition-uuid-1',
    name: 'Sion Family',
    color: '#10b981',
    allianceIds: [100, 101],
    alliances: ['SION-REND', 'SION-REND AK.']
  };

  test('buildCoalitionLookup indexes by name, object, and alliance ID', () => {
    const lookup = buildCoalitionLookup([testCoalition]);

    expect(lookup.get('sion-rend')).toBe(testCoalition);
    expect(lookup.get('sion-rend ak.')).toBe(testCoalition);
    expect(lookup.get('100')).toBe(testCoalition);
    expect(lookup.get('101')).toBe(testCoalition);
    expect(lookup.get('sion family')).toBe(testCoalition);
  });

  test('classifyIslands merges sister alliances as 100% CLEAN under coalition name and color', () => {
    const mockTowns = [
      { id: 1, islandX: 500, islandY: 500, alliance: 'SION-REND', allianceId: 100, player: 'MainPlayer' },
      { id: 2, islandX: 500, islandY: 500, alliance: 'SION-REND AK.', allianceId: 101, player: 'AcademyPlayer' },
      { id: 3, islandX: 500, islandY: 500, alliance: 'SION-REND', allianceId: 100, player: 'MainPlayer2' }
    ];

    const result = classifyIslands(mockIslands, mockTowns, { coalitions: [testCoalition] });
    const island = result.islandSummaryList.find(i => i.islandKey === '500_500');

    expect(island).toBeDefined();
    expect(island.status).toBe(ISLAND_STATUS.CLEAN);
    expect(island.dominantAlliance).toBe('Sion Family');
    expect(island.dominantColor).toBe('#10b981');
    expect(island.enemyCount).toBe(0);
    expect(island.dominanceRatio).toBe(1.0);
  });

  test('computeAllianceVoronoi merges coalition member towns into a unified territory', () => {
    const mockTowns = [
      // SION-REND
      { id: 1, islandX: 500, islandY: 500, player: { name: 'P1', alliance: { id: 100, name: 'SION-REND' } } },
      { id: 2, islandX: 502, islandY: 501, player: { name: 'P2', alliance: { id: 100, name: 'SION-REND' } } },
      // SION-REND AK.
      { id: 3, islandX: 501, islandY: 502, player: { name: 'P3', alliance: { id: 101, name: 'SION-REND AK.' } } },
      { id: 4, islandX: 503, islandY: 500, player: { name: 'P4', alliance: { id: 101, name: 'SION-REND AK.' } } }
    ];

    const alliances = [
      { id: 100, name: 'SION-REND', color: '#3b82f6' },
      { id: 101, name: 'SION-REND AK.', color: '#8b5cf6' }
    ];

    const voronoi = computeAllianceVoronoi(mockTowns, alliances, {
      coalitions: [testCoalition],
      minTownCount: 2
    });

    // Instead of two separate polygons for 100 and 101, they are unified under the coalition!
    expect(voronoi.features.length).toBe(1);
    const feature = voronoi.features[0];
    expect(feature.properties.allianceName).toBe('Sion Family');
    expect(feature.properties.color).toBe('#10b981');
    expect(feature.properties.isCoalition).toBe(true);
    expect(feature.properties.townCount).toBe(4);
  });

  test('computeContestedFrontlines does NOT flag friendly sister alliances on the same island', () => {
    const mockTowns = [
      // Friendly sister alliances on island 500_500
      { id: 1, islandX: 500, islandY: 500, alliance: 'SION-REND', player: { name: 'P1', alliance: { id: 100 } } },
      { id: 2, islandX: 500, islandY: 500, alliance: 'SION-REND AK.', player: { name: 'P2', alliance: { id: 101 } } }
    ];

    const frontlines = computeContestedFrontlines(mockTowns, { features: [] }, { coalitions: [testCoalition] });
    const islandLines = frontlines.features.filter(f => f.properties.isContestedIsland);

    // No friendly frontlines drawn!
    expect(islandLines.length).toBe(0);
  });

  test('computeContestedFrontlines DOES flag genuine enemies occupying the same island', () => {
    const mockTowns = [
      // Friendly sister alliances on island 500_500
      { id: 1, islandX: 500, islandY: 500, alliance: 'SION-REND', player: { name: 'P1', alliance: { id: 100 } } },
      // Enemy town on same island
      { id: 2, islandX: 500, islandY: 500, alliance: '-WANTED-', player: { name: 'Enemy', alliance: { id: 999 } } }
    ];

    const frontlines = computeContestedFrontlines(mockTowns, { features: [] }, { coalitions: [testCoalition] });
    const islandLines = frontlines.features.filter(f => f.properties.isContestedIsland);

    expect(islandLines.length).toBe(1);
    expect(islandLines[0].properties.islandKey).toBe('500_500');
    expect(islandLines[0].properties.allianceA).toBe('Sion Family');
    expect(islandLines[0].properties.allianceB).toBe('-WANTED-');
  });

  test('computeAllianceDominions groups towns by coalition', () => {
    const mockTowns = [
      { id: 1, islandX: 500, islandY: 500, alliance: 'SION-REND', allianceId: 100 },
      { id: 2, islandX: 501, islandY: 500, alliance: 'SION-REND AK.', allianceId: 101 },
      { id: 3, islandX: 502, islandY: 501, alliance: 'SION-REND', allianceId: 100 }
    ];

    const dominions = computeAllianceDominions(mockTowns, [], {}, { coalitions: [testCoalition] });

    // Should create polygons for 'Sion Family'
    expect(dominions.polygons.features.length).toBe(1);
    expect(dominions.polygons.features[0].properties.alliance).toBe('Sion Family');
    expect(dominions.polygons.features[0].properties.color).toBe('#10b981');
  });

  test('classifyIslands identifies frontline confrontation islands vs safe core heartland', () => {
    const islands = [
      { id: 1, x: 500, y: 500, availableTowns: 0, islandType: 1 },
      { id: 2, x: 503, y: 500, availableTowns: 0, islandType: 1 },
      { id: 3, x: 550, y: 550, availableTowns: 0, islandType: 1 }
    ];

    const towns = [
      // Sion Family on island 1 (close to enemy)
      { id: 1, islandX: 500, islandY: 500, alliance: 'SION-REND', allianceId: 100, player: 'P1' },
      // Enemy on island 2 (adjacent frontline, ~3 units = ~1.08 deg away)
      { id: 2, islandX: 503, islandY: 500, alliance: '-WANTED-', allianceId: 999, player: 'E1' },
      // Sion Family on island 3 (deep in heartland, > 50 units away)
      { id: 3, islandX: 550, islandY: 550, alliance: 'SION-REND AK.', allianceId: 101, player: 'P2' }
    ];

    const result = classifyIslands(islands, towns, { coalitions: [testCoalition] });

    const frontIsland = result.islandSummaryList.find(i => i.islandKey === '500_500');
    const safeIsland = result.islandSummaryList.find(i => i.islandKey === '550_550');
    const enemyFront = result.islandSummaryList.find(i => i.islandKey === '503_500');

    // Island 1 is frontline confronting WANTED
    expect(frontIsland.isFrontline).toBe(true);
    expect(frontIsland.threatLevel).toBe('CRITICAL');
    expect(frontIsland.frontlineRival).toBe('-WANTED-');
    expect(frontIsland.isSafeCore).toBe(false);

    // Enemy Island 2 is frontline confronting Sion Family
    expect(enemyFront.isFrontline).toBe(true);
    expect(enemyFront.frontlineRival).toBe('Sion Family');

    // Island 3 is deep in safe core heartland
    expect(safeIsland.isFrontline).toBe(false);
    expect(safeIsland.threatLevel).toBe('NONE');
    expect(safeIsland.isSafeCore).toBe(true);

    // Frontline GeoJSON collection has exactly the frontline islands
    expect(result.frontlineIslandsGeoJSON.features.length).toBe(2);
    expect(result.frontlineIslandsGeoJSON.features[0].properties.combatLabel).toContain('⚔️');
  });

  test('computeMaritimeBoundaries generates non-looping perpendicular demarcation barriers', async () => {
    const { computeMaritimeBoundaries } = await import('../../src/lib/map/maritimeBoundaries.js');

    const islands = [
      { id: 1, x: 500, y: 500, availableTowns: 0, islandType: 1 },
      { id: 2, x: 503, y: 500, availableTowns: 0, islandType: 1 }
    ];
    const towns = [
      { id: 1, islandX: 500, islandY: 500, alliance: 'SION-REND', allianceId: 100, player: 'P1' },
      { id: 2, islandX: 503, islandY: 500, alliance: '-WANTED-', allianceId: 999, player: 'E1' }
    ];

    const classification = classifyIslands(islands, towns, { coalitions: [testCoalition] });
    const boundaries = computeMaritimeBoundaries(classification.islandSummaryList);

    expect(boundaries.frontlinesGeoJSON.features.length).toBe(1);
    const barrier = boundaries.frontlinesGeoJSON.features[0];

    // Every barrier is a straight, non-looping 2-point LineString
    expect(barrier.geometry.type).toBe('LineString');
    expect(barrier.geometry.coordinates.length).toBe(2);
    expect(barrier.properties.type).toBe('demarcation_barrier');
    expect(barrier.properties.isFrontline).toBe(true);

    // No macro labels generated for single-island 1-town outposts
    expect(boundaries.macroLabelsGeoJSON.features.length).toBe(0);
  });
});
