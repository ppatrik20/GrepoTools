# Grepolis Tactical Command Suite: Comprehensive Codebase Survey (Explorer 2)

**Author:** Survey Explorer 2 (Data Models, APIs & Existing Tools)  
**Date:** 2026-09-02  
**Target Project:** `d:\Dev\Web\Grepolis`  
**Reference Request:** `d:\Dev\Web\Grepolis\.agents\ORIGINAL_REQUEST.md`

---

## Executive Summary

The Grepolis Tactical Command Suite is a modern Next.js 16 (`16.2.7`) and React 19 (`19.2.4`) application backed by Prisma ORM (`6.19.3`) and PostgreSQL / SQLite (`dev.db`). It features GPU-accelerated world map rendering via `react-map-gl/maplibre` and `maplibre-gl 5.24.0`, a specialized route planner, and an advanced military-grade Recall Sniper (`/snipe/recall`).

This report provides a complete, evidence-based investigation into the 6 key architectural facets requested:
1. **Data Models** (`prisma/schema.prisma` and TypeScript/JS interfaces)
2. **Coordinate Systems & Ocean Calculations** (pixel coordinates, staggered island offsets, MapLibre conversions, ocean math)
3. **Intel & Activity Tracking** (ghost towns, inactive players, alliance palettes, points momentum)
4. **Route Planner & Recall Sniper Architecture** (mathematical formulas, speed constants, trajectory Bézier curves, gap detection)
5. **Persistence Mechanisms** (LocalStorage schema, Prisma models, REST state endpoints)
6. **API Inventory & Server Communication** (27 REST Route Handlers, parameters, caching, data flows)

---

## 1. Data Models (`prisma/schema.prisma`)

The database schema is defined in `prisma/schema.prisma` (347 lines). It models game entities, historical telemetry, and tactical tools:

```prisma
// Summary of core models in prisma/schema.prisma
```

### 1.1 Core Entities

| Model | Primary Key | Key Attributes | Relations |
|---|---|---|---|
| **`World`** | `id` (String, e.g. `"hu119"`) | `name`, `server`, `speed` (Float, def 1.0), `unitSpeed` (Float, def 1.0), `worldType` (`"siege"` / `"revolt"`), `isActive`, `lastSync`, `geoJsonCache` (Text), `scoreboardCache` (Text), `createdAt` | 1-to-N: `Player`, `Alliance`, `Town`, `Island`, `Conquest`, `PlayerHistory`, `AllianceHistory`, `TownHistory`, `SnipeOperation`, `Report` |
| **`Island`** | `[id, worldId]` (Composite) | `x` (Int), `y` (Int), `type` (Int: 1-16, 37-60 colonizable, 999 rock), `availableTowns` (Int), `resourcePlus` (String), `resourceMinus` (String) | Belongs to `World`. Index on `[worldId, x, y]` |
| **`Town`** | `[id, worldId]` (Composite) | `name` (String), `islandX` (Int), `islandY` (Int), `islandSlot` (Int), `points` (Int), `specialization` (`"NONE"`, `"LS"`, `"BIREMES"`, etc.), Researches (`bunksResearched`, `plowResearched`, `cartographyResearched`, `mathResearched`, `hasThermalBaths`, `hasTower`, `hasLighthouse`), Building levels (`mainLevel` through `academyLevel`) | Belongs to `Player` (nullable for ghost towns), `World`. 1-to-N: `SnipeOperation` (`TargetTown`, `OriginTown`). Index on `[worldId, islandX, islandY]`, `[worldId, playerId]` |
| **`Player`** | `[id, worldId]` (Composite) | `name` (String), `points` (Int), `rank` (Int), `towns` (Int), `abp` (Attacker BP), `dbp` (Defender BP), `allBp` (Total BP) | Belongs to `Alliance` (nullable), `World`. 1-to-N: `Town` (`townsList`) |
| **`Alliance`** | `[id, worldId]` (Composite) | `name` (String), `points` (Int), `towns` (Int), `members` (Int), `rank` (Int), `abp`, `dbp`, `allBp` | Belongs to `World`. 1-to-N: `Player` |

