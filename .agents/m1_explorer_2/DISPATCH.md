## 2026-09-02T17:23:21Z
You are Milestone 1 Explorer 2 (MapLibre Layers & WebGL Performance).
Your working directory is `d:\Dev\Web\Grepolis\.agents\m1_explorer_2`.
You MUST read:
1. `d:\Dev\Web\Grepolis\.agents\ORIGINAL_REQUEST.md`
2. `d:\Dev\Web\Grepolis\PROJECT.md`
3. `d:\Dev\Web\Grepolis\src\app\map\page.js`

Your task:
Analyze how to integrate the Political & Frontline Heatmap layers into `src/app/map/page.js`:
1. Where in the layer hierarchy to place `voronoi-spheres-fill`, `voronoi-spheres-border`, and `contested-frontline-lines` (should be below town markers/sprites but above ocean lines).
2. How to register GeoJSON sources `voronoi-source` and `frontlines-source` with React-Map-GL.
3. Layer paint properties: semi-transparent fill (`['get', 'color']`, opacity ~0.25-0.4), glowing line borders, pulse/tension line styling.
4. Performance considerations: memoization (`useMemo`), updating sources only when towns/alliances/mode change to preserve 60 FPS.
Write your findings to `d:\Dev\Web\Grepolis\.agents\m1_explorer_2\analysis.md` and deliver `handoff.md`. Notify with `send_message`.
