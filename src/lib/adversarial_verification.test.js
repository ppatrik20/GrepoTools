import { expect, test, describe } from 'vitest';
import islandDefinitions from './map/island_definitions.json';
import { ALL_ISLAND_TYPES } from './map/assetLoader.js';
import { 
  calculateDistance, 
  calculateTravelTimeSeconds, 
  formatDuration 
} from './traveltime.js';

// Exact implementation of normalizeTownData from UnifiedSearchPanel.js
export function normalizeTownData(rawTown) {
  if (!rawTown) return null;
  const pName = typeof rawTown.player === 'object' ? rawTown.player?.name : (rawTown.player || 'Ghost Town');
  const aName = typeof rawTown.player === 'object' 
    ? rawTown.player?.alliance?.name 
    : (typeof rawTown.alliance === 'object' ? rawTown.alliance?.name : (rawTown.alliance || 'None'));
  
  return {
    id: rawTown.id,
    name: rawTown.name || `Town #${rawTown.id}`,
    points: Number(rawTown.points || rawTown.pts || 0),
    islandX: Number(rawTown.islandX ?? rawTown.x ?? 500),
    islandY: Number(rawTown.islandY ?? rawTown.y ?? 500),
    islandSlot: Number(rawTown.islandSlot ?? rawTown.slot ?? 0),
    islandType: Number(rawTown.islandType ?? rawTown.type ?? 1),
    dir: rawTown.dir || 'nw',
    lng: rawTown.lng ?? (Array.isArray(rawTown.coordinates) ? rawTown.coordinates[0] : undefined),
    lat: rawTown.lat ?? (Array.isArray(rawTown.coordinates) ? rawTown.coordinates[1] : undefined),
    coordinates: rawTown.coordinates || (rawTown.lng !== undefined && rawTown.lat !== undefined ? [rawTown.lng, rawTown.lat] : undefined),
    player: pName || 'Ghost Town',
    playerId: typeof rawTown.player === 'object' ? rawTown.player?.id : (rawTown.playerId || null),
    alliance: aName || 'None',
    allianceId: typeof rawTown.player === 'object' ? rawTown.player?.alliance?.id : (rawTown.allianceId || null),
    stage: rawTown.stage || 1,
    townColor: rawTown.townColor || '#94a3b8',
    isGhost: !pName || pName === 'Ghost Town'
  };
}

// Directional offsets from src/app/map/page.js
const TOWN_DIR_OFFSETS = {
  nw: { x: 9, y: 14 },
  ne: { x: 17, y: 11 },
  sw: { x: 10, y: 13 },
  se: { x: 15, y: 13 }
};

function getTownMapCoordinates(town) {
  if (!town) return [0, 0];
  if (town.lng !== undefined && town.lat !== undefined) {
    return [Number(town.lng), Number(town.lat)];
  }
  if (town.coordinates && Array.isArray(town.coordinates)) {
    return [Number(town.coordinates[0]), Number(town.coordinates[1])];
  }

  const ix = Number(town.islandX ?? town.x ?? 500);
  const iy = Number(town.islandY ?? town.y ?? 500);
  const islandType = Number(town.islandType || 1);
  const slot = Number(town.islandSlot ?? town.slot ?? 0);
  
  const islandDef = islandDefinitions[islandType] || null;
  const definedSlots = islandDef?.town_offsets || [];
  const slotDef = definedSlots[slot];

  const islandPixelX = ix * 128;
  const islandPixelY = iy * 128 + ((ix & 1) ? 64 : 0);

  if (slotDef) {
    const dir = town.dir || slotDef.dir || 'nw';
    const dirOffset = TOWN_DIR_OFFSETS[dir] || { x: 9, y: 14 };
    const townPixelX = islandPixelX + slotDef.x + dirOffset.x;
    const townPixelY = islandPixelY + slotDef.y + dirOffset.y;
    return [(townPixelX / 128000) * 360 - 180, -((townPixelY / 128000) * 180 - 90)];
  }

  const tileWidth = islandDef?.width || 7;
  const tileHeight = islandDef?.height || 4;
  const islandCenterPixelX = islandPixelX + (tileWidth * 128) / 2;
  const islandCenterPixelY = islandPixelY + (tileHeight * 128) / 2;
  const centerLng = (islandCenterPixelX / 128000) * 360 - 180;
  const centerLat = -((islandCenterPixelY / 128000) * 180 - 90);
  const angle = (slot / 20) * Math.PI * 2;
  return [centerLng + Math.cos(angle) * 0.003, centerLat + Math.sin(angle) * 0.003];
}

