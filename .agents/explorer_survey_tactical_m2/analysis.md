# Requirement R2: Tactical Command Suite & Search Investigation Analysis

**Explorer**: Explorer 2 (Tactical Command Suite & Search)  
**Date**: 2026-08-30  
**Scope**: In-Map Tactical & Intelligence Command Suite (Requirement R2)

---

## Executive Summary

The Grepolis World Map Tactical Command Suite & Search feature set has been thoroughly investigated across the frontend (`src/components/map/`, `src/app/map/`, `src/components/`) and backend API routes (`src/app/api/world/`).

The architecture consists of:
1. **`UnifiedSearchPanel`** (`src/components/map/UnifiedSearchPanel.js`): Floating top-center search bar with instant categorized autocomplete (Players, Alliances, Towns, Coordinates e.g. `503, 479`) and full keyboard navigation (`Ctrl+K`, `ArrowUp`, `ArrowDown`, `Enter`, `Escape`).
2. **`CommandDrawer`** (`src/components/map/CommandDrawer.js`): Sliding glassmorphic intelligence drawer anchored to the right side of the screen (`width: 420px`), allowing full simultaneous interactivity with the MapLibre canvas on the left.
3. **`DeepDiveModal` & `IslandModal`** (`src/components/DeepDiveModal.js`, `src/components/IslandModal.js`): Deep intelligence views providing 7-day momentum charts (Recharts `AreaChart`/`BarChart`), conquest history logs, and island dominance distributions.
4. **Data Normalization & Nested Object Protection**: Standardized via `normalizeTownData` (`src/components/map/UnifiedSearchPanel.js:6-28`) and defensive string coercion to eliminate all React child object crashes.

---

## 1. Search Bar Component (`UnifiedSearchPanel.js`)

### 1.1 UI Location & Placement
- **Location**: Mounted floating at the top-center of the map viewport.
- **Source Reference**: `src/app/map/page.js:309-320`:
  ```jsx
  {/* Top Floating Unified Search & Action Bar */}
  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center justify-center">
    <UnifiedSearchPanel
      worldId={activeWorldId}
      onSelectResult={handleSelectSearchResult}
      onToggleGhosts={() => setShowGhostsOnly(prev => !prev)}
      showGhostsOnly={showGhostsOnly}
      onToggleRouteTool={() => setIsRouteToolActive(prev => !prev)}
      isRouteToolActive={isRouteToolActive}
      onToggleEmptySlots={() => setShowEmptySlots(prev => !prev)}
      showEmptySlots={showEmptySlots}
    />
  </div>
  ```
- **Integrated Action Toolbar**: In addition to the search input, the floating bar embeds quick tactical filter toggles:
  - **`Ghosts` button**: Toggles ghost-town-only filter overlay on map.
  - **`Slots` button**: Toggles empty colonization slot markers on map.
  - **`Route` button**: Activates/deactivates the floating Naval & Mythical Troop Route Planner tool.

### 1.2 Autocomplete & Multi-Entity Search Mechanics
- **Debounce**: 200ms debounce timer triggers search when input has $\ge 2$ characters (`UnifiedSearchPanel.js:107-131`).
- **Backend API**: `GET /api/world/search?world=${worldId}&q=${query}` (`src/app/api/world/search/route.js`).
- **Coordinate Parsing**:
  - Regular expression `const coordMatch = q.match(/^(\d{1,4})[,\s|]+(\d{1,4})$/);` matches inputs like `503, 479`, `503 479`, `503|479`.
  - When matched, executes `prisma.island.findFirst({ where: { worldId, x, y } })` and returns `island: matchedIsland`.
- **Entity Queries**:
  - **Players**: `prisma.player.findMany` with case-insensitive `contains: q`, limit 8 (returns `id`, `name`, `points`, `rank`, `abp`, `dbp`, `allBp`, `alliance`).
  - **Alliances**: `prisma.alliance.findMany` with case-insensitive `contains: q`, limit 8 (returns `id`, `name`, `points`, `rank`, `towns`, `members`, `abp`, `dbp`).
  - **Towns**: `prisma.town.findMany` with case-insensitive `contains: q`, limit 8 (returns `id`, `name`, `points`, `islandX`, `islandY`, `islandSlot`, `player`).

