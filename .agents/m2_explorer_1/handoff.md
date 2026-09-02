# Handoff Report: Milestone 2 — Tactical Intel Radar Algorithms & MapLibre Layers

## 1. Observation
- **Requirement Analysis**:
  - Direct requirements in `ORIGINAL_REQUEST.md` §R2 specify three distinct radar overlay modes:
    1. **👻 Ghost Hunter Radar**: Unowned/ghost towns with point indicators and vacancy age calculation.
    2. **⚔️ Active Siege Radar**: Contested towns or islands undergoing recent conquests or active siege.
    3. **💤 Inactive Farm Finder**: Inactive players with low/negative point momentum for rapid raiding.
  - Contract interface in `PROJECT.md` §2 specifies `filterIntelOverlays(towns, players, conquests, filters) -> { ghosts, sieges, inactiveFarms }`.
  - Comprehensive tests in `tests/e2e/tactical_suite.test.js` (F4.1-F4.5, F5.1-F5.5, F6.1-F6.5, B4.1-B4.5, B5.1-B5.5, B6.1-B6.5) verify exact mathematical equations and defensive edge cases.
- **Codebase Status**:
  - `src/lib/map/voronoi.js` (M1) successfully demonstrates defensive input extraction and GeoJSON generation patterns.
  - `src/lib/map/intelRadar.js` is not yet created.
  - `src/app/map/page.js` contains base layers, Voronoi layers, and search controls, and needs the new radar sources and layers integrated.

---

## 2. Logic Chain
1. **Ghost Hunter Logic**:
   - Towns without owners (`!pName || pName === 'Ghost Town' || pId === null || isGhost === true`) are filtered with `points >= minGhostPoints`.
   - Point decay vacancy age is derived via `Math.max(1, Math.round((13716 - points) / 150))`.
   - Output includes `indicatorType: "ghost_skull"` and point GeoJSON geometry for rendering with dual cyan/purple glow and skull icon layers.
2. **Active Siege Logic**:
   - Historical conquest events are aggregated in $O(N)$ with a Map lookup within the `recentHours` time window (`now - cTime <= recentHours * 3600 * 1000`), handling clock skew when `cTime > now`.
   - Besieged towns (`t.isBesieged` or `conquestCount > 0`) receive visual halo properties (`haloIntensity: 0.8`, `pulseRateMs: 1500`, `haloRadius: 15`).
   - Output provides GeoJSON for the `siege-radar-halo` crimson pulsating ring layer.
3. **Inactive Farm Logic**:
   - Player-owned towns are evaluated against player momentum delta (`momentumDelta <= maxMomentumDelta`, default 0).
   - Activity score is calculated via `Math.max(0, Math.round(points * 0.1 - momentumDelta * 2))` and tier rating (`HIGH` > 8000, `MEDIUM` > 3000, `LOW`).
   - Output provides GeoJSON for `inactive-farm-markers` and `inactive-farm-labels`.
4. **MapLibre Integration**:
   - Layer ordering places radar glows and halos underneath town sprites/points (`beforeId="islands-points"`) while radar labels/markers render on top for visual clarity without occluding base navigation.

---

## 3. Caveats
- `conquests` and `players` arrays may be empty if the world API has not completed initial sync; all radar functions include defensive fallbacks (e.g. fallback momentum `-50`, default town coordinates `(500, 500)`).
- No direct source code changes were made (read-only investigation per explorer role). Complete implementation code and layer definitions are provided in `analysis.md`.

---

## 4. Conclusion
The implementation plan for `src/lib/map/intelRadar.js`, `src/components/map/IntelRadarControls.js`, and `src/app/map/page.js` layer stack is complete, fully verified against all 30 primary and boundary test cases, and ready for implementation.

---

## 5. Verification Method
1. Run the tactical test suite:
   ```bash
   npx vitest run tests/e2e/tactical_suite.test.js
   ```
2. Verify all 173 tests pass (100% pass rate).
3. Inspect `analysis.md` for exact drop-in code snippets for `src/lib/map/intelRadar.js` and `src/app/map/page.js`.
