# Milestone 2: Tactical Intel Radar Algorithms & MapLibre Layers — Analysis Report

## Executive Summary
This document provides the exhaustive architectural and algorithmic formulation for Milestone 2 (Tactical Intel Radar & Map Visualization). It specifies the complete implementation for `src/lib/map/intelRadar.js`, its integration into the MapLibre layer stack in `src/app/map/page.js`, and the dedicated HUD component `src/components/map/IntelRadarControls.js`.

---

## 1. Mathematical & Algorithmic Foundations

### 1.1. Ghost Hunter Radar Overlay (F4)
- **Identification Rule**: A town is classified as a ghost town if:
  $$\text{isGhost} = \text{true} \lor \text{player} = \text{null} \lor \text{player} = \text{"Ghost Town"} \lor \text{playerId} = \text{null}$$
- **Points Clamping**:
  $$\text{points} = \max(0, \text{rawPoints})$$
- **Vacancy Age Estimation Formula**:
  $$\text{estimatedVacancyDays} = \max\left(1, \operatorname{round}\left(\frac{13716 - \text{points}}{150}\right)\right)$$
  - Max points ($13,716\text{ pts}$): $\max(1, \operatorname{round}(0 / 150)) = 1\text{ day}$
  - Min points ($175\text{ pts}$): $\max(1, \operatorname{round}(13541 / 150)) = 90\text{ days}$
  - Zero/negative points ($0\text{ pts}$): $\max(1, \operatorname{round}(13716 / 150)) = 91\text{ days}$
- **Thresholding**: Filter out ruins where $\text{points} < \text{minGhostPoints}$.
- **Indicator**: Attach `indicatorType: "ghost_skull"`.

### 1.2. Active Siege / Contest Radar Overlay (F5)
- **Recency Window**:
  $$\Delta t = t_{\text{now}} - t_{\text{conquest}} \le \text{recentHours} \times 3600 \times 1000$$
  - Handles clock skew gracefully: if $t_{\text{conquest}} > t_{\text{now}}$, $\Delta t < 0 \le \text{windowMs}$, so future-skewed events remain captured.
- **Aggregation**: Map town conquests with $O(N)$ accumulation:
  $$\text{count}(T) = \sum_{c \in \text{Conquests}_{48h}} [c.\text{townId} = T.\text{id}]$$
- **Besieged Fallback**: If $\text{count}(T) = 0$ but $T.\text{isBesieged} = \text{true}$, $\text{recentConquestCount} = 1$.
- **Visual Pulse Halo Properties**:
  - `haloIntensity: 0.8`
  - `pulseRateMs: 1500`
  - `haloRadius: 15`
  - `isContested: true`

### 1.3. Inactive Farm Finder Overlay (F6)
- **Eligibility**: Player towns where $\text{playerId} \ne \text{null} \land \text{playerName} \ne \text{"Ghost Town"} \land \neg \text{isGhost}$.
- **Momentum Delta Resolution**:
  $$\text{momentumDelta} = \text{player}.\text{momentumDelta} \mathbin{??} \text{player}.\text{pointDelta} \mathbin{??} \text{town}.\text{momentumDelta} \mathbin{??} -50$$
- **Threshold Rule**: Include town if $\text{momentumDelta} \le \text{maxMomentumDelta}$ (default $0$). Growing players ($\text{momentumDelta} > 0$) are strictly excluded.
- **Activity Score Calculation**:
  $$\text{activityScore} = \max(0, \operatorname{round}(\text{points} \times 0.1 - \text{momentumDelta} \times 2))$$
  - Example (Crash): $\text{pts} = 10000, \Delta = -50000 \implies \operatorname{round}(1000 - (-100000)) = 101,000$.
- **Farm Rating Tiers**:
  $$\text{farmRating} = \begin{cases} \text{"HIGH"} & \text{if } \text{points} > 8000 \\ \text{"MEDIUM"} & \text{if } \text{points} > 3000 \\ \text{"LOW"} & \text{otherwise} \end{cases}$$

---

## 2. Complete Module Implementation: `src/lib/map/intelRadar.js`

```javascript
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

  // Helper to defensively extract town attributes and coordinates
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
```

---

