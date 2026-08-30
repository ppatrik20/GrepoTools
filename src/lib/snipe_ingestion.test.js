import { expect, test, describe } from 'vitest';
import { 
  calculateDistance, 
  calculateTravelTimeSeconds, 
  formatDuration, 
  unwrapTownPayload 
} from './traveltime.js';

describe('Snipe Parameter Ingestion & Town Payload Unwrapping', () => {
  test('unwraps nested API response { town: { id, name, x, y } } properly', () => {
    const apiResponse = {
      town: {
        id: '1',
        name: 'Sparta',
        x: 500,
        y: 500,
        islandX: 500,
        islandY: 500,
        islandSlot: 0,
        points: 10000,
        player: { id: 10, name: 'Leonidas', alliance: { id: 2, name: 'Spartan Guard' } }
      },
      history: [
        { date: '2026-08-28', points: 9500, delta: 500, timestamp: '2026-08-28T00:00:00.000Z' }
      ],
      activity: { pointDelta: 500, lastActive: '2026-08-28T00:00:00.000Z' },
      conquests: []
    };

    const town = unwrapTownPayload(apiResponse);
    expect(town).toBeDefined();
    expect(town.id).toBe('1');
    expect(town.name).toBe('Sparta');
    expect(town.x).toBe(500);
    expect(town.y).toBe(500);
    expect(town.islandX).toBe(500);
    expect(town.islandY).toBe(500);
    expect(town.islandSlot).toBe(0);
    expect(town.points).toBe(10000);
  });

  test('handles legacy flat town payload transparently (fallback)', () => {
    const flatTown = {
      id: '2',
      name: 'Athens',
      x: 503,
      y: 504,
      islandX: 503,
      islandY: 504,
      islandSlot: 3,
      points: 8000
    };

    const town = unwrapTownPayload(flatTown);
    expect(town).toBeDefined();
    expect(town.id).toBe('2');
    expect(town.name).toBe('Athens');
    expect(town.x).toBe(503);
    expect(town.y).toBe(504);
  });

  test('simulates /snipe query ingestion: resolves originTown and targetTown labels & CS travel time', () => {
    const originApiResponse = {
      town: {
        id: '10',
        name: 'Corinth Port',
        islandX: 450,
        islandY: 450,
        islandSlot: 1
      },
      history: [],
      activity: { pointDelta: 0 },
      conquests: []
    };

    const targetApiResponse = {
      town: {
        id: '20',
        name: 'Delphi Citadel',
        islandX: 456,
        islandY: 458,
        islandSlot: 4
      },
      history: [],
      activity: { pointDelta: 0 },
      conquests: []
    };

    const originTown = unwrapTownPayload(originApiResponse);
    const targetTown = unwrapTownPayload(targetApiResponse);

    expect(originTown).toBeTruthy();
    expect(targetTown).toBeTruthy();

    // 1. Operation label format
    const label = `${originTown.name} → ${targetTown.name}`;
    expect(label).toBe('Corinth Port → Delphi Citadel');
    expect(label).not.toContain('undefined');

    // 2. Distance calculation: dx=6, dy=8 -> sqrt(36+64) = 10.0
    const distance = calculateDistance(originTown, targetTown);
    expect(distance).toBe(10.0);

    // 3. Travel time: Colony Ship (speed 3) on World Speed 3, Unit Speed 1: (10.0 * 50) / (3 * 3 * 1) = 55.55 min -> 3333s = 00:55:33
    const travelSecs = calculateTravelTimeSeconds(distance, 3, 3, 1);
    expect(travelSecs).toBe(3333);
    expect(formatDuration(travelSecs)).toBe('00:55:33');
  });

  test('simulates /snipe/recall ingestion: sets defense group name and origin attacker metadata', () => {
    const targetApiResponse = {
      town: {
        id: '100',
        name: 'Thebes Fortress',
        islandX: 520,
        islandY: 520
      }
    };

    const originApiResponse = {
      town: {
        id: '200',
        name: 'Mycenae Bastion',
        islandX: 525,
        islandY: 525
      }
    };

    const targetTown = unwrapTownPayload(targetApiResponse);
    const originTown = unwrapTownPayload(originApiResponse);

    // Defense group setup
    expect(targetTown?.name).toBe('Thebes Fortress');
    const newGroup = {
      id: 'grp_1',
      name: targetTown.name,
      townId: targetTown.id,
      worldType: 'siege',
      movements: [],
      plans: []
    };
    expect(newGroup.name).toBe('Thebes Fortress');
    expect(newGroup.townId).toBe('100');

    // Origin attacker metadata
    expect(originTown?.name).toBe('Mycenae Bastion');
    const movAttacker = originTown.name;
    const movAttackerId = originTown.id;
    expect(movAttacker).toBe('Mycenae Bastion');
    expect(movAttackerId).toBe('200');
  });

  test('handles same-island transit distance unwrapped from API response correctly', () => {
    const originApiResponse = {
      town: { id: '301', name: 'Bay City A', islandX: 500, islandY: 500, islandSlot: 2 }
    };
    const targetApiResponse = {
      town: { id: '302', name: 'Bay City B', islandX: 500, islandY: 500, islandSlot: 7 }
    };

    const originTown = unwrapTownPayload(originApiResponse);
    const targetTown = unwrapTownPayload(targetApiResponse);

    // Slot diff = |7 - 2| = 5 -> distance = 2.0 + 5 * 0.35 = 3.75
    const distance = calculateDistance(originTown, targetTown);
    expect(distance).toBe(3.75);

    // Bireme (speed 15) on World Speed 3, Unit Speed 1: (3.75 * 50) / (15 * 3 * 1) = 4.166 min -> 250s
    const biremeSecs = calculateTravelTimeSeconds(distance, 15, 3, 1);
    expect(biremeSecs).toBe(250);
    expect(formatDuration(biremeSecs)).toBe('00:04:10');
  });
});