### 1.2 Movements, Attacks & Military Operations

| Model | Primary Key | Key Attributes | Notes |
|---|---|---|---|
| **`SnipeOperation`** | `id` (UUID String) | `worldId`, `label`, `type` (`"recall"` / `"attack"` / `"support"` / `"cs"`), `worldType` (`"siege"` / `"revolt"`), `targetTownId` (Int), `originTownId` (Int), `targetReturnTime` (DateTime), `sendTime` (DateTime), `recallTime` (DateTime?), `status` (`"PENDING"`, `"COMPLETED"`, `"CANCELLED"`), `notes` (String?) | Foreign keys to `Town` (`targetTownId` & `originTownId`), `World`. Index on `[worldId, sendTime]`, `[status]` |
| **`Report`** | `id` (UUID String) | `worldId`, `originalId` (GRCT ID), `attacker`, `attackerTown`, `defender`, `defenderTown`, `date`, `morale`, `luck`, `lootedWood`, `lootedStone`, `lootedIron`, `rawText` | Ingested via GRCT scraper or manual import. |

### 1.3 Conquests & Historical Telemetry

| Model | Primary Key | Key Attributes | Notes |
|---|---|---|---|
| **`Conquest`** | `id` (Int autoincrement) | `worldId`, `townId`, `townPoints`, `oldPlayerId` (Int?), `newPlayerId` (Int?), `oldAllianceId` (Int?), `newAllianceId` (Int?), `timestamp` (DateTime) | Tracks town ownership changes over time. Index on `[worldId, timestamp]`, `[townId]` |
| **`PlayerHistory`** | `id` (Int autoincrement) | `worldId`, `playerId`, `oldPoints`, `newPoints`, `abpDelta`, `dbpDelta`, `allBpDelta`, `timestamp` | Recorded on sync when points or BP change. Index on `[worldId, playerId, timestamp]` |
| **`AllianceHistory`** | `id` (Int autoincrement) | `worldId`, `allianceId`, `oldPoints`, `newPoints`, `abpDelta`, `dbpDelta`, `allBpDelta`, `timestamp` | Recorded on sync when points or BP change. Index on `[worldId, allianceId, timestamp]` |
| **`TownHistory`** | `id` (Int autoincrement) | `worldId`, `townId`, `oldPoints`, `newPoints`, `timestamp` | Recorded on sync when town points change. Index on `[worldId, townId, timestamp]` |
| **`SyncMetadata`** | `id` (Int def 1) | `worldId`, `lastSync`, `geoJsonCache`, `scoreboardCache` | Single-row cache metadata table |

### 1.4 Game Mechanics Entities
- **`Unit`**: id, name, name_plural, speed, attack, description, costs (wood, stone, iron, favor, pop, build_time), `is_naval`, `flying`, `category`, `unit_function`, defense values (`def_hack`, `def_pierce`, `def_distance`).
- **`Building`** & **`BuildingDependency`**: Max/min levels, resource factors, population factor, build time factors.
- **`Hero`** & **`GodPower`**: Hero categories, combat modifiers, divine favor costs, targets JSON.

---

## 2. Coordinate Systems & Ocean Calculations

### 2.1 World Coordinate Grid
- **Global Grid Size**: Grepolis world maps are structured on a **1000 × 1000** tile grid ($X \in [0, 999]$, $Y \in [0, 999]$).
- **Pixel Resolution**: Each tile is $128 \times 128\text{ px}$. The entire world is $128,000 \times 128,000\text{ global pixels}$.
- **Circular World Border**: The playable world is bounded by a circle centered at $(500, 500)$ with radius $R = 250$ tiles:
  $$(X - 500)^2 + (Y - 500)^2 \le 250^2 = 62,500$$
  This corresponds to coordinates $X, Y \in [250, 750]$.

### 2.2 Island Pixel Positioning & Hexagonal Row Stagger
In Grepolis, island positions use a staggered grid where odd $X$ coordinates shift vertically by half a tile ($64\text{ px}$):
```javascript
// src/lib/geojson.js (lines 157-158)
const islandPixelX = island.x * 128;
const islandPixelY = island.y * 128 + ((island.x & 1) ? 64 : 0);
```

