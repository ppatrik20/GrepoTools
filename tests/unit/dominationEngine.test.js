import { describe, test, expect } from 'vitest';
import {
  calculateDominationPercentage,
  calculateNextDecayThreshold,
  calculateLastStandDurationDays,
  calculateTownSafetyBuffer,
  simulateOptimalRosterMerge,
  rankDominationExpansionTargets
} from '../../src/lib/endgame/dominationEngine.js';

describe('Domination Engine (Dominancia)', () => {
  test('calculates domination percentage strictly over valid island towns', () => {
    // 50 total towns on valid islands. Alliance A owns 20 towns.
    // 20 / 50 = 40.0%
    const pct = calculateDominationPercentage({
      allianceValidTowns: 20,
      totalValidIslandTowns: 50
    });
    expect(pct).toBe(40.0);
  });

  test('calculates bi-weekly threshold decay accurately (KB #4485)', () => {
    // Current target = 40%, Top alliance = 30%.
    // Reduction = (40 - 30) / 2 = 5% -> New threshold = 35%
    const next1 = calculateNextDecayThreshold(40, 30);
    expect(next1).toBe(35);

    // Current target = 35%, Top alliance = 32%.
    // Reduction = (35 - 32) / 2 = 1.5% -> New threshold = 33.5%
    const next2 = calculateNextDecayThreshold(35, 32);
    expect(next2).toBe(33.5);

    // Difference < 2% -> stops decaying
    const next3 = calculateNextDecayThreshold(33.5, 32.5);
    expect(next3).toBe(33.5); // diff is 1.0%, no further decay
  });

  test('returns exact Last Stand duration scaled by world speed', () => {
    expect(calculateLastStandDurationDays(1)).toBe(28);
    expect(calculateLastStandDurationDays(2)).toBe(21);
    expect(calculateLastStandDurationDays(3)).toBe(17.5);
    expect(calculateLastStandDurationDays(4)).toBe(14);
    expect(calculateLastStandDurationDays(5)).toBe(10.5);
    expect(calculateLastStandDurationDays(6)).toBe(7);
  });

  test('computes town safety buffer for Last Stand defense room', () => {
    // Total valid towns = 1000. Target = 40% (needs 400).
    // Alliance holds 418 towns. Buffer = 418 - 400 = 18 towns.
    const buffer = calculateTownSafetyBuffer({
      currentValidTowns: 418,
      totalValidTowns: 1000,
      targetPercentage: 40
    });
    expect(buffer).toBe(18);
  });

  test('simulates optimal roster merge by ranking players by Valid Island town count', () => {
    const coalitionMembers = [
      { playerId: 1, playerName: 'General A', totalPoints: 100000 },
      { playerId: 2, playerName: 'General B', totalPoints: 95000 },
      { playerId: 3, playerName: 'Farmer C', totalPoints: 150000 }, // High points, but 0 valid towns!
      { playerId: 4, playerName: 'Frontliner D', totalPoints: 50000 }
    ];

    const validTownsByPlayerId = {
      1: 25,
      2: 20,
      3: 0, // In non-valid outer oceans
      4: 15
    };

    const totalValidTowns = 100;
    const allianceCap = 3; // Best 3 players

    const simulation = simulateOptimalRosterMerge({
      coalitionMembers,
      validTownsByPlayerId,
      totalValidTowns,
      allianceCap
    });

    expect(simulation.selectedMembers.length).toBe(3);
    // Selected should be 1, 2, 4 (ignoring 3 despite having highest total points!)
    expect(simulation.selectedMembers.map(m => m.playerId)).toEqual([1, 2, 4]);
    expect(simulation.projectedValidTowns).toBe(60);
    expect(simulation.projectedPercentage).toBe(60.0);
  });

  test('ranks domination expansion targets prioritizing Ghost Towns on Revolt worlds', () => {
    const validIslandIds = new Set(['500_500']);
    const towns = [
      { id: 1, islandKey: '500_500', name: 'Ghost 1', isGhost: true, points: 5000, alliance: null },
      { id: 2, islandKey: '500_500', name: 'Enemy Inactive', isGhost: false, points: 8000, alliance: 'FOES', playerId: 99 },
      { id: 3, islandKey: '900_900', name: 'Ghost Outer Ocean', isGhost: true, points: 5000, alliance: null } // Not a valid island!
    ];

    const intelRadar = { inactives: new Set([99]) };

    const rankedRevolt = rankDominationExpansionTargets({
      validIslandIds,
      towns,
      intelRadar,
      isRevoltWorld: true
    });

    expect(rankedRevolt.length).toBe(2); // Only towns on valid islands
    expect(rankedRevolt[0].id).toBe(1); // Ghost town has highest ROI on revolt (instant cap, no revolt countdown)
    expect(rankedRevolt[0].tier).toBe('TIER_1_GHOST');
    expect(rankedRevolt[1].id).toBe(2);
    expect(rankedRevolt[1].tier).toBe('TIER_2_INACTIVE');
  });
});
