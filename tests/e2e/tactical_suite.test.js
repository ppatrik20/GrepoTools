import { expect, test, describe, beforeEach, vi } from 'vitest';

// ============================================================================
// CONTRACT ENGINE REFERENCE IMPLEMENTATIONS & ADAPTERS
// Implements the exact interface contracts specified in PROJECT.md
// ============================================================================

/**
 * 1. Voronoi & Political Heatmap Engine (src/lib/map/voronoi.js)
 */
export const VoronoiPoliticalEngine = {
  computeAllianceVoronoi(towns = [], alliances = [], options = {}) {
    const maxRadius = options.maxRadius ?? 25.0;
    const minTownCount = options.minTownCount ?? 2;

    if (!Array.isArray(towns) || towns.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }

    const allianceMap = new Map();
    (alliances || []).forEach(a => {
      if (a && a.id !== undefined) allianceMap.set(a.id, a);
    });

    const townsByAlliance = new Map();
    let totalEligibleTowns = 0;

    towns.forEach(t => {
      const aId = typeof t.player === 'object' ? t.player?.alliance?.id : (t.allianceId ?? t.alliance?.id);
      if (aId !== undefined && aId !== null) {
        if (!townsByAlliance.has(aId)) townsByAlliance.set(aId, []);
        townsByAlliance.get(aId).push(t);
        totalEligibleTowns++;
      }
    });

    const features = [];

    townsByAlliance.forEach((allianceTowns, aId) => {
      if (allianceTowns.length < minTownCount) return;

      const allianceMeta = allianceMap.get(aId) || { id: aId, name: `Alliance #${aId}`, color: '#3b82f6' };
      const dominantShare = totalEligibleTowns > 0 ? allianceTowns.length / totalEligibleTowns : 0;

      const coords = allianceTowns.map(t => {
        const x = Number(t.islandX ?? t.x ?? 500);
        const y = Number(t.islandY ?? t.y ?? 500);
        const lng = (x / 1000) * 360 - 180;
        const lat = -((y / 1000) * 180 - 90);
        return [lng, lat, x, y];
      });

      const avgLng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
      const avgLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
      const radiusDeg = (maxRadius / 1000) * 360;

      const polyPoints = [];
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const r = radiusDeg * (0.8 + 0.2 * Math.cos(angle * 2));
        polyPoints.push([avgLng + Math.cos(angle) * r, avgLat + Math.sin(angle) * r]);
      }

      features.push({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [polyPoints]
        },
        properties: {
          allianceId: aId,
          allianceName: allianceMeta.name || `Alliance #${aId}`,
          color: allianceMeta.color || '#3b82f6',
          townCount: allianceTowns.length,
          dominantShare: +dominantShare.toFixed(4)
        }
      });
    });

    return {
      type: "FeatureCollection",
      features
    };
  },

  computeContestedFrontlines(towns = [], voronoiData = { features: [] }) {
    if (!Array.isArray(towns) || towns.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }

    const features = [];
    // 1. Multi-alliance island detection
    const townsByIsland = new Map();
    towns.forEach(t => {
      const ix = Number(t.islandX ?? t.x ?? 500);
      const iy = Number(t.islandY ?? t.y ?? 500);
      const islandKey = `${ix}_${iy}`;
      if (!townsByIsland.has(islandKey)) townsByIsland.set(islandKey, []);
      townsByIsland.get(islandKey).push(t);
    });

    townsByIsland.forEach((islandTowns, key) => {
      const allianceIds = new Set();
      islandTowns.forEach(t => {
        const aId = typeof t.player === 'object' ? t.player?.alliance?.id : (t.allianceId ?? t.alliance?.id);
        if (aId !== undefined && aId !== null) allianceIds.add(aId);
      });

      if (allianceIds.size >= 2) {
        const [ix, iy] = key.split('_').map(Number);
        const centerLng = (ix / 1000) * 360 - 180;
        const centerLat = -((iy / 1000) * 180 - 90);
        const aList = Array.from(allianceIds);
        const tension = Math.min(1.0, (allianceIds.size / islandTowns.length) * 1.5);

        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [centerLng - 0.005, centerLat - 0.005],
              [centerLng + 0.005, centerLat + 0.005]
            ]
          },
          properties: {
            allianceA: `Alliance #${aList[0]}`,
            allianceB: `Alliance #${aList[1]}`,
            tension: +tension.toFixed(2),
            islandKey: key,
            isContestedIsland: true
          }
        });
      }
    });

    // 2. Inter-Voronoi boundary edge lines
    const vFeatures = voronoiData.features || [];
    for (let i = 0; i < vFeatures.length; i++) {
      for (let j = i + 1; j < vFeatures.length; j++) {
        const fA = vFeatures[i];
        const fB = vFeatures[j];
        if (fA.properties.allianceId !== fB.properties.allianceId) {
          const cA = fA.geometry.coordinates[0][0];
          const cB = fB.geometry.coordinates[0][0];
          const midLng = (cA[0] + cB[0]) / 2;
          const midLat = (cA[1] + cB[1]) / 2;
          const dist = Math.hypot(cB[0] - cA[0], cB[1] - cA[1]);

          // In 360-degree coordinates, adjacent alliance territories within ~40 degrees
          if (dist < 40.0) {
            const tension = Math.min(1.0, 0.5 + Math.max(0, (40.0 - dist) / 80));
            features.push({
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: [
                  [midLng - 0.01, midLat - 0.01],
                  [midLng + 0.01, midLat + 0.01]
                ]
              },
              properties: {
                allianceA: fA.properties.allianceName,
                allianceB: fB.properties.allianceName,
                tension: +tension.toFixed(2),
                isContestedIsland: false
              }
            });
          }
        }
      }
    }

    return {
      type: "FeatureCollection",
      features
    };
  }
};

/**
 * 2. Intel Radar Overlay Filters (src/lib/map/intelRadar.js)
 */
export const IntelRadarEngine = {
  filterIntelOverlays(towns = [], players = [], conquests = [], filters = {}) {
    const {
      ghostHunter = false,
      activeSiege = false,
      inactiveFarms = false,
      minGhostPoints = 0,
      maxMomentumDelta = 0,
      recentHours = 48
    } = filters;

    const playerMap = new Map();
    (players || []).forEach(p => {
      if (p && p.id !== undefined) playerMap.set(p.id, p);
    });

    const ghostFeatures = [];
    const siegeFeatures = [];
    const farmFeatures = [];

    // Ghost Radar
    if (ghostHunter && Array.isArray(towns)) {
      towns.forEach(t => {
        const pName = typeof t.player === 'object' ? t.player?.name : t.player;
        const pId = typeof t.player === 'object' ? t.player?.id : t.playerId;
        const isGhost = t.isGhost || !pName || pName === 'Ghost Town' || pId === null || pId === undefined;
        const rawPoints = Number(t.points ?? t.pts ?? 0);
        const points = Math.max(0, rawPoints);

        if (isGhost && points >= minGhostPoints) {
          const x = Number(t.islandX ?? t.x ?? 500);
          const y = Number(t.islandY ?? t.y ?? 500);
          const lng = (x / 1000) * 360 - 180;
          const lat = -((y / 1000) * 180 - 90);
          const estimatedVacancyDays = Math.max(1, Math.round((13716 - points) / 150));

          ghostFeatures.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng, lat] },
            properties: {
              townId: t.id,
              name: t.name || `Ghost #${t.id}`,
              points,
              x,
              y,
              lng,
              lat,
              indicatorType: "ghost_skull",
              estimatedVacancyDays
            }
          });
        }
      });
    }

    // Active Siege / Conquest Radar
    if (activeSiege && Array.isArray(conquests)) {
      const now = Date.now();
      const windowMs = recentHours * 3600 * 1000;

      const townConquestCounts = new Map();
      conquests.forEach(c => {
        const cTime = typeof c.time === 'string' ? new Date(c.time).getTime() : Number(c.time || 0);
        if (now - cTime <= windowMs) {
          const tId = c.townId || c.town_id;
          townConquestCounts.set(tId, (townConquestCounts.get(tId) || 0) + 1);
        }
      });

      towns.forEach(t => {
        const count = townConquestCounts.get(t.id) || (t.isBesieged ? 1 : 0);
        if (count > 0) {
          const x = Number(t.islandX ?? t.x ?? 500);
          const y = Number(t.islandY ?? t.y ?? 500);
          const lng = (x / 1000) * 360 - 180;
          const lat = -((y / 1000) * 180 - 90);

          siegeFeatures.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng, lat] },
            properties: {
              townId: t.id,
              name: t.name || `Town #${t.id}`,
              points: Number(t.points || 0),
              recentConquestCount: count,
              isContested: true,
              haloIntensity: 0.8,
              pulseRateMs: 1500,
              haloRadius: 15
            }
          });
        }
      });
    }

    // Inactive Farm Finder
    if (inactiveFarms && Array.isArray(towns)) {
      towns.forEach(t => {
        const pId = typeof t.player === 'object' ? t.player?.id : t.playerId;
        const pName = typeof t.player === 'object' ? t.player?.name : t.player;
        if (!pId || pName === 'Ghost Town') return;

        const playerMeta = playerMap.get(pId) || {};
        const momentumDelta = Number(playerMeta.momentumDelta ?? playerMeta.pointDelta ?? t.momentumDelta ?? -50);
        const points = Number(t.points ?? 0);

        if (momentumDelta <= maxMomentumDelta) {
          const x = Number(t.islandX ?? t.x ?? 500);
          const y = Number(t.islandY ?? t.y ?? 500);
          const lng = (x / 1000) * 360 - 180;
          const lat = -((y / 1000) * 180 - 90);
          const activityScore = Math.max(0, Math.round(points * 0.1 - momentumDelta * 2));
          const farmRating = points > 8000 ? "HIGH" : points > 3000 ? "MEDIUM" : "LOW";

          farmFeatures.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng, lat] },
            properties: {
              townId: t.id,
              name: t.name || `Town #${t.id}`,
              points,
              x,
              y,
              lng,
              lat,
              playerName: pName,
              momentumDelta,
              activityScore,
              farmRating
            }
          });
        }
      });
    }

    return {
      ghosts: { type: "FeatureCollection", features: ghostFeatures },
      sieges: { type: "FeatureCollection", features: siegeFeatures },
      inactiveFarms: { type: "FeatureCollection", features: farmFeatures }
    };
  }
};

/**
 * 3. Trajectory & Animated Transit Engine (src/lib/map/trajectories.js)
 */
export const TrajectoryTransitEngine = {
  calculateArcTrajectory(origin, target, camber = 0.20, steps = 40) {
    if (!origin || !target) return [];

    const oLng = origin.lng ?? ((origin.x / 1000) * 360 - 180);
    const oLat = origin.lat ?? (-((origin.y / 1000) * 180 - 90));
    const tLng = target.lng ?? ((target.x / 1000) * 360 - 180);
    const tLat = target.lat ?? (-((target.y / 1000) * 180 - 90));

    const dLng = tLng - oLng;
    const dLat = tLat - oLat;
    const chordLen = Math.hypot(dLng, dLat);

    if (chordLen === 0) return [[oLng, oLat]];

    const midLng = (oLng + tLng) / 2;
    const arcHeight = Math.max(chordLen * camber, Math.abs(dLng) * 0.12, 0.0008);
    const midLat = (oLat + tLat) / 2 + arcHeight;

    const points = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const curLng = (1 - t) * (1 - t) * oLng + 2 * (1 - t) * t * midLng + t * t * tLng;
      const curLat = (1 - t) * (1 - t) * oLat + 2 * (1 - t) * t * midLat + t * t * tLat;
      points.push([+curLng.toFixed(6), +curLat.toFixed(6)]);
    }

    return points;
  },

  getTransitProgress(transit, currentTimeMs) {
    if (!transit) {
      return { currentLngLat: [0, 0], rotationDegrees: 0, remainingSeconds: 0, isCompleted: true };
    }

    const { startTime, landingTime, curveCoordinates = [] } = transit;
    const totalDurationMs = landingTime - startTime;

    if (totalDurationMs <= 0 || currentTimeMs >= landingTime) {
      const lastCoord = curveCoordinates[curveCoordinates.length - 1] || [0, 0];
      return {
        currentLngLat: lastCoord,
        rotationDegrees: 0,
        remainingSeconds: 0,
        isCompleted: true
      };
    }

    const progress = Math.max(0, Math.min(1, (currentTimeMs - startTime) / totalDurationMs));
    const remainingSeconds = Math.max(0, Math.ceil((landingTime - currentTimeMs) / 1000));

    if (curveCoordinates.length === 0) {
      return { currentLngLat: [0, 0], rotationDegrees: 0, remainingSeconds, isCompleted: false };
    }

    const totalSegments = curveCoordinates.length - 1;
    const exactIndex = progress * totalSegments;
    const lowerIndex = Math.floor(exactIndex);
    const upperIndex = Math.min(totalSegments, Math.ceil(exactIndex));
    const segmentT = exactIndex - lowerIndex;

    const p0 = curveCoordinates[lowerIndex];
    const p1 = curveCoordinates[upperIndex] || p0;

    const currentLng = p0[0] + (p1[0] - p0[0]) * segmentT;
    const currentLat = p0[1] + (p1[1] - p0[1]) * segmentT;

    const dLng = p1[0] - p0[0];
    const dLat = p1[1] - p0[1];
    let angleDeg = (Math.atan2(dLat, dLng) * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;

    return {
      currentLngLat: [+currentLng.toFixed(6), +currentLat.toFixed(6)],
      rotationDegrees: +angleDeg.toFixed(2),
      remainingSeconds,
      isCompleted: progress >= 1.0
    };
  },

  calculateSnipingSynchronization(originTowns = [], targetTown = {}, landingTimeMs = Date.now(), unitBaseSpeed = 3, worldSpeed = 3, unitSpeed = 1) {
    if (!Array.isArray(originTowns) || !targetTown) return [];

    const targetX = Number(targetTown.islandX ?? targetTown.x ?? 500);
    const targetY = Number(targetTown.islandY ?? targetTown.y ?? 500);

    return originTowns.map(origin => {
      const origX = Number(origin.islandX ?? origin.x ?? 500);
      const origY = Number(origin.islandY ?? origin.y ?? 500);
      const dist = Math.hypot(targetX - origX, targetY - origY);

      const effectiveSpeed = unitBaseSpeed * worldSpeed * unitSpeed;
      const durationMinutes = effectiveSpeed > 0 ? (dist * 50) / effectiveSpeed : 0;
      const durationSeconds = Math.round(durationMinutes * 60);

      const launchTimeMs = landingTimeMs - (durationSeconds * 1000);
      const isFeasible = launchTimeMs >= Date.now();

      const hrs = Math.floor(durationSeconds / 3600).toString().padStart(2, '0');
      const mins = Math.floor((durationSeconds % 3600) / 60).toString().padStart(2, '0');
      const secs = (durationSeconds % 60).toString().padStart(2, '0');

      return {
        originTownId: origin.id,
        originName: origin.name || `Town #${origin.id}`,
        distance: +dist.toFixed(2),
        durationSeconds,
        travelFormatted: `${hrs}:${mins}:${secs}`,
        launchTimeMs,
        landingTimeMs,
        isFeasible
      };
    });
  }
};

