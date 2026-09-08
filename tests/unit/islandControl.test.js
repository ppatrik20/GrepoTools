import { describe, test, expect } from 'vitest';
import { classifyIslands, buildCoalitionLookup, ISLAND_STATUS } from '../../src/lib/map/islandControl.js';

describe('Island Control & Sovereignty Engine', () => {
  const mockIslands = [
    { id: 1, x: 500, y: 500, availableTowns: 5, islandType: 1 },
    { id: 2, x: 510, y: 500, availableTowns: 2, islandType: 2 },
    { id: 3, x: 520, y: 500, availableTowns: 0, islandType: 1 },
    { id: 4, x: 530, y: 500, availableTowns: 10, islandType: 1 }
  ];

  test('Classifies 100% Clean Island correctly', () => {
    const mockTowns = [
      { id: 101, islandX: 500, islandY: 500, alliance: 'SION-REND', player: 'Player1' },
      { id: 102, islandX: 500, islandY: 500, alliance: 'SION-REND', player: 'Player2' },
      { id: 103, islandX: 500, islandY: 500, alliance: 'SION-REND', player: 'Player3' }
    ];

    const result = classifyIslands(mockIslands, mockTowns);
    const island500 = result.islandSummaryList.find(i => i.islandKey === '500_500');

    expect(island500).toBeDefined();
    expect(island500.status).toBe(ISLAND_STATUS.CLEAN);
    expect(island500.dominantAlliance).toBe('SION-REND');
    expect(island500.enemyCount).toBe(0);
    expect(island500.dominanceRatio).toBe(1.0);
    expect(result.cleanGeoJSON.features.length).toBe(1);
    expect(result.infiltratedGeoJSON.features.length).toBe(0);
  });

  test('Classifies Infiltrated Island (1-2 enemy towns) and highlights enemy beachheads', () => {
    const mockTowns = [
      // 10 towns of SION-REND
      { id: 1, islandX: 510, islandY: 500, alliance: 'SION-REND', player: 'Defender1' },
      { id: 2, islandX: 510, islandY: 500, alliance: 'SION-REND', player: 'Defender2' },
      { id: 3, islandX: 510, islandY: 500, alliance: 'SION-REND', player: 'Defender3' },
      { id: 4, islandX: 510, islandY: 500, alliance: 'SION-REND', player: 'Defender4' },
      { id: 5, islandX: 510, islandY: 500, alliance: 'SION-REND', player: 'Defender5' },
      // 1 enemy town of -WANTED-
      { id: 99, islandX: 510, islandY: 500, alliance: '-WANTED-', player: 'Infiltrator' }
    ];

    const result = classifyIslands(mockIslands, mockTowns);
    const island510 = result.islandSummaryList.find(i => i.islandKey === '510_500');

    expect(island510).toBeDefined();
    expect(island510.status).toBe(ISLAND_STATUS.INFILTRATED);
    expect(island510.dominantAlliance).toBe('SION-REND');
    expect(island510.enemyCount).toBe(1);
    expect(island510.enemyTowns.length).toBe(1);
    expect(island510.enemyTowns[0].id).toBe(99);

    // Should create 1 warning feature and 1 beachhead marker
    expect(result.infiltratedGeoJSON.features.length).toBe(1);
    expect(result.enemyBeachheadsGeoJSON.features.length).toBe(1);
    expect(result.enemyBeachheadsGeoJSON.features[0].properties.townId).toBe(99);
  });

  test('Classifies Contested Split Island correctly', () => {
    const mockTowns = [
      // 3 towns of Alliance A
      { id: 1, islandX: 520, islandY: 500, alliance: 'ALPHA', player: 'P1' },
      { id: 2, islandX: 520, islandY: 500, alliance: 'ALPHA', player: 'P2' },
      { id: 3, islandX: 520, islandY: 500, alliance: 'ALPHA', player: 'P3' },
      // 3 towns of Alliance B
      { id: 4, islandX: 520, islandY: 500, alliance: 'BETA', player: 'P4' },
      { id: 5, islandX: 520, islandY: 500, alliance: 'BETA', player: 'P5' },
      { id: 6, islandX: 520, islandY: 500, alliance: 'BETA', player: 'P6' }
    ];

    const result = classifyIslands(mockIslands, mockTowns);
    const island520 = result.islandSummaryList.find(i => i.islandKey === '520_500');

    expect(island520).toBeDefined();
    expect(island520.status).toBe(ISLAND_STATUS.CONTESTED);
    expect(result.contestedGeoJSON.features.length).toBe(1);
    expect(result.cleanGeoJSON.features.length).toBe(0);
    expect(result.infiltratedGeoJSON.features.length).toBe(0);
  });

  test('Recognizes Alliance Coalitions/Families so academy sister alliance counts as friendly clean', () => {
    const mockTowns = [
      { id: 1, islandX: 500, islandY: 500, alliance: 'SION-REND', player: 'MainPlayer' },
      { id: 2, islandX: 500, islandY: 500, alliance: 'SION-REND', player: 'MainPlayer2' },
      // Sister academy alliance on same island
      { id: 3, islandX: 500, islandY: 500, alliance: 'SION-REND AK.', player: 'AcademyPlayer' }
    ];

    const coalitions = [
      {
        id: 'sion_family',
        name: 'Sion Coalition',
        color: '#10b981',
        alliances: ['SION-REND', 'SION-REND AK.']
      }
    ];

    const result = classifyIslands(mockIslands, mockTowns, { coalitions });
    const island500 = result.islandSummaryList.find(i => i.islandKey === '500_500');

    expect(island500).toBeDefined();
    // Because both are in Sion Coalition, the island is 100% CLEAN!
    expect(island500.status).toBe(ISLAND_STATUS.CLEAN);
    expect(island500.dominantAlliance).toBe('Sion Coalition');
    expect(island500.dominantColor).toBe('#10b981');
    expect(island500.enemyCount).toBe(0);
  });
});
