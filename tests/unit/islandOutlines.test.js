import { describe, it, expect } from 'vitest';
import islandOutlines from '../../src/lib/map/island_outlines.json';
import islandDefs from '../../src/lib/map/island_definitions.json';

describe('Vector Island Outlines Integrity', () => {
  const COLONIZABLE_TYPES = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    11, 12, 13, 14, 15, 16,
    37, 38, 39, 40, 41, 42, 43, 44, 45, 46,
    47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60
  ];

  it('contains outlines for all 40 colonizable island types', () => {
    for (const type of COLONIZABLE_TYPES) {
      expect(islandOutlines[type], `Type ${type} should exist in island_outlines.json`).toBeDefined();
      expect(islandOutlines[type].exterior).toBeInstanceOf(Array);
      expect(islandOutlines[type].exterior.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('verifies exterior coordinates are properly normalized within [0, 1]', () => {
    for (const type of COLONIZABLE_TYPES) {
      const outline = islandOutlines[type];
      for (const [x, y] of outline.exterior) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      }
    }
  });

  it('contains procedural outlines for decorative rocks (types 17-36)', () => {
    for (let type = 17; type <= 36; type++) {
      expect(islandOutlines[type], `Rock type ${type} should exist`).toBeDefined();
      expect(islandOutlines[type].exterior.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('contains outline for rock island 999', () => {
    expect(islandOutlines['999']).toBeDefined();
    expect(islandOutlines['999'].exterior.length).toBeGreaterThanOrEqual(8);
  });

  it('validates that town offsets fall within the physical island footprint', () => {
    for (const type of COLONIZABLE_TYPES) {
      const def = islandDefs[type];
      const outline = islandOutlines[type];
      if (!def || !def.town_offsets) continue;

      const tileW = (outline.width || def.width) * 128;
      const tileH = (outline.height || def.height) * 128;

      const polyX = outline.exterior.map(p => p[0] * tileW);
      const polyY = outline.exterior.map(p => p[1] * tileH);
      const minPolyX = Math.min(...polyX);
      const maxPolyX = Math.max(...polyX);
      const minPolyY = Math.min(...polyY);
      const maxPolyY = Math.max(...polyY);

      // Verify each town slot is within a reasonable margin of the island polygon
      for (const slot of def.town_offsets) {
        // Towns can sit on piers/beaches up to 80px outside raw visual land centroid
        expect(slot.x).toBeGreaterThanOrEqual(minPolyX - 80);
        expect(slot.x).toBeLessThanOrEqual(maxPolyX + 80);
        expect(slot.y).toBeGreaterThanOrEqual(minPolyY - 80);
        expect(slot.y).toBeLessThanOrEqual(maxPolyY + 80);
      }
    }
  });

  it('includes inner contours for large and medium islands for topographic detail', () => {
    let islandsWithContours = 0;
    for (const type of COLONIZABLE_TYPES) {
      const outline = islandOutlines[type];
      if (outline.contours && outline.contours.length > 0) {
        islandsWithContours++;
        for (const contour of outline.contours) {
          expect(contour.length).toBeGreaterThanOrEqual(6);
          for (const [x, y] of contour) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(1);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(1);
          }
        }
      }
    }
    // At least 30 of the 40 colonizable islands should have interior contours
    expect(islandsWithContours).toBeGreaterThanOrEqual(30);
  });
});
