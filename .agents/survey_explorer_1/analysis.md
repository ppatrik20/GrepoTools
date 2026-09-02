# Architecture & Map Stack Survey Report

**Explorer**: Survey Explorer 1 (Codebase Architecture & Map Stack)  
**Date**: 2026-09-02  
**Target Repository**: `d:\Dev\Web\Grepolis`  
**Focus**: Next-Generation Grepolis World Map Stack, Architecture, Layering, State Management, UI/Styling, Build Toolchain, and Performance.

---

## Executive Summary

The Grepolis tactical web application is built on **Next.js 16.2.7 (App Router)** with **React 19.2.4**, **Tailwind CSS 4**, and **Prisma ORM (SQLite)**. The map viewer is powered by **MapLibre GL JS v5.24.0** wrapped in **React-Map-GL v8.1.1**, rendering a 128,000 x 128,000 pixel virtual world projection through a multi-tier WebGL Level-of-Detail (LOD) pipeline with GeoJSON clustering, sprite atlas preloading, and server-side gzip caching.

---

## 1. Map Library & Versioning

| Component | Library / Package | Version | Import / Usage Path |
|---|---|---|---|
| **Core Map Engine** | `maplibre-gl` | `^5.24.0` | `import maplibregl from "maplibre-gl"` (src/app/map/page.js:5) |
| **React Binding** | `react-map-gl/maplibre` | `^8.1.1` | `import Map, { Source, Layer, Popup } from "react-map-gl/maplibre"` (src/app/map/page.js:4) |
| **Styling CSS** | MapLibre CSS | `5.24.0` | `import "maplibre-gl/dist/maplibre-gl.css"` (src/app/map/page.js:6) |
| **Glyphs / Fonts** | Protomaps PBF Fontstack | Basemaps Assets | `https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf` (src/app/map/page.js:23) |
| **Legacy Reference Scripts** | Pure Canvas/jQuery | Legacy Grepolis Client | `src/lib/map/js/` (map.js, minimap.js, map_tile_renderer.js, map_movements.js) |

The map runs in pure WebGL mode on a custom dark base style (`#0b101e`) without external vector tile server dependencies.

---

## 2. Component Layout & Directory Structure

```
d:\Dev\Web\Grepolis/
├── src/
│   ├── app/
│   │   ├── layout.js                      # RootLayout with AppContextProvider & Navigation
│   │   ├── globals.css                    # Tailwind 4 CSS + custom glassmorphic design system
│   │   ├── map/
│   │   │   ├── layout.js                  # MapLayout (force-dynamic)
│   │   │   └── page.js                    # Main WorldMap component (MapLibre viewport & layer stack)
│   │   ├── planner/page.js                # Route planner view
│   │   ├── snipe/page.js                  # CS Landing Sniper
│   │   ├── snipe/recall/page.js           # Recall Sniper
│   │   └── api/
│   │       ├── world/geojson/route.js     # Gzip-cached GeoJSON FeatureCollection endpoint
│   │       ├── world/meta/route.js        # World metadata, stats, top players/alliances
│   │       ├── world/search/route.js      # Unified search endpoint (players, alliances, towns, coords)
│   │       ├── world/town/[id]/route.js   # Single town intelligence data
│   │       └── worlds/route.js            # Active world listing
│   ├── components/
│   │   ├── Navigation.js                  # Global top navigation bar
│   │   ├── IslandModal.js                 # Full island detailed drilldown modal
│   │   ├── DeepDiveModal.js               # Full player/alliance intelligence modal
│   │   └── map/
│   │       ├── CommandDrawer.js           # 420px sliding glassmorphic intelligence drawer
│   │       ├── RoutePlannerTool.js        # Bottom floating naval & mythical flight time calculator
│   │       └── UnifiedSearchPanel.js      # Top floating search bar with autocomplete & toggles
│   ├── context/
│   │   └── AppContext.js                  # Global AppContext (activeWorldId, activePlayer, masterData)
│   └── lib/
│       ├── constants.js                   # Alliance PALETTE hex colors (10 colors)
│       ├── geojson.js                     # generateGeoJSON: town stages, slot math, concentric origins
│       ├── traveltime.js                  # Distance, flight formulas, recall sniping calculations
│       └── map/
│           ├── assetLoader.js             # registerMapAssets: preloads 40 island PNGs + 5 town stages
│           ├── island_definitions.json    # Official 578 shoreline offset coordinates (x, y, dir)
│           └── alignment_metadata.json    # Concentric center offsets per island type
```

---

## 3. Map Layers, Markers, Ocean Lines & Overlays

