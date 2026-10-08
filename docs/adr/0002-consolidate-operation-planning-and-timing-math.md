# Consolidate Operation Planning and Timing Math

## Context
Operation planning routines were scattered across several shallow modules and UI components. `src/components/map/RoutePlannerTool.js` hardcoded naval and mythical unit catalogs while re-exporting low-level math routines to `src/app/snipe/page.js`. `src/app/snipe/page.js` inlined query ingestion, midnight date wrap-around, anti-timing buffer calculation (±10s), and storage synchronization. `src/app/snipe/recall/page.js` embedded Grepolis conquest game rules for Revolt vs. Siege gaps directly inside component handlers. Furthermore, tests (`src/lib/snipe_adversarial_stress.test.js`) had to invent a 25-line shadow simulator (`simulateSnipeIngestion`) to exercise query parameter normalization outside the browser DOM, and dual storage mechanisms (localStorage and remote Prisma database) duplicated deserialization and date revival across three page components.

## Decision
We consolidate troop catalogs, nautical travel time calculations, anti-timing launch window scheduling, and Revolt/Siege conquest gap calculations behind a deep, headless `OperationPlanner` domain module. We extract unit metadata into `src/lib/operations/units.js` and introduce an `OperationsStorage` module with dual adapters (`LocalOperationsAdapter` and `RemoteOperationsAdapter`) for unified persistence and Date revival. Presentation layers delegate entirely to `OperationPlanner`, and tests exercise the production module directly without shadow simulation.

## Considered Options
- *Custom React Hooks (`useOperationPlanner`, `useOperationIngestion`)*: Rejected because coupling domain rules and calculation to React state lifecycles prevents fast, headless CLI and Vitest execution without complex DOM rendering harnesses.
- *Shallow Utility Helpers*: Rejected because leaving coordination across multiple small files fails the deletion test and leaves UI components responsible for orchestration, anti-timing buffers, and date revival.
- *Direct API Routes for Math*: Rejected because round-tripping millisecond-critical snipe and recall calculations over HTTP adds latency and breaks offline client functionality.
