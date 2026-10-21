import { describe, test, expect } from 'vitest';
import {
  getWonderLevelCosts,
  calculateMaxFavorReductions,
  calculateWonderPoints,
  isEligibleToContribute,
  auditWonderFortress,
  rankEnemyWonderBreachTargets,
  WONDER_METADATA
} from '../../src/lib/endgame/wonderEngine.js';

describe('World Wonders Engine (A világ csodái)', () => {
  test('scales resource costs accurately by world speed', () => {
    // Level 1 on 1x speed = 200,000 each
    const l1Speed1 = getWonderLevelCosts(1, 1);
    expect(l1Speed1.wood).toBe(200000);
    expect(l1Speed1.stone).toBe(200000);
    expect(l1Speed1.silver).toBe(200000);
    expect(l1Speed1.favorReductionSeconds).toBe(100);

    // Level 10 on 3x speed = 23,800,000 * 3 = 71,400,000
    const l10Speed3 = getWonderLevelCosts(10, 3);
    expect(l10Speed3.wood).toBe(71400000);
    expect(l10Speed3.stone).toBe(71400000);
    expect(l10Speed3.silver).toBe(71400000);
  });

  test('calculates 50% max favor build time reduction limit', () => {
    // Level 1: build time 7020s, favor reduction 100s per cast. Max 50% = 3510s / 100 = 35 casts
    const maxCastsL1 = calculateMaxFavorReductions(1, 1);
    expect(maxCastsL1.maxCasts).toBe(35);
    expect(maxCastsL1.maxSecondsReduced).toBe(3500);
    expect(maxCastsL1.minBuildTimeSeconds).toBe(3520);
  });

  test('calculates cumulative WW points and 400-point 4/7 victory bonus', () => {
    // Level 9 wonder = 1+2+3+4+5+6+7+8+9 = 45 points
    // Level 5 wonder = 1+2+3+4+5 = 15 points
    // Level 1 wonder = 1 point
    // Total = 45 + 15 + 1 = 61
    const pointsNonWinner = calculateWonderPoints([9, 5, 1], false);
    expect(pointsNonWinner).toBe(61);

    // Winner gets +400 extra points
    const pointsWinner = calculateWonderPoints([10, 10, 10, 10], true);
    // 4 x 55 = 220 + 400 = 620
    expect(pointsWinner).toBe(620);
  });

  test('enforces 72-hour alliance membership cooldown for contributions', () => {
    const now = new Date('2026-10-21T12:00:00Z');
    
    // Joined 71 hours ago -> ineligible
    const joined71h = new Date('2026-10-18T13:00:00Z');
    expect(isEligibleToContribute(joined71h, now)).toBe(false);

    // Joined 73 hours ago -> eligible
    const joined73h = new Date('2026-10-18T11:00:00Z');
    expect(isEligibleToContribute(joined73h, now)).toBe(true);
  });

  test('audits Wonder Fortress island for empty foundation slots and Vacation Mode hazard', () => {
    const mockIsland = {
      islandKey: '500_500',
      islandType: 1, // Large 20-slot island
      availableTowns: 2 // 2 empty foundation slots! Hazard!
    };

    const mockTowns = [
      { id: 101, islandX: 500, islandY: 500, alliance: 'TITANS', player: 'Achilles', playerId: 10 },
      { id: 102, islandX: 500, islandY: 500, alliance: 'TITANS', player: 'Hector', playerId: 20 }
    ];

    const mockTeamMembers = [
      { playerId: 10, playerName: 'Achilles', vacationModeActive: false },
      { playerId: 20, playerName: 'Hector', vacationModeActive: true } // On vacation! Hazard!
    ];

    const audit = auditWonderFortress({
      islandKey: mockIsland.islandKey,
      islandType: mockIsland.islandType,
      availableTowns: mockIsland.availableTowns,
      towns: mockTowns,
      teamMembers: mockTeamMembers
    });

    expect(audit.isLargeIsland).toBe(true);
    expect(audit.hasEmptySlotHazard).toBe(true);
    expect(audit.emptySlotsCount).toBe(2);
    expect(audit.vacationHazardTowns.length).toBe(1);
    expect(audit.vacationHazardTowns[0].playerName).toBe('Hector');
    expect(audit.isFullyControlled).toBe(true); // All existing towns owned by TITANS
  });

  test('ranks enemy wonder breach targets taking into account 0% morale rule', () => {
    const enemyWonderIslands = [
      {
        islandKey: '600_600',
        wonderType: 'colossus',
        currentLevel: 8,
        alliance: 'OLYMPIANS',
        towns: [
          { id: 201, name: 'Bunker 1', points: 13000, player: 'ZeusLord', playerId: 1 },
          { id: 202, name: 'Weak Outpost', points: 1800, player: 'Newbie', playerId: 2 }
        ]
      }
    ];

    const intelRadar = {
      inactives: new Set([2]) // Player 2 is inactive
    };

    const intelByTownId = {
      202: { wallLevel: 0 }
    };

    const breachTargets = rankEnemyWonderBreachTargets(enemyWonderIslands, intelRadar, intelByTownId);
    expect(breachTargets.length).toBe(2);
    expect(breachTargets[0].townId).toBe(202);
    expect(breachTargets[0].breachScore).toBeGreaterThan(breachTargets[1].breachScore);
    expect(breachTargets[0].moraleExempt).toBe(true);
  });
});
