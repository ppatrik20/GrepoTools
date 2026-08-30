import { expect, test, describe } from 'vitest';
import { 
  calculateDistance, 
  calculateTravelTimeSeconds, 
  formatDuration, 
  unwrapTownPayload,
  parseDuration,
  calculateRecallTiming,
  calculateMidpointRecall
} from './traveltime.js';

describe('Adversarial Stress Test: unwrapTownPayload permutations', () => {
  test('handles nested object: { town: { id: 1, name: "Sparta" } }', () => {
    const payload = {
      town: { id: 1, name: 'Sparta', islandX: 500, islandY: 500, islandSlot: 2 },
      history: [],
      activity: {},
      conquests: []
    };
    const result = unwrapTownPayload(payload);
    expect(result).not.toBeNull();
    expect(result.id).toBe(1);
    expect(result.name).toBe('Sparta');
    expect(result.islandX).toBe(500);
  });

  test('handles flat object: { id: 2, name: "Athens" }', () => {
    const payload = { id: 2, name: 'Athens', islandX: 502, islandY: 502, islandSlot: 5 };
    const result = unwrapTownPayload(payload);
    expect(result).not.toBeNull();
    expect(result.id).toBe(2);
    expect(result.name).toBe('Athens');
  });

  test('handles null, undefined, empty, and primitive values without throwing', () => {
    expect(unwrapTownPayload(null)).toBeNull();
    expect(unwrapTownPayload(undefined)).toBeNull();
    expect(unwrapTownPayload(0)).toBeNull();
    expect(unwrapTownPayload('')).toBeNull();
    expect(unwrapTownPayload(false)).toBeNull();
    
    // Empty object
    const empty = unwrapTownPayload({});
    expect(empty).toEqual({});

    // Explicit town: null
    const nullTown = unwrapTownPayload({ town: null });
    expect(nullTown).toEqual({ town: null });
  });

  test('handles deep-nested null or malformed data', () => {
    const malformed = { town: undefined, error: "Not Found", status: 404 };
    const result = unwrapTownPayload(malformed);
    expect(result).toEqual(malformed);
  });
});

