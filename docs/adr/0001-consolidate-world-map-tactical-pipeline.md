# Consolidate World Map Tactical Pipeline and Layer Registry

## Context
The World Map React page (`src/app/map/page.js`) had grown to 2,758 lines by directly orchestrating feature partitioning, coalition coloring, Voronoi tessellation, continuous maritime meshes, intel radars, tactical pins, and 1,300 lines of inlined MapLibre WebGL paint rules. This made headless testing impossible and caused test suites to duplicate mock reference engines in-file.

## Decision
We consolidate all geospatial and tactical computation behind an in-process deep `TacticalScenePipeline` module returning a unified `SceneBundle` with a three-tier internal cache (Base topology, Political topology, Dynamic overlays), and extract MapLibre layer specifications into a declarative `TacticalLayerRegistry` factory. `src/app/map/page.js` becomes a thin presentation layer, and `tests/e2e/tactical_suite.test.js` tests the production pipeline directly.

## Considered Options
- *Stateful Reactive Store (Zustand)*: Rejected to avoid framework coupling and stateful mocking in tests; pure in-process pipeline enables direct headless Vitest execution.
- *Web Worker Pipeline*: Rejected due to 30-50ms structured clone serialization cost of 100k GeoJSON features and Turbopack worker complexity; in-memory math benchmarks under 15ms.
- *Component-per-Layer Deconstruction*: Rejected because MapLibre layer stacking (z-order) depends strictly on mount order; a declarative array locks render order reliably.
