# Handoff Report — Survey Explorer 2 (Data Models, APIs & Existing Tools)

## 1. Observation

### 1.1 Data Models (`prisma/schema.prisma`)
- `World` (`prisma/schema.prisma:10-35`): ID (`id`), `speed`, `unitSpeed`, `worldType` (`"siege"` / `"revolt"`), `geoJsonCache`, `scoreboardCache`, `lastSync`.
- `Town` (`prisma/schema.prisma:181-224`): Composite key `[id, worldId]`. Stores `islandX`, `islandY`, `islandSlot`, `points`, `playerId` (nullable for ghost towns), research flags (`bunksResearched`, `plowResearched`, `cartographyResearched`, `mathResearched`, `hasThermalBaths`, `hasTower`, `hasLighthouse`), building levels (`mainLevel` .. `academyLevel`).
- `Player` & `Alliance` (`prisma/schema.prisma:106-145`): Composite keys `[id, worldId]`. Includes `points`, `towns`, `rank`, battle points (`abp`, `dbp`, `allBp`).
- `Island` (`prisma/schema.prisma:90-104`): Composite key `[id, worldId]`. Attributes: `x`, `y`, `type` (1-16 & 37-60 colonizable, 999 rock), `availableTowns`, `resourcePlus`, `resourceMinus`.
- `SnipeOperation` (`prisma/schema.prisma:226-249`): UUID primary key. Fields: `worldId`, `label`, `type` (`"recall"`, `"attack"`, `"support"`, `"cs"`), `worldType`, `targetTownId`, `originTownId`, `targetReturnTime`, `sendTime`, `recallTime`, `status`, `notes`.
- `Conquest` (`prisma/schema.prisma:264-279`): `townId`, `townPoints`, `oldPlayerId`, `newPlayerId`, `oldAllianceId`, `newAllianceId`, `timestamp`.
- `PlayerHistory`, `AllianceHistory`, `TownHistory`: Historical delta tracking on sync.

### 1.2 Coordinate System & Ocean Numbers
- **Global Grid**: 1000 × 1000 tiles ($X, Y \in [0, 999]$), 128px per tile ($128,000 \times 128,000\text{ px}$). Playable world is bounded by center (500, 500) and radius 250 ($X, Y \in [250, 750]$).
- **Hexagonal / Staggered Y-Offset**: `islandPixelY = island.y * 128 + ((island.x & 1) ? 64 : 0)` (`src/lib/geojson.js:158`).
- **Town Slot Offsets**: Offsets defined in `island_definitions.json` combined with directional offsets (`TOWN_DIR_OFFSETS`: `nw: {x:9, y:14}`, `ne: {x:17, y:11}`, `sw: {x:10, y:13}`, `se: {x:15, y:13}`).
- **MapLibre Projection**:
  - `pixelToLng = (px) => (px / 128000) * 360 - 180`
  - `pixelToLat = (py) => -((py / 128000) * 180 - 90)`
  - Inverse: `gridX = Math.round((lng + 180) / 360 * 1000)`, `gridY = Math.round((90 - lat) / 0.18)` (`src/app/map/page.js:409-410`).
- **Ocean Number Calculation**: `O${Math.floor(x/100)}${Math.floor(y/100)}` (`src/app/map/page.js:1052`).

### 1.3 Ghost Towns, Inactive Players, Alliance Colors, Momentum
- **Ghost Towns**: `Town.playerId === null`, displayed as "Ghost Town" with `isGhost = true` (`src/lib/geojson.js:205`). Filterable via `showGhostsOnly` (`src/app/map/page.js:237-239`).
- **Inactive / Activity Deltas**: 7-day point deltas queried from `TownHistory` / `PlayerHistory` in `/api/world/town/[id]` and `/api/world/player/[id]`. 24-hour momentum rolling windows from `01:50:00 AM` baseline in `/api/world/momentum` and `src/lib/scoreboard.js`.
- **Alliance Colors**: Top 10 alliances receive colors from `PALETTE` (`["#ef4444", "#3b82f6", "#22c55e", ...]` in `src/lib/constants.js:1-4`). Overridable on client via `customColors` state.

