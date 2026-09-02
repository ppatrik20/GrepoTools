## 2026-09-02T17:14:56Z
<USER_REQUEST>
You are the E2E Test Writer for the Next-Generation Grepolis World Map Tactical Command Suite.
Your working directory is `d:\Dev\Web\Grepolis\.agents\e2e_test_writer_1`.

You MUST read:
1. `d:\Dev\Web\Grepolis\.agents\ORIGINAL_REQUEST.md`
2. `d:\Dev\Web\Grepolis\PROJECT.md`
3. `d:\Dev\Web\Grepolis\TEST_INFRA.md`

Your task:
1. Construct the comprehensive E2E & unit test suite in `tests/e2e/tactical_suite.test.js` using Vitest covering:
   - **Tier 1 (Feature Coverage ≥5 tests per feature)**:
     - F1: Voronoi calculation, polygon generation, alliance color assignments, radial clamping.
     - F2: Contested frontline boundary edge detection, tension score calculation, multi-alliance island detection.
     - F3: Control panel toggle between Geographic and Political views.
     - F4: Ghost hunter radar filtering, vacancy age estimation, ghost town markers.
     - F5: Active siege / contest radar filtering, recent conquest detection, pulsing halo attributes.
     - F6: Inactive farm finder filtering, momentum delta thresholds, activity scoring.
     - F7: Bézier route trajectory calculations (quadratic/cubic camber offsets, sample points).
     - F8: Animated troop transit sprite progress interpolation, tangent rotation angle calculation.
     - F9: Live ETA countdown timer tick logic, remaining seconds calculation, zero expiration.
     - F10: Multi-origin sniping path synchronization, unified landing time calculation.
     - F11: Tactical operation pin creation, type categorization (Primary, Secondary, Stack Biremes, Break Siege).
     - F12: Custom notes, priority tagging (Critical, High, Normal), validation.
     - F13: One-click export URL generator for `/snipe` and Route Planner data payloads.
     - F14: 1000x1000 minimap coordinate mapping, viewport frustum bounding box calculation.
     - F15: Minimap click/drag to camera coordinate projection & pan dispatching.
   - **Tier 2 (Boundary & Corner Cases ≥5 per feature area)**:
     - Single-town worlds, empty alliances, disconnected ocean clusters, extreme coordinates (0,0), (999,999), (500,500), circular bounds (R=250), zero travel duration, instantaneous landings, missing player metadata, max priority pins, LocalStorage JSON corruption handling.
   - **Tier 3 (Cross-Feature Combinations & Pairwise)**:
     - Voronoi heatmaps combined with tactical pins and active sieges.
     - Multi-origin sniping with troop animations and route planning.
     - Ghost hunter radar combined with minimap navigation and inactive farm sweep.
   - **Tier 4 (Real-World Application Scenarios)**:
     - 5 full end-to-end tactical command workflows simulating real Grepolis alliance wars, siege defenses, farming sweeps, and multi-origin naval operations.
2. Verify tests can be executed with `npx vitest run tests/e2e/tactical_suite.test.js` (they will test the module contracts defined in `PROJECT.md`).
3. Create `d:\Dev\Web\Grepolis\TEST_READY.md` summarizing test counts across Tiers 1-4 and test execution instructions.
4. Deliver `handoff.md` and notify with `send_message`.
</USER_REQUEST>
