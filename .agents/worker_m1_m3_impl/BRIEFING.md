# BRIEFING — 2026-08-30T18:57:40Z

## Mission
Implement Milestones 1 & 3 requirements for Next-Generation Grepolis World Map & Command Center: clean `island_1.png` alpha noise, calibrated physical proportion scaling curve, shoreline bay slot positioning in `geojson.js`, `/snipe` and `/snipe/recall` query parameter ingestion, and same-island trajectory arc.

## 🔒 My Identity
- Archetype: Implementation Worker
- Roles: implementer, qa, specialist
- Working directory: d:\Dev\Web\Grepolis\.agents\worker_m1_m3_impl
- Original parent: f2aaa4e8-bb34-4227-a742-f7be5ff52336
- Milestone: M1 & M3

## 🔒 Key Constraints
- Clean `island_1.png` alpha channel (alpha <= 30 to 0), verifying corner pixels have alpha = 0.
- Calibrated physical scaling curve $0.007 \times 2^Z$ for `island-sprites` layer in `src/app/map/page.js`.
- Shoreline bay slot positioning in `src/lib/geojson.js` strictly using 581 offsets in `island_definitions.json`, no synthetic fallback on colonizable islands.
- `/snipe` and `/snipe/recall` parameter ingestion (`targetTownId`, `originTownId`) wrapped safely in Suspense or handling search params.
- Same-island trajectory arc calculation between town slot coordinates rather than identical island centers.
- Pass `npm run build && prisma generate` and `npx vitest run`.

## Current Parent
- Conversation ID: f2aaa4e8-bb34-4227-a742-f7be5ff52336
- Updated: 2026-08-30T18:57:40Z

## Task Summary
- **What to build**:
  1. Alpha cleanup on `public/map/islands/island_1.png` (zero corner alpha, noise clamped).
  2. MapLibre island sprite icon-size scaling curve in `src/app/map/page.js` ($0.007 \times 2^Z$).
  3. Official town slot offsets and empty slot generation in `src/lib/geojson.js` and `scripts/rebuild_geojson_cache.js`.
  4. Query parameter ingestion in `src/app/snipe/page.js` and `src/app/snipe/recall/page.js` with `useSearchParams` and `Suspense`.
  5. Same-island trajectory coordinates and arc rendering in `src/app/map/page.js`.
  6. Build and test verification.
- **Success criteria**: All 6 tasks completed, tests passing (17/17), 0 build errors.
- **Interface contracts**: PROJECT.md § Interface Contracts
- **Code layout**: Next.js App Router in `src/`

## Change Tracker
- **Files modified**:
  - `public/map/islands/island_1.png`: Cleaned 161,840 noise background pixels (alpha <= 30 -> 0), verified 4 corner alphas = 0.
  - `src/app/map/page.js`: Updated `island-sprites` icon-size scaling curve to $0.007 \times 2^Z$, added `getTownMapCoordinates`, and fixed `routeLineData` for same-island slot trajectory arcs.
  - `src/components/map/UnifiedSearchPanel.js`: Enriched `normalizeTownData` with `islandType`, `dir`, `lng`, `lat`, `coordinates`.
  - `src/lib/geojson.js`: Fixed colonizable island classification and guaranteed all 40 colonizable island types strictly use official shoreline offsets with zero synthetic fallback.
  - `scripts/rebuild_geojson_cache.js`: Synchronized official slot offsets and empty slot logic.
  - `src/app/snipe/page.js`: Added `useSearchParams` ingestion for `targetTownId` & `originTownId` and wrapped in `Suspense`.
  - `src/app/snipe/recall/page.js`: Added `useSearchParams` ingestion for `targetTownId` & `originTownId` and wrapped in `Suspense`.
  - `src/lib/traveltime.js`: Exported `calculateDistance` and `calculateTravelTimeSeconds`.
  - `src/lib/traveltime.test.js`: Added 7 new unit tests covering alpha cutout integrity, shoreline offsets definition, scaling curve precision, and travel time calculations (17/17 passing).
- **Build status**: PASS (`npm run build && prisma generate` -> 0 errors)
- **Pending issues**: None

## Quality Status
- **Build/test result**: 17/17 passing tests, 0 build/typescript errors
- **Lint status**: clean
- **Tests added/modified**: 7 new tests in `src/lib/traveltime.test.js`

## Key Decisions Made
- Used `sharp` to clamp alpha values <= 30 on `island_1.png`, eliminating square artifact.
- Resolved slot coordinates in `getTownMapCoordinates` using official shoreline offsets from `island_definitions.json`.
- Wrapped `/snipe` and `/snipe/recall` pages in `React.Suspense` for Next.js App Router build compliance.

## Artifact Index
- `d:\Dev\Web\Grepolis\.agents\worker_m1_m3_impl\progress.md` — Progress heartbeat
- `d:\Dev\Web\Grepolis\.agents\worker_m1_m3_impl\changes.md` — Detailed changes log
- `d:\Dev\Web\Grepolis\.agents\worker_m1_m3_impl\handoff.md` — 5-component handoff report