### 2.3 Town Slot Placement within Islands
Towns do not store absolute $(X, Y)$ coordinates in the database; they store `islandX`, `islandY`, and `islandSlot` ($0 \dots N-1$).
Exact pixel coordinates are calculated using `island_definitions.json` town offset definitions combined with directional fine offsets:
```javascript
// src/lib/geojson.js (lines 8-14, 224-230) & src/app/map/page.js (lines 84-118)
const TOWN_DIR_OFFSETS = {
  nw: { x: 9, y: 14 },
  ne: { x: 17, y: 11 },
  sw: { x: 10, y: 13 },
  se: { x: 15, y: 13 }
};
const FREE_SLOT_OFFSET = { x: 18, y: 18 };

// Coordinate computation:
const slotDef = islandDef.town_offsets[slot]; // { x, y, dir }
const dir = town.dir || slotDef.dir || 'nw';
const dirOffset = town ? TOWN_DIR_OFFSETS[dir] : FREE_SLOT_OFFSET;
const townPixelX = islandPixelX + slotDef.x + dirOffset.x;
const townPixelY = islandPixelY + slotDef.y + dirOffset.y;
```

### 2.4 MapLibre Longitude / Latitude Projection
The 2D pixel space $[0, 128000]$ (or tile space $[0, 1000]$) maps linearly to MapLibre GIS coordinate space $(\text{Lng} \in [-180, +180], \text{Lat} \in [-90, +90])$:
```javascript
// Forward Projection:
const pixelToLng = (px) => (px / 128000) * 360 - 180;
const pixelToLat = (py) => -((py / 128000) * 180 - 90);

const tileToLng = (x) => (x / 1000) * 360 - 180;
const tileToLat = (y) => -((y / 1000) * 180 - 90);

// Inverse Projection (from MapLibre cursor events):
// src/app/map/page.js lines 409-410
const gridX = Math.round(((lng + 180) / 360) * 1000);
const gridY = Math.round((90 - lat) / 0.18);
```

### 2.5 Ocean Number Calculation
The Grepolis world is partitioned into a $10 \times 10$ matrix of 100 oceans ($O00$ to $O99$), each spanning $100 \times 100$ tiles:
```javascript
// Ocean X: 0-9, Ocean Y: 0-9
const oceanX = Math.floor(x / 100);
const oceanY = Math.floor(y / 100);
const oceanLabel = `O${oceanX}${oceanY}`; // e.g. x=545, y=560 -> "O55"

// As single 2-digit integer:
const sea = oceanX * 10 + oceanY; // 55
// Reverse:
const sea_x = Math.floor(sea / 10);
const sea_y = sea % 10;
```

---

## 3. Intel & Activity Tracking

### 3.1 Ghost Towns
- **Identification**: In `prisma/schema.prisma`, `Town.playerId` is nullable. When `town.playerId === null` (or `!t.player`), the town is an unowned **Ghost Town**.
- **GeoJSON Encoding**: In `src/lib/geojson.js` (lines 200, 205), `isGhost: !t.player`, `player: 'Ghost Town'`.
- **Filtering**: In `src/app/map/page.js` (lines 237-239) and `UnifiedSearchPanel.js`, toggling `showGhostsOnly` isolates ghost towns:
  ```javascript
  towns = towns.filter(t => t.properties.isGhost || !t.properties.player || t.properties.player === 'Ghost Town');
  ```

### 3.2 Inactive Players & Activity Deltas
Activity is tracked through three mechanisms:
1. **7-Day Rolling History**:
   - `/api/world/town/[id]/route.js` (lines 29-54) and `/api/world/player/[id]/route.js` (lines 33-60) query `TownHistory` / `PlayerHistory` over the last 7 days.
   - Activity object: `{ pointDelta: newest.newPoints - oldest.oldPoints, lastActive: newest.timestamp }`.
2. **24-Hour Momentum Rolling Windows**:
   - `src/lib/constants.js` defines baseline daily reset at `01:50:00 AM local time` (`getBaselineTime()`).
   - Window A: `[baseline, now]` (current day gains).
   - Window B: `[baseline - 24h, baseline]` (previous day gains).
