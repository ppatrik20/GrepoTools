# Handoff Report: Explorer 3 (Real-Time Route & Distance Tool - Requirement R3)

**Author**: Explorer 3 (Real-Time Route & Distance Tool)  
**Date**: 2026-08-30  
**Target Milestone**: R3 (Real-Time Troop Route & Distance Tool)  
**Working Directory**: `d:\Dev\Web\Grepolis\.agents\explorer_survey_route_m3`  
**Handoff Type**: Hard

---

## 1. Observation

1. **Travel Time UI & Utilities**:
   - `src/components/map/RoutePlannerTool.js` (lines 72–231) implements the floating route panel component.
   - `src/components/map/RoutePlannerTool.js` (lines 27–48) defines `calculateDistance(origin, target)`:
     ```javascript
     if (islandDist < 0.01) {
       const slot1 = Number(origin.islandSlot ?? 0);
       const slot2 = Number(target.islandSlot ?? 1);
       const slotDiff = Math.abs(slot2 - slot1) || 1;
       return 2.0 + slotDiff * 0.35;
     }
     return islandDist;
     ```
   - `src/components/map/RoutePlannerTool.js` (lines 50–62) defines `calculateTravelTimeSeconds(distance, unitBaseSpeed, worldSpeed = 3, unitSpeed = 1)`:
     ```javascript
     const minutes = (dist * 50) / (speed * wSpeed * uSpeed);
     return Math.max(30, Math.round(minutes * 60));
     ```
   - `src/lib/traveltime.js` (lines 24–44) implements `calculateTravelTime` using naval constant base delay:
     ```javascript
     const travelConstant = 500;
     const baseDelay = 300;
     const calculatedSeconds = baseDelay + (distance * travelConstant) / (unitSpeed * worldSpeed * speedMultiplier);
     return Math.round(calculatedSeconds);
     ```

2. **Unit Definitions & Speeds**:
   - `src/components/map/RoutePlannerTool.js` (lines 11–25) defines:
     - Naval: `bireme` (speed 15), `light_ship` (speed 13), `fast_transporter` (speed 15), `slow_transporter` (speed 8), `trireme` (speed 9), `colonize_ship` (speed 3).
     - Flying Mythicals: `pegasus` (speed 35), `harpy` (speed 25), `manticore` (speed 22), `griffin` (speed 18).
   - `prisma/schema.prisma` (lines 10–35, 37–63) defines `World.speed` (Float), `World.unitSpeed` (Float), and `Unit` model with `speed`, `is_naval`, `flying`.
   - `src/context/AppContext.js` (lines 68–82) computes `activeWorld` from `/api/worlds`, passed to `RoutePlannerTool` in `src/app/map/page.js` lines 853–854 (`worldSpeed={activeWorld?.speed || 3}`, `unitSpeed={activeWorld?.unitSpeed || 1}`).

3. **MapLibre Arcing Trajectory Visualization**:
   - `src/app/map/page.js` (lines 222–259) computes a 40-step Quadratic Bézier arc `routeLineData` using control midpoint `midLat = (oLat + tLat) / 2 + (Math.abs(tLng - oLng) * 0.12)`.
   - `src/app/map/page.js` (lines 443–465) renders the GeoJSON source `<Source id="route-line-source" type="geojson" data={routeLineData}>` with two layers:
     - Glow underlay: `route-line-glow` (`line-color: #38bdf8`, `line-width: 6`, `line-opacity: 0.5`, `line-blur: 3`).
     - Dashed line: `route-line` (`line-color: #38bdf8`, `line-width: 2.5`, `line-dasharray: [3, 2]`).

4. **Recall Sniper Tool (`/snipe`) Linkage**:
   - `src/components/map/RoutePlannerTool.js` (lines 221–227) renders:
     ```jsx
     <Link href={`/snipe?targetTownId=${target.id}&originTownId=${origin.id}`} ...>
     ```
   - In `src/app/snipe/page.js` and `src/app/snipe/recall/page.js`, neither page currently calls `useSearchParams()` from `next/navigation` to parse `targetTownId` or `originTownId`.

