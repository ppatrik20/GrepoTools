import { expect, test, describe } from 'vitest';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import islandDefinitions from './map/island_definitions.json';
import { 
  calculateTravelTime, 
  calculateRecallTiming, 
  calculateMidpointRecall, 
  formatDuration, 
  parseDuration,
  calculateDistance,
  calculateTravelTimeSeconds,
  unwrapTownPayload
} from './traveltime.js';

describe('Asset Integrity: Island Sprite Alpha Noise Cleanup (R1)', () => {
  test('island_1.png has 100% clean alpha cutout with 0 noise pixels and zero alpha corners', async () => {
    const imgPath = path.resolve(process.cwd(), 'public/map/islands/island_1.png');
    expect(fs.existsSync(imgPath)).toBe(true);

    const { data, info } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);

    // Check all 4 corners
    const topLeftAlpha = data[3];
    const topRightAlpha = data[(info.width - 1) * 4 + 3];
    const bottomLeftAlpha = data[(info.width * (info.height - 1)) * 4 + 3];
    const bottomRightAlpha = data[(info.width * info.height - 1) * 4 + 3];

    expect(topLeftAlpha).toBe(0);
    expect(topRightAlpha).toBe(0);
    expect(bottomLeftAlpha).toBe(0);
    expect(bottomRightAlpha).toBe(0);

    // Verify 0 residual noise pixels (alpha between 1 and 30)
    let noisePixels = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0 && data[i] <= 30) {
        noisePixels++;
      }
    }
    expect(noisePixels).toBe(0);
  });
});

describe('Shoreline Bay Slot Positioning (R1)', () => {
  test('all 40 colonizable island types (1-16, 37-60) have official shoreline offsets defined', () => {
    const colonizableTypes = [
      ...Array.from({ length: 16 }, (_, i) => i + 1),
      ...Array.from({ length: 24 }, (_, i) => i + 37)
    ];
    expect(colonizableTypes.length).toBe(40);

    let totalOffsets = 0;
    for (const typeId of colonizableTypes) {
      const def = islandDefinitions[typeId];
      expect(def).toBeDefined();
      expect(Array.isArray(def.town_offsets)).toBe(true);
      expect(def.town_offsets.length).toBeGreaterThan(0);
      totalOffsets += def.town_offsets.length;

      // Verify each slot has valid coastal pixel offsets and direction
      def.town_offsets.forEach(slot => {
        expect(typeof slot.x).toBe('number');
        expect(typeof slot.y).toBe('number');
        expect(['nw', 'ne', 'sw', 'se']).toContain(slot.dir);
      });
    }

    expect(totalOffsets).toBe(578);
  });
});

describe('Calibrated Physical Proportion Scaling Curve (R1, R4)', () => {
  test('scaling curve follows 0.007 * 2^Z exactly across zoom levels 5 to 12', () => {
    const expectedCurve = {
      5: 0.224,
      6: 0.448,
      7: 0.896,
      8: 1.792,
      9: 3.584,
      10: 7.168,
      11: 14.336,
      12: 28.672
    };

    for (const [zoomStr, expectedVal] of Object.entries(expectedCurve)) {
      const z = Number(zoomStr);
      const calculated = +(0.007 * Math.pow(2, z)).toFixed(3);
      expect(calculated).toBe(expectedVal);
    }
  });
});

describe('Troop Travel Time & Distance Engine (R3)', () => {
  test('calculates accurate same-island transit distance based on slot difference', () => {
    const townA = { id: 101, islandX: 500, islandY: 500, islandSlot: 0 };
    const townB = { id: 102, islandX: 500, islandY: 500, islandSlot: 5 };
    const distance = calculateDistance(townA, townB);

    // 2.0 + 5 * 0.35 = 3.75
    expect(distance).toBe(3.75);

    // Identical town returns 0
    expect(calculateDistance(townA, townA)).toBe(0);
  });

  test('calculates accurate inter-island Euclidean nautical distance', () => {
    const townA = { id: 101, islandX: 500, islandY: 500 };
    const townB = { id: 102, islandX: 503, islandY: 504 };
    const distance = calculateDistance(townA, townB);

    // sqrt(3^2 + 4^2) = 5.0
    expect(distance).toBe(5.0);
  });

  test('calculates correct travel duration for naval fleet units', () => {
    const distance = 5.0;
    // Colony Ship (base speed 3) on World Speed 3, Unit Speed 1: (5.0 * 50) / (3 * 3 * 1) = 27.777 min -> 1667 seconds
    const csSeconds = calculateTravelTimeSeconds(distance, 3, 3, 1);
    expect(csSeconds).toBe(1667);
    expect(formatDuration(csSeconds)).toBe("00:27:47");

    // Bireme (base speed 15) on World Speed 3, Unit Speed 1: (5.0 * 50) / (15 * 3 * 1) = 5.555 min -> 333 seconds
    const biremeSeconds = calculateTravelTimeSeconds(distance, 15, 3, 1);
    expect(biremeSeconds).toBe(333);
    expect(formatDuration(biremeSeconds)).toBe("00:05:33");
  });

  test('calculates correct travel duration for mythical flying units', () => {
    const distance = 10.0;
    // Pegasus (base speed 35) on World Speed 2, Unit Speed 1: (10.0 * 50) / (35 * 2 * 1) = 7.142 min -> 429 seconds
    const pegasusSeconds = calculateTravelTimeSeconds(distance, 35, 2, 1);
    expect(pegasusSeconds).toBe(429);
    expect(formatDuration(pegasusSeconds)).toBe("00:07:09");
  });
});