### 1.3 Flattening & Categorized Result Presentation
- `flatItems` memo array (`UnifiedSearchPanel.js:49-65`) unifies all result categories into a single ordered list:
  1. **Islands**: Rendered with `MapPin` icon, coordinates `(x, y)`, island type, resource buffs `+buff/-debuff`, and a `Jump to Island` badge.
  2. **Towns**: Rendered with `Castle` icon, town name, points, coordinates, slot number, player name, and alliance name.
  3. **Players**: Rendered with `Trophy` icon, player name, rank, total points, total battle points (BP), and alliance affiliation.
  4. **Alliances**: Rendered with `Users` icon, alliance name, rank, member count, total cities, and total points.

### 1.4 Selection Handlers
- Selecting a search result triggers `handleSelectSearchResult(type, item)` in `src/app/map/page.js:261-297`:
  - **Island**: Map executes `mapRef.current.flyTo({ center: [targetLng, targetLat], zoom: 9.2 })` and opens `CommandDrawer` with `{ type: 'island', data: item }`.
  - **Town**: Map flies to town location at zoom 9.2, normalizes data, and opens `CommandDrawer` with `{ type: 'town', data: norm }`. If Route Planner is active, assigns origin/target.
  - **Player**: Opens `CommandDrawer` with `{ type: 'player', data: item }` and highlights the player's towns across the map in amber (`#f59e0b`).
  - **Alliance**: Opens `CommandDrawer` with `{ type: 'alliance', data: item }` and highlights all alliance towns across the map in purple (`#8b5cf6`).

---

## 2. Keyboard Navigation Mechanics

The search bar provides complete keyboard navigation complying with accessible modal/combobox interaction standards:

| Key / Shortcut | Behavior | Code Reference |
|---|---|---|
| **`Ctrl+K` / `Cmd+K`** | Global window shortcut. Focuses search input from anywhere on the page. | `UnifiedSearchPanel.js:72-81` |
| **`ArrowDown`** | Increments highlighted item index with wrap-around `(prev + 1) % flatItems.length`. Reopens dropdown if closed. | `UnifiedSearchPanel.js:90-92` |
| **`ArrowUp`** | Decrements highlighted item index with wrap-around `(prev - 1 + flatItems.length) % flatItems.length`. | `UnifiedSearchPanel.js:93-95` |
| **`Enter`** | Selects currently highlighted item `flatItems[selectedIndex]` and executes selection action without page reload. | `UnifiedSearchPanel.js:96-101` |
| **`Escape`** | Closes the dropdown results list. | `UnifiedSearchPanel.js:102-104` |
| **`Click Outside`** | Dismisses dropdown via document mousedown listener. | `UnifiedSearchPanel.js:134-143` |
| **`Focus`** | Reopens dropdown if results exist. | `UnifiedSearchPanel.js:171` |

Visual feedback is provided via active highlighting classes on each result card (e.g. `bg-primary/25 border-primary/50` for islands, `bg-emerald-500/20` for towns, `bg-amber-500/20` for players, `bg-purple-500/20` for alliances).

---

## 3. CommandDrawer Component (`CommandDrawer.js`)

### 3.1 Positioning & Map Canvas Interactivity
- **Location**: `src/components/map/CommandDrawer.js`.
- **CSS Layout**:
  ```jsx
  className="glass-panel fixed top-16 right-0 bottom-0 z-50 flex flex-col bg-slate-900/95 border-l border-slate-700/80 shadow-2xl backdrop-blur-xl animate-slide-left transition-all"
  style={{ width: '420px', maxWidth: '100vw' }}
  ```
- **Interactivity Mechanism**:
  - The drawer is anchored exclusively to the right 420px of the viewport.
  - Unlike blocking modals, there is **no full-screen backdrop overlay** (`pointer-events: none` on ambient area).
  - The MapLibre WebGL canvas remains fully interactive on the remaining viewport area: users can pan, drag, zoom, inspect tooltips, and click other entities on the map.
  - Clicking any other town or island on the MapLibre canvas immediately updates `selectedEntity` in `src/app/map/page.js:377-413`, updating the open CommandDrawer content in real-time.
  - Header controls: Close (`X`) dismisses the drawer, while Maximize (`Maximize2`) promotes the entity to the full deep-dive intelligence modal (`DeepDiveModal` or `IslandModal`).

