# Handoff Report: Survey Spec Miner 3 (Requirements & Tactical Feature Specifications)

**Agent ID**: `survey_spec_miner_3`  
**Milestone**: Requirements & Tactical Feature Specifications (R1 through R5)  
**Date**: 2026-09-02T16:59:45Z  

---

## 1. Observation

### 1.1 Existing Codebase & Architecture
- **Coordinate Reference System (CRS)**: In `src/lib/geojson.js` (lines 16–18), the Grepolis map coordinate transformation maps 1000 tiles $\times$ 128px ($128,000\text{ px}$) to MapLibre Lng/Lat:
  $$\lambda = (P_x / 128000) \times 360 - 180, \quad \phi = -((P_y / 128000) \times 180 - 90)$$
  In `src/app/map/page.js` (lines 409–410), cursor coordinates are inversely mapped back to $(X_w, Y_w)$:
  $$X_w = \text{round}((\lambda + 180) / 360 \times 1000), \quad Y_w = \text{round}((90 - \phi) / 0.18)$$
- **MapLibre Layer Hierarchy**: In `src/app/map/page.js` (lines 470–809), layer stack comprises `ocean-lines`, `ocean-labels`, `route-line-glow`, `route-line`, `islands-points`, `island-sprites`, `rocks-points`, `empty-slots-sprites`, `town-points`, `town-sprites`, `town-flags`, and `town-labels`.
- **Existing Route Tool**: In `src/components/map/RoutePlannerTool.js` (lines 50–62), travel time is calculated with official formula:
  $$\text{Duration (minutes)} = \frac{\text{distance} \times 50}{\text{speed} \times \text{worldSpeed} \times \text{unitSpeed}}$$
- **Existing Snipe & Operations System**: In `src/app/snipe/page.js` (lines 24–68) and `src/app/api/snipe/operations/route.js`, snipe operations ingest `targetTownId` and `originTownId` and persist in Prisma database (`SnipeOperation` model in `prisma/schema.prisma` lines 226–248) and `localStorage`.
- **Momentum & Intel Engine**: In `src/app/api/world/momentum/route.js` (lines 25–41), point and battle point deltas ($\Delta\text{Pts}, \Delta\text{ABP}, \Delta\text{DBP}$) are computed across snapshot windows from `PlayerHistory` and `AllianceHistory`.

---

## 2. Logic Chain

1. **R1 (Political & Frontline Heatmaps)**:
   - *Observation*: Individual town points are grouped by alliance in `townLookup` in `src/lib/geojson.js`.
   - *Inference*: Voronoi tessellation of city coordinates using `d3-delaunay` creates non-overlapping territorial spheres. Clamping Voronoi cells to a maximum radial influence ($R_{\text{max}} = 15 - 22.5\text{ units}$) prevents unrealistic infinite ocean boundaries.
   - *Frontlines*: Shared Delaunay boundary edges between opposing alliances allow computing a tension coefficient $\mathcal{T}(E_{ij}) = \frac{\sqrt{\text{Pts}_i \cdot \text{Pts}_j}}{d_{ij}}$, rendering high-tension contested borders as glowing red lines. Island-level entropy identifies multi-alliance contested islands.

2. **R2 (Intel Radar Overlays)**:
   - *Observation*: Ghost towns have `player: 'Ghost Town'` or `playerId: null`. Recent conquests are tracked in the `Conquest` table. Inactivity is reflected in 0 delta in `PlayerHistory`.
   - *Inference*: Dedicated radar modes can be toggled without re-fetching base map data by filtering GeoJSON features and overlaying dynamic pulsing halos (`active-siege-ping`) and custom icon markers (ghost skulls, loot sacks).

3. **R3 (Animated Troop Movement & Trajectory Tracker)**:
   - *Observation*: Straight LineString routes create visual intersection clutter across ocean sectors.
   - *Inference*: Quadratic/cubic Bézier curves with normal vector camber offset provide clean, realistic maritime trajectories. Real-time sprite traversal with continuous tangent rotation $\theta(t) = \text{atan2}(B_y', B_x')$ and NTP-style synchronized countdown timers ($\Delta_{\text{sync}}$ from `/api/time`) deliver fluid visual flight paths.

4. **R4 (Tactical Pinboard & Operations)**:
   - *Observation*: Commanders need to flag targets (`Primary Target`, `Stack Biremes`, `Break Siege`) and communicate orders to alliance members.
   - *Inference*: Adding a `TacticalPin` entity supporting LocalStorage and Prisma PostgreSQL schema with deep-links to `/snipe` and `RoutePlannerTool` streamlines coordinated military operations.

5. **R5 (Interactive Minimap Radar Widget)**:
   - *Observation*: Navigating a $1000 \times 1000$ tile world requires macroscopic spatial awareness.
   - *Inference*: Projecting the $1000 \times 1000$ world to a $180 \times 180\text{ px}$ canvas and projecting MapLibre viewport bounds `map.getBounds()` as a draggable frustum box provides immediate macroscopic context and 1-click camera re-centering.

---

## 3. Caveats

1. **Voronoi Computational Budget**: In worlds with $>15,000$ active cities, computing Voronoi union polygons on the main UI thread could cause a minor frame hitch ($~80\text{ ms}$). To guarantee 60 FPS, this calculation must be offloaded to a Web Worker or pre-calculated and cached.
2. **Decay Rate Approximation**: In Grepolis, ghost town decay rates depend on building demolition queues and world speed. The specified decay formula provides a close estimate; exact age is taken from `Conquest` / `TownHistory` when historical data is present.
3. **Drift Compensation**: Client clock sync uses `/api/time` with single-trip half-RTT compensation. On erratic high-jitter mobile networks, a rolling 3-sample median RTT filter is recommended.

---

## 4. Conclusion

All functional, mathematical, algorithmic, and architectural specifications for features **R1 through R5** have been comprehensively mined, formulated, and documented in `d:\Dev\Web\Grepolis\.agents\survey_spec_miner_3\spec.md`. The design adheres strictly to the existing Next.js 16 / React 19 / MapLibre GL 5 / Prisma architecture, ensuring seamless implementation.

---

## 5. Verification Method

To verify the completeness and accuracy of the specification:
1. Inspect the full specification file: `d:\Dev\Web\Grepolis\.agents\survey_spec_miner_3\spec.md`.
2. Verify all mathematical equations (Bézier arc camber, Voronoi radial clamping, Coordinate transforms, Clock drift offset $\delta$, Momentum activity score).
3. Validate alignment with existing database schemas (`prisma/schema.prisma`) and component signatures (`RoutePlannerTool.js`, `UnifiedSearchPanel.js`, `CommandDrawer.js`, `src/app/map/page.js`).