### Virtual World Geometry & Projection
- Grepolis maps are a discrete grid of **1000 x 1000 tiles**. Each tile is 128x128 pixels, yielding a **128,000 x 128,000 global pixel plane**.
- Hexagonal/staggered Y-offset: Odd X columns are offset down by 64 pixels (`(island.x & 1) ? 64 : 0`).
- Projection equations (`pixelToLng` / `pixelToLat` in `src/lib/geojson.js:17-18`):
  - Lng = (x_pixel / 128000) * 360 - 180
  - Lat = -((y_pixel / 128000) * 180 - 90)
- Clamped MapLibre `maxBounds` restrict navigation to active world territory (coordinates 250 to 750).

### WebGL Multi-LOD Layer Hierarchy (`src/app/map/page.js`)

| Layer ID | Source | Type | Zoom Range | Visual Representation |
|---|---|---|---|---|
| `ocean-lines` | `ocean-grid-source` | `line` | All | Dashed lines (`#1e293b`) marking 100x100 tile ocean sector boundaries |
| `ocean-labels` | `ocean-grid-source` | `symbol` | All | Ocean sector text designations (`O44`, `O54`, `O55`) |
| `route-line-glow` | `route-line-source` | `line` | Active Route | 6px blurred cyan (#38bdf8) outer aura along 40-step quadratic Bézier curve |
| `route-line` | `route-line-source` | `line` | Active Route | 2.5px dashed cyan (#38bdf8) trajectory curve between origin and target cities |
| `islands-points` | `islands-source` | `circle` | 2.0 – 5.5 | Macro island circle dots colored by dominant alliance |
| `island-sprites` | `islands-source` | `symbol` | 5.0+ | All 40 colonizable island terrain PNGs scaled via calibrated .007 \times 2^Z$ curve |
| `rocks-points` | `rocks-source` | `circle` | 6.0+ | Subtle circle indicators for non-colonizable rocks/reefs |
| `empty-slots-sprites` | `empty-slots-source`| `symbol` | 7.2+ | `empty_slot.png` sprites placed on uncolonized shoreline bays |
| `clusters` | `towns-source` | `circle` | 2.0 – 5.5 | Clustered Supercluster bubbles colored by town density (Blue: <30, Purple: 30-99, Pink: 100+) |
| `cluster-count` | `towns-source` | `symbol` | 2.0 – 5.5 | Numeric cluster count label (`point_count_abbreviated`) |
| `town-points` | `towns-source` | `circle` | 3.5 – 6.8 | Unclustered dots sized by town stage (1 to 5) and tinted by alliance/player highlight |
| `town-sprites` | `towns-source` | `symbol` | 6.5+ | 3D isometric town stage models (`town_1`–`town_5`), anchored `bottom` |
| `town-flags` | `towns-source` | `circle` | 6.8+ | Alliance indicator badge offset `[0, -18]` above town sprite |
| `town-labels` | `towns-source` | `symbol` | 8.5+ | Town name text label with dark halo (`text-optional: true`) |

### HTML & React Overlays
- **Hover Tooltip**: React-Map-GL `<Popup>` rendering rich glassmorphic cards on town/island/rock/empty-slot hover.
- **Top Unified Search & Action Bar**: Glassmorphic search with autocomplete, `Ctrl+K` shortcut, ghost toggle, slot toggle, route tool toggle.
- **Sliding CommandDrawer**: 420px right-docked drawer for instant intelligence inspection without breaking map interactivity.
- **Floating RoutePlannerTool**: Bottom-centered travel time widget with live fleet/flyer transit calculations.
- **Left World Overview Panel**: Collapsible drawer showing Top 10 Alliances with interactive color picker overrides and world population stats.
- **Bottom-Right HUD**: Live cursor grid coordinate tracker `(X, Y)` and ocean designation `OXX` + sync timestamp.

---

## 4. State Management Architecture

| Scope | Mechanism | File / Location | Managed State Entities |
|---|---|---|---|
| **Global Application State** | **React Context** (`AppContext`) | `src/context/AppContext.js` | `worlds`, `activeWorldId`, `activeWorld` (worldSpeed, unitSpeed), `activePlayerName`, `activePlayer`, `masterData`, `loadingWorlds`, `loadingPlayer` |
| **Local Storage Persistence** | `window.localStorage` | `src/context/AppContext.js` | `grepo_active_world` (default: `hu119`), `grepo_active_player` |
| **Map Viewport & Layers** | React State & Refs | `src/app/map/page.js` | `data` (GeoJSON), `islandsData`, `townsData`, `rocksData`, `emptySlotsData`, `routeLineData`, `customColors`, `highlightedPlayers`, `highlightedAlliances`, `selectedEntity`, `showGhostsOnly`, `showEmptySlots`, `isRouteToolActive`, `routeOrigin`, `routeTarget`, `hoverInfo`, `cursorGrid` |
| **Cross-Tool Parameter Ingestion**| URL Search Params | `src/app/snipe/page.js`, `src/app/snipe/recall/page.js` | `targetTownId`, `originTownId` |

---

## 5. UI, Styling & Component Stack

- **Tailwind CSS**: v4.3.3 (`@tailwindcss/postcss: ^4.3.3`, `@import "tailwindcss";` in `globals.css`).
- **Icons**: `lucide-react` v1.17.0 (Castle, MapPin, Trophy, Users, Ghost, Compass, Navigation, Shield, Flame, Wind, Anchor, Sparkles, Send, etc.).
- **Data Visualizations**: `recharts` v3.8.1 (used in stats and scoreboard modules).
- **Theme & Design Tokens**:
  - Dark glassmorphism: `#0b1120` base dark, `rgba(15, 23, 42, 0.75)` card background with `backdrop-filter: blur(16px)`.
  - Typography: `Outfit` (sans-serif) for general UI, `JetBrains Mono` for coordinates, stats, and timings.
  - Palette: 10 vibrant alliance colors defined in `src/lib/constants.js` (`#ef4444`, `#3b82f6`, `#22c55e`, `#a855f7`, `#f97316`, `#ec4899`, `#eab308`, `#06b6d4`, `#84cc16`, `#14b8a6`).
- **Architecture Philosophy**: No heavy component library dependencies (no Radix UI, no Framer Motion, no Headless UI); pure performant React components styled with Tailwind 4 and custom CSS utility classes.

---

## 6. Next.js, Router & Build Toolchain

- **Next.js Version**: `16.2.7` (React `19.2.4`, React-DOM `19.2.4`).
- **Router Model**: **Next.js App Router** (`src/app/` tree with `layout.js`, `page.js`, and `route.js` route handlers).
- **Turbopack**: Enabled by default in Next.js 16 (`next dev` and `next build`).
- **Database & ORM**: SQLite (`dev.db`) accessed through Prisma ORM (`@prisma/client: ^6.19.3`, `prisma: ^6.19.3`).
- **Output Mode**: `standalone` (`output: "standalone"` in `next.config.mjs`).
- **Testing Stack**: Vitest v4.1.9 (`vitest.config.mjs`) for unit and integration testing; Playwright v1.60.0 for E2E testing.
- **Verification Result**: `npm run build && prisma generate` compiles cleanly and outputs standalone production assets with 0 TypeScript/Next.js errors.

---

## 7. Performance & High-Density Rendering Strategies

For worlds containing thousands of towns and hundreds of populated islands:

1. **GPU-Accelerated MapLibre GL JS Pipeline**:
   - Every town, island, flag, and line is rendered in a single WebGL canvas rather than as separate DOM elements.
   - Eliminates DOM node overhead and garbage collection pauses.

2. **GeoJSON Supercluster Caching**:
   - The towns source (`towns-source`) enables built-in spatial clustering (`cluster={true}`, `clusterMaxZoom={5}`, `clusterRadius={45}`).
   - At zoom levels 2.0 to 5.5, thousands of individual town points collapse into circle count clusters, maintaining smooth 60 FPS panning.

3. **Strict Zoom-Based LOD Culling**:
   - Heavy sprite assets (such as high-res 3D town stages and island pngs) only render at higher zoom thresholds (`minzoom: 5.0` for islands, `minzoom: 6.5` for 3D towns, `minzoom: 8.5` for text labels).
   - Labels utilize `text-optional: true` to prevent collision grid lockups.

4. **Asset Preloading & Image Atlas Registry**:
   - `src/lib/map/assetLoader.js` eager-loads all 40 island terrain sprites, 5 town stages, rock island, and empty slots into MapLibre's internal image registry upon map load (`onLoad`).
   - A `styleimagemissing` event handler acts as a fallback to dynamically load textures on demand without crashing.

5. **Server-Side Gzip Cache & Base64 Database Storage**:
   - `/api/world/geojson` delivers pre-compiled, gzip-compressed GeoJSON buffers stored directly in SQLite (`world.geoJsonCache`).
   - Requests leverage HTTP `ETag` and `If-None-Match` caching, enabling instant HTTP 304 responses when data is unchanged.

6. **Client-Side Event Throttling**:
   - Mouse move and hover coordinate tracking are throttled with `requestAnimationFrame` (`rafRef.current`), preventing React re-render flooding during cursor movement.