---

## 4. Data Structures & Statistical Visualizations

`CommandDrawer` renders customized tactical dashboards for each entity type:

### 4.1 Town View
- **Evolution Stages**: Evaluated via `getStageName(town.points)`:
  - $< 600$ pts: `Stage 1 • Hamlet`
  - $600 - 2,399$ pts: `Stage 2 • Village`
  - $2,400 - 5,499$ pts: `Stage 3 • Town`
  - $5,500 - 9,999$ pts: `Stage 4 • City`
  - $\ge 10,000$ pts: `Stage 5 • Metropolis`
- **Coordinates & Slot**: `({town.islandX}, {town.islandY}) • Slot #{town.islandSlot}`.
- **Relational Links**: Clickable player and alliance labels that seamlessly switch the drawer entity to the clicked player or alliance.
- **Tactical Actions**:
  - `Set as Origin`: Populates origin in `RoutePlannerTool`.
  - `Set as Target`: Populates target in `RoutePlannerTool`.
  - `Copy Town BB-Code`: One-click copy `[town]id[/town]` to clipboard.

### 4.2 Island View
- **Colonization & Slot Distribution**: Displays `colonizedCount / (availableTowns + colonizedCount) Cities` (e.g., `14 / 20 Cities`).
- **Resource Modifiers**: Dynamic indicators for `+resourcePlus / -resourceMinus` (e.g., `+Silver / -Wood`).
- **Island City Directory**: Scrollable list of all colonized towns on the island with slot index, points, player, and alliance badges. Clicking any town transitions the drawer to that town.
- **BB-Code**: Copy `[island]x|y[/island]` BB-Code.

### 4.3 Player View
- **KPIs**: World Rank (`#rank`), Total Cities (`towns.length`).
- **Battle Points (BP)**: Attack BP (`ABP` with swords icon) and Defense BP (`DBP` with shield icon).
- **Top Cities**: Ranked list of player's top 15 cities with point scores and direct town selection links.

### 4.4 Alliance View
- **KPIs**: Alliance Rank, Member Count, Total Cities.
- **Top Members**: Ranked list of top 15 players in the alliance with point scores and direct player selection links.

### 4.5 Momentum Charts & 7-Day History
- **Backend Endpoints**:
  - `/api/world/town/[id]`: Returns `{ town, history, activity, conquests }`.
  - `/api/world/player/[id]`: Returns `{ player, history, activity, conquests }`.
  - `/api/world/alliance/[id]`: Returns `{ alliance, history, activity, conquests }`.
  - `/api/world/island`: Returns `{ island, towns, conquests }` with per-town 7-day activity delta.
- **DeepDiveModal Chart Suite** (`src/components/DeepDiveModal.js:177-247`):
  - Toggle between **Total Curve** (Recharts `AreaChart` with linear gradient) and **Daily Gains** (Recharts `BarChart` with daily delta bars).
  - Conquest History & Log: chronological ledger with color-coded status badges (`TRANSFERRED`, `CONQUERED`, `LOST`), old/new player mappings, and timestamps.
- **Island Territorial Dominance** (`src/components/IslandModal.js:129-161`):
  - Dynamic multi-segment percentage bar chart showing island market share by alliance.

---

## 5. Nested Object Safety Analysis

### 5.1 The Root Problem in React Child Rendering
In Next.js / React, passing a non-primitive object (such as `{ id: 123, name: 'Alpha' }`) directly into JSX expressions (`<div>{town.player}</div>`) causes a fatal runtime crash:
```
Error: Objects are not valid as a React child (found: object with keys {id, name, alliance}).
If you meant to render a collection of children, use an array instead.
```

In Grepolis data models, `player` and `alliance` properties appear in different formats across different sources:
1. **Prisma relational queries**: `town.player` is `{ id, name, alliance: { id, name } }`.
2. **GeoJSON features**: `properties.player` is string `'Ghost Town'` or `'PlayerName'`.
3. **Search API results**: `town.player` is nested object, while `player.alliance` is `{ id, name }`.
4. **Conquest logs**: `conquest.oldPlayerObj` is `{ id, name }` or `null`.

