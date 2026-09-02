## 2026-09-02T17:38:47Z
You are Milestone 2 Explorer 1 (Intel Radar Algorithms & MapLibre Layers).
Your working directory is `d:\Dev\Web\Grepolis\.agents\m2_explorer_1`.

You MUST read:
1. `d:\Dev\Web\Grepolis\.agents\ORIGINAL_REQUEST.md` (R2 requirements)
2. `d:\Dev\Web\Grepolis\PROJECT.md` (Interface Contracts §2)
3. `d:\Dev\Web\Grepolis\TEST_READY.md` (F4, F5, F6 tests)
4. `src/lib/map/voronoi.js` (for coding standards and defensive patterns)
5. `src/app/map/page.js`

Your task:
Analyze and formulate the complete implementation for `src/lib/map/intelRadar.js` and MapLibre WebGL layers:
1. `filterIntelOverlays(towns, players, conquests, filters)`:
   - **Ghost Hunter Radar**: Identify unowned/ghost towns (`playerId === null` / `player === 'Ghost Town'`), vacancy age estimation `Math.max(1, Math.round((13716 - points) / 150))`, minGhostPoints threshold, point and skull indicator properties.
   - **Active Siege Radar**: Cross-reference conquests within `recentHours` (default 48h) or `isBesieged` flag, pulse halo properties (`haloIntensity: 0.8`, `pulseRateMs: 1500`, `haloRadius: 15`).
   - **Inactive Farm Finder**: Player towns with `momentumDelta <= maxMomentumDelta` (default 0), activityScore calculation `Math.max(0, Math.round(points * 0.1 - momentumDelta * 2))`, farm rating (`HIGH` > 8000, `MEDIUM` > 3000, `LOW`).
2. MapLibre layer stack in `src/app/map/page.js`:
   - `ghost-radar-source` (`ghost-radar-glow`, `ghost-radar-markers`)
   - `siege-radar-source` (`siege-radar-halo`)
   - `inactive-farm-source` (`inactive-farm-markers`, `inactive-farm-labels`)
   - Zoom ranges, color ramps (cyan/purple for ghosts, red pulse for sieges, amber/gold for farms).
3. Defensive handling of empty arrays, nullish properties, and non-numeric inputs.

Write your report to `d:\Dev\Web\Grepolis\.agents\m2_explorer_1\analysis.md` and deliver `handoff.md`. Notify with `send_message`.