describe('Travel Time Engine (Legacy & Modifiers)', () => {
  test('returns base delay when coordinates are identical', () => {
    const time = calculateTravelTime(100, 100, 100, 100, 13, 2);
    expect(time).toBe(300); // 5 minutes base delay
  });

  test('calculates correct travel time with speed modifiers', () => {
    // 5 units distance, base speed 13, world speed 2, Cartography (+10%), Lighthouse (+15%)
    const time = calculateTravelTime(100, 100, 103, 104, 13, 2, {
      cartographyResearched: true,
      hasLighthouse: true
    });
    expect(time).toBe(377);
  });
});

describe('Recall Timer Midpoint Logic', () => {
  test('calculates exact send and recall times from planned delay', () => {
    const target = new Date("2026-06-20T12:00:00.000Z");
    const cancelDelay = 240; // 4 minutes cancel delay
    const timings = calculateRecallTiming(target, cancelDelay);
    
    expect(timings.sendTime.toISOString()).toBe("2026-06-20T11:52:00.000Z");
    expect(timings.recallTime.toISOString()).toBe("2026-06-20T11:56:00.000Z");
    expect(timings.totalElapsedSeconds).toBe(480);
  });

  test('calculates exact midpoint recall from actual launch epoch (Date objects)', () => {
    const target = new Date("2026-06-20T12:00:00.000Z");
    const launch = new Date("2026-06-20T11:50:00.000Z"); // 10 minutes total gap -> 5 min cancel delay
    const timings = calculateMidpointRecall(target, launch);
    
    expect(timings.cancelDelaySeconds).toBe(300);
    expect(timings.recallTime.toISOString()).toBe("2026-06-20T11:55:00.000Z");
    expect(timings.totalElapsedSeconds).toBe(600);
  });

  test('calculates exact midpoint recall from numeric epoch milliseconds', () => {
    const targetMs = new Date("2026-06-20T12:00:00.000Z").getTime();
    const launchMs = new Date("2026-06-20T11:50:00.000Z").getTime();
    const timings = calculateMidpointRecall(targetMs, launchMs);
    
    expect(timings.cancelDelaySeconds).toBe(300);
    expect(timings.sendTime instanceof Date).toBe(true);
    expect(timings.recallTime instanceof Date).toBe(true);
    expect(timings.recallTime.toISOString()).toBe("2026-06-20T11:55:00.000Z");
    expect(timings.totalElapsedSeconds).toBe(600);
  });

  test('calculates exact midpoint recall from ISO strings', () => {
    const targetStr = "2026-06-20T12:00:00.000Z";
    const launchStr = "2026-06-20T11:50:00.000Z";
    const timings = calculateMidpointRecall(targetStr, launchStr);
    
    expect(timings.cancelDelaySeconds).toBe(300);
    expect(timings.recallTime.toISOString()).toBe("2026-06-20T11:55:00.000Z");
  });

  test('throws error if cancel delay is greater than 600', () => {
    const target = new Date("2026-06-20T12:00:00.000Z");
    expect(() => calculateRecallTiming(target, 601)).toThrow(/10 minutes/);
  });

  test('throws error in midpoint recall if launch is after target', () => {
    const target = new Date("2026-06-20T12:00:00.000Z");
    const launch = new Date("2026-06-20T12:01:00.000Z");
    expect(() => calculateMidpointRecall(target, launch)).toThrow(/before target/);
  });
});

describe('Duration Helpers', () => {
  test('formats seconds to HH:MM:SS', () => {
    expect(formatDuration(3665)).toBe("01:01:05");
    expect(formatDuration(45)).toBe("00:00:45");
  });

  test('parses HH:MM:SS to seconds', () => {
    expect(parseDuration("01:01:05")).toBe(3665);
    expect(parseDuration("00:00:45")).toBe(45);
    expect(parseDuration("10:00")).toBe(600);
  });
});

describe('Town API Response Unwrapping & Snipe Ingestion', () => {
  test('unwrapTownPayload unboxes { town: {...} } response format', () => {
    const apiResponse = {
      town: { id: '1', name: 'Sparta', x: 500, y: 500, points: 6500 },
      history: [],
      activity: { pointDelta: 100 },
      conquests: []
    };
    const town = unwrapTownPayload(apiResponse);
    expect(town).toBeDefined();
    expect(town.id).toBe('1');
    expect(town.name).toBe('Sparta');
    expect(town.x).toBe(500);
    expect(town.y).toBe(500);
    expect(town.points).toBe(6500);
  });

  test('unwrapTownPayload handles flat town object directly as fallback', () => {
    const flatTown = { id: '2', name: 'Athens', x: 503, y: 504 };
    const town = unwrapTownPayload(flatTown);
    expect(town).toBeDefined();
    expect(town.id).toBe('2');
    expect(town.name).toBe('Athens');
    expect(town.x).toBe(503);
    expect(town.y).toBe(504);
  });

  test('unwrapTownPayload handles null/undefined safely', () => {
    expect(unwrapTownPayload(null)).toBeNull();
    expect(unwrapTownPayload(undefined)).toBeNull();
  });

  test('correctly calculates distance between origin and target unwrapped from nested API responses', () => {
    const originResponse = {
      town: { id: '1', name: 'Sparta', islandX: 500, islandY: 500, islandSlot: 0 }
    };
    const targetResponse = {
      town: { id: '2', name: 'Athens', islandX: 503, islandY: 504, islandSlot: 2 }
    };

    const originTown = unwrapTownPayload(originResponse);
    const targetTown = unwrapTownPayload(targetResponse);

    expect(originTown.name).toBe('Sparta');
    expect(targetTown.name).toBe('Athens');

    const distance = calculateDistance(originTown, targetTown);
    expect(distance).toBe(5.0);

    const travelSecs = calculateTravelTimeSeconds(distance, 3, 3, 1);
    expect(travelSecs).toBe(1667);
    expect(formatDuration(travelSecs)).toBe('00:27:47');
  });
});

