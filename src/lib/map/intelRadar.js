/**
 * src/lib/map/intelRadar.js
 * Tactical Intel Radar Algorithms Engine
 * Milestone 2 (F4, F5, F6)
 */

/**
 * Calculates estimated vacancy days based on town points decay from maximum.
 * 
 * @param {number} points - Town point value
 * @returns {number} Vacancy age in days (minimum 1)
 */
export function estimateGhostVacancyDays(points) {
  const safePoints = Math.max(0, Number.isFinite(Number(points)) ? Number(points) : 0);
  return Math.max(1, Math.round((13716 - safePoints) / 150));
}

/**
 * Calculates farm activity / loot score based on town points and player momentum drop.
 * 
 * @param {number} points - Town point value
 * @param {number} momentumDelta - Player point momentum change
 * @returns {number} Computed activity score
 */
export function calculateFarmActivityScore(points, momentumDelta) {
  const safePoints = Math.max(0, Number.isFinite(Number(points)) ? Number(points) : 0);
  const safeDelta = Number.isFinite(Number(momentumDelta)) ? Number(momentumDelta) : -50;
  return Math.max(0, Math.round(safePoints * 0.1 - safeDelta * 2));
}

/**
 * Assigns farm priority rating based on town points tier.
 * 
 * @param {number} points - Town point value
 * @returns {"HIGH" | "MEDIUM" | "LOW"}
 */
export function getFarmRating(points) {
  const safePoints = Math.max(0, Number.isFinite(Number(points)) ? Number(points) : 0);
  if (safePoints > 8000) return "HIGH";
  if (safePoints > 3000) return "MEDIUM";
  return "LOW";
}

/**
 * Filters world towns and cross-references players/conquests to generate GeoJSON FeatureCollections
 * for Ghost Hunter, Active Siege, and Inactive Farm radar overlays.
 * 
 * @param {Array<Object>} towns - Array of raw town objects or GeoJSON features
 * @param {Array<Object>} players - Array of player records with momentum metadata
 * @param {Array<Object>} conquests - Array of conquest logs
 * @param {Object} filters - Radar filter toggles and thresholds
 * @returns {{ ghosts: Object, sieges: Object, inactiveFarms: Object }} GeoJSON FeatureCollections
 */
