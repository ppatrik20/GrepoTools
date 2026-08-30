# Implementation Changes Log — Milestones 1 & 3

## Overview
This document records all modifications implemented for Milestones 1 & 3 of the Next-Generation Grepolis World Map & Command Center.

---

### 1. `public/map/islands/island_1.png` (Requirement R1)
- **Problem**: `island_1.png` contained 161,840 background pixels with residual alpha noise (alpha values 21–27), rendering a square box artifact on dark sea backgrounds.
- **Change**: Clamped all pixels with alpha $\le 30$ to $0$ using `sharp`.
- **Verification**: Verified that all four corners have alpha $= 0$ (`[0, 0, 0, 0]`) and 0 noise pixels remain.

---

### 2. `src/app/map/page.js` (Requirements R1, R3, R4)
- **Scaling Curve**: Updated `island-sprites` layer `icon-size` property to the calibrated physical proportion curve expression $0.007 \times 2^Z$:
  ```javascript
  "icon-size": [
    "interpolate", ["exponential", 2], ["zoom"],
    5, 0.224,
    6, 0.448,
    7, 0.896,
    8, 1.792,
    9, 3.584,
    10, 7.168,
    11, 14.336,
    12, 28.672
  ]
  ```
- **Town Coordinate Resolution & Same-Island Trajectory**:
  - Implemented `getTownMapCoordinates(town)` utilizing `island_definitions.json` town offsets and direction offsets (`TOWN_DIR_OFFSETS`) to calculate exact pixel and geographic coordinates of town slots.
  - Updated `routeLineData` memoized calculation to obtain origin and target slot coordinates via `getTownMapCoordinates`.
  - When origin and target are on the same island, their distinct bay slot positions are resolved, computing an upward-arcing quadratic Bézier curve ($40$ steps) between the two slots with an apex offset based on slot chord distance.
  - Enhanced map click handler to preserve geometry coordinates, `islandType`, `dir`, and `islandSlot` onto normalized town objects.

---

### 3. `src/components/map/UnifiedSearchPanel.js` (Requirement R2, R3)
- Updated `normalizeTownData(rawTown)` to preserve `islandType`, `dir`, `lng`, `lat`, and `coordinates` array for seamless slot-accurate coordinates downstream.

---

### 4. `src/lib/geojson.js` and `scripts/rebuild_geojson_cache.js` (Requirement R1)
- Corrected island colonizability check:
  ```javascript
  const isColonizable = (island.type >= 1 && island.type <= 16) || (island.type >= 37 && island.type <= 60);
  const isRock = !isColonizable;
  ```
- Verified that all 40 colonizable island types (1–16, 37–60) strictly use the 578 official shoreline offsets in `island_definitions.json`.
- Guaranteed that all unoccupied slots are rendered as `empty-slot` features with zero synthetic ring fallback on colonizable islands.

---

### 5. `src/app/snipe/page.js` (Requirement R3)
- Ingested URL query parameters (`targetTownId` and `originTownId`) via `useSearchParams()`.
- Fetched town data from `/api/world/town/[id]` and pre-filled:
  - Form operation label (e.g. `OriginTown → TargetTown` or `Operation on TargetTown`).
  - Distance calculation and CS travel duration formatted as `HH:MM:SS`.
  - Movement type defaulting to `cs`.
- Wrapped page export in `<Suspense>` for Next.js App Router static compilation compliance.

---

### 6. `src/app/snipe/recall/page.js` (Requirement R3)
- Ingested URL query parameters (`targetTownId` and `originTownId`) via `useSearchParams()`.
- Fetched town data from `/api/world/town/[id]` and automatically:
  - Created/selected the defense city group for the target town.
  - Pre-filled `movAttacker` and `movAttackerId` for the origin dummy town.
- Wrapped page export in `<Suspense>` for Next.js App Router static compilation compliance.

---

### 7. `src/lib/traveltime.js` & `src/lib/traveltime.test.js` (Requirements R1, R3, R5)
- Exported `calculateDistance` and `calculateTravelTimeSeconds` from `traveltime.js`.
- Added 7 comprehensive unit tests to `traveltime.test.js`:
  1. `island_1.png` alpha cutout integrity: all 4 corners alpha $= 0$, 0 noise pixels.
  2. Shoreline bay slots: all 40 colonizable island types have official offsets defined (578 total).
  3. Calibrated scaling curve: verified $0.007 \times 2^Z$ across zoom levels 5 to 12.
  4. Same-island transit distance: slot separation formula ($2.0 + \Delta\text{slot} \times 0.35$).
  5. Inter-island Euclidean distance calculation.
  6. Naval fleet travel duration calculation.
  7. Mythical flying unit travel duration calculation.
- All 17 tests pass with 100% success rate.
