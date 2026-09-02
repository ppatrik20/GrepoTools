# Handoff Report: Milestone 1 Explorer 2 (MapLibre Layers & WebGL Performance)

## 1. Observation
- **File Checked: `src/app/map/page.js`**
  - Line 4: `import Map, { Source, Layer, Popup } from "react-map-gl/maplibre";`
  - Lines 470–491: `ocean-grid-source` rendering `ocean-lines` (line) and `ocean-labels` (symbol).
  - Lines 494–516: `route-line-source` rendering `route-line-glow` and `route-line`.
  - Lines 519–608: `islands-source` rendering `islands-points` (minzoom 2, maxzoom 5.5) and `island-sprites` (minzoom 5.0).
  - Lines 612–630: `rocks-source` rendering `rocks-points` (minzoom 6.0).
  - Lines 634–663: `empty-slots-source` rendering `empty-slots-sprites` (minzoom 7.2).
  - Lines 666–809: `towns-source` (with clustering enabled) rendering `clusters`, `cluster-count`, `town-points`, `town-sprites`, `town-flags`, and `town-labels`.
  - Lines 399–419: `onMouseMove` handler updating `cursorGrid` and `hoverInfo` on animation frames.
- **File Checked: `PROJECT.md`**
  - Lines 59–98: Interface Contract for `computeAllianceVoronoi(towns, alliances, options)` and `computeContestedFrontlines(towns, voronoiData)`.
  - Lines 14–15: Overlay layer definitions for `voronoi-spheres-fill`, `voronoi-spheres-border`, and `contested-frontline-lines`.
- **File Checked: `package.json`**
  - Lines 18, 22: `maplibre-gl: ^5.24.0` and `react-map-gl: ^8.1.1`.

## 2. Logic Chain
1. *From Observation of `src/app/map/page.js` (lines 470–809)*: The current WebGL rendering order places ocean lines at the base and towns at the top. Inserting Voronoi polygons directly beneath `islands-source` using `beforeId="islands-points"` ensures that the semi-transparent political color wash tints the water surface while keeping island terrain sprites and town buildings 100% crisp and un-tinted.
2. *From Observation of `react-map-gl` layer mounting mechanics*: In React-Map-GL, dynamically mounting layers inside React conditional statements without `beforeId` can cause MapLibre to append them at the top of the stack, obscuring town sprites. Adding `beforeId="islands-points"` and controlling visibility via `layout: { visibility: mapMode === 'political' ? 'visible' : 'none' }` guarantees deterministic Z-order and instantaneous (0ms) toggling.
3. *From Observation of high-frequency mouse events in `src/app/map/page.js` (lines 399–419)*: `onMouseMove` updates React state up to 120 times/sec. To avoid re-parsing GeoJSON and re-uploading GPU vertex buffers, `voronoiData` and `frontlinesData` must be memoized via `useMemo` strictly tied to `[rawTowns, topAlliances, customColors]` and decoupled from cursor/viewport state.
4. *From Observation of Paint Properties*: Using MapLibre shader expressions (`interpolate` over zoom and `coalesce` over `['get', 'color']` and `['get', 'tension']`) offloads dynamic color and opacity calculations to the GPU fragment shaders, ensuring uninterrupted 60 FPS performance.

## 3. Caveats
- When `data` is still loading, `islands-points` is not yet mounted. React-Map-GL handles `beforeId` gracefully when the target layer is absent by inserting at the current JSX order.
- In worlds with no alliances formed (e.g. newly spawned test worlds), `computeAllianceVoronoi` should return an empty FeatureCollection `{ type: 'FeatureCollection', features: [] }` rather than `null` to avoid React-Map-GL source warnings.

## 4. Conclusion
1. Place `voronoi-spheres-fill`, `voronoi-spheres-border`, `contested-frontline-glow`, and `contested-frontline-lines` inside two dedicated sources (`voronoi-source` and `frontlines-source`) positioned right after `ocean-grid-source` with `beforeId="islands-points"`.
2. Style the fill with zoom-interpolated opacity (`0.38` $\to$ `0.12`), borders with `line-blur: 1`, and frontlines with a dual-layer neon glow (Yellow $\to$ Orange $\to$ Red based on `tension`) and sharp white dashed core (`[2, 1]`).
3. Isolate Voronoi calculation in a multi-tier `useMemo` chain to maintain 60 FPS rendering under heavy mouse movement, camera panning, and zooming.

## 5. Verification Method
1. **Layer Hierarchy & Inspection**:
   - Inspect `src/app/map/page.js` and verify that `voronoi-source` and `frontlines-source` are declared before `islands-source` with `beforeId="islands-points"`.
2. **Build & Type Check**:
   - Run `npm run build && prisma generate` to verify zero TypeScript/JSX syntax errors.
3. **Automated & Visual Verification**:
   - Run E2E tactical tests: `npx playwright test tests/e2e/tactical_suite.test.js` (once created in M6).
   - In browser, toggle between "Geographic View" and "Political View" and verify in Chrome DevTools Performance panel that frame rate remains at solid 60 FPS during pan/zoom.
