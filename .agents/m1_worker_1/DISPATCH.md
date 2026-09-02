## 2026-09-02T17:25:11Z
You are the Milestone 1 Implementation Worker (Political & Frontline Heatmaps).
Your working directory is `d:\Dev\Web\Grepolis\.agents\m1_worker_1`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read:
1. `d:\Dev\Web\Grepolis\.agents\ORIGINAL_REQUEST.md`
2. `d:\Dev\Web\Grepolis\PROJECT.md`
3. `d:\Dev\Web\Grepolis\TEST_READY.md`
4. Explorer analyses:
   - `d:\Dev\Web\Grepolis\.agents\m1_explorer_1\analysis.md`
   - `d:\Dev\Web\Grepolis\.agents\m1_explorer_2\analysis.md`
   - `d:\Dev\Web\Grepolis\.agents\m1_explorer_3\analysis.md`

Your tasks:
1. Create `src/lib/map/voronoi.js` implementing:
   - `computeAllianceVoronoi(towns, alliances, options)`
   - `computeContestedFrontlines(towns, voronoiData)`
   - Full support for `maxRadius` radial clamping, dominant territory share calculation, official alliance color assignment, multi-alliance island detection (`islandKey`, `isContestedIsland: true`), tension scoring [0.0, 1.0], and robust boundary/edge cases (empty arrays, missing properties, sub-threshold alliances).
2. Create `src/components/map/PoliticalHeatmapLegend.js`:
   - Floating collapsible HUD widget (`top-20 right-4 z-30`).
   - Alliance territory list with color indicators, town counts, dominance share %, and live opacity slider (`0.10` to `0.80`).
   - Contested frontline toggle and highlight controls.
3. Update `src/components/map/UnifiedSearchPanel.js`:
   - Add segmented control pill toggle `[ 🌐 Geographic | 🛡️ Political ]` linked to `viewMode` / `onToggleViewMode` props.
4. Update `src/app/map/page.js`:
   - State for `viewMode` (`'geographic' | 'political'`), `politicalOpacity` (default `0.35`), and `showContestedOnly` (`false`).
   - Memoized computation of `voronoiData` and `frontlinesData` from `rawTowns`, `topAlliances`, `customColors`.
   - Add MapLibre sources `voronoi-source` and `frontlines-source` with layers `voronoi-spheres-fill`, `voronoi-spheres-border`, `contested-frontline-glow`, `contested-frontline-lines` with `beforeId="islands-points"`.
   - Ensure camera position and zoom are completely preserved across viewMode toggles.
   - Render `PoliticalHeatmapLegend` when `viewMode === 'political'`.
5. Run builds and tests:
   - `npx vitest run tests/e2e/tactical_suite.test.js`
   - `npm run build && prisma generate`
   Verify that all tests pass cleanly with 0 TypeScript/Next.js errors.

Write your report to `d:\Dev\Web\Grepolis\.agents\m1_worker_1\changes.md` and deliver `handoff.md`. Notify with `send_message`.
