import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import townOutlines from '../../src/lib/map/town_outlines.json';
import { getTownStage } from '../../src/lib/geojson.js';

describe('Vector Town Outlines & Dynamic SVG Icons Integrity', () => {
  const STAGES = [1, 2, 3, 4, 5];
  const ALL_KEYS = ['1', '2', '3', '4', '5', 'ghost', 'empty_slot'];

  it('contains outlines for all 5 stages, ghost town, and colonization slot', () => {
    for (const key of ALL_KEYS) {
      expect(townOutlines[key], `Stage/Key ${key} should exist in town_outlines.json`).toBeDefined();
      expect(townOutlines[key].exterior).toBeInstanceOf(Array);
      expect(townOutlines[key].exterior.length).toBeGreaterThanOrEqual(8);
      expect(townOutlines[key].width).toBeGreaterThan(0);
      expect(townOutlines[key].height).toBeGreaterThan(0);
    }
  });

  it('verifies exterior coordinates are properly normalized within [0, 1]', () => {
    for (const key of ALL_KEYS) {
      const outline = townOutlines[key];
      for (const [x, y] of outline.exterior) {
        expect(x, `Stage ${key} X coordinate`).toBeGreaterThanOrEqual(0);
        expect(x, `Stage ${key} X coordinate`).toBeLessThanOrEqual(1);
        expect(y, `Stage ${key} Y coordinate`).toBeGreaterThanOrEqual(0);
        expect(y, `Stage ${key} Y coordinate`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('verifies inner architectural contours exist for town stages', () => {
    for (const stage of STAGES) {
      const outline = townOutlines[stage];
      expect(outline.contours).toBeInstanceOf(Array);
      expect(outline.contours.length).toBeGreaterThanOrEqual(1);
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
  });

  it('verifies all generated SVG icon files and matching PNG assets exist on disk with valid vector markup', () => {
    const publicTownsDir = path.join(__dirname, '..', '..', 'public', 'map', 'towns');
    const publicSlotsDir = path.join(__dirname, '..', '..', 'public', 'map', 'slots');

    const expectedSvgFiles = [
      path.join(publicTownsDir, 'town_1.svg'),
      path.join(publicTownsDir, 'town_2.svg'),
      path.join(publicTownsDir, 'town_3.svg'),
      path.join(publicTownsDir, 'town_4.svg'),
      path.join(publicTownsDir, 'town_5.svg'),
      path.join(publicTownsDir, 'town_ghost.svg'),
      path.join(publicSlotsDir, 'empty_slot.svg')
    ];

    for (const filePath of expectedSvgFiles) {
      expect(fs.existsSync(filePath), `SVG file ${path.basename(filePath)} must exist`).toBe(true);
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('<svg');
      expect(content).toContain('viewBox="0 0 256 256"');
      expect(content).toContain('width="256"');
      expect(content).toContain('height="256"');
      expect(content).toContain('</svg>');
      // Verify SVG contains vector elements
      const hasVectorElements = content.includes('<path') || content.includes('<polygon') || content.includes('<circle');
      expect(hasVectorElements).toBe(true);

      // Verify matching PNG exists
      const pngPath = filePath.replace(/\.svg$/, '.png');
      expect(fs.existsSync(pngPath), `Matching PNG file ${path.basename(pngPath)} must exist`).toBe(true);
    }
  });

  it('verifies true alpha transparency in negative spaces for MapLibre SDF colorability', async () => {
    const sharp = (await import('sharp')).default;
    const publicTownsDir = path.join(__dirname, '..', '..', 'public', 'map', 'towns');
    const publicSlotsDir = path.join(__dirname, '..', '..', 'public', 'map', 'slots');

    // 1. Empty slot center mooring pool must have alpha = 0 (not a solid blob)
    const slotBuffer = await sharp(path.join(publicSlotsDir, 'empty_slot.png')).raw().toBuffer({ resolveWithObject: true });
    const slotCenterAlpha = slotBuffer.data[(128 * 256 + 128) * 4 + 3];
    expect(slotCenterAlpha, 'Empty slot center pool must have alpha 0').toBe(0);
    const slotRingAlpha = slotBuffer.data[(52 * 256 + 128) * 4 + 3];
    expect(slotRingAlpha, 'Empty slot outer ring must have alpha > 0').toBeGreaterThan(200);

    // 2. Town 1 door cutout must have alpha = 0
    const t1Buffer = await sharp(path.join(publicTownsDir, 'town_1.png')).raw().toBuffer({ resolveWithObject: true });
    const t1DoorAlpha = t1Buffer.data[(190 * 256 + 128) * 4 + 3];
    expect(t1DoorAlpha, 'Town 1 door cutout must have alpha 0').toBe(0);
    const t1WallAlpha = t1Buffer.data[(190 * 256 + 80) * 4 + 3];
    expect(t1WallAlpha, 'Town 1 wall must be opaque').toBeGreaterThan(200);

    // 3. Town 4 colonnade inter-column gap must have alpha = 0
    const t4Buffer = await sharp(path.join(publicTownsDir, 'town_4.png')).raw().toBuffer({ resolveWithObject: true });
    const t4GapAlpha = t4Buffer.data[(100 * 256 + 121) * 4 + 3];
    expect(t4GapAlpha, 'Town 4 inter-column gap must have alpha 0').toBe(0);
    const t4ColAlpha = t4Buffer.data[(100 * 256 + 110) * 4 + 3];
    expect(t4ColAlpha, 'Town 4 column pillar must be opaque').toBeGreaterThan(200);
  });

  it('verifies town foundation baseline sits near bottom of canvas to prevent floating sprites', () => {
    for (const key of ['1', '2', '3', '4', '5', 'ghost']) {
      const outline = townOutlines[key];
      const maxY = Math.max(...outline.exterior.map(p => p[1]));
      expect(maxY, `Stage ${key} baseline maxY should be grounded near bottom (>= 0.8)`).toBeGreaterThanOrEqual(0.80);
    }
  });

  it('verifies point thresholds map accurately to official town stages', () => {
    // Stage 1: Hamlet (< 600)
    expect(getTownStage(175)).toBe(1);
    expect(getTownStage(599)).toBe(1);
    // Stage 2: Village (600 - 2399)
    expect(getTownStage(600)).toBe(2);
    expect(getTownStage(2399)).toBe(2);
    // Stage 3: Town (2400 - 5499)
    expect(getTownStage(2400)).toBe(3);
    expect(getTownStage(5499)).toBe(3);
    // Stage 4: City (5500 - 9999)
    expect(getTownStage(5500)).toBe(4);
    expect(getTownStage(9999)).toBe(4);
    // Stage 5: Metropolis (10000+)
    expect(getTownStage(10000)).toBe(5);
    expect(getTownStage(17500)).toBe(5);
    // Edge cases
    expect(getTownStage(null)).toBe(1);
    expect(getTownStage(undefined)).toBe(1);
    expect(getTownStage(0)).toBe(1);
  });
});
