import { describe, test, expect } from 'vitest';
import { computeAllianceDominions } from '../../src/lib/map/dominions.js';

describe('Connected Alliance Territorial Dominions Engine', () => {
  test('returns empty FeatureCollections when given empty or null inputs', () => {
    const empty1 = computeAllianceDominions([], []);
    expect(empty1.polygons.type).toBe('FeatureCollection');
    expect(empty1.polygons.features).toHaveLength(0);
    expect(empty1.labels.type).toBe('FeatureCollection');
    expect(empty1.labels.features).toHaveLength(0);

    const empty2 = computeAllianceDominions(null, null);
    expect(empty2.polygons.features).toHaveLength(0);
  });

  test('does not chain distant towns across oceans into giant spanning polygons', () => {
    const mockTowns = [
      // Cluster A (Ocean 55, near x: 500, y: 500)
      { x: 500, y: 500, alliance: 'WANTED' },
      { x: 502, y: 501, alliance: 'WANTED' },
      { x: 503, y: 504, alliance: 'WANTED' },
      // Cluster B (Ocean 34, near x: 340, y: 440 - far away)
      { x: 340, y: 440, alliance: 'WANTED' },
      { x: 342, y: 441, alliance: 'WANTED' },
      { x: 343, y: 443, alliance: 'WANTED' }
    ];

    const alliances = [{ name: 'WANTED', color: '#ef4444' }];
    const result = computeAllianceDominions(mockTowns, alliances);

    // Should create 2 distinct local dominions, NOT 1 giant triangle
    expect(result.polygons.features).toHaveLength(2);
    expect(result.polygons.features[0].properties.townCount).toBe(3);
    expect(result.polygons.features[1].properties.townCount).toBe(3);
  });

  test('generates valid closed GeoJSON Polygon geometry with smooth ring', () => {
    const mockTowns = [
      { x: 500, y: 500, alliance: 'ALPHA' },
      { x: 501, y: 502, alliance: 'ALPHA' },
      { x: 504, y: 503, alliance: 'ALPHA' },
      { x: 502, y: 505, alliance: 'ALPHA' }
    ];

    const alliances = [{ name: 'ALPHA', color: '#3b82f6' }];
    const result = computeAllianceDominions(mockTowns, alliances);

    expect(result.polygons.features).toHaveLength(1);
    const poly = result.polygons.features[0];
    expect(poly.geometry.type).toBe('Polygon');
    const ring = poly.geometry.coordinates[0];
    expect(ring.length).toBeGreaterThanOrEqual(4);

    // Ring must be closed (first coordinate equals last coordinate)
    expect(ring[0][0]).toBeCloseTo(ring[ring.length - 1][0], 4);
    expect(ring[0][1]).toBeCloseTo(ring[ring.length - 1][1], 4);
  });

  test('scales border width dynamically based on town count', () => {
    const smallCluster = [
      { x: 500, y: 500, alliance: 'SMALL' },
      { x: 501, y: 501, alliance: 'SMALL' },
      { x: 502, y: 502, alliance: 'SMALL' }
    ];
    const bigCluster = Array.from({ length: 35 }, (_, i) => ({
      x: 600 + (i % 5),
      y: 600 + Math.floor(i / 5),
      alliance: 'BIG'
    }));

    const alliances = [
      { name: 'SMALL', color: '#eab308' },
      { name: 'BIG', color: '#10b981' }
    ];

    const result = computeAllianceDominions([...smallCluster, ...bigCluster], alliances);
    const smallPoly = result.polygons.features.find(p => p.properties.alliance === 'SMALL');
    const bigPoly = result.polygons.features.find(p => p.properties.alliance === 'BIG');

    expect(smallPoly.properties.borderWidth).toBeLessThan(bigPoly.properties.borderWidth);
  });

  test('generates centroid label for significant holdings', () => {
    const mockTowns = [
      { x: 500, y: 500, alliance: 'IMPERIAL' },
      { x: 501, y: 501, alliance: 'IMPERIAL' },
      { x: 502, y: 502, alliance: 'IMPERIAL' },
      { x: 503, y: 503, alliance: 'IMPERIAL' }
    ];
    const alliances = [{ name: 'IMPERIAL', color: '#8b5cf6' }];
    const result = computeAllianceDominions(mockTowns, alliances);

    expect(result.labels.features).toHaveLength(1);
    const label = result.labels.features[0];
    expect(label.geometry.type).toBe('Point');
    expect(label.properties.label).toContain('IMPERIAL');
    expect(label.properties.label).toContain('4');
  });
});
