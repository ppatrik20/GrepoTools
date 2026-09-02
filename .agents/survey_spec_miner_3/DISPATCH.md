## 2026-09-02T16:56:48Z

You are Survey Spec Miner 3 (Requirements & Tactical Feature Specifications).
Your working directory is `d:\Dev\Web\Grepolis\.agents\survey_spec_miner_3`.
You MUST read `d:\Dev\Web\Grepolis\.agents\ORIGINAL_REQUEST.md`.

Investigate and document precise functional and technical specifications for R1 through R5:
1. R1: Political & Frontline Heatmaps: Voronoi alliance territory calculation algorithm (e.g. d3-delaunay, d3-voronoi, turf.js, or GPU shader/canvas approach), top alliance color assignment, contested frontline zone detection algorithms (islands with competing alliances or overlapping Voronoi edges), toggle controls in the UI.
2. R2: Conquest & Intel Radar Overlays:
   - Ghost Hunter Radar (unowned/ghost town detection, vacancy age calculation, marker styling).
   - Active Siege / Contest Radar (contested towns, recent ownership shifts, conquest indicators).
   - Inactive Farm Finder (point delta / momentum thresholds, activity score, filter sliders).
3. R3: Animated Troop Movement & Trajectory Tracker:
   - Bézier curve trajectory mathematics (quadratic/cubic arcing paths across ocean sectors).
   - Animation engine (requestAnimationFrame, CSS animations, or Canvas/WebGL rendering with ship & mythical flyer SVG/sprites).
   - Real-time countdown timer tick logic (synced with Grepolis server time / local clock).
   - Multi-origin sniping trajectory coordination (multiple origins converging on single target with unified landing time).
4. R4: Tactical Alliance Pinboard & Operation Markers:
   - Pin types: Primary Target, Secondary Target, Stack Biremes, Break Siege.
   - Metadata: Priority (Critical, High, Normal), custom notes, creator/timestamp, target town details.
   - Persistence layer: LocalStorage / DB schema for pins.
   - One-click integration & export to `/snipe` and Route Planner with prepopulated targets and coordinates.
5. R5: Interactive Minimap Radar Widget:
   - 1000x1000 world coordinate mapping to 150x150 or 200x200 minimap radar canvas.
   - Active viewport bounding box projection (converting MapLibre viewport bounds to world coordinates).
   - Click/drag pan interaction handling to sync with main map camera.
   - Collapsible / draggable floating HUD design.

Write your full structured report to `d:\Dev\Web\Grepolis\.agents\survey_spec_miner_3\spec.md` and deliver `handoff.md`.
Notify with send_message when done.
