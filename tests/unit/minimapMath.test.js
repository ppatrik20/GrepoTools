import { expect, test, describe } from 'vitest';
import { 
  worldToLngLat, 
  lngLatToWorld, 
  projectWorldToMinimap, 
  projectMinimapClickToWorld, 
  calculateViewportFrustum 
} from '../../src/lib/map/minimapMath.js';

describe('Milestone 5: Minimap Radar Math Unit Tests', () => {
  describe('Projections & Inverses', () => {
    test('worldToLngLat converts origin (500, 500) to (0, 0)', () => {
      const [lng, lat] = worldToLngLat(500, 500);
      expect(lng).toBe(0);
      expect(lat).toBe(0);
    });

    test('lngLatToWorld converts (0, 0) to (500, 500)', () => {
      const { x, y } = lngLatToWorld(0, 0);
      expect(x).toBe(500);
      expect(y).toBe(500);
    });

    test('bijective round-trip consistency across entire world bounds', () => {
      const testCoordinates = [
        { x: 0, y: 0 },
        { x: 250, y: 750 },
        { x: 500, y: 500 },
        { x: 1000, y: 1000 },
        { x: 123, y: 876 }
      ];

      testCoordinates.forEach(({ x, y }) => {
        const [lng, lat] = worldToLngLat(x, y);
        const inv = lngLatToWorld(lng, lat);
        expect(inv.x).toBe(x);
        expect(inv.y).toBe(y);
      });
    });

    test('projectMinimapClickToWorld maps click coordinates correctly', () => {
      const click = projectMinimapClickToWorld(110, 110, 220, 220);
      expect(click.worldX).toBe(500);
      expect(click.worldY).toBe(500);
      expect(click.lng).toBe(0);
      expect(click.lat).toBe(0);
    });
  });

  describe('Viewport Frustum Calculation', () => {
    test('computes symmetric bounding box around camera position', () => {
      const frustum = calculateViewportFrustum({ longitude: 0, latitude: 0, zoom: 6 });
      expect(frustum.minLng).toBeLessThan(0);
      expect(frustum.maxLng).toBeGreaterThan(0);
      expect(frustum.minLat).toBeLessThan(0);
      expect(frustum.maxLat).toBeGreaterThan(0);
      expect(frustum.width).toBeGreaterThan(0);
      expect(frustum.height).toBeGreaterThan(0);
    });

    test('higher zoom produces smaller bounding box', () => {
      const fZoom4 = calculateViewportFrustum({ longitude: 0, latitude: 0, zoom: 4 });
      const fZoom8 = calculateViewportFrustum({ longitude: 0, latitude: 0, zoom: 8 });

      expect(fZoom8.width).toBeLessThan(fZoom4.width);
      expect(fZoom8.height).toBeLessThan(fZoom4.height);
    });
  });
});