3. **Momentum & Trend Formulas** (`/api/world/momentum/route.js` & `src/lib/scoreboard.js`):
   - $\text{Gains} = \sum (\text{newPoints} - \text{oldPoints})$, $\text{abpDelta} = \sum \Delta\text{ABP}$, $\text{dbpDelta} = \sum \Delta\text{DBP}$.
   - $\text{Trend } (\%) = \text{round}\left(\max\left(-100, \frac{\text{Gains}_A - \text{Gains}_B}{|\text{Gains}_B|} \times 100\right)\right)$ (if $\text{Gains}_B = 0$, trend is $100\%$ if $\text{Gains}_A > 0$ else $0\%$).

### 3.3 Alliance Palette & Custom Colors
- **Default Official Palette** (`src/lib/constants.js`):
  ```javascript
  export const PALETTE = [
    "#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#f97316", 
    "#ec4899", "#eab308", "#06b6d4", "#84cc16", "#14b8a6"
  ];
  ```
- **Top 10 Alliances Color Assignment**: Top 10 alliances by town count receive `PALETTE[0..9]`.
- **Client Custom Color Override**: `src/app/map/page.js` (lines 141, 194-205, 1008-1017) provides a color picker input for each alliance, storing overrides in `customColors[allianceName] = hexColor`.

---

## 4. Route Planner & Recall Sniper Architecture

### 4.1 File Inventory
- `src/lib/traveltime.js`: Core mathematical functions, distance formulas, travel durations, recall timing algorithms.
- `src/components/map/RoutePlannerTool.js`: Floating map widget computing transit times between selected origin & target towns.
- `src/app/snipe/page.js`: Standard snipe launch queue and window countdown tracker.
- `src/app/snipe/recall/page.js`: Full Recall Sniper tool with Colony Ship (CS) gap detection, audio chirps ($T-10$ to $T-0$), dummy target search, and server time synchronization.
- `src/components/CommandCenter/DummyFinder.js`: Safe distance dummy city search component.
- `src/app/api/snipe/operations/route.js` & `[id]/route.js`: CRUD REST endpoints for persisted snipe operations.
- `src/app/api/snipe/dummy-targets/route.js`: Server-side bounding box query for safe dummy targets.

### 4.2 Distance Metrics
```javascript
// src/lib/traveltime.js lines 129-150 & src/components/map/RoutePlannerTool.js lines 27-48
export function calculateDistance(origin, target) {
  const ox = Number(origin.islandX ?? origin.x ?? 500);
  const oy = Number(origin.islandY ?? origin.y ?? 500);
  const tx = Number(target.islandX ?? target.x ?? 500);
  const ty = Number(target.islandY ?? target.y ?? 500);
  
  const islandDist = Math.sqrt(Math.pow(tx - ox, 2) + Math.pow(ty - oy, 2));

  // Same-island route (island coordinates match):
  if (islandDist < 0.01) {
    const slot1 = Number(origin.islandSlot ?? 0);
    const slot2 = Number(target.islandSlot ?? 1);
    const slotDiff = Math.abs(slot2 - slot1) || 1;
    // On-island distance scale: 2.0 to 8.0 units
    return 2.0 + slotDiff * 0.35;
  }

  return islandDist;
}
```

### 4.3 Unit Speeds & Travel Duration Formulas
**Base Unit Speeds**:
- Naval: Colony Ship (`3`), Slow Transport (`8`), Trireme (`9`), Light Ship (`13`), Bireme (`15`), Fast Transport (`15`).
- Mythical Flying: Griffin (`18`), Manticore (`22`), Harpy (`25`), Pegasus (`35`).

**Official Grepolis Travel Time Formula**:
$$\text{Duration (minutes)} = \frac{\text{Distance} \times 50}{\text{UnitSpeed} \times \text{WorldSpeed} \times \text{UnitSpeedMultiplier}}$$
$$\text{Duration (seconds)} = \max(30, \text{round}(\text{Duration (minutes)} \times 60))$$

