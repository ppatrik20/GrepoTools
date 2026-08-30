# Real-Time Troop Route & Distance Tool (Requirement R3) Investigation

**Date**: 2026-08-30  
**Target Milestone**: R3 (Real-Time Troop Route & Distance Tool)  
**Author**: Explorer 3 (Real-Time Route & Distance Tool)

---

## 1. Executive Summary

Requirement R3 mandates an interactive naval and mythical troop travel time calculator on the world map, accurate same-island and inter-island travel calculations scaled by world speeds, an arcing dashed MapLibre trajectory line between origin and target, and a 1-click link to the Recall Sniper Tool (`/snipe`).

This investigation cataloged and audited all travel time engines, unit configurations, speed formulas, coordinate projections, MapLibre rendering layers, and `/snipe` integrations across the codebase.

---

## 2. Component & Utility Inventory for Travel Calculations

| Component / Utility File | Role & Capabilities | Key Exported APIs |
|---|---|---|
| `src/components/map/RoutePlannerTool.js` | Interactive floating bottom-center UI panel for calculating naval & mythical travel durations between selected origin and target cities. | `RoutePlannerTool` (React Component), `calculateDistance(origin, target)`, `calculateTravelTimeSeconds(dist, speed, wSpeed, uSpeed)`, `formatDuration(seconds)` |
| `src/lib/traveltime.js` | Core mathematical engine for travel duration and midpoint recall calculations. | `calculateTravelTime(x1, y1, x2, y2, unitSpeed, worldSpeed, modifiers)`, `calculateRecallTiming(targetReturnTime, cancelDelaySeconds)`, `calculateMidpointRecall(targetReturnTime, actualLaunchTime)`, `formatDuration(seconds)`, `parseDuration(str)` |
| `src/lib/traveltime.test.js` | Vitest test suite verifying 10 unit test cases for travel times, modifiers, midpoint calculations, and ATR cancel limits. | 10 passing tests (100% pass rate) |
| `src/app/map/page.js` | World map orchestrator. Manages route origin/target selection state (`routeOrigin`, `routeTarget`, `isRouteToolActive`), generates the Bézier arcing GeoJSON trajectory data (`routeLineData`), and hosts the MapLibre source & layers. | In-map state & GeoJSON layer rendering |
| `src/components/map/CommandDrawer.js` | Sliding intelligence drawer. Contains "Set as Origin" and "Set as Target" quick action buttons (`onSetRouteOrigin`, `onSetRouteTarget`) for any selected town. | Drawer action handlers |
| `src/components/CommandCenter/DummyFinder.js` | Recall sniper tool helper to find ghost/neutral towns far enough away to satisfy cancel windows. | `DummyFinder` (React Component) |
| `src/app/api/snipe/dummy-targets/route.js` | Server API finding dummy targets using `calculateTravelTime` against database towns. | `GET /api/snipe/dummy-targets` |
| `src/app/snipe/page.js` | Operations Launch Queue with ±10s ATR window tracking. | Operations Queue UI |
| `src/app/snipe/recall/page.js` | Midpoint Recall Sniper cockpit with audio chirps, gap detector (Siege vs Revolt), and execution countdowns. | Midpoint Recall UI |
| `src/app/api/snipe/operations/route.js` | CRUD API for saving/loading planned operations into Prisma `SnipeOperation` model. | `GET`, `POST`, `DELETE /api/snipe/operations` |

---

## 3. Units and Speeds Specification

### 3.1 Unit Catalog & Base Speeds in `RoutePlannerTool.js`

In `src/components/map/RoutePlannerTool.js` (lines 11-25):

#### Naval Fleet Units (`NAVAL_UNITS`)
1. **Bireme (`bireme`)**: Base Speed = `15`, Role = `Defense`, Color = `#38bdf8`
2. **Light Ship / Gyújtó (`light_ship`)**: Base Speed = `13`, Role = `Offense`, Color = `#f87171`
3. **Fast Transport / Gyors (`fast_transporter`)**: Base Speed = `15`, Role = `Transport`, Color = `#34d399`
4. **Slow Transport / Lassú (`slow_transporter`)**: Base Speed = `8`, Role = `Transport`, Color = `#94a3b8`
5. **Trireme / Trirema (`trireme`)**: Base Speed = `9`, Role = `Hybrid`, Color = `#a78bfa`
6. **Colony Ship / Gyarmatosító (`colonize_ship`)**: Base Speed = `3`, Role = `Conquest`, Color = `#fbbf24`