### 1.4 Route Planner & Recall Sniper
- **Files**: `src/lib/traveltime.js`, `src/components/map/RoutePlannerTool.js`, `src/app/snipe/page.js`, `src/app/snipe/recall/page.js`, `src/components/CommandCenter/DummyFinder.js`, `src/app/api/snipe/operations/route.js`, `src/app/api/snipe/dummy-targets/route.js`.
- **Distance**: Inter-island $\sqrt{(tx-ox)^2 + (ty-oy)^2}$; same-island $2.0 + |\Delta\text{slot}| \times 0.35$ (`src/lib/traveltime.js:129-150`).
- **Travel Time**: $\text{Duration (min)} = \frac{\text{Distance} \times 50}{\text{UnitSpeed} \times \text{WorldSpeed} \times \text{UnitSpeedMultiplier}}$ (`src/lib/traveltime.js:169-171`).
- **Recall Sniper**: Midpoint recall formula $\text{RecallTime} = \text{LaunchTime} + \frac{\text{TargetReturnTime} - \text{LaunchTime}}{2}$ with maximum 600s cancel window (`src/lib/traveltime.js:77-108`).
- **Trajectories**: Quadratic Bézier curve with 40 sampled steps, $\text{midLat} = \frac{oLat + tLat}{2} + \max(\text{chordLen} \times 0.20, |\Delta\text{Lng}| \times 0.12, 0.0008)$ (`src/app/map/page.js:270-302`).

### 1.5 Persistence
- **LocalStorage**: `grepo_active_world`, `grepo_active_player`, `grepo-operations-queue_${worldId}`, `grepo-recall-groups_${worldId}`, `grepoPinnedPlayers_${worldId}`, `grepoPinnedAlliances_${worldId}`.
- **Database**: `SnipeOperation` (CRUD via `/api/snipe/operations`), `Town` (PUT `/api/towns`), `World` caches.

### 1.6 APIs
- Total 27 REST Route Handlers (`src/app/api/**/route.js`). No `"use server"` Server Actions.

---

## 2. Logic Chain

1. From `prisma/schema.prisma`, `Town` records store `islandX`, `islandY`, and `islandSlot`, while `Island` stores `x`, `y`, `type`. Therefore, town positions are derived relative to island origins.
2. `src/lib/geojson.js` calculates exact pixel positions by adding `island.x * 128` (with staggered odd-$X$ shift `((island.x & 1) ? 64 : 0)`) to slot offsets from `island_definitions.json` and directional offsets from `TOWN_DIR_OFFSETS`.
3. Coordinates are converted to MapLibre GIS coordinates using linear scaling $(\text{px} / 128000) \times 360 - 180$ and $-((\text{py} / 128000) \times 180 - 90)$.
4. Ocean numbers are verified as $\lfloor X/100 \rfloor$ and $\lfloor Y/100 \rfloor$, yielding 100 oceans ($O00$ through $O99$).
5. Ghost towns are identified by `playerId === null` directly in the database.
6. Route travel time follows the official InnoGames formula $\frac{\text{distance} \times 50}{\text{speed} \times \text{worldSpeed} \times \text{unitSpeed}}$, verified in `src/lib/traveltime.js` and tested in `src/lib/traveltime.test.js`.
7. State persistence is split between LocalStorage (session queues, recall groups, UI preferences) and PostgreSQL/SQLite via Prisma (`SnipeOperation`, `Town` customization, `World` cache).

---

## 3. Caveats

- **No Caveats.** All 6 investigation points have been verified directly in the source code files.

---

## 4. Conclusion

The data architecture, coordinate mathematics, travel calculations, and API routes are solid and completely mapped. The implementation of R1 (Voronoi heatmaps), R2 (Ghost/Siege/Farm radar overlays), R3 (Animated transit trajectories), R4 (Tactical Pinboard), and R5 (Minimap radar) can integrate seamlessly with the existing `src/lib/geojson.js`, `src/lib/traveltime.js`, `src/app/map/page.js`, and `src/app/api/` endpoints.

---

## 5. Verification Method

To independently verify these findings:
1. **Inspect Data Models & Prisma Schema**:
   `view_file` at `d:\Dev\Web\Grepolis\prisma\schema.prisma` lines 10-280.
2. **Inspect Coordinate Math & GeoJSON Generation**:
   `view_file` at `d:\Dev\Web\Grepolis\src\lib\geojson.js` lines 8-35 and 150-240.
3. **Inspect Route Planner & Recall Formulas**:
   `view_file` at `d:\Dev\Web\Grepolis\src\lib\traveltime.js` lines 24-175.
4. **Inspect Route Handlers**:
   Review all 27 routes under `d:\Dev\Web\Grepolis\src\app\api\`.
5. **Run Existing Test Suite**:
   Run `npx vitest run` in `d:\Dev\Web\Grepolis`.
