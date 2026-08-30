# Project: Next-Generation Grepolis World Map & Command Center

## Architecture
- **Framework**: Next.js 16 (App Router, React 19, Turbopack, TailwindCSS 4)
- **Map Engine**: MapLibre GL with WebGL multi-LOD layers and GeoJSON clustering
- **Database & ORM**: SQLite / Prisma ORM with live Grepolis world synchronization
- **State Management**: AppContext with dynamic world settings (speed, unitSpeed)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 40 Island Terrain Types | All 40 colonizable island sprites (`island_1`–`island_16`, `island_37`–`island_60`) loaded in MapLibre | M1 | R1 |
| 2 | Town Growth Stages & Empty Slots | 5 town stage models (`town_1`–`town_5`) and `empty_slot` sprites with 0 alpha noise | M1 | R1 |
| 3 | Alpha Cutout Cleanup | Clean `island_1.png` background noise to eliminate square box artifact | M1 | R1 |
| 4 | Shoreline Bay Alignment | Position all towns on 578 official shoreline offsets in `island_definitions.json`, eliminate synthetic ring fallback | M1 | R1 |
| 5 | Calibrated Proportion Scaling | Scale island sprites with physical curve $0.007 \times 2^Z$ across zoom levels 5 to 12 | M1 | R1 |
| 6 | Multi-LOD Layer Stack | Clusters (z2–5.5), 4K landmasses (z>=5.0), 3D town models (z>=6.5), alliance flags (z>=6.8), town labels (z>=8.5) | M1 | R4 |
| 7 | Floating Categorized Search Bar | Instant search with autocomplete for Players, Alliances, Towns, Coordinates (`503, 479`) | M2 | R2 |
| 8 | Full Keyboard Navigation | `Ctrl+K` focus, `ArrowUp`/`ArrowDown` cycling with wrap-around, `Enter` select, `Escape` dismiss | M2 | R2 |
| 9 | Sliding CommandDrawer | Right-docked glassmorphic drawer (`420px`) preserving 100% MapLibre map interactivity | M2 | R2 |
| 10 | Safe Object Rendering | `normalizeTownData` sanitizes relational player/alliance objects into primitive strings | M2 | R2 |
| 11 | Real-Time Troop Route Calculator | Speeds for naval fleet units (6 types) and flying mythical units (4 types) scaled by active world speed | M3 | R3 |
| 12 | Same-Island Transit Times | Slot separation formula ($2.0 + \Delta\text{slot} \times 0.35$) producing realistic 2–30+ min transit | M3 | R3 |
| 13 | Inter-Island Euclidean Travel Times | Grepolis formula $\frac{\text{Distance} \times 50}{\text{Unit Speed} \times \text{World Speed}}$ | M3 | R3 |
| 14 | Arcing Trajectory Visualization | 40-step quadratic Bézier dashed cyan curve with glow aura on MapLibre | M3 | R3 |
| 15 | Recall Sniper (`/snipe`) Integration | One-click navigation and query param ingestion (`targetTownId`, `originTownId`) in `/snipe` and `/snipe/recall` | M3 | R3 |
| 16 | Zero Error Production Build | `npm run build && prisma generate` passes with 0 TypeScript/Next.js errors | M4 | R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Asset Pipeline, Terrain Alignment & LOD Stack (R1, R4) | Alpha cleanup for `island_1.png`, $0.007 \times 2^Z$ scaling curve, shoreline bay slot alignment in `geojson.js`, multi-LOD layers validation | none | DONE |
| 2 | Tactical Command Suite & Search (R2) | Unified search bar autocomplete, keyboard shortcuts (`Ctrl+K`, arrows, enter, esc), CommandDrawer interactivity & safety | none | DONE |
| 3 | Route Planner, Trajectory & Sniper Linkage (R3) | Unit speeds, same-island & inter-island formulas, trajectory line, `/snipe` URL parameter ingestion | none | DONE |
| 4 | Integration, E2E Verification & Forensic Audit (R5) | Full build check (`npm run build && prisma generate`), vitest test suite, adversarial testing & integrity audit | M1, M2, M3 | DONE |

## Interface Contracts
- **MapLibre Layer IDs**: `islands-points`, `rocks-points`, `clusters`, `cluster-count`, `island-sprites`, `town-sprites`, `empty-slots-sprites`, `town-flags`, `town-labels`, `route-line`, `route-line-glow`.
- **Search API**: `/api/world/search?world={worldId}&q={query}` returns `{ players: [], alliances: [], towns: [], islands: [] }`.
- **Sniper Link Contract**: `/snipe?targetTownId={id}&originTownId={id}` and `/snipe/recall?targetTownId={id}&originTownId={id}` automatically consumes parameters into form state.
- **Scaling Contract**: Island icon-size expression: `['interpolate', ['exponential', 2], ['zoom'], 5, 0.224, 6, 0.448, 7, 0.896, 8, 1.792, 9, 3.584, 10, 7.168, 11, 14.336, 12, 28.672]`.