describe('Adversarial Stress Test: /snipe Query Parameter Ingestion Simulations', () => {
  // Simulator for /snipe ingestion logic from src/app/snipe/page.js
  function simulateSnipeIngestion(originPayload, targetPayload, activeWorld = { speed: 3, unitSpeed: 1 }) {
    const originTown = unwrapTownPayload(originPayload);
    const targetTown = unwrapTownPayload(targetPayload);

    let label = '';
    let travelTime = '';
    let type = 'attack';

    const originValid = originTown && originTown.name;
    const targetValid = targetTown && targetTown.name;

    if (originValid && targetValid) {
      label = `${originTown.name} ? ${targetTown.name}`;
      const dist = calculateDistance(originTown, targetTown);
      const worldSpeed = activeWorld?.speed || 3;
      const unitSpeed = activeWorld?.unitSpeed || 1;
      const travelSecs = calculateTravelTimeSeconds(dist, 3, worldSpeed, unitSpeed);
      travelTime = formatDuration(travelSecs);
      type = 'cs';
    } else if (targetValid) {
      label = `Operation on ${targetTown.name}`;
    } else if (originValid) {
      label = `Operation from ${originTown.name}`;
    }

    return { label, travelTime, type, originTown, targetTown };
  }

  test('Permutation 1: Both origin and target nested', () => {
    const origin = { town: { id: 10, name: 'Origin City', islandX: 500, islandY: 500, islandSlot: 1 } };
    const target = { town: { id: 20, name: 'Target City', islandX: 503, islandY: 504, islandSlot: 2 } };

    const state = simulateSnipeIngestion(origin, target, { speed: 3, unitSpeed: 1 });
    expect(state.label).toBe('Origin City ? Target City');
    expect(state.type).toBe('cs');
    expect(state.travelTime).toBe('00:27:47'); // 5.0 dist -> (5 * 50) / (3 * 3 * 1) = 27.77m -> 1667s -> 00:27:47
  });

  test('Permutation 2: Both origin and target flat', () => {
    const origin = { id: 10, name: 'Origin City', islandX: 500, islandY: 500, islandSlot: 1 };
    const target = { id: 20, name: 'Target City', islandX: 503, islandY: 504, islandSlot: 2 };

    const state = simulateSnipeIngestion(origin, target, { speed: 3, unitSpeed: 1 });
    expect(state.label).toBe('Origin City ? Target City');
    expect(state.travelTime).toBe('00:27:47');
  });

  test('Permutation 3: Hybrid mixed (origin flat, target nested)', () => {
    const origin = { id: 10, name: 'Flat Origin', islandX: 500, islandY: 500, islandSlot: 1 };
    const target = { town: { id: 20, name: 'Nested Target', islandX: 500, islandY: 500, islandSlot: 5 } };

    const state = simulateSnipeIngestion(origin, target, { speed: 3, unitSpeed: 1 });
    expect(state.label).toBe('Flat Origin ? Nested Target');
    expect(state.type).toBe('cs');
    // Same island: slotDiff = 4 -> dist = 2.0 + 4 * 0.35 = 3.4
    // CS travel: (3.4 * 50) / (3 * 3 * 1) = 18.88m -> 1133s -> 00:18:53
    expect(state.travelTime).toBe('00:18:53');
  });

  test('Permutation 4: Target only (missing originTownId)', () => {
    const target = { town: { id: 20, name: 'Target Only', islandX: 500, islandY: 500 } };
    const state = simulateSnipeIngestion(null, target);
    expect(state.label).toBe('Operation on Target Only');
    expect(state.travelTime).toBe('');
  });

  test('Permutation 5: Origin only (missing targetTownId)', () => {
    const origin = { town: { id: 10, name: 'Origin Only', islandX: 500, islandY: 500 } };
    const state = simulateSnipeIngestion(origin, null);
    expect(state.label).toBe('Operation from Origin Only');
    expect(state.travelTime).toBe('');
  });

  test('Permutation 6: Both null / undefined / 404 failure', () => {
    const state = simulateSnipeIngestion(null, null);
    expect(state.label).toBe('');
    expect(state.travelTime).toBe('');
    expect(state.type).toBe('attack');
  });

  test('Permutation 7: Corrupted payloads without name property (404 error response objects)', () => {
    const errPayload = { error: 'Town not found', status: 404 };
    const state = simulateSnipeIngestion(errPayload, errPayload);
    expect(state.label).toBe('');
    expect(state.travelTime).toBe('');
  });

  test('Permutation 8: Same Origin and Target Town IDs (distance = 0)', () => {
    const town = { town: { id: '99', name: 'Sparta', islandX: 500, islandY: 500, islandSlot: 1 } };
    const state = simulateSnipeIngestion(town, town);
    expect(state.label).toBe('Sparta ? Sparta');
    expect(state.travelTime).toBe('00:00:00');
  });
});

