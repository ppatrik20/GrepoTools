import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  planAttackOperation,
  calculateConquestGaps,
  planRecallSnipe,
  resolveOperationTargeting,
  resolveTargetDate,
  ANTI_TIMING_BUFFER_MS
} from '../../src/lib/operations/OperationPlanner.js';
import {
  NAVAL_UNITS,
  MYTHICAL_FLYING_UNITS,
  ALL_UNITS,
  getUnit,
  COLONY_SHIP_SPEED
} from '../../src/lib/operations/units.js';
import {
  LocalOperationsAdapter,
  RemoteOperationsAdapter
} from '../../src/lib/operations/OperationsStorage.js';

describe('Unit Catalog & Speeds (units.js)', () => {
  it('defines 6 naval units and 4 mythical flying units', () => {
    expect(NAVAL_UNITS.length).toBe(6);
    expect(MYTHICAL_FLYING_UNITS.length).toBe(4);
    expect(ALL_UNITS.length).toBe(10);
  });

  it('correctly retrieves Colony Ship with base speed 3', () => {
    const cs = getUnit('colonize_ship');
    expect(cs).toBeDefined();
    expect(cs.baseSpeed).toBe(COLONY_SHIP_SPEED);
    expect(cs.baseSpeed).toBe(3);
    expect(cs.role).toBe('Conquest');
  });

  it('correctly retrieves Pegasus with base speed 35', () => {
    const pegasus = getUnit('pegasus');
    expect(pegasus).toBeDefined();
    expect(pegasus.baseSpeed).toBe(35);
  });
});

describe('OperationPlanner: planAttackOperation', () => {
  it('calculates travel duration and ±10s launch window for attack', () => {
    const origin = { id: 1, name: 'Athens', islandX: 500, islandY: 500 };
    const target = { id: 2, name: 'Sparta', islandX: 503, islandY: 504 }; // distance = 5.0
    const fixedNow = new Date('2026-10-08T10:00:00.000Z');
    const landingTime = new Date('2026-10-08T12:00:00.000Z');

    const plan = planAttackOperation({
      originTown: origin,
      targetTown: target,
      targetLandingTime: landingTime,
      unitBaseSpeed: 3, // Colony ship
      worldSpeed: 3,
      unitSpeed: 1,
      referenceNow: fixedNow
    });

    expect(plan.distance).toBe(5.0);
    // (5.0 * 50) / (3 * 3 * 1) = 27.777 min -> 1667 seconds
    expect(plan.travelSeconds).toBe(1667);
    expect(plan.formattedDuration).toBe('00:27:47');
    expect(plan.label).toBe('Athens → Sparta');

    // Ideal launch epoch: 12:00:00 - 1667s = 11:32:13
    const expectedLaunch = new Date(landingTime.getTime() - 1667 * 1000);
    expect(plan.idealLaunchDate.getTime()).toBe(expectedLaunch.getTime());

    // Window: ±10s (ANTI_TIMING_BUFFER_MS)
    expect(plan.windowStart.getTime()).toBe(expectedLaunch.getTime() - ANTI_TIMING_BUFFER_MS);
    expect(plan.windowEnd.getTime()).toBe(expectedLaunch.getTime() + ANTI_TIMING_BUFFER_MS);
  });

  it('handles midnight wrap-around when targetLandingTime is given as HH:MM:SS', () => {
    // Current time: 22:00 local time
    const fixedNow = new Date();
    fixedNow.setHours(22, 0, 0, 0);

    // Target time: 02:00 (which is before 22:00 today, so should wrap to tomorrow)
    const resolved = resolveTargetDate('02:00:00', fixedNow);
    expect(resolved.getHours()).toBe(2);
    expect(resolved.getTime()).toBeGreaterThan(fixedNow.getTime());
    // Difference should be roughly 4 hours
    const diffHours = (resolved.getTime() - fixedNow.getTime()) / (3600 * 1000);
    expect(Math.round(diffHours)).toBe(4);
  });
});

describe('OperationPlanner: calculateConquestGaps', () => {
  const csArrival = new Date('2026-10-08T15:00:00.000Z').getTime();
  const attack1 = new Date('2026-10-08T14:58:30.000Z').getTime();
  const attack2 = new Date('2026-10-08T14:59:50.000Z').getTime();
  const support1 = new Date('2026-10-08T15:00:05.000Z').getTime();

  const movements = [
    { id: 'att_1', type: 'attack', arrivalTime: attack1, attacker: 'Aggressor 1' },
    { id: 'att_2', type: 'attack', arrivalTime: attack2, attacker: 'Aggressor 2' },
    { id: 'cs_1', type: 'cs', arrivalTime: csArrival, attacker: 'CS Commander' },
    { id: 'sup_1', type: 'support', arrivalTime: support1, attacker: 'Friendly Support' }
  ];

  it('calculates Revolt gap: defending units must land 1s BEFORE CS', () => {
    const gaps = calculateConquestGaps({ movements, worldType: 'revolt' });
    expect(gaps.length).toBe(1);
    const gap = gaps[0];

    expect(gap.mode).toBe('revolt');
    expect(gap.returnTime).toBe(csArrival - 1000); // exactly 1s before CS
    expect(gap.gapStart).toBe(attack2); // last clear attack
    expect(gap.gapEnd).toBe(csArrival);
    expect(gap.desc).toContain('Defend Revolt CS');
  });

  it('calculates Siege gaps: provides Break Siege (1s after CS) and Pre-CS Defense (1s before CS)', () => {
    const gaps = calculateConquestGaps({ movements, worldType: 'siege' });
    expect(gaps.length).toBe(2);

    const breakSiege = gaps.find(g => g.mode === 'siege_break');
    expect(breakSiege).toBeDefined();
    expect(breakSiege.returnTime).toBe(csArrival + 1000); // 1s AFTER CS
    expect(breakSiege.gapStart).toBe(csArrival);
    expect(breakSiege.gapEnd).toBe(support1);

    const preCs = gaps.find(g => g.mode === 'siege_defend');
    expect(preCs).toBeDefined();
    expect(preCs.returnTime).toBe(csArrival - 1000); // 1s BEFORE CS
    expect(preCs.gapStart).toBe(attack2);
    expect(preCs.gapEnd).toBe(csArrival);
  });
});