### 5.2 Codebase Normalization & Defense
The codebase employs a robust multi-tiered sanitization architecture:

1. **`normalizeTownData(rawTown)`** (`src/components/map/UnifiedSearchPanel.js:6-28`):
   ```javascript
   export function normalizeTownData(rawTown) {
     if (!rawTown) return null;
     const pName = typeof rawTown.player === 'object' ? rawTown.player?.name : (rawTown.player || 'Ghost Town');
     const aName = typeof rawTown.player === 'object' 
       ? rawTown.player?.alliance?.name 
       : (typeof rawTown.alliance === 'object' ? rawTown.alliance?.name : (rawTown.alliance || 'None'));
     
     return {
       id: rawTown.id,
       name: rawTown.name || `Town #${rawTown.id}`,
       points: Number(rawTown.points || rawTown.pts || 0),
       islandX: Number(rawTown.islandX ?? rawTown.x ?? 500),
       islandY: Number(rawTown.islandY ?? rawTown.y ?? 500),
       islandSlot: Number(rawTown.islandSlot ?? rawTown.slot ?? 0),
       player: pName || 'Ghost Town',
       playerId: typeof rawTown.player === 'object' ? rawTown.player?.id : (rawTown.playerId || null),
       alliance: aName || 'None',
       allianceId: typeof rawTown.player === 'object' ? rawTown.player?.alliance?.id : (rawTown.allianceId || null),
       stage: rawTown.stage || 1,
       townColor: rawTown.townColor || '#94a3b8',
       isGhost: !pName || pName === 'Ghost Town'
     };
   }
   ```
2. **Applied at All Ingestion Points**:
   - `src/app/map/page.js:272` (`handleSelectSearchResult`): `normalizeTownData(item)`
   - `src/app/map/page.js:397` (Map click listener): `normalizeTownData(p)`
   - `src/components/map/UnifiedSearchPanel.js:56`: `normalizeTownData(t)`
   - `src/components/map/CommandDrawer.js:71`: `normalizeTownData(entity.data)`
   - `src/components/map/CommandDrawer.js:232`: `normalizeTownData(t)` for island town lists
   - `src/components/map/CommandDrawer.js:298`: `normalizeTownData(t)` for player town lists
3. **Defensive String Accessors in Modals**:
   - `DeepDiveModal.js:59-74`: `getPlayerName()` and `getAllianceName()` safely extract `.name` strings whether the entity is a player object, town object, or string.
   - `IslandModal.js:178-208`: Converts raw town/player records into flat payload objects with explicit primitive string properties before passing to callback handlers.
   - `DeepDiveModal.js:277`: Conquest logs render `c.oldPlayerObj?.name || 'Ghost'` instead of the raw player object.

A complete codebase grep audit confirmed that **zero raw object child expressions exist** in JSX rendering.

---

## 6. Architecture & Data Flow Summary

```
User Input / Keyboard (Ctrl+K, Up/Down, Enter)
      │
      ▼
UnifiedSearchPanel (Floating Top-Center)
      │──> /api/world/search (Debounced 200ms)
      │       ├── Coordinates -> prisma.island.findFirst
      │       ├── Players     -> prisma.player.findMany
      │       ├── Alliances   -> prisma.alliance.findMany
      │       └── Towns       -> prisma.town.findMany
      │
      ▼
normalizeTownData() -> Sanitizes nested player/alliance objects into flat primitives
      │
      ├──> FlyTo Location on MapLibre Canvas (center, zoom 9.2)
      │
      └──> Open CommandDrawer (Fixed Right, 420px, Map remains 100% interactive)
              ├── Town View: Evolution Stage, Coordinates, BB-Code, Route Actions
              ├── Island View: Slot Capacity, Resource Buffs, City List
              ├── Player View: Rank, Total Cities, Battle Points (ABP/DBP), City List
              ├── Alliance View: Rank, Members, Cities, Member List
              │
              └── Maximize2 -> DeepDiveModal (7-Day Area/Bar Momentum Charts, Conquest Log)
```