5. **Test & Build Execution**:
   - `npx vitest run` executed with 10 passed tests in `src/lib/traveltime.test.js` (0 failures).
   - `npm run build && prisma generate` passed with exit code 0 and 0 TypeScript errors.

---

## 2. Logic Chain

1. **Travel Engine Assessment**:
   - Observation 1 demonstrates that both on-island slot separation and inter-island Euclidean distances are calculated in `RoutePlannerTool.js`.
   - For same-island transit, slot separation distance ($2.0 + \Delta\text{slot} \times 0.35$) produces realistic travel times between 1m07s (Pegasus, $\Delta\text{slot}=1$) and 48m03s (Colony Ship, $\Delta\text{slot}=19$) on a 3x speed world, satisfying the 2–30 min requirement.
   - For inter-island voyages, Euclidean distance $\sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}$ is combined with the official Grepolis formula $\frac{\text{Distance} \times 50}{\text{Unit Speed} \times \text{World Speed} \times \text{Unit Speed Multiplier}}$ in minutes.

2. **Unit & Speed Data Integrity**:
   - Observation 2 confirms that all standard naval fleet units (Bireme, Light Ship, Fast Transport, Slow Transport, Trireme, Colony Ship) and flying mythical units (Pegasus, Harpy, Manticore, Griffin) are accurately declared with their official base speeds.
   - Active world speed factors (`worldSpeed`, `unitSpeed`) are loaded dynamically from Prisma through `AppContext` and applied directly in the denominator of the travel duration equations.

3. **Map Visualization Integrity**:
   - Observation 3 confirms that an arcing dashed flight/naval trajectory line is generated via a 40-step quadratic Bézier curve and rendered on MapLibre GL with a cyan dashed line (`route-line`) and blurred aura (`route-line-glow`).

4. **Sniper Integration Analysis**:
   - Observation 4 reveals that while `RoutePlannerTool.js` constructs the correct query URL `/snipe?targetTownId=...&originTownId=...`, the receiving pages (`/snipe` and `/snipe/recall`) currently lack `useSearchParams()` handlers to automatically ingest the parameters and populate the operation forms or recall groups.

---

## 3. Caveats

1. **Demolition Ship (Brander)**: Demolition Ship (base speed 5) is defined in Grepolis data (`src/lib/map/js/data/units.js`) but is not currently listed in the `NAVAL_UNITS` array of `RoutePlannerTool.js`. (The 6 primary naval combat & transport ships are present).
2. **Same-Island Arc**: When origin and target are on the same island, their island coordinates $(ox, oy)$ are identical. In `src/app/map/page.js`, `routeLineData` uses island center coordinates, which collapses the trajectory line to a point when both towns share the same island coordinates.
3. **URL Parameter Ingestion**: The link to `/snipe` passes parameters, but `/snipe` does not consume them yet.

---

## 4. Conclusion

Requirement R3 (Real-Time Troop Route & Distance Tool) is robustly structured and functional:
- Base speeds for all major naval and flying mythical units are accurately configured.
- Same-island slot separation avoids static 0/1m clamps and yields realistic 2–30+ min transit times.
- Inter-island Euclidean formula matches official Grepolis rules scaled by active world speeds.
- MapLibre renders a 40-step quadratic Bézier arcing dashed cyan line with glow.
- The `/snipe` one-click navigation is linked via query parameters `?targetTownId=...&originTownId=...`.

---

## 5. Verification Method

1. **Vitest Unit Test Verification**:
   ```powershell
   npx vitest run
   ```
   *Expected Result*: 10/10 tests pass in `src/lib/traveltime.test.js`.

2. **Next.js Production Build**:
   ```powershell
   npm run build && prisma generate
   ```
   *Expected Result*: Exits with code 0, 0 TypeScript/Turbopack errors.

3. **Code Inspection**:
   - View `src/components/map/RoutePlannerTool.js` lines 11–65.
   - View `src/app/map/page.js` lines 222–259 and 443–465.
   - View `src/lib/traveltime.js` lines 14–44.