describe('OperationPlanner: planRecallSnipe', () => {
  it('calculates midpoint recall and cancel delay for given delay minutes', () => {
    const returnTime = new Date('2026-10-08T12:00:00.000Z');
    const sendDelayMinutes = 8; // 8 minutes away -> 4 minutes cancel delay (240s)

    const plan = planRecallSnipe({
      targetReturnTime: returnTime,
      sendDelayMinutes
    });

    expect(plan.cancelDelaySeconds).toBe(240);
    expect(plan.sendTime.toISOString()).toBe('2026-10-08T11:52:00.000Z');
    expect(plan.recallTime.toISOString()).toBe('2026-10-08T11:56:00.000Z');
    expect(plan.totalElapsedSeconds).toBe(480);
  });

  it('throws error when planned send time is in the past relative to serverTime', () => {
    const returnTime = new Date('2026-10-08T12:00:00.000Z');
    const serverTime = new Date('2026-10-08T11:55:00.000Z');
    const sendDelayMinutes = 10; // Would mean sendTime = 11:50:00, which is in past!

    expect(() => {
      planRecallSnipe({
        targetReturnTime: returnTime,
        sendDelayMinutes,
        serverTime
      });
    }).toThrow(/Send Time is in the past/);
  });
});

describe('OperationPlanner: resolveOperationTargeting', () => {
  it('unwraps both nested towns and sets Colony Ship travel duration and label', () => {
    const origin = { town: { id: 10, name: 'Origin Port', islandX: 500, islandY: 500, islandSlot: 1 } };
    const target = { town: { id: 20, name: 'Target Harbor', islandX: 503, islandY: 504, islandSlot: 2 } };

    const targeting = resolveOperationTargeting({
      originPayload: origin,
      targetPayload: target,
      activeWorld: { speed: 3, unitSpeed: 1 }
    });

    expect(targeting.originTown.name).toBe('Origin Port');
    expect(targeting.targetTown.name).toBe('Target Harbor');
    expect(targeting.label).toBe('Origin Port → Target Harbor');
    expect(targeting.type).toBe('cs');
    expect(targeting.travelTime).toBe('00:27:47');
  });

  it('handles target-only and origin-only payloads gracefully', () => {
    const targetOnly = resolveOperationTargeting({
      targetPayload: { town: { id: 20, name: 'Target Harbor' } }
    });
    expect(targetOnly.label).toBe('Operation on Target Harbor');
    expect(targetOnly.travelTime).toBe('');

    const originOnly = resolveOperationTargeting({
      originPayload: { id: 10, name: 'Origin Port' }
    });
    expect(originOnly.label).toBe('Operation from Origin Port');
    expect(originOnly.travelTime).toBe('');
  });
});

describe('OperationsStorage: LocalOperationsAdapter', () => {
  let fakeStorage;

  beforeEach(() => {
    fakeStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(k => fakeStorage[k] || null),
      setItem: vi.fn((k, v) => { fakeStorage[k] = v; }),
      removeItem: vi.fn(k => { delete fakeStorage[k]; })
    });
  });

  it('saves and revives operation queue with Date hydration', () => {
    const queue = [
      {
        id: 'op1',
        label: 'Op 1',
        windowStart: new Date('2026-10-08T10:00:00.000Z'),
        windowEnd: new Date('2026-10-08T10:00:20.000Z'),
        targetDate: new Date('2026-10-08T10:30:00.000Z')
      }
    ];

    LocalOperationsAdapter.setQueue('hu119', queue);
    const revived = LocalOperationsAdapter.getQueue('hu119');

    expect(revived.length).toBe(1);
    expect(revived[0].windowStart instanceof Date).toBe(true);
    expect(revived[0].windowStart.toISOString()).toBe('2026-10-08T10:00:00.000Z');
    expect(revived[0].targetDate instanceof Date).toBe(true);
  });

  it('recovers gracefully from corrupted JSON in localStorage', () => {
    fakeStorage['grepo-operations-queue_hu119'] = 'corrupted{json[';
    const queue = LocalOperationsAdapter.getQueue('hu119');
    expect(queue).toEqual([]);
  });
});

describe('OperationsStorage: RemoteOperationsAdapter', () => {
  it('fetches operations and hydrates Date timestamps', async () => {
    const mockOps = [
      {
        id: 'db_op1',
        label: 'Siege Break Plan',
        targetReturnTime: '2026-10-08T12:00:00.000Z',
        sendTime: '2026-10-08T11:50:00.000Z',
        recallTime: '2026-10-08T11:55:00.000Z'
      }
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockOps
    });

    const ops = await RemoteOperationsAdapter.fetchOperations({
      worldId: 'hu119',
      fetchImpl: mockFetch
    });

    expect(ops.length).toBe(1);
    expect(ops[0].targetReturnTime instanceof Date).toBe(true);
    expect(ops[0].sendTime instanceof Date).toBe(true);
    expect(ops[0].recallTime instanceof Date).toBe(true);
  });
});