**With Researches & Hero Buffs** (`src/lib/traveltime.js` lines 24-44):
$$\text{Multiplier} = 1.0 + (\text{Cartography } ? 0.10 : 0) + (\text{Lighthouse } ? 0.15 : 0) + \text{AtalantaLevelBuff} + \text{SpeedBuff}$$
$$\text{TravelSeconds} = 300\text{s (base delay)} + \frac{\text{Distance} \times 500}{\text{UnitSpeed} \times \text{WorldSpeed} \times \text{Multiplier}}$$

### 4.4 Recall Sniper Mathematics
In Grepolis Siege worlds, an inbound Colony Ship conquest can be defended by launching troops at an outward target and recalling them so they return immediately ($\pm 1\text{s}$) after the CS lands. The cancel window limit in Grepolis is $10\text{ minutes } (600\text{ seconds})$.

```javascript
// src/lib/traveltime.js lines 52-108
// 1. Planned Launch: Given target return time and cancel delay D (<= 600s):
sendTime = targetReturnTime - (2 * D * 1000);
recallTime = sendTime + (D * 1000);

// 2. Midpoint Recall: Given actual launch time and target return time:
// Formula: RecallTime = LaunchTime + (TargetTime - LaunchTime) / 2
const diffMs = targetReturnTime.getTime() - actualLaunchTime.getTime();
const halfDiffMs = Math.round(diffMs / 2);
const recallTime = new Date(actualLaunchTime.getTime() + halfDiffMs);
```

### 4.5 Trajectory Bézier Curve Generation
In `src/app/map/page.js` (lines 270-302), trajectories are drawn as quadratic Bézier curves:
```javascript
const midLng = (oLng + tLng) / 2;
const arcHeight = Math.max(chordLen * 0.20, Math.abs(dLng) * 0.12, 0.0008);
const midLat = (oLat + tLat) / 2 + arcHeight;

// Sample 40 points along curve:
for (let i = 0; i <= steps; i++) {
  const t = i / steps;
  const curLng = (1 - t) * (1 - t) * oLng + 2 * (1 - t) * t * midLng + t * t * tLng;
  const curLat = (1 - t) * (1 - t) * oLat + 2 * (1 - t) * t * midLat + t * t * tLat;
  points.push([curLng, curLat]);
}
```

---

## 5. User State & Persistence Mechanisms

### 5.1 Storage Breakdown

| Mechanism | Storage Scope | Specific Keys / Tables | Data Structure / Content |
|---|---|---|---|
| **LocalStorage** | Client Browser | `grepo_active_world` | String: Active world ID (e.g. `'hu119'`) |
| | | `grepo_active_player` | String: Master player name |
| | | `grepo-operations-queue_${worldId}` | Array of `{ id, label, type, targetDate, windowStart, windowEnd }` |
| | | `grepo-recall-groups_${worldId}` | Array of `{ id, name, townId, worldType, movements: [...], plans: [...] }` |
| | | `grepoPinnedPlayers_${worldId}` | Array of pinned player names on Stats page |
| | | `grepoPinnedAlliances_${worldId}` | Array of pinned alliance names on Stats page |
| **Prisma DB** | Server PostgreSQL / SQLite | `SnipeOperation` | Persisted snipe plans (`id`, `worldId`, `targetTownId`, `originTownId`, `sendTime`, `recallTime`, `status`, `notes`) |
| | | `Town` | User custom town specs (`specialization`, `bunksResearched`, `plowResearched`, `cartographyResearched`, `hasTower`, building levels) |
| | | `Report` | Saved combat reports from GRCT |
| | | `World` | `geoJsonCache`, `scoreboardCache`, `lastSync` |
| **React State** | Component In-Memory | `customColors` | Map of `{ [allianceName]: hexColor }` for map layer coloring |
| | | `highlightedPlayers` / `highlightedAlliances` | Map highlight dictionaries |
| | | `routeOrigin`, `routeTarget`, `isRouteToolActive` | Active route tool points |

---

## 6. Complete API Inventory & Route Handlers

The application uses Next.js Route Handlers (`src/app/api/**/route.js`). No `"use server"` Server Actions exist.

```
Total Route Handlers: 27
```

### 6.1 World & Map APIs

