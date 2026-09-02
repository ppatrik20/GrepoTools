# Handoff Report — Codebase Architecture & Map Stack Survey

## 1. Observation
- **Map Engine & Bindings**:
  - `package.json:18,22` defines `"maplibre-gl": "^5.24.0"` and `"react-map-gl": "^8.1.1"`.
  - `src/app/map/page.js:4-6` imports `Map, { Source, Layer, Popup } from "react-map-gl/maplibre"`, `maplibregl from "maplibre-gl"`, and `"maplibre-gl/dist/maplibre-gl.css"`.
- **Framework & Toolchain**:
  - `package.json:19-21` defines `"next": "16.2.7"`, `"react": "19.2.4"`, `"react-dom": "19.2.4"`.
  - `package.json:26,32` defines `"tailwindcss": "^4.3.3"` and `"@tailwindcss/postcss": "^4.3.3"`.
  - `next.config.mjs:3` defines `output: "standalone"`.
  - `src/app/layout.js` and `src/app/map/page.js` use the Next.js App Router paradigm.
- **Map Layers & Components**:
  - Multi-LOD layer stack registered in `src/app/map/page.js:470-808`: `ocean-lines`, `ocean-labels`, `route-line-glow`, `route-line`, `islands-points` (z2-5.5), `island-sprites` (z5.0+), `rocks-points` (z6.0+), `empty-slots-sprites` (z7.2+), `clusters` (z2-5.5), `cluster-count` (z2-5.5), `town-points` (z3.5-6.8), `town-sprites` (z6.5+), `town-flags` (z6.8+), `town-labels` (z8.5+).
  - Floating and sliding overlays: `src/components/map/UnifiedSearchPanel.js`, `src/components/map/CommandDrawer.js`, `src/components/map/RoutePlannerTool.js`.
  - Asset preloader: `src/lib/map/assetLoader.js` registers all 40 island PNGs, 5 town stage models, rock island, and empty slot sprites into MapLibre instance.
  - Coordinate projection in `src/lib/geojson.js:17-18`: `pixelToLng = (px / 128000) * 360 - 180`, `pixelToLat = (py / 128000) * 180 - 90`.
- **State Management**:
  - `src/context/AppContext.js` exposes `AppContextProvider` with `worlds`, `activeWorldId`, `activeWorld`, `activePlayerName`, `activePlayer`, `masterData`.
  - Local state in `src/app/map/page.js` manages GeoJSON feature filtering, custom colors, highlights, selected drawer entity, tool active flags, and hovered tooltip.
  - URL search parameters are consumed by `/snipe` and `/snipe/recall` for one-click target and origin ingestion.
- **Build & Verification**:
  - `npm run build && prisma generate` compiled successfully with 0 errors (Next.js 16.2.7 Turbopack, standalone output, 14 static/dynamic routes generated, Prisma client generated in 258ms).
  - `npx vitest run` executed 57 unit tests across 4 test suites (`snipe_ingestion.test.js`, `snipe_adversarial_stress.test.js`, `adversarial_verification.test.js`, `traveltime.test.js`).

## 2. Logic Chain
1. Observations of `package.json` and `src/app/map/page.js` establish that MapLibre GL JS v5.24.0 with React-Map-GL v8.1.1 is the active map rendering engine.
2. Observations of the layer definitions in `src/app/map/page.js` confirm a multi-tiered Level-of-Detail (LOD) architecture where macro views render clustered point aggregations, and tactical views (z5.0 - z12.0) render full island sprites (0.007 * 2^Z scaling), 3D isometric town models, alliance flags, and shoreline slot indicators.
3. Analysis of `src/context/AppContext.js` and local component states shows a clean separation between global world context (active world, active player, master sync) and high-frequency local map interaction state (selection, routing, highlights).
4. Build verification proves the codebase is on React 19.2.4 + Next.js 16.2.7 (App Router) using Turbopack with zero compilation errors and full TypeScript/App Router compliance.

## 3. Caveats
- Legacy reference scripts in `src/lib/map/js/` contain raw jQuery/Canvas client dumps from the original Grepolis game for reference purposes; they are not executed by the React MapLibre frontend.
- Asset test in `traveltime.test.js` expects 0 noise pixels for `island_1.png`, which is a known asset cleanup check from Milestone 1.

## 4. Conclusion
The codebase is structured around a high-performance WebGL map architecture utilizing MapLibre GL JS v5, React-Map-GL v8, Next.js 16 App Router, Tailwind CSS 4, and Prisma ORM. The architecture cleanly supports adding new tactical layers (such as Voronoi political influence heatmaps, intel radar filters, animated troop trajectories, tactical pinboard markers, and global minimap radar widgets) by introducing new MapLibre Sources/Layers and React overlay panels.

## 5. Verification Method
- Build validation: Run `npm run build && prisma generate` (passes with 0 errors).
- Test validation: Run `npx vitest run` to execute unit tests for geometry, travel time, and API parameter ingestion.
- File inspection: Inspect `src/app/map/page.js`, `src/lib/geojson.js`, `src/lib/map/assetLoader.js`, and `src/context/AppContext.js`.