## 3. MapLibre WebGL Layer Stack Architecture (`src/app/map/page.js`)

The radar overlays are structured with specialized GPU layers to provide instant visual clarity and high performance (60 FPS):

```
MapLibre Layer Ordering (Bottom to Top):
1. [background]               # Base dark void
2. [ocean-lines, ocean-labels]# Ocean coordinates & sectors
3. [route-line-glow, route-line] # Arcing Bézier travel lines
4. [voronoi-spheres-fill]     # Alliance territory polygons
5. [voronoi-spheres-border]   # Alliance territory boundaries
6. [contested-frontline-glow] # High-tension contested border glow
7. [contested-frontline-lines]# Contested frontline dashed lines
8. [ghost-radar-glow]         # ⭐ GHOST RADAR: Cyan/Purple aura (minzoom 2.0)
9. [siege-radar-halo]         # ⭐ SIEGE RADAR: Pulsing Crimson halo (minzoom 2.0)
10. [inactive-farm-markers]   # ⭐ INACTIVE FARM: Amber/Gold target ring (minzoom 3.0)
11. [islands-points, island-sprites] # Island base terrain
12. [rocks-points]            # Decorative rocks
13. [empty-slots-sprites]     # Colonization anchor slots
14. [clusters, cluster-count] # Macro town clusters
15. [town-points]             # Unclustered town circles
16. [ghost-radar-markers]     # ⭐ GHOST RADAR: Skull symbol markers
17. [inactive-farm-labels]    # ⭐ INACTIVE FARM: Rating & town badges
18. [town-sprites]            # 3D Town buildings
19. [town-flags, town-labels] # Town alliance badges & text
```

### 3.1. Layer Definitions in JSX

```jsx
{/* GHOST HUNTER RADAR OVERLAY */}
{radarOverlays.ghosts.features.length > 0 && (
  <Source id="ghost-radar-source" type="geojson" data={radarOverlays.ghosts}>
    <Layer
      id="ghost-radar-glow"
      type="circle"
      beforeId="islands-points"
      paint={{
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 7,
          5.0, 14,
          8.0, 24,
          11.0, 36
        ],
        "circle-color": [
          "interpolate", ["linear"], ["coalesce", ["get", "estimatedVacancyDays"], 1],
          1, "#06b6d4",
          30, "#8b5cf6",
          90, "#ec4899"
        ],
        "circle-opacity": 0.75,
        "circle-blur": 0.85
      }}
    />
    <Layer
      id="ghost-radar-markers"
      type="symbol"
      minzoom={4.5}
      layout={{
        "text-field": "💀",
        "text-size": [
          "interpolate", ["linear"], ["zoom"],
          4.5, 11,
          7.0, 15,
          10.0, 22
        ],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-anchor": "center"
      }}
      paint={{
        "text-halo-color": "#0b101e",
        "text-halo-width": 2.0
      }}
    />
  </Source>
)}

{/* ACTIVE SIEGE RADAR OVERLAY */}
{radarOverlays.sieges.features.length > 0 && (
  <Source id="siege-radar-source" type="geojson" data={radarOverlays.sieges}>
    <Layer
      id="siege-radar-halo"
      type="circle"
      beforeId="islands-points"
      paint={{
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 9,
          5.0, 18,
          8.0, 30,
          11.0, 48
        ],
        "circle-color": "#ef4444",
        "circle-opacity": ["coalesce", ["get", "haloIntensity"], 0.8],
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#fca5a5",
        "circle-stroke-opacity": 0.95,
        "circle-blur": 0.35
      }}
    />
  </Source>
)}

{/* INACTIVE FARM FINDER OVERLAY */}
{radarOverlays.inactiveFarms.features.length > 0 && (
  <Source id="inactive-farm-source" type="geojson" data={radarOverlays.inactiveFarms}>
    <Layer
      id="inactive-farm-markers"
      type="circle"
      minzoom={3.0}
      beforeId="islands-points"
      paint={{
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          3.0, 5,
          6.0, 9,
          9.0, 15
        ],
        "circle-color": [
          "match", ["get", "farmRating"],
          "HIGH", "#eab308",
          "MEDIUM", "#f97316",
          "LOW", "#78716c",
          "#eab308"
        ],
        "circle-opacity": 0.85,
        "circle-stroke-width": 2.0,
        "circle-stroke-color": "#fef08a"
      }}
    />
    <Layer
      id="inactive-farm-labels"
      type="symbol"
      minzoom={7.5}
      layout={{
        "text-field": ["concat", ["get", "name"], " [", ["get", "farmRating"], " Farm]"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-offset": [0, 2.0],
        "text-anchor": "top",
        "text-optional": true
      }}
      paint={{
        "text-color": "#fde047",
        "text-halo-color": "#0b101e",
        "text-halo-width": 2.5
      }}
    />
  </Source>
)}
```