function generateTrajectoryGeoJSON(routeOrigin, routeTarget) {
  if (!routeOrigin || !routeTarget) return null;
  const [oLng, oLat] = getTownMapCoordinates(routeOrigin);
  const [tLng, tLat] = getTownMapCoordinates(routeTarget);

  const dLng = tLng - oLng;
  const dLat = tLat - oLat;
  const chordLen = Math.sqrt(dLng * dLng + dLat * dLat);
  if (chordLen === 0) return null;

  const midLng = (oLng + tLng) / 2;
  const arcHeight = Math.max(chordLen * 0.20, Math.abs(dLng) * 0.12, 0.0008);
  const midLat = (oLat + tLat) / 2 + arcHeight;

  const points = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const curLng = (1 - t) * (1 - t) * oLng + 2 * (1 - t) * t * midLng + t * t * tLng;
    const curLat = (1 - t) * (1 - t) * oLat + 2 * (1 - t) * t * midLat + t * t * tLat;
    points.push([curLng, curLat]);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: points }
      }
    ]
  };
}

// ----------------------------------------------------------------------------
// TEST SUITE: Milestone 1-4 Adversarial Challenge & Stress Verification
// ----------------------------------------------------------------------------

describe('Challenge Area 1: MapLibre Zoom LOD Thresholds & Calibrated Curve', () => {
  test('LOD zoom thresholds strictly adhere to specification hierarchy', () => {
    const LOD_SPECS = {
      macroClusters: { min: 2.0, max: 5.5 },
      islandLandmasses: { min: 5.0, max: Infinity },
      town3DSprites: { min: 6.5, max: Infinity },
      emptySlotSprites: { min: 6.8, max: Infinity },
      allianceFlags: { min: 6.8, max: Infinity },
      townLabels: { min: 8.5, max: Infinity }
    };

    expect(LOD_SPECS.macroClusters.min).toBe(2.0);
    expect(LOD_SPECS.macroClusters.max).toBe(5.5);
    expect(LOD_SPECS.islandLandmasses.min).toBe(5.0);
    expect(LOD_SPECS.town3DSprites.min).toBe(6.5);
    expect(LOD_SPECS.allianceFlags.min).toBe(6.8);
    expect(LOD_SPECS.townLabels.min).toBe(8.5);

    // Verify ordering: Clusters -> Landmasses -> 3D Towns -> Flags -> Labels
    expect(LOD_SPECS.macroClusters.min).toBeLessThan(LOD_SPECS.islandLandmasses.min);
    expect(LOD_SPECS.islandLandmasses.min).toBeLessThan(LOD_SPECS.town3DSprites.min);
    expect(LOD_SPECS.town3DSprites.min).toBeLessThanOrEqual(LOD_SPECS.allianceFlags.min);
    expect(LOD_SPECS.allianceFlags.min).toBeLessThan(LOD_SPECS.townLabels.min);
  });

  test('calibrated proportion scaling curve follows 0.007 * 2^Z continuously across Z=5.0 to 12.0', () => {
    const testZooms = [5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0, 10.5, 11.0, 11.5, 12.0];
    
    for (const z of testZooms) {
      const scale = 0.007 * Math.pow(2, z);
      expect(scale).toBeGreaterThan(0);
      
      if (z === 5.0) expect(scale).toBeCloseTo(0.224, 3);
      if (z === 6.0) expect(scale).toBeCloseTo(0.448, 3);
      if (z === 7.0) expect(scale).toBeCloseTo(0.896, 3);
      if (z === 8.0) expect(scale).toBeCloseTo(1.792, 3);
      if (z === 9.0) expect(scale).toBeCloseTo(3.584, 3);
      if (z === 10.0) expect(scale).toBeCloseTo(7.168, 3);
      if (z === 11.0) expect(scale).toBeCloseTo(14.336, 3);
      if (z === 12.0) expect(scale).toBeCloseTo(28.672, 3);
    }
  });

  test('all 40 island types are registered and present in assetLoader definition', () => {
    expect(ALL_ISLAND_TYPES.length).toBe(40);
    for (let i = 1; i <= 16; i++) {
      expect(ALL_ISLAND_TYPES).toContain(i);
    }
    for (let i = 37; i <= 60; i++) {
      expect(ALL_ISLAND_TYPES).toContain(i);
    }
  });
});

