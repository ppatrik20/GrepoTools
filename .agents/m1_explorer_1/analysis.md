# Milestone 1: Voronoi & Frontline Algorithms Analysis

**Author**: Milestone 1 Explorer 1 (Voronoi & Frontline Specialist)  
**Date**: 2026-09-02  
**Target Module**: `src/lib/map/voronoi.js`  
**Related Features**: F1 (Political Voronoi Territory Heatmaps), F2 (Contested Frontline Border Outlines), F3 (Control Panel Mode Toggle)  
**Related Tests**: `tests/e2e/tactical_suite.test.js` (Tier 1: F1, F2; Tier 2: B1.1-B1.5, B2.1-B2.5; Tier 3: C1, C4, C12, C13; Tier 4: Scenarios 1, 5, 8)

---

## 1. Executive Summary

Milestone 1 introduces political territory visualization and contested frontline tension analysis to the Grepolis Tactical Command Suite. The core algorithmic engine resides in `src/lib/map/voronoi.js`, providing two high-performance, GPU-ready GeoJSON computation routines:
1. `computeAllianceVoronoi(towns, alliances, options)`: Aggregates town coordinates by alliance, derives spatial cluster centroids, applies radial clamping (`maxRadius`), filters sub-threshold alliances (`minTownCount`), computes dominant territory share, and generates closed GeoJSON Polygon features tinted with alliance hex colors.
2. `computeContestedFrontlines(towns, voronoiData)`: Evaluates two distinct classes of military conflict zones:
   - **Contested Island Clashes** (`isContestedIsland: true`): High-precision detection of islands hosting $\ge 2$ rival coalitions, calculating island tension scaled by alliance density.
   - **Inter-Spherical Frontlines** (`isContestedIsland: false`): Proximity-based border tension lines between adjacent alliance territory centroids within an angular distance threshold of $40.0^\circ$.

---

## 2. Coordinate System & Projection Transformation

Grepolis operates on a discrete grid of $1000 \times 1000$ world tiles with playable bounds centered at $(500, 500)$ with radius $250$. MapLibre GL uses spherical Mercator coordinates (Longitude $\lambda \in [-180, 180]$, Latitude $\phi \in [-90, 90]$).

### Projection Equations
$$\lambda = \left(\frac{X}{1000}\right) \times 360 - 180$$
$$\phi = -\left(\left(\frac{Y}{1000}\right) \times 180 - 90\right)$$

### Inverse Projection
$$X_w = \text{round}\left(\frac{\lambda + 180}{360} \times 1000\right)$$
$$Y_w = \text{round}\left(\frac{90 - \phi}{180} \times 1000\right)$$

All spatial algorithms in `voronoi.js` normalize input town coordinates ($t.x, t.y, t.islandX, t.islandY$) through these formulas to guarantee alignment with MapLibre GL layers and tiles.

---

## 3. Detailed Algorithmic Specifications

### 3.1. `computeAllianceVoronoi(towns, alliances, options)`

```typescript
interface VoronoiOptions {
  maxRadius?: number;     // Radial clamping limit in coordinate units (default: 25.0)
  minTownCount?: number;  // Minimum alliance town threshold (default: 2)
}

interface PoliticalTerritoryData {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "Polygon";
      coordinates: Array<Array<[number, number]>>;
    };
    properties: {
      allianceId: number;
      allianceName: string;
      color: string;
      townCount: number;
      dominantShare: number; // 0.0 - 1.0 (4 decimal places)
    };
  }>;
}
```

#### Step-by-Step Execution Pipeline:
1. **Input Validation**: If `towns` is empty or not an array, immediately return `{ type: "FeatureCollection", features: [] }`.
2. **Alliance Metadata Mapping**: Construct an `allianceMap: Map<number, Alliance>` to resolve official names and hex colors. If an alliance is missing from the list, default to `name: "Alliance #${aId}"` and `color: "#3b82f6"`.
3. **Alliance Grouping & Town Normalization**:
   - Extract `allianceId` via `t.player?.alliance?.id ?? t.allianceId ?? t.alliance?.id`.
   - Group eligible towns ($allianceId \ne \text{null/undefined}$) into `townsByAlliance: Map<number, Town[]>`.
   - Compute `totalEligibleTowns = \sum |Towns(A)|`.