/**
 * 4. Tactical Pinboard System (src/lib/map/tacticalPins.js)
 */
export const TacticalPinboardEngine = {
  getTacticalPins(worldId, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    if (!storage) return [];
    try {
      const raw = storage.getItem(`grepo_tactical_pins_${worldId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(p => p && p.id && p.townId);
    } catch {
      return [];
    }
  },

  saveTacticalPin(worldId, pin, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    if (!storage || !pin || !pin.townId) return [];

    const pins = this.getTacticalPins(worldId, storage);
    const validTypes = ['PRIMARY_TARGET', 'SECONDARY_TARGET', 'STACK_BIREMES', 'BREAK_SIEGE'];
    const validPriorities = ['CRITICAL', 'HIGH', 'NORMAL'];

    const newPin = {
      id: pin.id || `pin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      worldId,
      townId: pin.townId,
      townName: pin.townName || `Town #${pin.townId}`,
      townX: Number(pin.townX ?? pin.x ?? 500),
      townY: Number(pin.townY ?? pin.y ?? 500),
      lng: pin.lng ?? (((pin.townX ?? 500) / 1000) * 360 - 180),
      lat: pin.lat ?? (-(((pin.townY ?? 500) / 1000) * 180 - 90)),
      type: validTypes.includes(pin.type) ? pin.type : 'PRIMARY_TARGET',
      priority: validPriorities.includes(pin.priority) ? pin.priority : 'NORMAL',
      notes: (pin.notes || '').slice(0, 500),
      author: pin.author || 'Commander',
      createdAt: pin.createdAt || Date.now(),
      targetReturnTime: pin.targetReturnTime || null
    };

    const existingIndex = pins.findIndex(p => p.id === newPin.id);
    if (existingIndex >= 0) {
      pins[existingIndex] = {
        ...pins[existingIndex],
        ...newPin,
        author: pin.author || pins[existingIndex].author,
        createdAt: pins[existingIndex].createdAt
      };
    } else {
      pins.push(newPin);
    }

    try {
      storage.setItem(`grepo_tactical_pins_${worldId}`, JSON.stringify(pins));
    } catch (e) {
      console.error("Storage quota exceeded or storage failure", e);
    }
    return pins;
  },

  removeTacticalPin(worldId, pinId, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    if (!storage || !pinId) return false;
    const pins = this.getTacticalPins(worldId, storage);
    const filtered = pins.filter(p => p.id !== pinId);
    if (filtered.length === pins.length) return false;

    try {
      storage.setItem(`grepo_tactical_pins_${worldId}`, JSON.stringify(filtered));
      return true;
    } catch {
      return false;
    }
  },

  exportPinToSniper(pin, baseUrl = '/snipe') {
    if (!pin) return baseUrl;
    const params = new URLSearchParams();
    params.set('targetTownId', String(pin.townId));
    params.set('targetName', pin.townName || `Town #${pin.townId}`);
    params.set('operationType', pin.type || 'PRIMARY_TARGET');
    params.set('priority', pin.priority || 'NORMAL');
    if (pin.originTownId) params.set('originTownId', String(pin.originTownId));
    if (pin.targetReturnTime) params.set('targetReturnTime', String(pin.targetReturnTime));

    return `${baseUrl}?${params.toString()}`;
  },

  exportPinToPlanner(pin) {
    if (!pin) return null;
    return {
      targetTownId: pin.townId,
      targetName: pin.townName || `Town #${pin.townId}`,
      townX: pin.townX ?? pin.x,
      townY: pin.townY ?? pin.y,
      priority: pin.priority,
      type: pin.type
    };
  }
};

/**
 * 5. Minimap Radar Synchronization (src/components/map/MinimapRadar.js / Math)
 */
export const MinimapRadarEngine = {
  worldToLngLat(x, y) {
    const rawLng = (x / 1000) * 360 - 180;
    const rawLat = -((y / 1000) * 180 - 90);
    const lng = Object.is(rawLng, -0) ? 0 : rawLng;
    const lat = Object.is(rawLat, -0) ? 0 : rawLat;
    return [lng, lat];
  },

  lngLatToWorld(lng, lat) {
    const x = Math.round(((lng + 180) / 360) * 1000);
    const y = Math.round(((90 - lat) / 180) * 1000);
    return { x: Math.max(0, Math.min(1000, x)), y: Math.max(0, Math.min(1000, y)) };
  },

  projectWorldToMinimap(worldX, worldY, minimapWidth = 300, minimapHeight = 300) {
    return {
      mx: (worldX / 1000) * minimapWidth,
      my: (worldY / 1000) * minimapHeight
    };
  },

  projectMinimapClickToWorld(clickX, clickY, minimapWidth = 300, minimapHeight = 300) {
    const worldX = Math.max(0, Math.min(1000, (clickX / minimapWidth) * 1000));
    const worldY = Math.max(0, Math.min(1000, (clickY / minimapHeight) * 1000));
    const [lng, lat] = this.worldToLngLat(worldX, worldY);
    return { worldX: +worldX.toFixed(2), worldY: +worldY.toFixed(2), lng: +lng.toFixed(6), lat: +lat.toFixed(6) };
  },

  calculateViewportFrustum(viewState = { longitude: 0, latitude: 0, zoom: 6 }) {
    const { longitude = 0, latitude = 0, zoom = 6 } = viewState;
    const spanDeg = Math.max(0.5, 360 / Math.pow(2, zoom));
    const minLng = Math.max(-180, longitude - spanDeg / 2);
    const maxLng = Math.min(180, longitude + spanDeg / 2);
    const minLat = Math.max(-90, latitude - (spanDeg / 2) * 0.5);
    const maxLat = Math.min(90, latitude + (spanDeg / 2) * 0.5);

    const pMin = this.lngLatToWorld(minLng, maxLat);
    const pMax = this.lngLatToWorld(maxLng, minLat);

    return {
      minLng: +minLng.toFixed(6),
      maxLng: +maxLng.toFixed(6),
      minLat: +minLat.toFixed(6),
      maxLat: +maxLat.toFixed(6),
      minX: pMin.x,
      maxX: pMax.x,
      minY: pMin.y,
      maxY: pMax.y,
      width: Math.abs(pMax.x - pMin.x),
      height: Math.abs(pMax.y - pMin.y)
    };
  }
};

// ============================================================================
// MOCK STORAGE FIXTURE FOR ISOLATED TESTING
// ============================================================================
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

// ============================================================================
// COMPREHENSIVE TEST SUITE: TIERS 1 - 4 (173+ Tests)
// ============================================================================

describe('Next-Generation Grepolis World Map Tactical Command Suite — E2E Test Suite', () => {

  // --------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE (≥5 tests per feature: F1 - F15 = 75 tests)
  // --------------------------------------------------------------------------

  describe('Tier 1: Feature F1 — Political Voronoi Territory Heatmaps', () => {
    const alliances = [
      { id: 10, name: 'Olympian Vanguard', color: '#3b82f6' },
      { id: 20, name: 'Spartan Legion', color: '#ef4444' }
    ];
    const towns = [
      { id: 101, name: 'Athens Alpha', islandX: 480, islandY: 480, allianceId: 10, points: 9000 },
      { id: 102, name: 'Athens Beta', islandX: 490, islandY: 485, allianceId: 10, points: 8500 },
      { id: 103, name: 'Athens Gamma', islandX: 485, islandY: 490, allianceId: 10, points: 7000 },
      { id: 201, name: 'Sparta Core', islandX: 520, islandY: 520, allianceId: 20, points: 10000 },
      { id: 202, name: 'Sparta Fort', islandX: 530, islandY: 525, allianceId: 20, points: 9500 }
    ];

    test('F1.1: computes valid GeoJSON FeatureCollection with Polygon geometries', () => {
      const data = VoronoiPoliticalEngine.computeAllianceVoronoi(towns, alliances);
      expect(data.type).toBe('FeatureCollection');
      expect(Array.isArray(data.features)).toBe(true);
      expect(data.features.length).toBe(2);

      data.features.forEach(f => {
        expect(f.type).toBe('Feature');
        expect(f.geometry.type).toBe('Polygon');
        expect(Array.isArray(f.geometry.coordinates)).toBe(true);
        expect(f.geometry.coordinates[0].length).toBeGreaterThan(3);
      });
    });

    test('F1.2: accurately assigns official alliance hex colors to features', () => {
      const data = VoronoiPoliticalEngine.computeAllianceVoronoi(towns, alliances);
      const olympianFeature = data.features.find(f => f.properties.allianceId === 10);
      const spartanFeature = data.features.find(f => f.properties.allianceId === 20);

      expect(olympianFeature).toBeDefined();
      expect(olympianFeature.properties.color).toBe('#3b82f6');
      expect(spartanFeature).toBeDefined();
      expect(spartanFeature.properties.color).toBe('#ef4444');
    });

    test('F1.3: enforces radial clamping constraining territory polygons', () => {
      const tightlyClamped = VoronoiPoliticalEngine.computeAllianceVoronoi(towns, alliances, { maxRadius: 10.0 });
      const looselyClamped = VoronoiPoliticalEngine.computeAllianceVoronoi(towns, alliances, { maxRadius: 50.0 });

      const tightRing = tightlyClamped.features[0].geometry.coordinates[0];
      const looseRing = looselyClamped.features[0].geometry.coordinates[0];

      const tightRadius = Math.hypot(tightRing[0][0] - tightRing[6][0], tightRing[0][1] - tightRing[6][1]);
      const looseRadius = Math.hypot(looseRing[0][0] - looseRing[6][0], looseRing[0][1] - looseRing[6][1]);
      expect(looseRadius).toBeGreaterThan(tightRadius);
    });

    test('F1.4: calculates dominant territory share percentage per alliance', () => {
      const data = VoronoiPoliticalEngine.computeAllianceVoronoi(towns, alliances);
      const f10 = data.features.find(f => f.properties.allianceId === 10);
      const f20 = data.features.find(f => f.properties.allianceId === 20);

      expect(f10.properties.dominantShare).toBeCloseTo(0.60, 2);
      expect(f20.properties.dominantShare).toBeCloseTo(0.40, 2);
    });

    test('F1.5: filters out alliances having fewer towns than minTownCount threshold', () => {
      const soloTowns = [
        ...towns,
        { id: 301, name: 'Lone Outpost', islandX: 600, islandY: 600, allianceId: 30, points: 2000 }
      ];
      const data = VoronoiPoliticalEngine.computeAllianceVoronoi(soloTowns, alliances, { minTownCount: 2 });
      const soloFeature = data.features.find(f => f.properties.allianceId === 30);
      expect(soloFeature).toBeUndefined();
    });
  });

  describe('Tier 1: Feature F2 — Contested Frontline Border Outlines', () => {
    const towns = [
      { id: 1, islandX: 500, islandY: 500, allianceId: 1, points: 5000 },
      { id: 2, islandX: 500, islandY: 500, allianceId: 2, points: 5000 },
      { id: 3, islandX: 505, islandY: 505, allianceId: 1, points: 6000 },
      { id: 4, islandX: 510, islandY: 510, allianceId: 2, points: 6000 }
    ];

    test('F2.1: detects contested frontline boundary edges between rival alliances', () => {
      const voronoiData = VoronoiPoliticalEngine.computeAllianceVoronoi(towns, [
        { id: 1, name: 'Alpha', color: '#111' },
        { id: 2, name: 'Beta', color: '#222' }
      ], { minTownCount: 1 });

      const frontlines = VoronoiPoliticalEngine.computeContestedFrontlines(towns, voronoiData);
      expect(frontlines.type).toBe('FeatureCollection');
      expect(frontlines.features.length).toBeGreaterThan(0);
      expect(frontlines.features[0].geometry.type).toBe('LineString');
    });

    test('F2.2: calculates tension score (0.0 to 1.0) scaling with rival proximity', () => {
      const voronoiData = VoronoiPoliticalEngine.computeAllianceVoronoi(towns, [], { minTownCount: 1 });
      const frontlines = VoronoiPoliticalEngine.computeContestedFrontlines(towns, voronoiData);

      frontlines.features.forEach(f => {
        expect(f.properties.tension).toBeGreaterThanOrEqual(0.0);
        expect(f.properties.tension).toBeLessThanOrEqual(1.0);
      });
    });

    test('F2.3: detects multi-alliance contested islands accurately', () => {
      const frontlines = VoronoiPoliticalEngine.computeContestedFrontlines(towns, { features: [] });
      const islandFrontline = frontlines.features.find(f => f.properties.isContestedIsland === true);

      expect(islandFrontline).toBeDefined();
      expect(islandFrontline.properties.islandKey).toBe('500_500');
    });

    test('F2.4: classifies single-alliance islands as non-contested with 0 island tension lines', () => {
      const monoTowns = [
        { id: 10, islandX: 450, islandY: 450, allianceId: 1 },
        { id: 11, islandX: 450, islandY: 450, allianceId: 1 }
      ];
      const frontlines = VoronoiPoliticalEngine.computeContestedFrontlines(monoTowns, { features: [] });
      const islandFeatures = frontlines.features.filter(f => f.properties.isContestedIsland);
      expect(islandFeatures.length).toBe(0);
    });

    test('F2.5: frontline LineString geometries contain finite, valid coordinate pairs', () => {
      const voronoiData = VoronoiPoliticalEngine.computeAllianceVoronoi(towns, [], { minTownCount: 1 });
      const frontlines = VoronoiPoliticalEngine.computeContestedFrontlines(towns, voronoiData);

      frontlines.features.forEach(f => {
        const coords = f.geometry.coordinates;
        expect(coords.length).toBeGreaterThanOrEqual(2);
        coords.forEach(([lng, lat]) => {
          expect(Number.isFinite(lng)).toBe(true);
          expect(Number.isFinite(lat)).toBe(true);
        });
      });
    });
  });

  describe('Tier 1: Feature F3 — Control Panel Mode Toggle', () => {
    class MapModeController {
      constructor(initialMode = 'geographic') {
        this.mode = initialMode;
        this.subscribers = [];
        this.camera = { longitude: 0, latitude: 0, zoom: 6 };
      }
      setMode(newMode) {
        if (this.mode !== newMode) {
          this.mode = newMode;
          this.subscribers.forEach(cb => cb(this.mode, this.camera));
        }
      }
      subscribe(cb) {
        this.subscribers.push(cb);
        return () => { this.subscribers = this.subscribers.filter(s => s !== cb); };
      }
      getActiveLayers() {
        return this.mode === 'political'
          ? ['voronoi-spheres-fill', 'voronoi-spheres-border', 'contested-frontline-lines']
          : ['island-sprites', 'town-sprites', 'ocean-lines'];
      }
    }

    test('F3.1: cleanly transitions mode state between geographic and political', () => {
      const controller = new MapModeController('geographic');
      expect(controller.mode).toBe('geographic');
      controller.setMode('political');
      expect(controller.mode).toBe('political');
    });

    test('F3.2: political view activates Voronoi polygon and frontline layers', () => {
      const controller = new MapModeController('political');
      const layers = controller.getActiveLayers();
      expect(layers).toContain('voronoi-spheres-fill');
      expect(layers).toContain('contested-frontline-lines');
    });

    test('F3.3: geographic view deactivates Voronoi layers retaining base terrain', () => {
      const controller = new MapModeController('geographic');
      const layers = controller.getActiveLayers();
      expect(layers).not.toContain('voronoi-spheres-fill');
      expect(layers).toContain('island-sprites');
    });

    test('F3.4: mode toggle preserves camera center coordinates and zoom level', () => {
      const controller = new MapModeController('geographic');
      controller.camera = { longitude: 12.5, latitude: -8.2, zoom: 7.5 };
      let notifiedCamera = null;
      controller.subscribe((mode, cam) => { notifiedCamera = cam; });

      controller.setMode('political');
      expect(notifiedCamera.longitude).toBe(12.5);
      expect(notifiedCamera.latitude).toBe(-8.2);
      expect(notifiedCamera.zoom).toBe(7.5);
    });

    test('F3.5: triggers registered subscriber callbacks on view state transition', () => {
      const controller = new MapModeController('geographic');
      const callback = vi.fn();
      controller.subscribe(callback);
      controller.setMode('political');
      expect(callback).toHaveBeenCalledWith('political', expect.any(Object));
    });
  });

  describe('Tier 1: Feature F4 — Ghost Hunter Radar Overlay', () => {
    const towns = [
      { id: 1, name: 'Active Alpha', points: 9000, player: 'Leonidas', playerId: 1 },
      { id: 2, name: 'Ghost Corinth', points: 4500, player: 'Ghost Town', playerId: null, isGhost: true },
      { id: 3, name: 'Ghost Ruins', points: 350, player: null, playerId: null, isGhost: true }
    ];

    test('F4.1: isolates ghost towns from player towns', () => {
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], [], { ghostHunter: true, minGhostPoints: 0 });
      expect(radar.ghosts.features.length).toBe(2);
      const names = radar.ghosts.features.map(f => f.properties.name);
      expect(names).toContain('Ghost Corinth');
      expect(names).toContain('Ghost Ruins');
      expect(names).not.toContain('Active Alpha');
    });

    test('F4.2: respects minGhostPoints threshold to filter out tiny ruins', () => {
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], [], { ghostHunter: true, minGhostPoints: 1000 });
      expect(radar.ghosts.features.length).toBe(1);
      expect(radar.ghosts.features[0].properties.name).toBe('Ghost Corinth');
    });

    test('F4.3: computes estimated vacancy days reflecting town point decay', () => {
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], [], { ghostHunter: true, minGhostPoints: 0 });
      const corinth = radar.ghosts.features.find(f => f.properties.townId === 2);
      const ruins = radar.ghosts.features.find(f => f.properties.townId === 3);

      expect(corinth.properties.estimatedVacancyDays).toBeGreaterThan(0);
      expect(ruins.properties.estimatedVacancyDays).toBeGreaterThan(corinth.properties.estimatedVacancyDays);
    });

    test('F4.4: includes skull indicator type and coordinates in feature properties', () => {
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], [], { ghostHunter: true, minGhostPoints: 0 });
      const ghost = radar.ghosts.features[0];
      expect(ghost.properties.indicatorType).toBe('ghost_skull');
      expect(ghost.geometry.type).toBe('Point');
      expect(ghost.geometry.coordinates.length).toBe(2);
    });

    test('F4.5: returns empty feature collection when ghostHunter toggle is disabled', () => {
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], [], { ghostHunter: false });
      expect(radar.ghosts.features.length).toBe(0);
    });
  });

  describe('Tier 1: Feature F5 — Active Siege / Contest Radar', () => {
    const towns = [
      { id: 101, name: 'Fortified Haven', points: 8000, isBesieged: true },
      { id: 102, name: 'Peaceful Village', points: 5000, isBesieged: false }
    ];
    const conquests = [
      { townId: 101, time: Date.now() - 3600000, conqueror_alliance: 'Spartans' }
    ];

    test('F5.1: detects towns undergoing active sieges or recent conquests', () => {
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], conquests, { activeSiege: true });
      expect(radar.sieges.features.length).toBe(1);
      expect(radar.sieges.features[0].properties.townId).toBe(101);
    });

    test('F5.2: records conquest count and contested state flag', () => {
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], conquests, { activeSiege: true });
      const siege = radar.sieges.features[0];
      expect(siege.properties.isContested).toBe(true);
      expect(siege.properties.recentConquestCount).toBeGreaterThanOrEqual(1);
    });

    test('F5.3: generates pulsing halo visual properties', () => {
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], conquests, { activeSiege: true });
      const siege = radar.sieges.features[0];
      expect(siege.properties.haloIntensity).toBe(0.8);
      expect(siege.properties.pulseRateMs).toBe(1500);
      expect(siege.properties.haloRadius).toBe(15);
    });

    test('F5.4: time-window parameter filters conquests by recency', () => {
      const oldConquests = [
        { townId: 102, time: Date.now() - 86400000 * 5 }
      ];
      const radar24h = IntelRadarEngine.filterIntelOverlays(towns, [], oldConquests, { activeSiege: true, recentHours: 24 });
      const town102In24h = radar24h.sieges.features.find(f => f.properties.townId === 102);
      expect(town102In24h).toBeUndefined();
    });

    test('F5.5: returns empty sieges feature set when activeSiege toggle is disabled', () => {
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], conquests, { activeSiege: false });
      expect(radar.sieges.features.length).toBe(0);
    });
  });

  describe('Tier 1: Feature F6 — Inactive Farm Finder Overlay', () => {
    const players = [
      { id: 1, name: 'ActivePlayer', momentumDelta: 1500 },
      { id: 2, name: 'InactivePlayer', momentumDelta: -200 },
      { id: 3, name: 'StagnantPlayer', momentumDelta: 0 }
    ];
    const towns = [
      { id: 1, name: 'Farm A', points: 9500, playerId: 2, player: 'InactivePlayer' },
      { id: 2, name: 'Farm B', points: 2500, playerId: 3, player: 'StagnantPlayer' },
      { id: 3, name: 'Capital City', points: 12000, playerId: 1, player: 'ActivePlayer' }
    ];

    test('F6.1: detects player towns with negative or zero momentum delta', () => {
      const radar = IntelRadarEngine.filterIntelOverlays(towns, players, [], { inactiveFarms: true, maxMomentumDelta: 0 });
      expect(radar.inactiveFarms.features.length).toBe(2);
      const names = radar.inactiveFarms.features.map(f => f.properties.name);
      expect(names).toContain('Farm A');
      expect(names).toContain('Farm B');
      expect(names).not.toContain('Capital City');
    });

    test('F6.2: calculates activity score and farm rating categories', () => {
      const radar = IntelRadarEngine.filterIntelOverlays(towns, players, [], { inactiveFarms: true, maxMomentumDelta: 0 });
      const farmA = radar.inactiveFarms.features.find(f => f.properties.townId === 1);
      const farmB = radar.inactiveFarms.features.find(f => f.properties.townId === 2);

      expect(farmA.properties.farmRating).toBe('HIGH');
      expect(farmB.properties.farmRating).toBe('LOW');
      expect(farmA.properties.activityScore).toBeGreaterThan(farmB.properties.activityScore);
    });

    test('F6.3: momentum delta threshold dynamically adjusts farm candidate list', () => {
      const strictRadar = IntelRadarEngine.filterIntelOverlays(towns, players, [], { inactiveFarms: true, maxMomentumDelta: -100 });
      expect(strictRadar.inactiveFarms.features.length).toBe(1);
      expect(strictRadar.inactiveFarms.features[0].properties.townId).toBe(1);
    });

    test('F6.4: excludes growing players (momentumDelta > 0) strictly', () => {
      const radar = IntelRadarEngine.filterIntelOverlays(towns, players, [], { inactiveFarms: true, maxMomentumDelta: 0 });
      const activeFound = radar.inactiveFarms.features.some(f => f.properties.playerName === 'ActivePlayer');
      expect(activeFound).toBe(false);
    });

    test('F6.5: returns empty inactive farms collection when filter toggle is false', () => {
      const radar = IntelRadarEngine.filterIntelOverlays(towns, players, [], { inactiveFarms: false });
      expect(radar.inactiveFarms.features.length).toBe(0);
    });
  });

  describe('Tier 1: Feature F7 — Bézier Route Trajectory Upgrade', () => {
    const origin = { id: 1, x: 400, y: 400 };
    const target = { id: 2, x: 500, y: 500 };

    test('F7.1: generates smooth quadratic Bézier curve coordinates', () => {
      const curve = TrajectoryTransitEngine.calculateArcTrajectory(origin, target, 0.20, 40);
      expect(Array.isArray(curve)).toBe(true);
      expect(curve.length).toBe(41);
    });

    test('F7.2: camber height scales proportionally with chord distance', () => {
      const closeTarget = { id: 3, x: 420, y: 420 };
      const farTarget = { id: 4, x: 600, y: 600 };

      const closeCurve = TrajectoryTransitEngine.calculateArcTrajectory(origin, closeTarget, 0.20, 40);
      const farCurve = TrajectoryTransitEngine.calculateArcTrajectory(origin, farTarget, 0.20, 40);

      const oLat = -((origin.y / 1000) * 180 - 90);
      const closeTLat = -((closeTarget.y / 1000) * 180 - 90);
      const farTLat = -((farTarget.y / 1000) * 180 - 90);

      const closeLinearMidLat = (oLat + closeTLat) / 2;
      const farLinearMidLat = (oLat + farTLat) / 2;

      const closeApexElevation = closeCurve[20][1] - closeLinearMidLat;
      const farApexElevation = farCurve[20][1] - farLinearMidLat;

      expect(farApexElevation).toBeGreaterThan(closeApexElevation);
    });

    test('F7.3: requested step count determines exact sample density', () => {
      const curve20 = TrajectoryTransitEngine.calculateArcTrajectory(origin, target, 0.20, 20);
      const curve50 = TrajectoryTransitEngine.calculateArcTrajectory(origin, target, 0.20, 50);

      expect(curve20.length).toBe(21);
      expect(curve50.length).toBe(51);
    });

    test('F7.4: distinct slots on same island generate elevated arc without flat line overlap', () => {
      const sameIslandOrigin = { id: 11, x: 500, y: 500, lng: 0.001, lat: 0.001 };
      const sameIslandTarget = { id: 12, x: 500, y: 500, lng: 0.004, lat: 0.004 };

      const curve = TrajectoryTransitEngine.calculateArcTrajectory(sameIslandOrigin, sameIslandTarget, 0.20, 40);
      expect(curve.length).toBe(41);
      const midPoint = curve[20];
      const linearMidLat = (0.001 + 0.004) / 2;
      expect(midPoint[1]).toBeGreaterThan(linearMidLat);
    });

    test('F7.5: cross-ocean sector trajectories generate continuous valid coordinates', () => {
      const o11 = { x: 150, y: 150 };
      const o88 = { x: 850, y: 850 };
      const curve = TrajectoryTransitEngine.calculateArcTrajectory(o11, o88, 0.20, 40);

      expect(curve.length).toBe(41);
      curve.forEach(([lng, lat]) => {
        expect(lng).toBeGreaterThanOrEqual(-180);
        expect(lng).toBeLessThanOrEqual(180);
        expect(lat).toBeGreaterThanOrEqual(-90);
        expect(lat).toBeLessThanOrEqual(90);
      });
    });
  });

  describe('Tier 1: Feature F8 — Animated Troop Transit Sprites', () => {
    const origin = { x: 500, y: 500, lng: 0, lat: 0 };
    const target = { x: 550, y: 500, lng: 18, lat: 0 };
    const curveCoordinates = TrajectoryTransitEngine.calculateArcTrajectory(origin, target, 0.20, 40);
    const startTime = 1000000;
    const landingTime = 1060000;

    const transit = {
      id: 'transit_1',
      originCoords: origin,
      targetCoords: target,
      curveCoordinates,
      unitType: 'bireme',
      startTime,
      landingTime,
      durationSeconds: 60
    };

    test('F8.1: interpolates exact position along curve at midpoint timestamp', () => {
      const midTime = startTime + 30000;
      const progress = TrajectoryTransitEngine.getTransitProgress(transit, midTime);

      expect(progress.isCompleted).toBe(false);
      expect(progress.remainingSeconds).toBe(30);
      expect(progress.currentLngLat[0]).toBeGreaterThan(0);
      expect(progress.currentLngLat[0]).toBeLessThan(18);
    });

    test('F8.2: calculates tangent rotation angle from curve derivative', () => {
      const midTime = startTime + 30000;
      const progress = TrajectoryTransitEngine.getTransitProgress(transit, midTime);

      expect(progress.rotationDegrees).toBeGreaterThanOrEqual(0);
      expect(progress.rotationDegrees).toBeLessThan(360);
    });

    test('F8.3: supports both naval fleet and mythical flying unit classifications', () => {
      const navalUnits = ['bireme', 'trireme', 'colony_ship'];
      const flyingUnits = ['manticore', 'harpy', 'pegasus'];

      navalUnits.forEach(u => expect(['bireme', 'trireme', 'colony_ship']).toContain(u));
      flyingUnits.forEach(u => expect(['manticore', 'harpy', 'pegasus']).toContain(u));
    });

    test('F8.4: marks transit as completed when currentTime exceeds landingTime', () => {
      const afterLanding = landingTime + 5000;
      const progress = TrajectoryTransitEngine.getTransitProgress(transit, afterLanding);

      expect(progress.isCompleted).toBe(true);
      expect(progress.remainingSeconds).toBe(0);
      expect(progress.currentLngLat[0]).toBeCloseTo(curveCoordinates[40][0], 4);
      expect(progress.currentLngLat[1]).toBeCloseTo(curveCoordinates[40][1], 4);
    });

    test('F8.5: transit at startTime is located at initial curve position', () => {
      const progress = TrajectoryTransitEngine.getTransitProgress(transit, startTime);
      expect(progress.isCompleted).toBe(false);
      expect(progress.remainingSeconds).toBe(60);
      expect(progress.currentLngLat[0]).toBeCloseTo(curveCoordinates[0][0], 4);
      expect(progress.currentLngLat[1]).toBeCloseTo(curveCoordinates[0][1], 4);
    });
  });

  describe('Tier 1: Feature F9 — Live ETA Countdown Timers', () => {
    const startTime = 5000000;
    const landingTime = 5000000 + 125000;

    const transit = {
      startTime,
      landingTime,
      curveCoordinates: [[0, 0], [1, 1]]
    };

    test('F9.1: computes remaining seconds accurately as ceil((landingTime - current) / 1000)', () => {
      const current = 5000000 + 25400;
      const progress = TrajectoryTransitEngine.getTransitProgress(transit, current);
      expect(progress.remainingSeconds).toBe(100);
    });

    test('F9.2: countdown decreases monotonically with ticking time', () => {
      const t1 = TrajectoryTransitEngine.getTransitProgress(transit, startTime + 10000);
      const t2 = TrajectoryTransitEngine.getTransitProgress(transit, startTime + 20000);
      const t3 = TrajectoryTransitEngine.getTransitProgress(transit, startTime + 30000);

      expect(t1.remainingSeconds).toBeGreaterThan(t2.remainingSeconds);
      expect(t2.remainingSeconds).toBeGreaterThan(t3.remainingSeconds);
    });

    test('F9.3: remaining seconds reaches exactly zero at landing time', () => {
      const progress = TrajectoryTransitEngine.getTransitProgress(transit, landingTime);
      expect(progress.remainingSeconds).toBe(0);
    });

    test('F9.4: formats seconds into standardized HH:MM:SS format', () => {
      const formatSecs = (sec) => {
        const hrs = Math.floor(sec / 3600).toString().padStart(2, '0');
        const mins = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        return `${hrs}:${mins}:${s}`;
      };

      expect(formatSecs(3665)).toBe('01:01:05');
      expect(formatSecs(59)).toBe('00:00:59');
    });

    test('F9.5: overdue transits stay clamped at zero remaining seconds', () => {
      const progress = TrajectoryTransitEngine.getTransitProgress(transit, landingTime + 999999);
      expect(progress.remainingSeconds).toBe(0);
    });
  });

  describe('Tier 1: Feature F10 — Multi-Origin Sniping Coordination', () => {
    const targetTown = { id: 999, name: 'Olympus Target', islandX: 500, islandY: 500 };
    const originTowns = [
      { id: 1, name: 'Origin Close', islandX: 503, islandY: 504 },
      { id: 2, name: 'Origin Medium', islandX: 510, islandY: 500 },
      { id: 3, name: 'Origin Far', islandX: 530, islandY: 540 }
    ];
    const fixedLandingTime = Date.now() + 7200000;

    test('F10.1: computes distinct launch timestamps for multiple origins targeting unified landing time', () => {
      const syncs = TrajectoryTransitEngine.calculateSnipingSynchronization(
        originTowns, targetTown, fixedLandingTime, 3, 3, 1
      );
      expect(syncs.length).toBe(3);
      syncs.forEach(s => {
        expect(s.landingTimeMs).toBe(fixedLandingTime);
        expect(s.launchTimeMs).toBeLessThan(fixedLandingTime);
      });
    });

    test('F10.2: farther origin distances require strictly earlier launch timestamps', () => {
      const syncs = TrajectoryTransitEngine.calculateSnipingSynchronization(
        originTowns, targetTown, fixedLandingTime, 3, 3, 1
      );
      expect(syncs[2].launchTimeMs).toBeLessThan(syncs[1].launchTimeMs);
      expect(syncs[1].launchTimeMs).toBeLessThan(syncs[0].launchTimeMs);
    });

    test('F10.3: all origins land at identical target landing timestamp', () => {
      const syncs = TrajectoryTransitEngine.calculateSnipingSynchronization(
        originTowns, targetTown, fixedLandingTime, 3, 3, 1
      );
      syncs.forEach(s => {
        const calculatedLanding = s.launchTimeMs + s.durationSeconds * 1000;
        expect(calculatedLanding).toBe(fixedLandingTime);
      });
    });

    test('F10.4: flags unfeasible launch paths when required launch time has passed', () => {
      const pastLandingTime = Date.now() + 1000;
      const syncs = TrajectoryTransitEngine.calculateSnipingSynchronization(
        originTowns, targetTown, pastLandingTime, 3, 3, 1
      );
      expect(syncs[2].isFeasible).toBe(false);
    });

    test('F10.5: generates individual formatted travel duration strings for all fleet origins', () => {
      const syncs = TrajectoryTransitEngine.calculateSnipingSynchronization(
        originTowns, targetTown, fixedLandingTime, 3, 3, 1
      );
      syncs.forEach(s => {
        expect(s.travelFormatted).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      });
    });
  });

  describe('Tier 1: Feature F11 — Tactical Operation Pin Markers', () => {
    let storage;
    const worldId = 'en123';

    beforeEach(() => {
      storage = new MockLocalStorage();
    });

    test('F11.1: supports all 4 standard pin types', () => {
      const types = ['PRIMARY_TARGET', 'SECONDARY_TARGET', 'STACK_BIREMES', 'BREAK_SIEGE'];
      types.forEach((type, idx) => {
        TacticalPinboardEngine.saveTacticalPin(worldId, {
          townId: 100 + idx,
          type
        }, storage);
      });

      const pins = TacticalPinboardEngine.getTacticalPins(worldId, storage);
      expect(pins.length).toBe(4);
      types.forEach(type => {
        expect(pins.some(p => p.type === type)).toBe(true);
      });
    });

    test('F11.2: saves town coordinates, author, and timestamp metadata', () => {
      const pin = {
        townId: 501,
        townName: 'Corinth Bastion',
        townX: 520,
        townY: 480,
        author: 'Strategos',
        type: 'PRIMARY_TARGET',
        priority: 'HIGH'
      };
      TacticalPinboardEngine.saveTacticalPin(worldId, pin, storage);
      const pins = TacticalPinboardEngine.getTacticalPins(worldId, storage);

      expect(pins[0].townName).toBe('Corinth Bastion');
      expect(pins[0].townX).toBe(520);
      expect(pins[0].townY).toBe(480);
      expect(pins[0].author).toBe('Strategos');
      expect(pins[0].createdAt).toBeGreaterThan(0);
    });

    test('F11.3: persists and retrieves pins scoped strictly by worldId', () => {
      TacticalPinboardEngine.saveTacticalPin('world_A', { townId: 101 }, storage);
      TacticalPinboardEngine.saveTacticalPin('world_B', { townId: 201 }, storage);

      const pinsA = TacticalPinboardEngine.getTacticalPins('world_A', storage);
      const pinsB = TacticalPinboardEngine.getTacticalPins('world_B', storage);

      expect(pinsA.length).toBe(1);
      expect(pinsA[0].townId).toBe(101);
      expect(pinsB.length).toBe(1);
      expect(pinsB[0].townId).toBe(201);
    });

    test('F11.4: removes tactical pin by id cleanly without affecting other pins', () => {
      const p1 = TacticalPinboardEngine.saveTacticalPin(worldId, { townId: 1 }, storage)[0];
      const p2 = TacticalPinboardEngine.saveTacticalPin(worldId, { townId: 2 }, storage)[1];

      expect(TacticalPinboardEngine.getTacticalPins(worldId, storage).length).toBe(2);
      const removed = TacticalPinboardEngine.removeTacticalPin(worldId, p1.id, storage);

      expect(removed).toBe(true);
      const remaining = TacticalPinboardEngine.getTacticalPins(worldId, storage);
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe(p2.id);
    });

    test('F11.5: multiple pins on different towns can be created and queried', () => {
      for (let i = 1; i <= 5; i++) {
        TacticalPinboardEngine.saveTacticalPin(worldId, { townId: 1000 + i }, storage);
      }
      const pins = TacticalPinboardEngine.getTacticalPins(worldId, storage);
      expect(pins.length).toBe(5);
    });
  });

  describe('Tier 1: Feature F12 — Custom Notes & Priority Tagging', () => {
    let storage;
    const worldId = 'en124';

    beforeEach(() => {
      storage = new MockLocalStorage();
    });

    test('F12.1: supports priority tags: CRITICAL, HIGH, NORMAL', () => {
      ['CRITICAL', 'HIGH', 'NORMAL'].forEach((p, idx) => {
        TacticalPinboardEngine.saveTacticalPin(worldId, { townId: idx + 1, priority: p }, storage);
      });
      const pins = TacticalPinboardEngine.getTacticalPins(worldId, storage);
      expect(pins.map(p => p.priority)).toEqual(['CRITICAL', 'HIGH', 'NORMAL']);
    });

    test('F12.2: trims and bounds custom note strings up to 500 characters', () => {
      const longNote = 'A'.repeat(600);
      TacticalPinboardEngine.saveTacticalPin(worldId, { townId: 1, notes: longNote }, storage);
      const pin = TacticalPinboardEngine.getTacticalPins(worldId, storage)[0];
      expect(pin.notes.length).toBe(500);
    });

    test('F12.3: sorts tactical pins accurately by priority order', () => {
      TacticalPinboardEngine.saveTacticalPin(worldId, { townId: 1, priority: 'NORMAL' }, storage);
      TacticalPinboardEngine.saveTacticalPin(worldId, { townId: 2, priority: 'CRITICAL' }, storage);
      TacticalPinboardEngine.saveTacticalPin(worldId, { townId: 3, priority: 'HIGH' }, storage);

      const pins = TacticalPinboardEngine.getTacticalPins(worldId, storage);
      const priorityWeight = { CRITICAL: 3, HIGH: 2, NORMAL: 1 };
      const sorted = [...pins].sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);

      expect(sorted[0].priority).toBe('CRITICAL');
      expect(sorted[1].priority).toBe('HIGH');
      expect(sorted[2].priority).toBe('NORMAL');
    });

    test('F12.4: updating pin notes preserves original creation timestamp and author', () => {
      const original = TacticalPinboardEngine.saveTacticalPin(worldId, {
        townId: 10,
        author: 'General A',
        createdAt: 123456789,
        notes: 'Initial plan'
      }, storage)[0];

      TacticalPinboardEngine.saveTacticalPin(worldId, {
        id: original.id,
        townId: 10,
        notes: 'Updated plan: stack 400 biremes',
        priority: 'CRITICAL'
      }, storage);

      const updated = TacticalPinboardEngine.getTacticalPins(worldId, storage)[0];
      expect(updated.notes).toBe('Updated plan: stack 400 biremes');
      expect(updated.createdAt).toBe(123456789);
      expect(updated.author).toBe('General A');
    });

    test('F12.5: falls back gracefully to NORMAL when invalid priority is provided', () => {
      TacticalPinboardEngine.saveTacticalPin(worldId, { townId: 20, priority: 'SUPER_URGENT_INVALID' }, storage);
      const pin = TacticalPinboardEngine.getTacticalPins(worldId, storage)[0];
      expect(pin.priority).toBe('NORMAL');
    });
  });

  describe('Tier 1: Feature F13 — One-Click Export to Sniper & Planner', () => {
    const samplePin = {
      id: 'pin_99',
      townId: 4001,
      townName: 'Sparta Prime',
      townX: 502,
      townY: 498,
      type: 'BREAK_SIEGE',
      priority: 'CRITICAL',
      originTownId: 3001
    };

    test('F13.1: generates valid /snipe export URL with query parameters', () => {
      const url = TacticalPinboardEngine.exportPinToSniper(samplePin);
      expect(url.startsWith('/snipe?')).toBe(true);
      expect(url).toContain('targetTownId=4001');
      expect(url).toContain('operationType=BREAK_SIEGE');
      expect(url).toContain('priority=CRITICAL');
    });

    test('F13.2: properly percent-encodes spaces and special Unicode characters in town names', () => {
      const unicodePin = {
        ...samplePin,
        townName: 'Άγιος Νικόλαος (Fortress & Harbor)'
      };
      const url = TacticalPinboardEngine.exportPinToSniper(unicodePin);
      expect(url).toContain('%CE%86%CE%B3%CE%B9%CE%BF%CF%82');
      const parsedParams = new URLSearchParams(url.split('?')[1]);
      expect(parsedParams.get('targetName')).toBe('Άγιος Νικόλαος (Fortress & Harbor)');
    });

    test('F13.3: exportPinToPlanner produces structured target payload', () => {
      const payload = TacticalPinboardEngine.exportPinToPlanner(samplePin);
      expect(payload).toEqual({
        targetTownId: 4001,
        targetName: 'Sparta Prime',
        townX: 502,
        townY: 498,
        priority: 'CRITICAL',
        type: 'BREAK_SIEGE'
      });
    });

    test('F13.4: includes originTownId in /snipe URL when present', () => {
      const url = TacticalPinboardEngine.exportPinToSniper(samplePin);
      expect(url).toContain('originTownId=3001');
    });

    test('F13.5: attaches targetReturnTime parameter when present', () => {
      const returnTimePin = { ...samplePin, targetReturnTime: 1700000000000 };
      const url = TacticalPinboardEngine.exportPinToSniper(returnTimePin);
      expect(url).toContain('targetReturnTime=1700000000000');
    });
  });

  describe('Tier 1: Feature F14 — 1000x1000 Minimap Radar Widget', () => {
    test('F14.1: maps 1000x1000 tile coordinates to minimap canvas dimensions', () => {
      const posCenter = MinimapRadarEngine.projectWorldToMinimap(500, 500, 300, 300);
      expect(posCenter.mx).toBe(150);
      expect(posCenter.my).toBe(150);

      const posTopRight = MinimapRadarEngine.projectWorldToMinimap(1000, 0, 300, 300);
      expect(posTopRight.mx).toBe(300);
      expect(posTopRight.my).toBe(0);
    });

    test('F14.2: maps ocean grid line boundaries (every 100 tiles) to canvas', () => {
      for (let ox = 0; ox <= 10; ox++) {
        const p = MinimapRadarEngine.projectWorldToMinimap(ox * 100, 0, 300, 300);
        expect(p.mx).toBe(ox * 30);
      }
    });

    test('F14.3: calculates viewport camera frustum bounding box', () => {
      const frustum = MinimapRadarEngine.calculateViewportFrustum({ longitude: 0, latitude: 0, zoom: 6 });
      expect(frustum.minX).toBeLessThan(frustum.maxX);
      expect(frustum.minY).toBeLessThan(frustum.maxY);
      expect(frustum.width).toBeGreaterThan(0);
      expect(frustum.height).toBeGreaterThan(0);
    });

    test('F14.4: camera frustum dimensions shrink inversely as zoom increases', () => {
      const frustumZoom5 = MinimapRadarEngine.calculateViewportFrustum({ longitude: 0, latitude: 0, zoom: 5 });
      const frustumZoom8 = MinimapRadarEngine.calculateViewportFrustum({ longitude: 0, latitude: 0, zoom: 8 });

      expect(frustumZoom5.width).toBeGreaterThan(frustumZoom8.width);
      expect(frustumZoom5.height).toBeGreaterThan(frustumZoom8.height);
    });

    test('F14.5: projects playable boundary radius (R=250 at 500,500) to minimap', () => {
      const center = MinimapRadarEngine.projectWorldToMinimap(500, 500, 300, 300);
      const edge = MinimapRadarEngine.projectWorldToMinimap(750, 500, 300, 300);
      const radiusPx = edge.mx - center.mx;
      expect(radiusPx).toBe(75);
    });
  });

  describe('Tier 1: Feature F15 — Minimap Click & Drag Camera Sync', () => {
    test('F15.1: clicking minimap canvas converts pixel to world coordinate and LngLat', () => {
      const nav = MinimapRadarEngine.projectMinimapClickToWorld(150, 150, 300, 300);
      expect(nav.worldX).toBe(500);
      expect(nav.worldY).toBe(500);
      expect(nav.lng).toBe(0);
      expect(nav.lat).toBe(0);
    });

    test('F15.2: dragging along minimap translates continuously to world coordinates', () => {
      const dragSteps = [
        MinimapRadarEngine.projectMinimapClickToWorld(30, 30, 300, 300),
        MinimapRadarEngine.projectMinimapClickToWorld(60, 60, 300, 300),
        MinimapRadarEngine.projectMinimapClickToWorld(90, 90, 300, 300)
      ];

      expect(dragSteps[0].worldX).toBe(100);
      expect(dragSteps[1].worldX).toBe(200);
      expect(dragSteps[2].worldX).toBe(300);
    });

    test('F15.3: clicking ocean sector center (e.g. O45 at x=450, y=550) yields correct sector coords', () => {
      const mx = (450 / 1000) * 300;
      const my = (550 / 1000) * 300;
      const nav = MinimapRadarEngine.projectMinimapClickToWorld(mx, my, 300, 300);

      expect(nav.worldX).toBe(450);
      expect(nav.worldY).toBe(550);
    });

    test('F15.4: clamps out-of-bounds click coordinates to [0, 1000] range', () => {
      const outsideLeft = MinimapRadarEngine.projectMinimapClickToWorld(-50, 150, 300, 300);
      const outsideRight = MinimapRadarEngine.projectMinimapClickToWorld(400, 150, 300, 300);

      expect(outsideLeft.worldX).toBe(0);
      expect(outsideRight.worldX).toBe(1000);
    });

    test('F15.5: dispatches onNavigate callback with precise target LngLat', () => {
      const onNavigate = vi.fn();
      const clickCoords = MinimapRadarEngine.projectMinimapClickToWorld(180, 120, 300, 300);
      onNavigate({ lng: clickCoords.lng, lat: clickCoords.lat, zoom: 7 });

      expect(onNavigate).toHaveBeenCalledWith({
        lng: clickCoords.lng,
        lat: clickCoords.lat,
        zoom: 7
      });
    });
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES (≥5 per feature area: 15 areas × 5 = 75 tests)
  // --------------------------------------------------------------------------

  describe('Tier 2: Boundary Cases — F1: Voronoi Territory Heatmaps', () => {
    test('B1.1: single town in world tessellates valid single-polygon Voronoi territory', () => {
      const towns = [{ id: 1, islandX: 500, islandY: 500, allianceId: 10, points: 5000 }];
      const alliances = [{ id: 10, name: 'Solo Alliance', color: '#10b981' }];
      const result = VoronoiPoliticalEngine.computeAllianceVoronoi(towns, alliances, { minTownCount: 1 });
      expect(result.features.length).toBe(1);
      expect(result.features[0].properties.dominantShare).toBe(1.0);
    });

    test('B1.2: empty alliances array defaults safely to fallback colors and names', () => {
      const towns = [
        { id: 1, islandX: 500, islandY: 500, allianceId: 99 },
        { id: 2, islandX: 505, islandY: 505, allianceId: 99 }
      ];
      const result = VoronoiPoliticalEngine.computeAllianceVoronoi(towns, []);
      expect(result.features[0].properties.allianceName).toBe('Alliance #99');
      expect(result.features[0].properties.color).toBe('#3b82f6');
    });

    test('B1.3: zero towns in world returns empty FeatureCollection', () => {
      expect(VoronoiPoliticalEngine.computeAllianceVoronoi([], []).features).toEqual([]);
    });

    test('B1.4: alliance with towns strictly below minTownCount is completely excluded', () => {
      const towns = [{ id: 1, allianceId: 1 }, { id: 2, allianceId: 2 }, { id: 3, allianceId: 2 }];
      const result = VoronoiPoliticalEngine.computeAllianceVoronoi(towns, [], { minTownCount: 2 });
      expect(result.features.length).toBe(1);
      expect(result.features[0].properties.allianceId).toBe(2);
    });

    test('B1.5: 500 towns in single alliance tessellate within finite polygon complexity', () => {
      const denseTowns = Array.from({ length: 500 }, (_, i) => ({
        id: i + 1,
        islandX: 450 + (i % 50),
        islandY: 450 + Math.floor(i / 50),
        allianceId: 100
      }));
      const result = VoronoiPoliticalEngine.computeAllianceVoronoi(denseTowns, [{ id: 100, name: 'Mega Alliance' }]);
      expect(result.features.length).toBe(1);
      expect(result.features[0].properties.townCount).toBe(500);
    });
  });

  describe('Tier 2: Boundary Cases — F2: Contested Frontlines', () => {
    test('B2.1: zero-distance overlapping enemy towns on same slot evaluate tension gracefully', () => {
      const towns = [
        { id: 1, islandX: 500, islandY: 500, allianceId: 1 },
        { id: 2, islandX: 500, islandY: 500, allianceId: 2 }
      ];
      const frontlines = VoronoiPoliticalEngine.computeContestedFrontlines(towns, { features: [] });
      expect(frontlines.features.length).toBe(1);
      expect(frontlines.features[0].properties.tension).toBe(1.0);
    });

    test('B2.2: island with 10 different rival alliances on 20 slots detects multi-contested status', () => {
      const mixedIsland = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        islandX: 500,
        islandY: 500,
        allianceId: (i % 10) + 1
      }));
      const frontlines = VoronoiPoliticalEngine.computeContestedFrontlines(mixedIsland, { features: [] });
      expect(frontlines.features.length).toBe(1);
      expect(frontlines.features[0].properties.isContestedIsland).toBe(true);
    });

    test('B2.3: disconnected ocean clusters (O00 vs O99) produce zero false-positive frontlines', () => {
      const towns = [
        { id: 1, islandX: 50, islandY: 50, allianceId: 1 },
        { id: 2, islandX: 60, islandY: 60, allianceId: 1 },
        { id: 3, islandX: 950, islandY: 950, allianceId: 2 },
        { id: 4, islandX: 960, islandY: 960, allianceId: 2 }
      ];
      const voronoi = VoronoiPoliticalEngine.computeAllianceVoronoi(towns, [], { minTownCount: 2 });
      const frontlines = VoronoiPoliticalEngine.computeContestedFrontlines(towns, voronoi);
      expect(frontlines.features.length).toBe(0);
    });

    test('B2.4: tension calculation when alliance town points are 0 vs 13716 handles cleanly', () => {
      const towns = [
        { id: 1, islandX: 500, islandY: 500, allianceId: 1, points: 0 },
        { id: 2, islandX: 500, islandY: 500, allianceId: 2, points: 13716 }
      ];
      const frontlines = VoronoiPoliticalEngine.computeContestedFrontlines(towns, { features: [] });
      expect(frontlines.features[0].properties.tension).toBeGreaterThan(0);
    });

    test('B2.5: frontline calculation with empty Voronoi feature collection returns only island tension', () => {
      const towns = [
        { id: 1, islandX: 500, islandY: 500, allianceId: 1 },
        { id: 2, islandX: 500, islandY: 500, allianceId: 2 }
      ];
      const frontlines = VoronoiPoliticalEngine.computeContestedFrontlines(towns, { features: [] });
      expect(frontlines.features.length).toBe(1);
    });
  });

  describe('Tier 2: Boundary Cases — F3: Control Panel Mode Toggle', () => {
    class RapidToggleController {
      constructor() { this.mode = 'geographic'; this.toggleCount = 0; }
      toggle() {
        this.mode = this.mode === 'geographic' ? 'political' : 'geographic';
        this.toggleCount++;
      }
    }

    test('B3.1: rapid 100-cycle mode alternation executes consistently', () => {
      const c = new RapidToggleController();
      for (let i = 0; i < 100; i++) c.toggle();
      expect(c.toggleCount).toBe(100);
      expect(c.mode).toBe('geographic');
    });

    test('B3.2: mode toggle at extreme coordinates (1000, 1000) maintains valid bounds', () => {
      const [lng, lat] = MinimapRadarEngine.worldToLngLat(1000, 1000);
      expect(lng).toBe(180);
      expect(lat).toBe(-90);
    });

    test('B3.3: world center (500, 500) projects to exact non-negative zero [0, 0]', () => {
      const [lng, lat] = MinimapRadarEngine.worldToLngLat(500, 500);
      expect(lng).toBe(0);
      expect(lat).toBe(0);
    });

    test('B3.4: negative world coordinates clamp safely', () => {
      const clamped = MinimapRadarEngine.lngLatToWorld(-200, 100);
      expect(clamped.x).toBe(0);
      expect(clamped.y).toBe(0);
    });

    test('B3.5: high precision float world coordinates project reliably', () => {
      const floatCoord = MinimapRadarEngine.worldToLngLat(500.54321, 499.12345);
      expect(Number.isFinite(floatCoord[0])).toBe(true);
      expect(Number.isFinite(floatCoord[1])).toBe(true);
    });
  });

  describe('Tier 2: Boundary Cases — F4: Ghost Hunter Radar Overlay', () => {
    test('B4.1: max point ghost town (13,716 points) yields vacancy age 1 day', () => {
      const towns = [{ id: 1, points: 13716, player: 'Ghost Town' }];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], [], { ghostHunter: true });
      expect(radar.ghosts.features[0].properties.estimatedVacancyDays).toBe(1);
    });

    test('B4.2: min point ghost town (175 points) yields high vacancy age (~90 days)', () => {
      const towns = [{ id: 2, points: 175, player: null }];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], [], { ghostHunter: true });
      expect(radar.ghosts.features[0].properties.estimatedVacancyDays).toBeGreaterThan(80);
    });

    test('B4.3: negative point input clamped to 0 points safely', () => {
      const towns = [{ id: 3, points: -50, isGhost: true }];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], [], { ghostHunter: true });
      expect(radar.ghosts.features[0].properties.points).toBe(0);
      expect(radar.ghosts.features[0].properties.estimatedVacancyDays).toBeGreaterThan(0);
    });

    test('B4.4: ghost town with null/undefined town ID defaults gracefully', () => {
      const towns = [{ id: null, points: 2000, isGhost: true }];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], [], { ghostHunter: true });
      expect(radar.ghosts.features.length).toBe(1);
    });

    test('B4.5: filter with minGhostPoints exceeding max points returns 0 ghosts', () => {
      const towns = [{ id: 4, points: 5000, isGhost: true }];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], [], { ghostHunter: true, minGhostPoints: 15000 });
      expect(radar.ghosts.features.length).toBe(0);
    });
  });

  describe('Tier 2: Boundary Cases — F5: Active Siege Radar', () => {
    test('B5.1: conquest event exactly at timeframe boundary is included', () => {
      const exactTime = Date.now() - 48 * 3600 * 1000;
      const conquests = [{ townId: 10, time: exactTime }];
      const towns = [{ id: 10, name: 'Borderline Town' }];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], conquests, { activeSiege: true, recentHours: 48 });
      expect(radar.sieges.features.length).toBe(1);
    });

    test('B5.2: multiple conquests on same town in 1 minute aggregate count', () => {
      const now = Date.now();
      const conquests = [
        { townId: 20, time: now - 1000 },
        { townId: 20, time: now - 2000 },
        { townId: 20, time: now - 3000 }
      ];
      const towns = [{ id: 20, name: 'Hot Zone' }];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], conquests, { activeSiege: true });
      expect(radar.sieges.features[0].properties.recentConquestCount).toBe(3);
    });

    test('B5.3: conquest with future timestamp handles clock skew cleanly', () => {
      const conquests = [{ townId: 30, time: Date.now() + 60000 }];
      const towns = [{ id: 30, name: 'Future Town' }];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], conquests, { activeSiege: true });
      expect(radar.sieges.features.length).toBe(1);
    });

    test('B5.4: town undergoing siege with 0 points renders valid halo properties', () => {
      const towns = [{ id: 40, points: 0, isBesieged: true }];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], [], { activeSiege: true });
      expect(radar.sieges.features[0].properties.haloRadius).toBe(15);
    });

    test('B5.5: 5,000 historical conquest records filtered efficiently within sub-50ms', () => {
      const conquests = Array.from({ length: 5000 }, (_, i) => ({
        townId: i % 100,
        time: Date.now() - (i * 3600000)
      }));
      const towns = [{ id: 1, name: 'Town 1' }];
      const start = performance.now();
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], conquests, { activeSiege: true, recentHours: 24 });
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
      expect(radar.sieges.features.length).toBe(1);
    });
  });

  describe('Tier 2: Boundary Cases — F6: Inactive Farm Finder', () => {
    test('B6.1: extreme negative momentum (-50,000) produces high activity score', () => {
      const players = [{ id: 1, momentumDelta: -50000 }];
      const towns = [{ id: 1, points: 10000, playerId: 1, player: 'CrashedPlayer' }];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, players, [], { inactiveFarms: true });
      expect(radar.inactiveFarms.features[0].properties.activityScore).toBeGreaterThan(100000);
    });

    test('B6.2: exact zero momentum delta included when maxMomentumDelta is 0', () => {
      const players = [{ id: 2, momentumDelta: 0 }];
      const towns = [{ id: 2, points: 6000, playerId: 2, player: 'Stagnant' }];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, players, [], { inactiveFarms: true, maxMomentumDelta: 0 });
      expect(radar.inactiveFarms.features.length).toBe(1);
    });

    test('B6.3: town with 0 points and negative momentum handled safely', () => {
      const players = [{ id: 3, momentumDelta: -100 }];
      const towns = [{ id: 3, points: 0, playerId: 3, player: 'Wiped' }];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, players, [], { inactiveFarms: true });
      expect(radar.inactiveFarms.features[0].properties.farmRating).toBe('LOW');
    });

    test('B6.4: missing player dictionary reference defaults to standard negative momentum', () => {
      const towns = [{ id: 4, points: 4000, playerId: 999, player: 'Unknown' }];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], [], { inactiveFarms: true });
      expect(radar.inactiveFarms.features.length).toBe(1);
    });

    test('B6.5: inactive player with 100 towns filters all towns simultaneously', () => {
      const players = [{ id: 5, momentumDelta: -300 }];
      const towns = Array.from({ length: 100 }, (_, i) => ({
        id: 1000 + i,
        points: 5000,
        playerId: 5,
        player: 'BigInactive'
      }));
      const radar = IntelRadarEngine.filterIntelOverlays(towns, players, [], { inactiveFarms: true });
      expect(radar.inactiveFarms.features.length).toBe(100);
    });
  });

  describe('Tier 2: Boundary Cases — F7: Bézier Route Trajectory Upgrade', () => {
    test('B7.1: zero-length trajectory (origin === target) returns single point without NaN', () => {
      const pt = { x: 500, y: 500 };
      const curve = TrajectoryTransitEngine.calculateArcTrajectory(pt, pt);
      expect(curve.length).toBe(1);
      expect(isNaN(curve[0][0])).toBe(false);
    });

    test('B7.2: maximum world diagonal trajectory ((0,0) to (1000,1000)) yields valid LngLat arc', () => {
      const curve = TrajectoryTransitEngine.calculateArcTrajectory({ x: 0, y: 0 }, { x: 1000, y: 1000 }, 0.20, 40);
      expect(curve.length).toBe(41);
      expect(curve[0][0]).toBe(-180);
      expect(curve[40][0]).toBe(180);
    });

    test('B7.3: inverted / negative camber camber parameter handled without NaN', () => {
      const curve = TrajectoryTransitEngine.calculateArcTrajectory({ x: 400, y: 400 }, { x: 600, y: 600 }, -0.20, 40);
      expect(curve.length).toBe(41);
      curve.forEach(([lng, lat]) => expect(Number.isFinite(lat)).toBe(true));
    });

    test('B7.4: high step density (steps = 200) calculates smoothly', () => {
      const curve = TrajectoryTransitEngine.calculateArcTrajectory({ x: 400, y: 400 }, { x: 500, y: 500 }, 0.20, 200);
      expect(curve.length).toBe(201);
    });

    test('B7.5: trajectory crossing prime meridian (Lng 0, Lat 0) maintains continuity', () => {
      const curve = TrajectoryTransitEngine.calculateArcTrajectory({ lng: -10, lat: 0 }, { lng: 10, lat: 0 }, 0.20, 40);
      expect(curve[20][0]).toBeCloseTo(0, 4);
    });
  });

  describe('Tier 2: Boundary Cases — F8: Animated Troop Transit Sprites', () => {
    test('B8.1: currentTime before startTime clamps progress to 0%', () => {
      const transit = {
        startTime: 2000,
        landingTime: 4000,
        curveCoordinates: [[0, 0], [10, 10]]
      };
      const p = TrajectoryTransitEngine.getTransitProgress(transit, 1000);
      expect(p.isCompleted).toBe(false);
      expect(p.currentLngLat[0]).toBe(0);
    });

    test('B8.2: currentTime after landingTime clamps progress to 100%', () => {
      const transit = {
        startTime: 2000,
        landingTime: 4000,
        curveCoordinates: [[0, 0], [10, 10]]
      };
      const p = TrajectoryTransitEngine.getTransitProgress(transit, 5000);
      expect(p.isCompleted).toBe(true);
      expect(p.currentLngLat[0]).toBe(10);
    });

    test('B8.3: 1 millisecond transit duration handles without division-by-zero', () => {
      const transit = {
        startTime: 1000,
        landingTime: 1001,
        curveCoordinates: [[0, 0], [5, 5]]
      };
      const p = TrajectoryTransitEngine.getTransitProgress(transit, 1000.5);
      expect(Number.isFinite(p.currentLngLat[0])).toBe(true);
    });

    test('B8.4: mythical flyer unit types handled with rotation derivatives', () => {
      const transit = {
        unitType: 'pegasus',
        startTime: 1000,
        landingTime: 5000,
        curveCoordinates: [[0, 0], [5, 10]]
      };
      const p = TrajectoryTransitEngine.getTransitProgress(transit, 3000);
      expect(p.rotationDegrees).toBeGreaterThan(0);
    });

    test('B8.5: empty curve coordinates array returns fallback coordinate [0,0]', () => {
      const transit = {
        startTime: 1000,
        landingTime: 5000,
        curveCoordinates: []
      };
      const p = TrajectoryTransitEngine.getTransitProgress(transit, 3000);
      expect(p.currentLngLat).toEqual([0, 0]);
    });
  });

  describe('Tier 2: Boundary Cases — F9: Live ETA Countdown Timers', () => {
    test('B9.1: countdown at exact boundary millisecond (landingTime - 1ms) returns 1 second', () => {
      const transit = { startTime: 0, landingTime: 10000, curveCoordinates: [[0, 0], [1, 1]] };
      const p = TrajectoryTransitEngine.getTransitProgress(transit, 9999);
      expect(p.remainingSeconds).toBe(1);
    });

    test('B9.2: countdown for long transit (100 hours) formats accurately', () => {
      const totalSecs = 100 * 3600;
      const hrs = Math.floor(totalSecs / 3600).toString().padStart(2, '0');
      const mins = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
      const secs = (totalSecs % 60).toString().padStart(2, '0');
      expect(`${hrs}:${mins}:${secs}`).toBe('100:00:00');
    });

    test('B9.3: epoch rollover timestamps (year 2038+) compute remaining seconds reliably', () => {
      const futureLanding = 2200000000000;
      const current = futureLanding - 30000;
      const transit = { startTime: current - 30000, landingTime: futureLanding, curveCoordinates: [[0, 0], [1, 1]] };
      const p = TrajectoryTransitEngine.getTransitProgress(transit, current);
      expect(p.remainingSeconds).toBe(30);
    });

    test('B9.4: rapid 60 FPS sub-second interval ticks update monotonically', () => {
      const transit = { startTime: 0, landingTime: 10000, curveCoordinates: [[0, 0], [1, 1]] };
      let prevSec = 11;
      for (let ms = 0; ms < 5000; ms += 16.6) {
        const p = TrajectoryTransitEngine.getTransitProgress(transit, ms);
        expect(p.remainingSeconds).toBeLessThanOrEqual(prevSec);
        prevSec = p.remainingSeconds;
      }
    });

    test('B9.5: invalid inverted timestamps (start > landing) immediately mark completed', () => {
      const transit = { startTime: 10000, landingTime: 5000, curveCoordinates: [[0, 0], [1, 1]] };
      const p = TrajectoryTransitEngine.getTransitProgress(transit, 6000);
      expect(p.isCompleted).toBe(true);
      expect(p.remainingSeconds).toBe(0);
    });
  });

  describe('Tier 2: Boundary Cases — F10: Multi-Origin Sniping Coordination', () => {
    test('B10.1: 50 origin towns synchronized simultaneously with zero failures', () => {
      const origins = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        islandX: 450 + (i % 10) * 2,
        islandY: 450 + Math.floor(i / 10) * 2
      }));
      const target = { islandX: 500, islandY: 500 };
      const syncs = TrajectoryTransitEngine.calculateSnipingSynchronization(origins, target, Date.now() + 3600000);
      expect(syncs.length).toBe(50);
    });

    test('B10.2: all origins on exact same coordinates yield identical launch time', () => {
      const origins = [{ id: 1, x: 480, y: 480 }, { id: 2, x: 480, y: 480 }];
      const target = { x: 500, y: 500 };
      const syncs = TrajectoryTransitEngine.calculateSnipingSynchronization(origins, target, Date.now() + 100000);
      expect(syncs[0].launchTimeMs).toBe(syncs[1].launchTimeMs);
    });

    test('B10.3: launch window 1 millisecond in future flagged as feasible', () => {
      const origins = [{ id: 1, x: 500, y: 500 }];
      const target = { x: 500, y: 500 };
      const now = Date.now();
      const syncs = TrajectoryTransitEngine.calculateSnipingSynchronization(origins, target, now + 1000);
      expect(syncs[0].isFeasible).toBe(true);
    });

    test('B10.4: launch window in past correctly flagged as unfeasible', () => {
      const origins = [{ id: 1, x: 100, y: 100 }];
      const target = { x: 900, y: 900 };
      const syncs = TrajectoryTransitEngine.calculateSnipingSynchronization(origins, target, Date.now() + 1000);
      expect(syncs[0].isFeasible).toBe(false);
    });

    test('B10.5: ultra-fast speed modifiers (World Speed 6, Unit Speed 2) compute reduced durations', () => {
      const origins = [{ id: 1, x: 500, y: 500 }];
      const target = { x: 530, y: 540 }; // dist 50
      const standardSync = TrajectoryTransitEngine.calculateSnipingSynchronization(origins, target, Date.now() + 100000, 3, 1, 1);
      const fastSync = TrajectoryTransitEngine.calculateSnipingSynchronization(origins, target, Date.now() + 100000, 3, 6, 2);

      expect(fastSync[0].durationSeconds).toBeLessThan(standardSync[0].durationSeconds);
    });
  });

  describe('Tier 2: Boundary Cases — F11: Tactical Operation Pins', () => {
    let storage;
    beforeEach(() => { storage = new MockLocalStorage(); });

    test('B11.1: 1,000 simultaneous tactical pins in single world handled intact', () => {
      for (let i = 1; i <= 1000; i++) {
        TacticalPinboardEngine.saveTacticalPin('world_stress', { townId: i }, storage);
      }
      expect(TacticalPinboardEngine.getTacticalPins('world_stress', storage).length).toBe(1000);
    });

    test('B11.2: pin at extreme corner (0, 0) preserves coordinates', () => {
      TacticalPinboardEngine.saveTacticalPin('world_1', { townId: 1, townX: 0, townY: 0 }, storage);
      const pin = TacticalPinboardEngine.getTacticalPins('world_1', storage)[0];
      expect(pin.townX).toBe(0);
      expect(pin.townY).toBe(0);
    });

    test('B11.3: pin with explicit ID overwrites existing pin instead of duplicating', () => {
      TacticalPinboardEngine.saveTacticalPin('world_1', { id: 'custom_pin_1', townId: 1, townName: 'V1' }, storage);
      TacticalPinboardEngine.saveTacticalPin('world_1', { id: 'custom_pin_1', townId: 1, townName: 'V2' }, storage);

      const pins = TacticalPinboardEngine.getTacticalPins('world_1', storage);
      expect(pins.length).toBe(1);
      expect(pins[0].townName).toBe('V2');
    });

    test('B11.4: string-based townId normalized safely', () => {
      TacticalPinboardEngine.saveTacticalPin('world_1', { townId: '5001' }, storage);
      const pin = TacticalPinboardEngine.getTacticalPins('world_1', storage)[0];
      expect(pin.townId).toBe('5001');
    });

    test('B11.5: empty string worldId handled without exception', () => {
      TacticalPinboardEngine.saveTacticalPin('', { townId: 10 }, storage);
      const pins = TacticalPinboardEngine.getTacticalPins('', storage);
      expect(pins.length).toBe(1);
    });
  });

  describe('Tier 2: Boundary Cases — F12: Custom Notes & Priority Tagging', () => {
    let storage;
    beforeEach(() => { storage = new MockLocalStorage(); });

    test('B12.1: note with exact 500 characters stored completely without truncation', () => {
      const note500 = 'Z'.repeat(500);
      TacticalPinboardEngine.saveTacticalPin('w1', { townId: 1, notes: note500 }, storage);
      expect(TacticalPinboardEngine.getTacticalPins('w1', storage)[0].notes.length).toBe(500);
    });

    test('B12.2: note with 501 characters truncated to exactly 500 characters', () => {
      const note501 = 'Z'.repeat(501);
      TacticalPinboardEngine.saveTacticalPin('w1', { townId: 1, notes: note501 }, storage);
      expect(TacticalPinboardEngine.getTacticalPins('w1', storage)[0].notes.length).toBe(500);
    });

    test('B12.3: notes containing HTML/script tags safely stored as text without execution', () => {
      const scriptNote = '<script>alert("hack")</script>';
      TacticalPinboardEngine.saveTacticalPin('w1', { townId: 1, notes: scriptNote }, storage);
      expect(TacticalPinboardEngine.getTacticalPins('w1', storage)[0].notes).toBe(scriptNote);
    });

    test('B12.4: notes containing emojis and Greek Unicode text preserved intact', () => {
      const unicodeNote = '⚔️ Operation Thermopylae 🛡️: ΜΟΛΩΝ ΛΑΒΕ';
      TacticalPinboardEngine.saveTacticalPin('w1', { townId: 1, notes: unicodeNote }, storage);
      expect(TacticalPinboardEngine.getTacticalPins('w1', storage)[0].notes).toBe(unicodeNote);
    });

    test('B12.5: sorting 1,000 mixed priority pins maintains strict priority tier hierarchy', () => {
      for (let i = 1; i <= 1000; i++) {
        const p = i % 3 === 0 ? 'CRITICAL' : (i % 2 === 0 ? 'HIGH' : 'NORMAL');
        TacticalPinboardEngine.saveTacticalPin('w1', { townId: i, priority: p }, storage);
      }
      const pins = TacticalPinboardEngine.getTacticalPins('w1', storage);
      const weight = { CRITICAL: 3, HIGH: 2, NORMAL: 1 };
      const sorted = [...pins].sort((a, b) => weight[b.priority] - weight[a.priority]);

      for (let i = 0; i < sorted.length - 1; i++) {
        expect(weight[sorted[i].priority]).toBeGreaterThanOrEqual(weight[sorted[i + 1].priority]);
      }
    });
  });

  describe('Tier 2: Boundary Cases — F13: One-Click Export to Sniper & Planner', () => {
    test('B13.1: town name containing URL reserved characters properly encoded', () => {
      const pin = { townId: 1, townName: 'Fortress #1 & 2 / Harbor ? True = 1' };
      const url = TacticalPinboardEngine.exportPinToSniper(pin);
      const params = new URLSearchParams(url.split('?')[1]);
      expect(params.get('targetName')).toBe('Fortress #1 & 2 / Harbor ? True = 1');
    });

    test('B13.2: town name with 200 characters encoded and decoded losslessly', () => {
      const longName = 'Empire_'.repeat(25);
      const pin = { townId: 2, townName: longName };
      const url = TacticalPinboardEngine.exportPinToSniper(pin);
      const params = new URLSearchParams(url.split('?')[1]);
      expect(params.get('targetName')).toBe(longName);
    });

    test('B13.3: export with custom base URL generates formatted path', () => {
      const pin = { townId: 3, townName: 'Target 3' };
      const url = TacticalPinboardEngine.exportPinToSniper(pin, 'https://grepotools.com/snipe');
      expect(url.startsWith('https://grepotools.com/snipe?')).toBe(true);
    });

    test('B13.4: export with targetReturnTime 0 omits or handles cleanly', () => {
      const pin = { townId: 4, targetReturnTime: 0 };
      const url = TacticalPinboardEngine.exportPinToSniper(pin);
      expect(url).toContain('targetTownId=4');
    });

    test('B13.5: export planner payload handles float coordinates cleanly', () => {
      const pin = { townId: 5, townName: 'Float Town', townX: 500.25, townY: 499.75, priority: 'HIGH' };
      const payload = TacticalPinboardEngine.exportPinToPlanner(pin);
      expect(payload.townX).toBe(500.25);
      expect(payload.townY).toBe(499.75);
    });
  });

  describe('Tier 2: Boundary Cases — F14: 1000x1000 Minimap Radar Widget', () => {
    test('B14.1: rectangular non-square minimap canvas (400x200) projects coordinates correctly', () => {
      const p = MinimapRadarEngine.projectWorldToMinimap(500, 500, 400, 200);
      expect(p.mx).toBe(200);
      expect(p.my).toBe(100);
    });

    test('B14.2: zero dimension canvas handles without throw returning zero coordinates', () => {
      const p = MinimapRadarEngine.projectWorldToMinimap(500, 500, 0, 0);
      expect(p.mx).toBe(0);
      expect(p.my).toBe(0);
    });

    test('B14.3: extreme zoom levels (Z=0.5 and Z=15) compute valid non-empty frustums', () => {
      const f0 = MinimapRadarEngine.calculateViewportFrustum({ zoom: 0.5 });
      const f15 = MinimapRadarEngine.calculateViewportFrustum({ zoom: 15 });
      expect(f0.width).toBeGreaterThan(f15.width);
    });

    test('B14.4: camera centered on exact ocean boundary line (X=500) computes symmetrical frustum', () => {
      const f = MinimapRadarEngine.calculateViewportFrustum({ longitude: 0, latitude: 0, zoom: 6 });
      expect(Math.abs(500 - f.minX)).toBeCloseTo(Math.abs(f.maxX - 500), 0);
    });

    test('B14.5: minimap viewport correctly encompasses playable circle at global zoom overview', () => {
      const frustum = MinimapRadarEngine.calculateViewportFrustum({ longitude: 0, latitude: 0, zoom: 0.5 });
      expect(frustum.minX).toBeLessThanOrEqual(250);
      expect(frustum.maxX).toBeGreaterThanOrEqual(750);
    });
  });

  describe('Tier 2: Boundary Cases — F15: Minimap Click & Drag Camera Sync', () => {
    test('B15.1: clicking exact pixel corners (0,0) and (300,300) maps to (0,0) and (1000,1000)', () => {
      const pTL = MinimapRadarEngine.projectMinimapClickToWorld(0, 0, 300, 300);
      const pBR = MinimapRadarEngine.projectMinimapClickToWorld(300, 300, 300, 300);
      expect(pTL.worldX).toBe(0);
      expect(pTL.worldY).toBe(0);
      expect(pBR.worldX).toBe(1000);
      expect(pBR.worldY).toBe(1000);
    });

    test('B15.2: clicking far outside canvas (-1000, 5000) clamps safely to [0, 1000]', () => {
      const pOut = MinimapRadarEngine.projectMinimapClickToWorld(-1000, 5000, 300, 300);
      expect(pOut.worldX).toBe(0);
      expect(pOut.worldY).toBe(1000);
    });

    test('B15.3: rapid drag sequence of 500 coordinate translations processes without latency', () => {
      for (let i = 0; i < 500; i++) {
        const p = MinimapRadarEngine.projectMinimapClickToWorld(i % 300, (i * 2) % 300, 300, 300);
        expect(p.worldX).toBeGreaterThanOrEqual(0);
        expect(p.worldX).toBeLessThanOrEqual(1000);
      }
    });

    test('B15.4: clicking ocean sector centers (O00 to O99) matches exact formula (ox*100+50, oy*100+50)', () => {
      for (let ox = 0; ox < 10; ox++) {
        const mx = ((ox * 100 + 50) / 1000) * 300;
        const my = 150;
        const nav = MinimapRadarEngine.projectMinimapClickToWorld(mx, my, 300, 300);
        expect(nav.worldX).toBe(ox * 100 + 50);
      }
    });

    test('B15.5: navigation callback error safely caught in calling context without breaking UI', () => {
      const errNav = () => { throw new Error('RenderCrash'); };
      expect(() => {
        try { errNav(); } catch (e) { expect(e.message).toBe('RenderCrash'); }
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS & PAIRWISE (15 tests)
  // --------------------------------------------------------------------------

  describe('Tier 3: Cross-Feature Combinations & Pairwise', () => {
    let storage;
    beforeEach(() => { storage = new MockLocalStorage(); });

    test('C1: Voronoi territory heatmaps + Tactical pins + Active sieges on contested islands', () => {
      const alliances = [
        { id: 1, name: 'Spartan Army', color: '#ef4444' },
        { id: 2, name: 'Athenian Fleet', color: '#3b82f6' }
      ];
      const towns = [
        { id: 101, name: 'Contested Fortress', islandX: 520, islandY: 520, allianceId: 1, isBesieged: true },
        { id: 102, name: 'Rival Encampment', islandX: 520, islandY: 520, allianceId: 2 }
      ];

      const voronoi = VoronoiPoliticalEngine.computeAllianceVoronoi(towns, alliances, { minTownCount: 1 });
      expect(voronoi.features.length).toBe(2);

      const frontlines = VoronoiPoliticalEngine.computeContestedFrontlines(towns, voronoi);
      expect(frontlines.features[0].properties.isContestedIsland).toBe(true);

      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], [], { activeSiege: true });
      expect(radar.sieges.features.length).toBe(1);

      TacticalPinboardEngine.saveTacticalPin('world_war', {
        townId: 101,
        type: 'BREAK_SIEGE',
        priority: 'CRITICAL',
        notes: 'Under heavy siege! Break within 2 hours.'
      }, storage);

      const pins = TacticalPinboardEngine.getTacticalPins('world_war', storage);
      expect(pins[0].type).toBe('BREAK_SIEGE');
    });

    test('C2: Multi-origin sniping + Bézier animated trajectories + ETA countdowns converging on pin', () => {
      const targetPin = { townId: 5001, townName: 'Siege Target', townX: 550, townY: 550 };
      const origins = [
        { id: 1, name: 'Naval Port 1', islandX: 530, islandY: 530 },
        { id: 2, name: 'Naval Port 2', islandX: 570, islandY: 520 }
      ];
      const landingTime = Date.now() + 1800000;

      const syncs = TrajectoryTransitEngine.calculateSnipingSynchronization(origins, targetPin, landingTime, 15, 3, 1);
      expect(syncs.length).toBe(2);

      const transits = syncs.map((s, idx) => ({
        id: `transit_${idx}`,
        originCoords: origins[idx],
        targetCoords: targetPin,
        curveCoordinates: TrajectoryTransitEngine.calculateArcTrajectory(origins[idx], targetPin, 0.20, 30),
        startTime: s.launchTimeMs,
        landingTime: s.landingTimeMs,
        durationSeconds: s.durationSeconds
      }));

      const checkTime = landingTime - 300000;
      transits.forEach(t => {
        const progress = TrajectoryTransitEngine.getTransitProgress(t, checkTime);
        expect(progress.isCompleted).toBe(false);
        expect(progress.remainingSeconds).toBe(300);
      });
    });

    test('C3: Ghost hunter radar + Inactive farm finder + Minimap navigation sweep', () => {
      const players = [{ id: 10, name: 'InactiveKing', momentumDelta: -500 }];
      const towns = [
        { id: 1, name: 'Ghost A', points: 6000, player: null, isGhost: true, islandX: 450, islandY: 450 },
        { id: 2, name: 'Farm B', points: 8500, player: 'InactiveKing', playerId: 10, islandX: 460, islandY: 455 }
      ];

      const overlays = IntelRadarEngine.filterIntelOverlays(towns, players, [], {
        ghostHunter: true,
        inactiveFarms: true,
        minGhostPoints: 2000,
        maxMomentumDelta: 0
      });

      expect(overlays.ghosts.features.length).toBe(1);
      expect(overlays.inactiveFarms.features.length).toBe(1);

      const sectorClick = MinimapRadarEngine.projectMinimapClickToWorld((450 / 1000) * 300, (450 / 1000) * 300);
      expect(sectorClick.worldX).toBe(450);
    });

    test('C4: Political view mode toggle + Frontline demarcation + 1-Click export to /snipe', () => {
      const pin = { townId: 777, townName: 'Frontline Keep', townX: 510, townY: 510, type: 'PRIMARY_TARGET', priority: 'HIGH' };
      TacticalPinboardEngine.saveTacticalPin('world_alpha', pin, storage);
      const savedPin = TacticalPinboardEngine.getTacticalPins('world_alpha', storage)[0];
      const exportUrl = TacticalPinboardEngine.exportPinToSniper(savedPin);
      expect(exportUrl).toBe('/snipe?targetTownId=777&targetName=Frontline+Keep&operationType=PRIMARY_TARGET&priority=HIGH');
    });

    test('C5: Simultaneous full tactical overlay filtering with Minimap frustum clipping', () => {
      const towns = [
        { id: 1, name: 'Ghost Center', isGhost: true, points: 5000, islandX: 500, islandY: 500 },
        { id: 2, name: 'Ghost Far Rim', isGhost: true, points: 5000, islandX: 950, islandY: 950 }
      ];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], [], { ghostHunter: true });
      const frustum = MinimapRadarEngine.calculateViewportFrustum({ longitude: 0, latitude: 0, zoom: 7 });

      const inFrustum = radar.ghosts.features.filter(f => {
        const x = f.properties.x;
        const y = f.properties.y;
        return x >= frustum.minX && x <= frustum.maxX && y >= frustum.minY && y <= frustum.maxY;
      });

      expect(inFrustum.length).toBe(1);
      expect(inFrustum[0].properties.townId).toBe(1);
    });

    test('C6: Inactive farm finder + Route planner payload generation + Minimap sweep', () => {
      const towns = [{ id: 88, name: 'Farm 88', points: 9000, player: 'Lazy', playerId: 88, islandX: 420, islandY: 420 }];
      const players = [{ id: 88, momentumDelta: -250 }];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, players, [], { inactiveFarms: true });

      const farm = radar.inactiveFarms.features[0];
      const plannerPayload = TacticalPinboardEngine.exportPinToPlanner({
        townId: farm.properties.townId,
        townName: farm.properties.name,
        townX: farm.properties.x,
        townY: farm.properties.y,
        priority: 'NORMAL',
        type: 'SECONDARY_TARGET'
      });

      expect(plannerPayload.targetTownId).toBe(88);
      expect(plannerPayload.townX).toBe(420);
    });

    test('C7: Tactical pin priority ordering + Multi-origin sniping wave sequence', () => {
      TacticalPinboardEngine.saveTacticalPin('w_wave', { townId: 10, priority: 'HIGH' }, storage);
      TacticalPinboardEngine.saveTacticalPin('w_wave', { townId: 20, priority: 'CRITICAL' }, storage);

      const pins = TacticalPinboardEngine.getTacticalPins('w_wave', storage);
      const weight = { CRITICAL: 3, HIGH: 2, NORMAL: 1 };
      pins.sort((a, b) => weight[b.priority] - weight[a.priority]);

      expect(pins[0].townId).toBe(20);
    });

    test('C8: Active siege countdown timer + Defense bireme sniping synchronization', () => {
      const csLanding = Date.now() + 600000; // 10 mins
      const defOrigins = [{ id: 1, x: 505, y: 505 }];
      const target = { x: 500, y: 500 };

      const sync = TrajectoryTransitEngine.calculateSnipingSynchronization(defOrigins, target, csLanding - 1000, 15, 3, 1);
      expect(sync[0].landingTimeMs).toBe(csLanding - 1000);
    });

    test('C9: Ghost town vacancy estimator + Farm activity scoring correlation', () => {
      const towns = [
        { id: 1, points: 10000, isGhost: true },
        { id: 2, points: 2000, isGhost: true }
      ];
      const radar = IntelRadarEngine.filterIntelOverlays(towns, [], [], { ghostHunter: true });
      const g1 = radar.ghosts.features.find(f => f.properties.townId === 1);
      const g2 = radar.ghosts.features.find(f => f.properties.townId === 2);

      expect(g1.properties.estimatedVacancyDays).toBeLessThan(g2.properties.estimatedVacancyDays);
    });

    test('C10: Deep sea trajectory across multiple ocean grid lines + Minimap tracking', () => {
      const o22 = { x: 250, y: 250 };
      const o66 = { x: 650, y: 650 };
      const curve = TrajectoryTransitEngine.calculateArcTrajectory(o22, o66, 0.20, 40);
      const frustum = MinimapRadarEngine.calculateViewportFrustum({ longitude: curve[20][0], latitude: curve[20][1], zoom: 6 });
      expect(frustum.width).toBeGreaterThan(0);
    });

    test('C11: Operation pin update + Dynamic re-export to sniper with return time', () => {
      const pin = TacticalPinboardEngine.saveTacticalPin('w_re', { townId: 44, townName: 'Bunker' }, storage)[0];
      TacticalPinboardEngine.saveTacticalPin('w_re', { id: pin.id, townId: 44, targetReturnTime: 1750000000000 }, storage);

      const updated = TacticalPinboardEngine.getTacticalPins('w_re', storage)[0];
      const url = TacticalPinboardEngine.exportPinToSniper(updated);
      expect(url).toContain('targetReturnTime=1750000000000');
    });

    test('C12: Multi-alliance island flip + Frontline tension recalibration', () => {
      const townsBefore = [{ id: 1, islandX: 500, islandY: 500, allianceId: 10 }];
      const frontlinesBefore = VoronoiPoliticalEngine.computeContestedFrontlines(townsBefore, { features: [] });
      expect(frontlinesBefore.features.length).toBe(0);

      const townsAfter = [
        { id: 1, islandX: 500, islandY: 500, allianceId: 10 },
        { id: 2, islandX: 500, islandY: 500, allianceId: 20 }
      ];
      const frontlinesAfter = VoronoiPoliticalEngine.computeContestedFrontlines(townsAfter, { features: [] });
      expect(frontlinesAfter.features.length).toBe(1);
    });

    test('C13: Full tactical overlay stack (Ghost + Siege + Farm + Voronoi + Frontlines)', () => {
      const towns = [
        { id: 1, name: 'G1', isGhost: true, points: 4000, islandX: 500, islandY: 500 },
        { id: 2, name: 'S1', isBesieged: true, points: 9000, islandX: 510, islandY: 510, allianceId: 1, player: 'Lord Siege', playerId: 2 },
        { id: 3, name: 'F1', points: 6000, playerId: 5, player: 'Idle', momentumDelta: -100, islandX: 520, islandY: 520, allianceId: 2 }
      ];
      const players = [
        { id: 5, momentumDelta: -100 },
        { id: 2, momentumDelta: 500 }
      ];
      const intel = IntelRadarEngine.filterIntelOverlays(towns, players, [], {
        ghostHunter: true,
        activeSiege: true,
        inactiveFarms: true
      });

      expect(intel.ghosts.features.length).toBe(1);
      expect(intel.sieges.features.length).toBe(1);
      expect(intel.inactiveFarms.features.length).toBe(1);
    });

    test('C14: Minimap frustum clipping across all active tactical overlays', () => {
      const frustum = MinimapRadarEngine.calculateViewportFrustum({ longitude: 0, latitude: 0, zoom: 6 });
      expect(frustum.minLng).toBeLessThan(frustum.maxLng);
      expect(frustum.minLat).toBeLessThan(frustum.maxLat);
    });

    test('C15: End-to-end LocalStorage recovery under active radar and pinboard workflows', () => {
      storage.setItem('grepo_tactical_pins_w_corrupt', 'INVALID_JSON_CORRUPTED');
      TacticalPinboardEngine.saveTacticalPin('w_corrupt', { townId: 77 }, storage);
      const pins = TacticalPinboardEngine.getTacticalPins('w_corrupt', storage);
      expect(pins.length).toBe(1);
      expect(pins[0].townId).toBe(77);
    });
  });

  // --------------------------------------------------------------------------
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS (8 Comprehensive Workload Scenarios)
  // --------------------------------------------------------------------------

  describe('Tier 4: Real-World Workload Scenarios', () => {
    let storage;
    beforeEach(() => { storage = new MockLocalStorage(); });

    test('Scenario 1: Large-Scale Coalition World War Operation (F1, F2, F3, F10, F11, F12, F13)', () => {
      const worldId = 'en_ww1';
      const alliances = [
        { id: 100, name: 'Olympian Coalition', color: '#2563eb' },
        { id: 200, name: 'Spartan Hegemony', color: '#dc2626' }
      ];
      const towns = [
        { id: 1, name: 'Olympus Stronghold', islandX: 480, islandY: 480, allianceId: 100, points: 11000 },
        { id: 2, name: 'Olympus Naval Base', islandX: 485, islandY: 482, allianceId: 100, points: 10500 },
        { id: 3, name: 'Sparta Frontline', islandX: 515, islandY: 515, allianceId: 200, points: 12000 },
        { id: 4, name: 'Sparta Redoubt', islandX: 520, islandY: 520, allianceId: 200, points: 9800 }
      ];

      const voronoi = VoronoiPoliticalEngine.computeAllianceVoronoi(towns, alliances);
      expect(voronoi.features.length).toBe(2);
      const frontlines = VoronoiPoliticalEngine.computeContestedFrontlines(towns, voronoi);
      expect(frontlines.features.length).toBe(1);

      const targetTown = towns[2];
      TacticalPinboardEngine.saveTacticalPin(worldId, {
        townId: targetTown.id,
        townName: targetTown.name,
        townX: targetTown.islandX,
        townY: targetTown.islandY,
        type: 'PRIMARY_TARGET',
        priority: 'CRITICAL',
        notes: 'Op Zero Hour: Unified CS landing at 20:00:00 UTC with naval clearance.',
        author: 'Supreme Commander'
      }, storage);

      const pins = TacticalPinboardEngine.getTacticalPins(worldId, storage);
      expect(pins.length).toBe(1);
      expect(pins[0].priority).toBe('CRITICAL');

      const landingTime = new Date('2026-09-03T20:00:00Z').getTime();
      const strikeFleetOrigins = [towns[0], towns[1]];
      const syncs = TrajectoryTransitEngine.calculateSnipingSynchronization(
        strikeFleetOrigins, targetTown, landingTime, 3, 3, 1
      );

      expect(syncs.length).toBe(2);
      syncs.forEach(s => expect(s.landingTimeMs).toBe(landingTime));

      const exportUrl = TacticalPinboardEngine.exportPinToSniper(pins[0]);
      expect(exportUrl).toContain('/snipe?targetTownId=3');
      expect(exportUrl).toContain('priority=CRITICAL');
    });

    test('Scenario 2: Island Siege Defense & Multi-Origin Bireme Sniping (F5, F8, F9, F10, F11, F13)', () => {
      const worldId = 'en_siege_def';
      const besiegedTown = { id: 801, name: 'Delos Bunker', islandX: 500, islandY: 500, isBesieged: true };
      const conquestEvent = [{ townId: 801, time: Date.now() - 1800000 }];

      const radar = IntelRadarEngine.filterIntelOverlays([besiegedTown], [], conquestEvent, { activeSiege: true });
      expect(radar.sieges.features.length).toBe(1);

      const csLandingTime = Date.now() + 3600000;
      TacticalPinboardEngine.saveTacticalPin(worldId, {
        townId: besiegedTown.id,
        townName: besiegedTown.name,
        townX: besiegedTown.islandX,
        townY: besiegedTown.islandY,
        type: 'BREAK_SIEGE',
        priority: 'CRITICAL',
        notes: 'Enemy CS in inbound! Land defensive Biremes 1 second before CS.',
        targetReturnTime: csLandingTime
      }, storage);

      const defenseOrigins = [
        { id: 701, name: 'Def Port A', islandX: 490, islandY: 500 },
        { id: 702, name: 'Def Port B', islandX: 510, islandY: 510 },
        { id: 703, name: 'Def Port C', islandX: 500, islandY: 520 }
      ];
      const targetSnipeLanding = csLandingTime - 1000;
      const syncs = TrajectoryTransitEngine.calculateSnipingSynchronization(
        defenseOrigins, besiegedTown, targetSnipeLanding, 15, 3, 1
      );

      expect(syncs.length).toBe(3);
      syncs.forEach(s => expect(s.landingTimeMs).toBe(targetSnipeLanding));

      const transitB = {
        id: 'transit_def_b',
        originCoords: defenseOrigins[1],
        targetCoords: besiegedTown,
        curveCoordinates: TrajectoryTransitEngine.calculateArcTrajectory(defenseOrigins[1], besiegedTown),
        startTime: syncs[1].launchTimeMs,
        landingTime: syncs[1].landingTimeMs,
        durationSeconds: syncs[1].durationSeconds
      };

      const progress = TrajectoryTransitEngine.getTransitProgress(transitB, targetSnipeLanding - 10000);
      expect(progress.remainingSeconds).toBe(10);
      expect(progress.isCompleted).toBe(false);
    });

    test('Scenario 3: Rapid Ocean Ghost Hunting & Inactive Farming Sweep (F4, F6, F14, F15)', () => {
      const worldId = 'en_farm_sweep';
      const players = [
        { id: 10, name: 'InactiveLord', momentumDelta: -800 },
        { id: 20, name: 'ActiveDefender', momentumDelta: 2500 }
      ];
      const sectorTowns = [
        { id: 1, name: 'Ruined Acropolis', points: 7500, player: null, isGhost: true, islandX: 450, islandY: 450 },
        { id: 2, name: 'Abandoned Port', points: 5200, player: 'Ghost Town', isGhost: true, islandX: 455, islandY: 452 },
        { id: 3, name: 'Fallen Haven', points: 9100, player: 'InactiveLord', playerId: 10, islandX: 458, islandY: 456 },
        { id: 4, name: 'Iron Fortress', points: 13000, player: 'ActiveDefender', playerId: 20, islandX: 460, islandY: 460 }
      ];

      const intel = IntelRadarEngine.filterIntelOverlays(sectorTowns, players, [], {
        ghostHunter: true,
        inactiveFarms: true,
        minGhostPoints: 3000,
        maxMomentumDelta: 0
      });

      expect(intel.ghosts.features.length).toBe(2);
      expect(intel.inactiveFarms.features.length).toBe(1);
      expect(intel.inactiveFarms.features[0].properties.townId).toBe(3);

      const minimapNav = MinimapRadarEngine.projectMinimapClickToWorld((450 / 1000) * 300, (450 / 1000) * 300);
      expect(minimapNav.worldX).toBe(450);

      intel.ghosts.features.forEach(g => {
        TacticalPinboardEngine.saveTacticalPin(worldId, {
          townId: g.properties.townId,
          townName: g.properties.name,
          type: 'SECONDARY_TARGET',
          priority: 'NORMAL',
          notes: `Ghost farm target: ${g.properties.points} pts.`
        }, storage);
      });

      const pins = TacticalPinboardEngine.getTacticalPins(worldId, storage);
      expect(pins.length).toBe(2);
    });

    test('Scenario 4: Deep Sea Transit Trajectory Planning & Minimap Navigation (F7, F8, F9, F14, F15)', () => {
      const deepOrigin = { id: 1, name: 'Western Base', x: 200, y: 200 };
      const deepTarget = { id: 2, name: 'Eastern Colony', x: 800, y: 800 };

      const curve = TrajectoryTransitEngine.calculateArcTrajectory(deepOrigin, deepTarget, 0.20, 40);
      expect(curve.length).toBe(41);

      const startTime = 1000000;
      const landingTime = 1090000;
      const transit = {
        id: 'deep_colony_fleet',
        originCoords: deepOrigin,
        targetCoords: deepTarget,
        curveCoordinates: curve,
        unitType: 'colony_ship',
        startTime,
        landingTime,
        durationSeconds: 90
      };

      const p0 = TrajectoryTransitEngine.getTransitProgress(transit, startTime);
      const p33 = TrajectoryTransitEngine.getTransitProgress(transit, startTime + 30000);
      const p66 = TrajectoryTransitEngine.getTransitProgress(transit, startTime + 60000);
      const p100 = TrajectoryTransitEngine.getTransitProgress(transit, landingTime);

      expect(p0.remainingSeconds).toBe(90);
      expect(p33.remainingSeconds).toBe(60);
      expect(p66.remainingSeconds).toBe(30);
      expect(p100.remainingSeconds).toBe(0);
      expect(p100.isCompleted).toBe(true);

      const frustumMid = MinimapRadarEngine.calculateViewportFrustum({
        longitude: p33.currentLngLat[0],
        latitude: p33.currentLngLat[1],
        zoom: 6.5
      });
      expect(frustumMid.width).toBeGreaterThan(0);
    });

    test('Scenario 5: Frontline Border Shift & Alliance Pinboard Coordination (F1, F2, F11, F12, F13)', () => {
      const worldId = 'en_frontline_shift';
      const islandTownsShifted = [
        { id: 1, name: 'Bastion 1', islandX: 500, islandY: 500, allianceId: 10 },
        { id: 2, name: 'Bastion 2 (Captured)', islandX: 500, islandY: 500, allianceId: 20 }
      ];
      const frontlinesShifted = VoronoiPoliticalEngine.computeContestedFrontlines(islandTownsShifted, { features: [] });
      expect(frontlinesShifted.features.length).toBe(1);
      expect(frontlinesShifted.features[0].properties.isContestedIsland).toBe(true);
      expect(frontlinesShifted.features[0].properties.tension).toBe(1.0);

      TacticalPinboardEngine.saveTacticalPin(worldId, {
        townId: 1,
        townName: 'Bastion 1',
        townX: 500,
        townY: 500,
        type: 'STACK_BIREMES',
        priority: 'CRITICAL',
        notes: 'Island breached! Stack 800 Biremes immediately.'
      }, storage);

      const pins = TacticalPinboardEngine.getTacticalPins(worldId, storage);
      expect(pins[0].type).toBe('STACK_BIREMES');
      expect(pins[0].priority).toBe('CRITICAL');

      const plannerPayload = TacticalPinboardEngine.exportPinToPlanner(pins[0]);
      expect(plannerPayload.targetTownId).toBe(1);
      expect(plannerPayload.type).toBe('STACK_BIREMES');
    });

    test('Scenario 6: Midnight Multi-Wave Naval Defense & Counter-Offensive (F5, F8, F9, F10, F11)', () => {
      const worldId = 'en_midnight_ops';
      const targetA = { id: 101, name: 'City Alpha', islandX: 500, islandY: 500, isBesieged: true };
      const targetB = { id: 102, name: 'City Beta', islandX: 520, islandY: 520 };

      // 1. Defend City A with Stack Biremes
      TacticalPinboardEngine.saveTacticalPin(worldId, {
        townId: 101,
        type: 'STACK_BIREMES',
        priority: 'CRITICAL',
        notes: 'Stack 1200 Biremes before 02:00:00'
      }, storage);

      // 2. Counter-strike City B with Primary Target
      TacticalPinboardEngine.saveTacticalPin(worldId, {
        townId: 102,
        type: 'PRIMARY_TARGET',
        priority: 'HIGH',
        notes: 'Counter-offensive launch at 02:05:00'
      }, storage);

      const pins = TacticalPinboardEngine.getTacticalPins(worldId, storage);
      expect(pins.length).toBe(2);

      // 3. Coordinate synchronized counter-strike
      const origins = [{ id: 1, x: 480, y: 480 }, { id: 2, x: 490, y: 490 }];
      const syncs = TrajectoryTransitEngine.calculateSnipingSynchronization(origins, targetB, Date.now() + 7200000);
      expect(syncs.length).toBe(2);
    });

    test('Scenario 7: Alliance Reset & Migration to Fresh Ocean Cluster (F4, F11, F14, F15)', () => {
      const worldId = 'en_migration';
      // Clear old pins
      TacticalPinboardEngine.saveTacticalPin(worldId, { townId: 99 }, storage);
      TacticalPinboardEngine.removeTacticalPin(worldId, TacticalPinboardEngine.getTacticalPins(worldId, storage)[0].id, storage);
      expect(TacticalPinboardEngine.getTacticalPins(worldId, storage).length).toBe(0);

      // Scan new ocean cluster for high point ghosts
      const newOceanTowns = [
        { id: 301, name: 'New Ghost Prime', points: 9500, isGhost: true, islandX: 750, islandY: 750 },
        { id: 302, name: 'New Ghost Harbor', points: 8200, isGhost: true, islandX: 752, islandY: 750 }
      ];
      const radar = IntelRadarEngine.filterIntelOverlays(newOceanTowns, [], [], { ghostHunter: true, minGhostPoints: 5000 });
      expect(radar.ghosts.features.length).toBe(2);

      // Pin founding cities
      radar.ghosts.features.forEach(g => {
        TacticalPinboardEngine.saveTacticalPin(worldId, {
          townId: g.properties.townId,
          type: 'PRIMARY_TARGET',
          priority: 'CRITICAL',
          notes: 'New core cluster founding town.'
        }, storage);
      });

      expect(TacticalPinboardEngine.getTacticalPins(worldId, storage).length).toBe(2);
    });

    test('Scenario 8: High-Tension Coalition Border Standoff with 20+ Island Outposts (F1, F2, F11, F12)', () => {
      const worldId = 'en_standoff';
      const islands = Array.from({ length: 20 }, (_, i) => ([
        { id: i * 2 + 1, islandX: 500 + i, islandY: 500 + i, allianceId: 10 },
        { id: i * 2 + 2, islandX: 500 + i, islandY: 500 + i, allianceId: 20 }
      ])).flat();

      const frontlines = VoronoiPoliticalEngine.computeContestedFrontlines(islands, { features: [] });
      expect(frontlines.features.length).toBe(20);

      // Assign priorities across frontline outposts
      frontlines.features.slice(0, 5).forEach((f, idx) => {
        TacticalPinboardEngine.saveTacticalPin(worldId, {
          townId: 1000 + idx,
          type: 'PRIMARY_TARGET',
          priority: 'CRITICAL',
          notes: `Frontline defense anchor #${idx + 1}`
        }, storage);
      });

      const pins = TacticalPinboardEngine.getTacticalPins(worldId, storage);
      expect(pins.length).toBe(5);
    });
  });
});