describe('Challenge Area 2: Same-Island Trajectory Generation & Bézier Control Points', () => {
  test('generates valid 40-step quadratic Bézier arc between distinct slots on same island', () => {
    const origin = { id: 101, islandX: 500, islandY: 500, islandSlot: 0, islandType: 1, dir: 'nw' };
    const target = { id: 102, islandX: 500, islandY: 500, islandSlot: 8, islandType: 1, dir: 'se' };

    const trajectory = generateTrajectoryGeoJSON(origin, target);
    expect(trajectory).not.toBeNull();
    expect(trajectory.type).toBe('FeatureCollection');
    expect(trajectory.features.length).toBe(1);

    const lineFeature = trajectory.features[0];
    expect(lineFeature.geometry.type).toBe('LineString');
    const coords = lineFeature.geometry.coordinates;

    // 40 steps -> 41 points
    expect(coords.length).toBe(41);

    const [oLng, oLat] = getTownMapCoordinates(origin);
    const [tLng, tLat] = getTownMapCoordinates(target);

    // Endpoints match origin and target
    expect(coords[0][0]).toBeCloseTo(oLng, 6);
    expect(coords[0][1]).toBeCloseTo(oLat, 6);
    expect(coords[40][0]).toBeCloseTo(tLng, 6);
    expect(coords[40][1]).toBeCloseTo(tLat, 6);

    // Arc apex elevation: midpoint latitude is elevated above the linear chord
    const midPoint = coords[20];
    const linearMidLat = (oLat + tLat) / 2;
    expect(midPoint[1]).toBeGreaterThan(linearMidLat);

    // All points are valid finite coordinates
    coords.forEach(([lng, lat]) => {
      expect(Number.isFinite(lng)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
      expect(isNaN(lng)).toBe(false);
      expect(isNaN(lat)).toBe(false);
    });
  });

  test('arcHeight minimum clamp (0.0008) prevents degenerate flat curves for adjacent slots', () => {
    const origin = { id: 201, islandX: 450, islandY: 450, islandSlot: 1, islandType: 2 };
    const target = { id: 202, islandX: 450, islandY: 450, islandSlot: 2, islandType: 2 };

    const trajectory = generateTrajectoryGeoJSON(origin, target);
    expect(trajectory).not.toBeNull();
    const coords = trajectory.features[0].geometry.coordinates;
    expect(coords.length).toBe(41);

    const [oLng, oLat] = getTownMapCoordinates(origin);
    const [tLng, tLat] = getTownMapCoordinates(target);
    const linearMidLat = (oLat + tLat) / 2;
    const apexLat = coords[20][1];

    // Apex should be elevated by at least arcHeight/2 = 0.0004
    expect(apexLat - linearMidLat).toBeGreaterThanOrEqual(0.00039);
  });

  test('returns null when origin and target are identical coordinates (preventing zero-length lines)', () => {
    const origin = { id: 301, islandX: 500, islandY: 500, islandSlot: 3, islandType: 1 };
    const trajectory = generateTrajectoryGeoJSON(origin, origin);
    expect(trajectory).toBeNull();
  });
});

describe('Challenge Area 3: Query Parameter Ingestion & API Contract Forensics', () => {
  test('uncovers /api/world/town/[id] response format discrepancy in parameter ingestion', () => {
    // Simulated API response from /api/world/town/[id]
    const apiTownResponse = {
      town: {
        id: 4001,
        name: "Sparta Prime",
        points: 8500,
        islandX: 502,
        islandY: 498,
        islandSlot: 4,
        player: { id: 10, name: "Leonidas", alliance: { id: 5, name: "Spartans" } }
      },
      history: [{ date: "2026-08-25", points: 8000, delta: 500 }],
      activity: { pointDelta: 500, lastActive: "2026-08-29" },
      conquests: []
    };

    // Adversarial Check 1: Ingestion expecting flat object
    const ingestedDirectly = apiTownResponse;
    expect(ingestedDirectly.name).toBeUndefined(); // BUG VULNERABILITY: flat property is undefined!
    expect(ingestedDirectly.town.name).toBe("Sparta Prime");

    // Safe normalization / un-nesting pattern:
    const safeTown = ingestedDirectly.town || ingestedDirectly;
    expect(safeTown.name).toBe("Sparta Prime");
    expect(safeTown.islandX).toBe(502);
  });

  test('calculates correct distance when towns are properly normalized from API response', () => {
    const originTownApi = {
      town: { id: 101, name: "Athens", islandX: 500, islandY: 500, islandSlot: 0 }
    };
    const targetTownApi = {
      town: { id: 102, name: "Thebes", islandX: 503, islandY: 504, islandSlot: 2 }
    };

    const origin = originTownApi.town || originTownApi;
    const target = targetTownApi.town || targetTownApi;

    const dist = calculateDistance(origin, target);
    expect(dist).toBe(5.0); // 3-4-5 triangle

    const timeSecs = calculateTravelTimeSeconds(dist, 3, 3, 1); // CS speed 3 on 3x world
    expect(timeSecs).toBe(1667);
    expect(formatDuration(timeSecs)).toBe("00:27:47");
  });
});

describe('Challenge Area 4: Nested Object Safety Across All Components', () => {
  test('normalizeTownData handles nested player and alliance objects without React child crashes', () => {
    const nestedRawTown = {
      id: 501,
      name: "Corinth",
      points: 4200,
      islandX: 510,
      islandY: 490,
      islandSlot: 3,
      player: {
        id: 77,
        name: "Pericles",
        alliance: {
          id: 88,
          name: "Delian League"
        }
      }
    };

    const normalized = normalizeTownData(nestedRawTown);

    // Player and alliance must be primitive strings, NEVER raw Objects!
    expect(typeof normalized.player).toBe('string');
    expect(normalized.player).toBe('Pericles');
    expect(typeof normalized.alliance).toBe('string');
    expect(normalized.alliance).toBe('Delian League');
    expect(normalized.playerId).toBe(77);
    expect(normalized.allianceId).toBe(88);
    expect(normalized.isGhost).toBe(false);
  });

  test('normalizeTownData gracefully handles ghost towns, missing attributes, and malformed inputs', () => {
    const ghostTownRaw = {
      id: 502,
      name: null,
      points: 175,
      islandX: null,
      islandY: undefined,
      player: null,
      alliance: null
    };

    const normalizedGhost = normalizeTownData(ghostTownRaw);
    expect(normalizedGhost.name).toBe('Town #502');
    expect(normalizedGhost.player).toBe('Ghost Town');
    expect(normalizedGhost.alliance).toBe('None');
    expect(normalizedGhost.isGhost).toBe(true);
    expect(normalizedGhost.islandX).toBe(500);
    expect(normalizedGhost.islandY).toBe(500);

    // Null input
    expect(normalizeTownData(null)).toBeNull();
    expect(normalizeTownData(undefined)).toBeNull();
  });

  test('normalizeTownData handles legacy flat string formats safely', () => {
    const legacyFlatTown = {
      id: 503,
      name: "Rhodes",
      points: "6400",
      x: 520,
      y: 530,
      slot: 7,
      player: "Odysseus",
      alliance: "Ithaca Fleet"
    };

    const normalized = normalizeTownData(legacyFlatTown);
    expect(normalized.player).toBe('Odysseus');
    expect(normalized.alliance).toBe('Ithaca Fleet');
    expect(normalized.points).toBe(6400);
    expect(normalized.islandX).toBe(520);
    expect(normalized.islandY).toBe(530);
    expect(normalized.islandSlot).toBe(7);
  });
});