4. **Filtering by `minTownCount`**: Exclude any alliance whose town count is strictly less than `options.minTownCount ?? 2`.
5. **Centroid & Geometric Radial Hull Generation**:
   - For each qualifying alliance, project all town coordinates to $(\lambda_k, \phi_k)$.
   - Calculate cluster center:
     $$\bar{\lambda} = \frac{1}{N} \sum_{k=1}^N \lambda_k, \quad \bar{\phi} = \frac{1}{N} \sum_{k=1}^N \phi_k$$
   - Convert radial clamping option to angular degrees:
     $$R_{\text{deg}} = \left(\frac{\text{maxRadius}}{1000}\right) \times 360$$
   - Generate closed polygon contour ($S = 12$ steps, $i \in [0, 12]$):
     $$\theta_i = \frac{2\pi i}{S}$$
     $$r(\theta_i) = R_{\text{deg}} \times \left(0.8 + 0.2 \cos(2\theta_i)\right)$$
     $$P_i = \left[\bar{\lambda} + r(\theta_i)\cos(\theta_i), \bar{\phi} + r(\theta_i)\sin(\theta_i)\right]$$
6. **Dominant Share Computation**:
   $$\text{dominantShare} = +\left(\frac{|Towns(A)|}{\text{totalEligibleTowns}}\right).\text{toFixed}(4)$$
7. **Feature Assembly**: Package as GeoJSON Polygon feature.

---

### 3.2. `computeContestedFrontlines(towns, voronoiData)`

```typescript
interface ContestedFrontlineData {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "LineString";
      coordinates: Array<[number, number]>;
    };
    properties: {
      allianceA: string;
      allianceB: string;
      tension: number;           // 0.0 - 1.0 (2 decimal places)
      islandKey?: string;        // e.g. "500_500"
      isContestedIsland: boolean;// true for island clash, false for inter-Voronoi border
    };
  }>;
}
```

#### Step-by-Step Execution Pipeline:

#### Part A: Multi-Alliance Contested Island Detection
1. Group towns by island key `islandKey = "${ix}_${iy}"` where $ix = t.islandX ?? t.x ?? 500$, $iy = t.islandY ?? t.y ?? 500$.
2. For each island group:
   - Identify set of distinct alliance IDs present on the island.
   - If $|AllianceIds| \ge 2$:
     - Calculate island tension score:
       $$\mathcal{T}_{\text{island}} = \min\left(1.0, \frac{|AllianceIds|}{|IslandTowns|} \times 1.5\right)$$
     - Compute center Lng/Lat: $(\lambda_{\text{center}}, \phi_{\text{center}})$.
     - Construct a LineString demarcator:
       $$\text{coordinates} = \left[ [\lambda_{\text{center}} - 0.005, \phi_{\text{center}} - 0.005], [\lambda_{\text{center}} + 0.005, \phi_{\text{center}} + 0.005] \right]$$
     - Emit feature with properties: `{ allianceA: "Alliance #${a1}", allianceB: "Alliance #${a2}", tension: +tension.toFixed(2), islandKey, isContestedIsland: true }`.

#### Part B: Inter-Voronoi Spherical Frontlines
1. Inspect pairwise combinations of Voronoi territory features $(f_i, f_j)$ with $f_i.allianceId \ne f_j.allianceId$.
2. Calculate angular distance between polygon anchors:
   $$D_{ij} = \sqrt{(\lambda_j - \lambda_i)^2 + (\phi_j - \phi_i)^2}$$
3. Proximity Threshold: If $D_{ij} < 40.0^\circ$:
   - Calculate tension score:
     $$\mathcal{T}_{\text{border}} = \min\left(1.0, 0.5 + \max\left(0, \frac{40.0 - D_{ij}}{80.0}\right)\right)$$
   - Compute midpoint $(\lambda_{\text{mid}}, \phi_{\text{mid}}) = \left(\frac{\lambda_i + \lambda_j}{2}, \frac{\phi_i + \phi_j}{2}\right)$.
   - Construct LineString segment:
     $$\text{coordinates} = \left[ [\lambda_{\text{mid}} - 0.01, \phi_{\text{mid}} - 0.01], [\lambda_{\text{mid}} + 0.01, \phi_{\text{mid}} + 0.01] \right]$$
   - Emit feature with properties: `{ allianceA: fA.allianceName, allianceB: fB.allianceName, tension: +tension.toFixed(2), isContestedIsland: false }`.

---

## 4. Boundary & Corner Cases Analysis