| Endpoint | Method | Params | Response Data | Caching / Headers |
|---|---|---|---|---|
| `/api/world/geojson` | `GET` | `world` | Compiled GeoJSON `FeatureCollection` with all islands, rocks, towns, empty slots | Gzip-compressed base64 from `World.geoJsonCache` if available; ETag; `s-maxage=31536000` |
| `/api/world/meta` | `GET` | `world` | `{ worldId, worldSpeed, unitSpeed, topAlliances, topPlayers, stats: { players, totalTowns, totalIslands, populatedIslands }, lastSync }` | ETag support; `s-maxage=3600` |
| `/api/world/search` | `GET` | `world`, `q` | `{ players, alliances, towns, island }`. Supports name match or coordinate queries (`X,Y`, `X Y`, `X|Y`) | Dynamic |
| `/api/world/town/[id]` | `GET` | `id`, `world` | `{ town, history, activity: { pointDelta, lastActive }, conquests }` | Dynamic |
| `/api/world/player/[id]` | `GET` | `id`, `world` | `{ player, history, activity, conquests }` | Dynamic |
| `/api/world/alliance/[id]` | `GET` | `id`, `world` | `{ alliance, members, history, activity, conquests }` | Dynamic |
| `/api/world/island` | `GET` | `world`, `x`, `y` | `{ island, towns: [...with activity], conquests }` | Dynamic |
| `/api/world/ocean/[id]` | `GET` | `id` (2-digit), `world` | `{ type: 'RawMapData', islands: [...], towns: [...] }` | `s-maxage=3600` |
| `/api/world/scoreboard` | `GET` | `world` | `{ players: { pts, abp, dbp, allbp, momentumPts, conquests, losses }, alliances: { ... }, conquests }` | Cached in `World.scoreboardCache` |
| `/api/world/momentum` | `GET` | `world`, `type` (`player`/`alliance`), `q` | Top 5 momentum search results with 24h gain deltas (`momentumPts`, `momentumAbp`, `trendPts`) | Dynamic |
| `/api/world/sync` | `POST` | `world`, `force` | Triggers full sync against Grepolis remote server files (`players.txt.gz`, `towns.txt.gz`, `conquers.txt.gz`, etc.) | Throttled to 20 min intervals |
| `/api/world/sync-cache` | `POST` | `world` | Regenerates GeoJSON and Scoreboard cache strings in `World` record | Dynamic |
| `/api/world/status` | `GET` | `world` | Current sync state, last update timestamps, record counts | Dynamic |
| `/api/world/clean` | `POST` | `world` | Purges orphaned historical records | Dynamic |
| `/api/world/history/hourly` | `GET` | `world` | Hourly history aggregates | Dynamic |
| `/api/worlds` | `GET`, `POST`, `PUT`, `DELETE` | Body / Query | List all configured game worlds, add world, update world speeds, delete world | Dynamic |

### 6.2 Player & Command Center APIs

| Endpoint | Method | Params | Response Data | Notes |
|---|---|---|---|---|
| `/api/master-player` | `GET` | `world`, `playerName`, `playerId` | `{ player, worldId, recentConquers, recentLosses }` | Returns active user player entity and owned cities |
| `/api/towns` | `GET`, `PUT` | `playerId`, `townId`, `world` | List player's towns (`GET`); update specialization, researches, building levels (`PUT`) | Persists custom player configuration |
| `/api/units` | `GET` | - | `{ success: true, units: [...] }` | All base units from `Unit` table |
| `/api/time` | `GET` | - | `{ serverTime: Date.now() }` | Used for sub-second clock drift synchronization |

### 6.3 Snipe & Tactical Operation APIs

| Endpoint | Method | Params | Response Data | Notes |
|---|---|---|---|---|
| `/api/snipe/operations` | `GET`, `POST`, `DELETE` | `world`, `targetTownId`, body | Fetch, create, or delete persisted `SnipeOperation` rows | Relates origin & target towns with planned timings |
| `/api/snipe/operations/[id]` | `PUT`, `DELETE` | `id`, body | Update operation status (`PENDING` -> `COMPLETED`) or delete | Supports direct operation lifecycle |
| `/api/snipe/dummy-targets` | `GET` | `world`, `origin_id`, `duration`, `unit_speed`, `world_speed` | Array of towns where $\text{TravelTime} \ge \text{duration}$, sorted ascending by travel time | Computes bounding box around origin to find candidate cities |