export function filterIntelOverlays(towns = [], players = [], conquests = [], filters = {}) {
  const {
    ghostHunter = false,
    activeSiege = false,
    inactiveFarms = false,
    minGhostPoints = 0,
    maxMomentumDelta = 0,
    recentHours = 48
  } = filters || {};

  const safeTowns = Array.isArray(towns) ? towns : [];
  const safePlayers = Array.isArray(players) ? players : [];
  const safeConquests = Array.isArray(conquests) ? conquests : [];

  const emptyResult = {
    ghosts: { type: "FeatureCollection", features: [] },
    sieges: { type: "FeatureCollection", features: [] },
    inactiveFarms: { type: "FeatureCollection", features: [] }
  };

  if (!ghostHunter && !activeSiege && !inactiveFarms) {
    return emptyResult;
  }

  // Build Player Lookup Map
  const playerMap = new Map();
  safePlayers.forEach(p => {
    if (p && p.id !== undefined && p.id !== null) {
      playerMap.set(p.id, p);
    }
  });

  // Defensive extractor for town coordinates and attributes
  function extractTownData(t) {
    if (!t) return null;
    const raw = t.properties ? { ...t.properties, ...t } : t;

    let x = Number(raw.islandX ?? raw.x ?? 500);
    let y = Number(raw.islandY ?? raw.y ?? 500);
    if (!Number.isFinite(x)) x = 500;
    if (!Number.isFinite(y)) y = 500;

    let lng, lat;
    if (t.geometry?.coordinates && Array.isArray(t.geometry.coordinates)) {
      lng = Number(t.geometry.coordinates[0]);
      lat = Number(t.geometry.coordinates[1]);
    } else if (raw.lng !== undefined && raw.lat !== undefined && Number.isFinite(Number(raw.lng)) && Number.isFinite(Number(raw.lat))) {
      lng = Number(raw.lng);
      lat = Number(raw.lat);
    } else if (Array.isArray(raw.coordinates) && raw.coordinates.length >= 2) {
      lng = Number(raw.coordinates[0]);
      lat = Number(raw.coordinates[1]);
    } else {
      lng = (x / 1000) * 360 - 180;
      lat = -((y / 1000) * 180 - 90);
    }

    const pName = typeof raw.player === 'object' ? raw.player?.name : raw.player;
    const pId = typeof raw.player === 'object' ? raw.player?.id : raw.playerId;
    const rawPoints = Number(raw.points ?? raw.pts ?? 0);
    const points = Math.max(0, Number.isFinite(rawPoints) ? rawPoints : 0);

    return {
      raw,
      id: raw.id ?? null,
      name: raw.name || (raw.id ? `Town #${raw.id}` : 'Unknown Town'),
      points,
      x,
      y,
      lng,
      lat,
      pName,
      pId,
      isBesieged: Boolean(raw.isBesieged),
      isGhost: Boolean(raw.isGhost) || !pName || pName === 'Ghost Town' || pId === null || pId === undefined
    };
  }

  const ghostFeatures = [];
  const siegeFeatures = [];
  const farmFeatures = [];

  // 1. Ghost Hunter Radar
  if (ghostHunter) {
    const minPts = Number.isFinite(Number(minGhostPoints)) ? Math.max(0, Number(minGhostPoints)) : 0;
    safeTowns.forEach(t => {
      const data = extractTownData(t);
      if (!data) return;

      if (data.isGhost && data.points >= minPts) {
        const estimatedVacancyDays = estimateGhostVacancyDays(data.points);
        ghostFeatures.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [data.lng, data.lat] },
          properties: {
            townId: data.id,
            name: data.raw.name || (data.id ? `Ghost #${data.id}` : 'Ghost Town'),
            points: data.points,
            x: data.x,
            y: data.y,
            lng: data.lng,
            lat: data.lat,
            indicatorType: "ghost_skull",
            estimatedVacancyDays
          }
        });
      }
    });
  }

  // 2. Active Siege Radar
  if (activeSiege) {
    const now = Date.now();
    const safeRecentHours = Number.isFinite(Number(recentHours)) ? Math.max(0, Number(recentHours)) : 48;
    const windowMs = safeRecentHours * 3600 * 1000;

    const townConquestCounts = new Map();
    safeConquests.forEach(c => {
      if (!c) return;
      const cTime = typeof c.time === 'string' ? new Date(c.time).getTime() : Number(c.time || 0);
      if (now - cTime <= windowMs) {
        const tId = c.townId ?? c.town_id ?? c.id;
        if (tId !== undefined && tId !== null) {
          townConquestCounts.set(tId, (townConquestCounts.get(tId) || 0) + 1);
        }
      }
    });

    safeTowns.forEach(t => {
      const data = extractTownData(t);
      if (!data) return;

      const conquestCount = townConquestCounts.get(data.id) || (data.isBesieged ? 1 : 0);
      if (conquestCount > 0) {
        siegeFeatures.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [data.lng, data.lat] },
          properties: {
            townId: data.id,
            name: data.name,
            points: data.points,
            recentConquestCount: conquestCount,
            isContested: true,
            haloIntensity: 0.8,
            pulseRateMs: 1500,
            haloRadius: 15
          }
        });
      }
    });
  }

  // 3. Inactive Farm Finder
  if (inactiveFarms) {
    const maxDelta = Number.isFinite(Number(maxMomentumDelta)) ? Number(maxMomentumDelta) : 0;

    safeTowns.forEach(t => {
      const data = extractTownData(t);
      if (!data || data.isGhost || !data.pId || data.pName === 'Ghost Town') return;

      const playerMeta = playerMap.get(data.pId) || {};
      const momentumDelta = Number(playerMeta.momentumDelta ?? playerMeta.pointDelta ?? data.raw.momentumDelta ?? -50);

      if (momentumDelta <= maxDelta) {
        const activityScore = calculateFarmActivityScore(data.points, momentumDelta);
        const farmRating = getFarmRating(data.points);

        farmFeatures.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [data.lng, data.lat] },
          properties: {
            townId: data.id,
            name: data.name,
            points: data.points,
            x: data.x,
            y: data.y,
            lng: data.lng,
            lat: data.lat,
            playerName: data.pName,
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

export const IntelRadarEngine = {
  filterIntelOverlays,
  estimateGhostVacancyDays,
  calculateFarmActivityScore,
  getFarmRating
};

export default IntelRadarEngine;
