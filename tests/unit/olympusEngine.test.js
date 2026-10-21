import { describe, test, expect } from 'vitest';
import {
  LARGE_TEMPLE_BONUSES,
  OLYMPUS_TIMELINES,
  simulateOlympusCurseAttrition,
  calculatePortalRouteTiming,
  generateReinforcementRelaySchedule
} from '../../src/lib/endgame/olympusEngine.js';

describe('Olympus Engine (Olimposz)', () => {
  test('has accurate Large Temple god bonus specs matching KB #4482', () => {
    expect(LARGE_TEMPLE_BONUSES.ares.movementSpeedBonusPct).toBe(15);
    expect(LARGE_TEMPLE_BONUSES.zeus.mythAttackBonusPct).toBe(15);
    expect(LARGE_TEMPLE_BONUSES.athena.favorBonusPct).toBe(20);
    expect(LARGE_TEMPLE_BONUSES.hera.recruitTimeReductionPct).toBe(40);
    expect(LARGE_TEMPLE_BONUSES.artemis.recruitCostReductionPct).toBe(40);
  });

  test('returns correct cumulative hold targets and jump intervals', () => {
    expect(OLYMPUS_TIMELINES.fast.requiredHoldDays).toBe(38);
    expect(OLYMPUS_TIMELINES.fast.jumpIntervalDays).toBe(15);

    expect(OLYMPUS_TIMELINES.normal.requiredHoldDays).toBe(50);
    expect(OLYMPUS_TIMELINES.normal.jumpIntervalDays).toBe(20);

    expect(OLYMPUS_TIMELINES.slow.requiredHoldDays).toBe(63);
    expect(OLYMPUS_TIMELINES.slow.jumpIntervalDays).toBe(25);
  });

  test('simulates Olympus Curse exponential 5% attrition curve', () => {
    // 50,000 biremes initially.
    // Tick 1: 50,000 * 0.95 = 47,500
    // Tick 2: 47,500 * 0.95 = 45,125
    // Tick 14: 50,000 * 0.95^14 ≈ 24,383
    const curve = simulateOlympusCurseAttrition(50000, 14);
    expect(curve[0].remainingTroops).toBe(50000);
    expect(curve[1].remainingTroops).toBe(47500);
    expect(curve[2].remainingTroops).toBe(45125);
    expect(curve[14].remainingTroops).toBe(24384);
    expect(curve[14].totalLostToCurse).toBe(25616);
  });

  test('calculates two-leg Portal Temple routing and highlights one-way return trip', () => {
    const route = calculatePortalRouteTiming({
      originToPortalSeconds: 3600, // 1 hour to Portal Temple
      portalTeleportSeconds: 7200, // 2 hours teleport jump
      directOriginToOlympusSeconds: 28800, // 8 hours direct
      hasAresLargeTemple: true // +15% speed
    });

    // Outbound via portal should be (3600 / 1.15) + 7200 = 3130 + 7200 = 10330s
    expect(route.outboundViaPortalSeconds).toBe(10330);
    // Direct return without portal: 28800 / 1.15 = 25043s
    expect(route.returnDirectSeconds).toBe(25043);
    expect(route.isPortalFaster).toBe(true);
    expect(route.timeSavedSeconds).toBe(25043 - 10330);
  });

  test('generates staggered 6-hour reinforcement relay schedule for team members', () => {
    const members = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
      { id: 4, name: 'Dave' }
    ];

    const shieldEnd = new Date('2026-10-21T18:00:00Z');
    const schedule = generateReinforcementRelaySchedule({
      shieldEndsAt: shieldEnd,
      teamMembers: members,
      shiftIntervalHours: 6,
      shiftCount: 4
    });

    expect(schedule.length).toBe(4);
    expect(schedule[0].shiftName).toBe('Shift Alpha');
    expect(schedule[0].targetArrival.toISOString()).toBe('2026-10-21T18:00:00.000Z');
    expect(schedule[1].targetArrival.toISOString()).toBe('2026-10-22T00:00:00.000Z');
  });
});