describe('Adversarial Stress Test: /snipe/recall Query Parameter Ingestion Simulations', () => {
  // Simulator for /snipe/recall ingestion logic from src/app/snipe/recall/page.js
  function simulateRecallIngestion(originPayload, targetPayload, initialGroups = [], activeWorld = { worldType: 'siege' }) {
    let groups = [...initialGroups];
    let activeGroupId = null;
    let movAttacker = '';
    let movAttackerId = null;

    const targetTown = unwrapTownPayload(targetPayload);
    if (targetTown?.name) {
      const existing = groups.find(g => g.townId === targetTown.id || g.name.toLowerCase() === targetTown.name.toLowerCase());
      if (existing) {
        activeGroupId = existing.id;
      } else {
        const newGroup = {
          id: 'grp_' + targetTown.id,
          name: targetTown.name,
          townId: targetTown.id,
          worldType: (activeWorld?.worldType || 'siege').toLowerCase(),
          movements: [],
          plans: []
        };
        activeGroupId = newGroup.id;
        groups.push(newGroup);
      }
    }

    const originTown = unwrapTownPayload(originPayload);
    if (originTown?.name) {
      movAttacker = originTown.name;
      movAttackerId = originTown.id;
    }

    return { groups, activeGroupId, movAttacker, movAttackerId };
  }

  test('Permutation 1: Nested targetTown creates defense group and nested originTown sets attacker', () => {
    const target = { town: { id: '100', name: 'Corinth Capital' } };
    const origin = { town: { id: '200', name: 'Sparta Garrison' } };

    const state = simulateRecallIngestion(origin, target);
    expect(state.groups.length).toBe(1);
    expect(state.groups[0].name).toBe('Corinth Capital');
    expect(state.groups[0].townId).toBe('100');
    expect(state.activeGroupId).toBe('grp_100');
    expect(state.movAttacker).toBe('Sparta Garrison');
    expect(state.movAttackerId).toBe('200');
  });

  test('Permutation 2: Flat targetTown and originTown', () => {
    const target = { id: '101', name: 'Thebes Wall' };
    const origin = { id: '201', name: 'Athens Harbor' };

    const state = simulateRecallIngestion(origin, target);
    expect(state.groups.length).toBe(1);
    expect(state.groups[0].name).toBe('Thebes Wall');
    expect(state.movAttacker).toBe('Athens Harbor');
    expect(state.movAttackerId).toBe('201');
  });

  test('Permutation 3: Re-selecting existing group matches by townId and does not duplicate', () => {
    const initial = [{ id: 'existing_1', name: 'Corinth Capital', townId: '100', movements: [], plans: [] }];
    const target = { town: { id: '100', name: 'Corinth Capital' } };

    const state = simulateRecallIngestion(null, target, initial);
    expect(state.groups.length).toBe(1);
    expect(state.activeGroupId).toBe('existing_1');
  });

  test('Permutation 4: Target only (no origin provided)', () => {
    const target = { town: { id: '100', name: 'Only Target' } };
    const state = simulateRecallIngestion(null, target);
    expect(state.groups.length).toBe(1);
    expect(state.movAttacker).toBe('');
    expect(state.movAttackerId).toBeNull();
  });

  test('Permutation 5: Origin only (no target provided)', () => {
    const origin = { town: { id: '200', name: 'Only Origin' } };
    const state = simulateRecallIngestion(origin, null);
    expect(state.groups.length).toBe(0);
    expect(state.activeGroupId).toBeNull();
    expect(state.movAttacker).toBe('Only Origin');
    expect(state.movAttackerId).toBe('200');
  });

  test('Permutation 6: Null / 404 / malformed payloads do not mutate state or throw', () => {
    const state = simulateRecallIngestion(null, null);
    expect(state.groups.length).toBe(0);
    expect(state.movAttacker).toBe('');
    expect(state.movAttackerId).toBeNull();

    const errState = simulateRecallIngestion({ error: 'Not found' }, { error: 'Not found' });
    expect(errState.groups.length).toBe(0);
    expect(errState.movAttacker).toBe('');
  });
});

describe('Adversarial Stress Test: Travel Time Boundary & Extreme Values', () => {
  test('handles extreme coordinates, zero speeds, and negative coordinates without NaN', () => {
    const townA = { islandX: 0, islandY: 0, islandSlot: 0 };
    const townB = { islandX: 9999, islandY: 9999, islandSlot: 20 };

    const dist = calculateDistance(townA, townB);
    expect(Number.isFinite(dist)).toBe(true);
    expect(dist).toBeGreaterThan(14000);

    // Negative coordinates
    const townNeg = { islandX: -500, islandY: -500 };
    const distNeg = calculateDistance(townA, townNeg);
    expect(Number.isFinite(distNeg)).toBe(true);

    // Zero / negative speeds clamp to safe minimum 1
    const secs1 = calculateTravelTimeSeconds(dist, 0, 0, 0);
    expect(Number.isFinite(secs1)).toBe(true);
    expect(secs1).toBeGreaterThan(0);

    // Zero distance
    expect(calculateTravelTimeSeconds(0, 15, 3, 1)).toBe(0);
    expect(calculateTravelTimeSeconds(-10, 15, 3, 1)).toBe(0);
  });

  test('formatDuration and parseDuration handle edge cases and malformed input', () => {
    expect(formatDuration(0)).toBe('00:00:00');
    expect(formatDuration(-100)).toBe('00:00:00');
    expect(formatDuration(NaN)).toBe('00:00:00');
    expect(formatDuration(null)).toBe('00:00:00');
    expect(formatDuration(3661)).toBe('01:01:01');
    expect(formatDuration(86400)).toBe('24:00:00');

    expect(parseDuration('01:01:01')).toBe(3661);
    expect(parseDuration('05:30')).toBe(330);
    expect(parseDuration('')).toBe(0);
    expect(parseDuration(null)).toBe(0);
    expect(parseDuration('invalid')).toBe(0);
  });
});