| Test Case | Scenario | Expected Behavior |
|---|---|---|
| **B1.1** | Single town in world (`minTownCount = 1`) | 1 Polygon feature, `dominantShare = 1.0` |
| **B1.2** | Empty alliances array (`alliances = []`) | Fallback name `Alliance #${aId}`, fallback color `#3b82f6` |
| **B1.3** | Zero towns in world (`towns = []`) | Return empty FeatureCollection `{ features: [] }` |
| **B1.4** | Alliance below `minTownCount` | Alliance completely excluded from feature collection |
| **B1.5** | 500 towns in single mega-alliance | 1 Polygon feature, $O(N)$ centroid calculation, finite $S=12$ complexity |
| **B2.1** | Zero-distance slot clashes (same slot, rival alliances) | Grouped under same `islandKey`, $\mathcal{T}_{\text{island}} = 1.0$ |
| **B2.2** | 10 alliances on 20-slot mixed island | Accurately flagged as `isContestedIsland: true`, $\mathcal{T} \in [0, 1]$ |
| **B2.3** | Disconnected ocean clusters (O00 vs O99, dist $> 40^\circ$) | 0 false-positive inter-Voronoi frontlines |
| **B2.4** | Extreme point disparity (0 vs 13,716 points) | Tension math depends on ownership structure, robust to point values |
| **B2.5** | Empty Voronoi baseline (`voronoiData = { features: [] }`) | Returns only island contested frontlines without crashing |

---

## 5. Proposed Module Implementation (`src/lib/map/voronoi.js`)

Below is the concrete code implementation recommended for `src/lib/map/voronoi.js`:

```javascript
/**
 * src/lib/map/voronoi.js
 * Voronoi Political Territory Heatmap & Contested Frontline Calculation Engine
 * Milestone 1 (F1, F2)
 */

/**
 * Computes GPU-ready GeoJSON Polygon FeatureCollection representing alliance spheres of influence.
 * 
 * @param {Array<Object>} towns - Array of world towns
 * @param {Array<Object>} alliances - Array of alliance metadata ({ id, name, color })
 * @param {Object} options - Configuration options ({ maxRadius: number, minTownCount: number })
 * @returns {Object} GeoJSON FeatureCollection
 */
export function computeAllianceVoronoi(towns = [], alliances = [], options = {}) {
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
}

/**
 * Computes contested frontline LineString FeatureCollection covering multi-alliance islands and inter-Voronoi borders.
 * 
 * @param {Array<Object>} towns - Array of world towns
 * @param {Object} voronoiData - GeoJSON FeatureCollection of political territories
 * @returns {Object} GeoJSON FeatureCollection
 */
export function computeContestedFrontlines(towns = [], voronoiData = { features: [] }) {
  if (!Array.isArray(towns) || towns.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const features = [];

  // 1. Multi-alliance contested island detection
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
  const vFeatures = voronoiData?.features || [];
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

        // Adjacent alliance territories within ~40 degrees
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

export const VoronoiPoliticalEngine = {
  computeAllianceVoronoi,
  computeContestedFrontlines
};

export default VoronoiPoliticalEngine;
```

---

## 6. MapLibre GL Integration Guidelines (for `src/app/map/page.js`)

When integrating with MapLibre GL JS:
1. **Sources**:
   - `voronoi-spheres-source`: GeoJSON from `computeAllianceVoronoi(towns, alliances, options)`
   - `contested-frontlines-source`: GeoJSON from `computeContestedFrontlines(towns, voronoiData)`
2. **Layers**:
   - `voronoi-spheres-fill` (type: `fill`, `fill-color: ['get', 'color']`, `fill-opacity: 0.25`)
   - `voronoi-spheres-border` (type: `line`, `line-color: ['get', 'color']`, `line-width: 2`, `line-opacity: 0.6`)
   - `contested-frontline-lines` (type: `line`, `line-color: ['case', ['get', 'isContestedIsland'], '#ef4444', '#f59e0b']`, `line-width: ['interpolate', ['linear'], ['get', 'tension'], 0, 2, 1, 5]`)
3. **Toggle Control**:
   - When mode is `"political"`, render Voronoi and frontline layers before town sprites (`town-sprites`).
   - When mode is `"geographic"`, remove or set visibility to `"none"`.

---

## 7. Verification Method
1. Ensure all 173 E2E tests in `tests/e2e/tactical_suite.test.js` pass with `npx vitest run tests/e2e/tactical_suite.test.js`.
2. Inspect output GeoJSON structure for compliance with GeoJSON RFC 7946 specifications.
3. Test edge cases: 0 towns, single town, 500 towns, disconnected clusters.
