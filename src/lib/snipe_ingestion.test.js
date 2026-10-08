import { expect, test, describe } from 'vitest';
import { 
  calculateDistance, 
  calculateTravelTimeSeconds, 
  formatDuration, 
  unwrapTownPayload 
} from './traveltime.js';
import {
  resolveOperationTargeting,
  resolveRecallTargeting
} from './operations/OperationPlanner.js';

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

  test('resolves /snipe query targeting: resolves originTown and targetTown labels & CS travel time', () => {
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

    // Test through production OperationPlanner engine
    const targeting = resolveOperationTargeting({
      originPayload: originApiResponse,
      targetPayload: targetApiResponse,
      activeWorld: { speed: 3, unitSpeed: 1 }
    });

    expect(targeting.originTown).toBeTruthy();
    expect(targeting.targetTown).toBeTruthy();
    expect(targeting.label).toBe('Corinth Port → Delphi Citadel');
    expect(targeting.distance).toBe(10.0);
    expect(targeting.travelSeconds).toBe(3333);
    expect(targeting.travelTime).toBe('00:55:33');
    expect(targeting.type).toBe('cs');
  });

  test('resolves /snipe/recall targeting: sets defense group name and origin attacker metadata', () => {
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

    const recallTargeting = resolveRecallTargeting({
      originPayload: originApiResponse,
      targetPayload: targetApiResponse,
      existingGroups: [],
      activeWorld: { worldType: 'siege' }
    });

    expect(recallTargeting.groups.length).toBe(1);
    expect(recallTargeting.groups[0].name).toBe('Thebes Fortress');
    expect(recallTargeting.groups[0].townId).toBe('100');
    expect(recallTargeting.activeGroupId).toBe('grp_100');
    expect(recallTargeting.movAttacker).toBe('Mycenae Bastion');
    expect(recallTargeting.movAttackerId).toBe('200');
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