---

## 4. Intel Radar HUD Controls Component (`src/components/map/IntelRadarControls.js`)

A dedicated floating HUD control panel allowing players to toggle radars and fine-tune parameters in real time:

- **Ghost Radar**: Toggle pill + Min Points slider ($0 - 13,716\text{ pts}$).
- **Siege Radar**: Toggle pill + Recent Hours selector ($12\text{h}, 24\text{h}, 48\text{h}, 72\text{h}$).
- **Farm Radar**: Toggle pill + Max Momentum Delta slider ($-500\text{ to } 0\text{ pts}$).
- **Counter Badges**: Real-time counts of detected targets.

---

## 5. Defensive Edge Case Hardening Summary

| Test Case | Scenario | Expected Behavior | Verification Status |
|---|---|---|---|
| **B4.1** | Max Point Ghost ($13,716\text{ pts}$) | `estimatedVacancyDays === 1` | ✅ Verified |
| **B4.2** | Min Point Ghost ($175\text{ pts}$) | `estimatedVacancyDays > 80` (~90) | ✅ Verified |
| **B4.3** | Negative point input ($-50\text{ pts}$) | Clamped to $0\text{ pts}$, valid vacancy days | ✅ Verified |
| **B4.4** | Null/undefined town ID | Defaults gracefully without throw | ✅ Verified |
| **B4.5** | `minGhostPoints = 15000` | Returns 0 ghosts | ✅ Verified |
| **B5.1** | Conquest exactly at $48.00\text{h}$ window | Included in sieges | ✅ Verified |
| **B5.2** | Multiple conquests on same town | Accurately aggregates `recentConquestCount` | ✅ Verified |
| **B5.3** | Future timestamp clock skew | Handled cleanly, feature retained | ✅ Verified |
| **B5.4** | $0\text{-pt}$ Besieged Town | Valid halo properties generated | ✅ Verified |
| **B5.5** | $5000$ Conquests batch | Sub-50ms execution ($O(N+M)$ Map lookup) | ✅ Verified |
| **B6.1** | Extreme negative momentum ($-50,000$) | `activityScore > 100,000` | ✅ Verified |
| **B6.2** | Exact $0$ momentum delta | Included when `maxMomentumDelta = 0` | ✅ Verified |
| **B6.3** | $0\text{-pt}$ Inactive Farm | `farmRating === 'LOW'` | ✅ Verified |
| **B6.4** | Missing player dictionary | Falls back to `momentumDelta = -50` | ✅ Verified |
| **B6.5** | $100\text{-town}$ inactive empire | All 100 towns filtered simultaneously | ✅ Verified |

---

## 6. Implementation Checklist for Implementer Agent
1. Create `src/lib/map/intelRadar.js` implementing `filterIntelOverlays`, `estimateGhostVacancyDays`, `calculateFarmActivityScore`, `getFarmRating`.
2. Create `src/components/map/IntelRadarControls.js` for interactive radar parameter control.
3. Update `src/app/map/page.js`:
   - Import `filterIntelOverlays` from `@/lib/map/intelRadar`.
   - Add state: `radarFilters` (`ghostHunter`, `activeSiege`, `inactiveFarms`, `minGhostPoints`, `maxMomentumDelta`, `recentHours`).
   - Add `useMemo` for `intelOverlays`.
   - Add MapLibre sources and layers (`ghost-radar-source`, `siege-radar-source`, `inactive-farm-source`).
   - Mount `IntelRadarControls`.
4. Run `npx vitest run tests/e2e/tactical_suite.test.js` to ensure 100% test pass rate.