#### Flying Mythical Units (`MYTHICAL_FLYING_UNITS`)
1. **Pegasus (`pegasus`)**: Base Speed = `35`, Color = `#67e8f9`
2. **Harpy (`harpy`)**: Base Speed = `25`, Color = `#f43f5e`
3. **Manticore (`manticore`)**: Base Speed = `22`, Color = `#fb923c`
4. **Griffin (`griffin`)**: Base Speed = `18`, Color = `#eab308`

### 3.2 Database & World Speed Storage & Propagation

1. **Prisma Schema (`prisma/schema.prisma`)**:
   - `World` model contains:
     - `speed: Float @default(1.0)` (World game speed multiplier, e.g. 1.0, 2.0, 3.0, 4.0, 6.0)
     - `unitSpeed: Float @default(1.0)` (World unit speed multiplier)
     - `worldType: String @default("siege")` ("siege" or "revolt")
   - `Unit` model stores static Grepolis unit stats including `speed`, `attack`, `is_naval`, `flying`.
2. **Application State (`src/context/AppContext.js`)**:
   - Fetches active world via `/api/worlds`.
   - Exposes `activeWorld` object containing live `speed` and `unitSpeed`.
3. **Map & Component Consumption (`src/app/map/page.js`)**:
   - Lines 853–854:
     ```jsx
     worldSpeed={activeWorld?.speed || 3}
     unitSpeed={activeWorld?.unitSpeed || 1}
     ```
   - Passed directly into `<RoutePlannerTool />`.

---

## 4. Same-Island vs Inter-Island Calculations

### 4.1 Same-Island Slot Distance & Realistic Transit Durations

In `src/components/map/RoutePlannerTool.js` (lines 38-45):
```javascript
// If on the SAME island (island coordinates match):
if (islandDist < 0.01) {
  const slot1 = Number(origin.islandSlot ?? 0);
  const slot2 = Number(target.islandSlot ?? 1);
  const slotDiff = Math.abs(slot2 - slot1) || 1;
  // On-island distance scale: 2.0 to 8.0 units
  return 2.0 + slotDiff * 0.35;
}
```

#### Transit Durations Analysis (World Speed = 3, Unit Speed = 1):
For an island with up to 20 slots (`slotDiff` = 1 to 19):
- **Formula**: `Duration (seconds) = Math.max(30, Math.round(((2.0 + slotDiff * 0.35) * 50) / (unitSpeed * worldSpeed) * 60))`
- **Distance Range**: `2.35` units (`slotDiff = 1`) to `8.65` units (`slotDiff = 19`).
- **Calculated Durations**:
  - **Pegasus** (Speed 35):
    - `slotDiff = 1`: 1 min 07 sec (67s)
    - `slotDiff = 19`: 4 min 07 sec (247s)
  - **Bireme** (Speed 15):
    - `slotDiff = 1`: 2 min 37 sec (157s)
    - `slotDiff = 19`: 9 min 37 sec (577s)
  - **Light Ship** (Speed 13):
    - `slotDiff = 1`: 3 min 01 sec (181s)
    - `slotDiff = 19`: 11 min 05 sec (665s)
  - **Colony Ship** (Speed 3):
    - `slotDiff = 1`: 13 min 03 sec (783s)
    - `slotDiff = 19`: 48 min 03 sec (2883s)

**Compliance**: Eliminates the previous synthetic 0-second / 1-minute static clamp, providing distinct, realistic durations (2–30+ mins) proportional to slot separation.

### 4.2 Inter-Island Nautical Euclidean Calculations

In `src/components/map/RoutePlannerTool.js` (lines 36, 50-62):
```javascript
const islandDist = Math.sqrt(Math.pow(tx - ox, 2) + Math.pow(ty - oy, 2));

// Official Grepolis travel time formula:
// Duration (minutes) = (distance * 50) / (speed * worldSpeed * unitSpeed)
const minutes = (dist * 50) / (speed * wSpeed * uSpeed);
return Math.max(30, Math.round(minutes * 60));
```

#### Comparison with `src/lib/traveltime.js`:
- In `traveltime.js`, `calculateTravelTime` applies a base delay:
  `Seconds = 300 + (distance * 500) / (unitSpeed * worldSpeed * speedMultiplier)` (with Cartography, Lighthouse, Atalanta modifiers).
- In `RoutePlannerTool.js`, the standard Grepolis formula `(Distance * 50) / (Unit Speed * World Speed)` (in minutes) is used for clear, standard baseline route planning without hidden town-specific building buffs.

---

## 5. MapLibre Arcing Dashed Trajectory Line Visualization