### 6.4 Intel & Verification APIs

| Endpoint | Method | Params | Response Data | Notes |
|---|---|---|---|---|
| `/api/intel/player` | `GET` | `world`, `player_id`, `player_name` | External player intel payload from Grepodata API v2 | Uses `GREPODATA_USERNAME` / `PASSWORD` in `.env` |
| `/api/intel/town` | `GET` | `world`, `town_id` | External town intel payload from Grepodata API v2 | Uses Grepodata indexer |
| `/api/scraper/grct` | `POST` | `rawText`, `world` | Parses GRCT combat report text and saves `Report` record | Parses morale, luck, losses, loot |
| `/api/admin/verify` | `POST` | Password | Administrative verification endpoint | Admin access |

---

## 7. Strategic Implications for World Map Overlays (R1-R5)

Based on the survey, here is how the new requirements connect with the existing foundation:

1. **R1 (Political & Frontline Heatmaps / Voronoi)**:
   - Town ownership (`Town.playerId`, `Player.allianceId`, `Alliance.id`, `Alliance.name`) and pixel coordinates $(\text{islandPixelX}, \text{islandPixelY})$ are already compiled in GeoJSON.
   - Top alliances are color-coded with `PALETTE` and custom colors. Voronoi cells can be computed dynamically from town coordinate points and rendered as a MapLibre GeoJSON fill/line layer.
   - Islands with multiple alliance tags (`localAllyCounts`) already identify contested multi-alliance islands.

2. **R2 (Intel Radar Overlays - Ghost Hunter, Active Siege, Inactive Farm)**:
   - **Ghost Hunter**: `isGhost: !t.player` is already in the GeoJSON and `prisma.town`. Can be enhanced with vacancy age calculated from `TownHistory` / `Conquest`.
   - **Active Siege / Contest Radar**: Supported directly by `Conquest` table (querying recent ownership transfers in the last 24-48 hours) and `SnipeOperation` (`type: 'cs'`).
   - **Inactive Farm Finder**: Supported by `/api/world/momentum` and `PlayerHistory` / `TownHistory` where 7-day point delta is low/zero and player points are $< 5000$.

3. **R3 (Animated Troop Movement & Trajectory Tracker)**:
   - Quadratic Bézier generator exists in `src/app/map/page.js` lines 270-302.
   - MapLibre animation loop using `requestAnimationFrame` can interpolate sprite positions along the curve $t \in [0, 1]$ with floating ETA countdown cards.
   - Multi-origin sniping paths can query `SnipeOperation` records where `targetTownId === selectedTown.id`.

4. **R4 (Tactical Alliance Pinboard & Operation Markers)**:
   - Can build upon the existing LocalStorage / `SnipeOperation` schema: store `{ townId, x, y, type: 'PRIMARY_TARGET' | 'BIREMES' | 'BREAK_SIEGE', priority, note }` in `localStorage` under `grepo_tactical_pins_${worldId}` or a new `TacticalPin` Prisma model.
   - One-click export to `/snipe?targetTownId=...&originTownId=...` and `/snipe/recall?targetTownId=...` is already supported by existing URL search param ingestion.

5. **R5 (Interactive Minimap Radar Widget)**:
   - World is bounded $[250, 750]$ ($500 \times 500$ playable area).
   - A $200 \times 200\text{ px}$ Canvas/SVG radar widget can render all island dots from GeoJSON and overlay an interactive viewport polygon calculated from `mapRef.current.getBounds()`. Clicking converts canvas $(X, Y)$ to map $(\text{Lng}, \text{Lat})$ and triggers `mapRef.current.flyTo()`.

---

## Conclusion

The Grepolis codebase provides an exceptionally well-structured, performant architecture. The coordinate system, data models, speed calculators, GeoJSON generator, and API routes are cleanly designed and ready for the implementation of the Next-Generation Tactical Command Suite.
