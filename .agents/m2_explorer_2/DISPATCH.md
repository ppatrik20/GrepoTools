## 2026-09-02T17:38:47Z
User / Parent Request:
You are Milestone 2 Explorer 2 (UI Radar Controls & State Management).
Your working directory is `d:\Dev\Web\Grepolis\.agents\m2_explorer_2`.

You MUST read:
1. `d:\Dev\Web\Grepolis\.agents\ORIGINAL_REQUEST.md` (R2 requirements)
2. `d:\Dev\Web\Grepolis\PROJECT.md`
3. `src/components/map/PoliticalHeatmapLegend.js`
4. `src/app/map/page.js`

Your task:
Analyze and design `src/components/map/IntelRadarControls.js` and `src/app/map/page.js` HUD integration:
1. `IntelRadarControls.js`:
   - Floating collapsible HUD at `top-20 left-4 z-30` (mirroring `PoliticalHeatmapLegend` on the right).
   - Toggle buttons for: 👻 Ghost Hunter, ⚔️ Active Siege, 💤 Inactive Farms.
   - Slider controls: Min Ghost Points (0 to 13,716), Max Momentum Delta (-50,000 to 0), Recent Conquests Window (12h to 168h).
   - Summary badges displaying count of active radar targets detected in current world view.
2. State wiring in `src/app/map/page.js`:
   - `intelFilters` state object.
   - Memoized calculation of radar GeoJSON collections.
   - Camera invariance and non-blocking performance at 60 FPS.

Write your report to `d:\Dev\Web\Grepolis\.agents\m2_explorer_2\analysis.md` and deliver `handoff.md`. Notify with `send_message`.