### 5.1 Coordinate Transformation & Quadratic Bézier Arc Generation

In `src/app/map/page.js` (lines 222-259):
1. **Coordinate Projection**:
   - Origin: `ox = routeOrigin.islandX ?? routeOrigin.x`, `oy = routeOrigin.islandY ?? routeOrigin.y`
   - Target: `tx = routeTarget.islandX ?? routeTarget.x`, `ty = routeTarget.islandY ?? routeTarget.y`
   - Projected to MapLibre Web Mercator coordinates:
     - `oLng = (ox / 1000) * 360 - 180`
     - `oLat = -((oy / 1000) * 180 - 90)`
     - `tLng = (tx / 1000) * 360 - 180`
     - `tLat = -((ty / 1000) * 180 - 90)`
2. **Quadratic Bézier Curve Construction**:
   - Midpoint / Control Point:
     - `midLng = (oLng + tLng) / 2`
     - `midLat = (oLat + tLat) / 2 + (Math.abs(tLng - oLng) * 0.12)` (curvature scales with longitudinal distance)
   - Sampled across 40 segments (`t` from 0 to 1 in steps of 1/40):
     - `curLng = (1-t)^2 * oLng + 2*(1-t)*t * midLng + t^2 * tLng`
     - `curLat = (1-t)^2 * oLat + 2*(1-t)*t * midLat + t^2 * tLat`
3. **GeoJSON Output**:
   - Emits a GeoJSON `FeatureCollection` with a single `LineString` feature.

### 5.2 MapLibre Source and Layer Stack

In `src/app/map/page.js` (lines 443-465):
```jsx
{routeLineData && (
  <Source id="route-line-source" type="geojson" data={routeLineData}>
    <Layer
      id="route-line-glow"
      type="line"
      paint={{
        "line-color": "#38bdf8",
        "line-width": 6,
        "line-opacity": 0.5,
        "line-blur": 3
      }}
    />
    <Layer
      id="route-line"
      type="line"
      paint={{
        "line-color": "#38bdf8",
        "line-width": 2.5,
        "line-dasharray": [3, 2]
      }}
    />
  </Source>
)}
```
- **Layer 1 (`route-line-glow`)**: Cyan glow aura (`#38bdf8`, line-width: 6, line-opacity: 0.5, line-blur: 3).
- **Layer 2 (`route-line`)**: Sharp dashed trajectory line (`#38bdf8`, line-width: 2.5, line-dasharray: `[3, 2]`).

---

## 6. One-Click Recall Sniper Tool (`/snipe`) Linkage & State Sharing

### 6.1 Link Construction in `RoutePlannerTool.js`

In `src/components/map/RoutePlannerTool.js` (lines 221-227):
```jsx
<Link
  href={`/snipe?targetTownId=${target.id}&originTownId=${origin.id}`}
  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all shadow-md"
>
  <Send size={12} /> Send to Sniper Tool
</Link>
```

### 6.2 Destination Page Analysis (`/snipe` vs `/snipe/recall`)

1. **Current Behavior on `/snipe` (`src/app/snipe/page.js`)**:
   - `/snipe` renders the manual Launch Operations Queue with inputs: `label`, `targetTime`, `travelTime`, `type`.
   - **Audit Finding**: `src/app/snipe/page.js` currently does not read `useSearchParams()` from `next/navigation`. When clicking the button from `RoutePlannerTool`, the query parameters `?targetTownId=...&originTownId=...` are passed in the URL, but the form inputs are not automatically populated from the URL parameters.
2. **Current Behavior on `/snipe/recall` (`src/app/snipe/recall/page.js`)**:
   - `/snipe/recall` provides the Precision Midpoint Recall Sniper Cockpit, featuring:
     - Target city tracking groups
     - Automated gap calculation (1s before/after CS for Siege vs Revolt)
     - Dual Step 1 (Launch) & Step 2 (Midpoint Recall) execution timers with live ATR countdowns and audio chirps
     - Dummy Target Finder (`DummyFinder`), which takes `originTownId`.
   - **Audit Finding**: `/snipe/recall` also currently does not inspect `useSearchParams()`. Adding search params handling (or linking directly to `/snipe/recall?targetTownId=...&originTownId=...`) enables instant pre-filling of both the target defense city and dummy origin city in the recall cockpit.

---

## 7. Verification & Build Integrity

- **Vitest**: `npx vitest run` passes 10/10 tests in `src/lib/traveltime.test.js`.
- **Production Build**: `npm run build && prisma generate` passed with 0 TypeScript/Next.js errors.