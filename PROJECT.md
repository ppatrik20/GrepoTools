# Project: Next-Generation Grepolis World Map: Tactical Command Suite & Intelligence Overlays

## Architecture
- **Framework & Runtime**: Next.js 16.2.7 (App Router), React 19.2.4, Turbopack, Tailwind CSS 4 (`@tailwindcss/postcss: ^4.3.3`), Lucide React icons.
- **Map & WebGL Engine**: MapLibre GL JS v5.24.0 (`maplibre-gl`), React-Map-GL v8.1.1 (`react-map-gl/maplibre`), WebGL GPU acceleration.
- **Coordinate Reference System (CRS)**:
  - World Grid: $1000 \times 1000$ tiles ($128,000 \times 128,000\text{ px}$ at 128px/tile). Playable bounds: center (500,500), radius 250 ($X, Y \in [250, 750]$).
  - MapLibre Projections:
    $$\lambda = (P_x / 128000) \times 360 - 180, \quad \phi = -((P_y / 128000) \times 180 - 90)$$
    $$X_w = \text{round}((\lambda + 180) / 360 \times 1000), \quad Y_w = \text{round}((90 - \phi) / 0.18)$$
  - Ocean formula: $O\{ox\}\{oy\}$ where $ox = \lfloor X_w / 100 \rfloor, oy = \lfloor Y_w / 100 \rfloor$.
- **Layer & Overlay Architecture**:
  - Base Layers: `ocean-lines`, `ocean-labels`, `route-line-glow`, `route-line`, `islands-points`, `island-sprites`, `rocks-points`, `empty-slots-sprites`, `clusters`, `town-points`, `town-sprites`, `town-flags`, `town-labels`.
  - Tactical Overlay Layers (New):
    - `voronoi-spheres-fill`, `voronoi-spheres-border`, `contested-frontline-lines`
    - `ghost-radar-glow`, `ghost-radar-markers`, `siege-radar-halo`, `inactive-farm-markers`
    - `animated-troop-trajectories`, `animated-troop-sprites`, `troop-countdown-overlays`
    - `tactical-pin-markers`, `tactical-pin-labels`
    - Minimap Radar HUD Canvas widget
- **State Management & Persistence**:
  - Global Context: `src/context/AppContext.js`
  - Map Viewport & Overlays: `src/app/map/page.js` local state + custom hook / modular controllers
  - Local Persistence: `localStorage` (`grepo_tactical_pins_${worldId}`, `grepo_radar_settings`, etc.)
  - Database: Prisma schema (`SnipeOperation`, `Town`, `World`, `TacticalPin`)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---|---|---|---|
| F1 | Political Voronoi Territory Heatmaps | Dynamic, GPU-accelerated alliance territory polygons with official alliance hex colors and radial clamping | M1 | ORIGINAL_REQUEST §R1 |
| F2 | Contested Frontline Border Outlines | Visual demarcation of high-tension contested frontline border zones and contested islands with multi-alliance presence | M1 | ORIGINAL_REQUEST §R1 |
| F3 | Map Control Panel Mode Toggle | Interactive toggle in control panel switching between Geographic View and Political/Frontline View | M1 | ORIGINAL_REQUEST §R1 |
| F4 | Ghost Hunter Radar Overlay | Highlight unowned/ghost towns with distinct skull indicators, vacancy age calculation, and filter controls | M2 | ORIGINAL_REQUEST §R2 |
| F5 | Active Siege / Contest Radar | Pulse halos and indicators highlighting contested towns/islands undergoing heavy ownership shifts | M2 | ORIGINAL_REQUEST §R2 |
| F6 | Inactive Farm Finder Overlay | Identify inactive players with low point momentum for rapid raid targeting with momentum threshold sliders | M2 | ORIGINAL_REQUEST §R2 |
| F7 | Bézier Route Trajectory Upgrade | Upgrade Route Planner to render smooth quadratic/cubic Bézier flight paths across ocean sectors | M3 | ORIGINAL_REQUEST §R3 |
| F8 | Animated Troop Transit Sprites | Animated naval ships and mythical flying unit sprites gliding along arcing Bézier trajectories with tangent rotation | M3 | ORIGINAL_REQUEST §R3 |
| F9 | Live ETA Countdown Timers | Real-time floating arrival countdown timers ticking down to zero above travelling unit icons | M3 | ORIGINAL_REQUEST §R3 |
| F10 | Multi-Origin Sniping Trajectory Coordination | Support multiple origin paths converging simultaneously on a single target city with synchronized landing | M3 | ORIGINAL_REQUEST §R3 |
| F11 | Tactical Operation Pin Markers | Drop operation pins (`Primary Target`, `Secondary Target`, `Stack Biremes`, `Break Siege`) on towns/coordinates | M4 | ORIGINAL_REQUEST §R4 |
| F12 | Custom Notes & Priority Tagging | Attach custom notes and priority tags (`Critical`, `High`, `Normal`) with persistent storage | M4 | ORIGINAL_REQUEST §R4 |
| F13 | One-Click Export to Sniper & Planner | Direct 1-click export from tactical pins to Recall Sniper (`/snipe`) and Route Planner with prepopulated targets | M4 | ORIGINAL_REQUEST §R4 |
| F14 | 1000x1000 Minimap Radar Widget | Bottom corner draggable/collapsible minimap radar showing full 1000x1000 world overview with active camera rectangle | M5 | ORIGINAL_REQUEST §R5 |
| F15 | Minimap Click & Drag Camera Sync | Clicking or dragging on minimap immediately pans MapLibre camera to that coordinate/ocean sector | M5 | ORIGINAL_REQUEST §R5 |
| F16 | E2E Testing Suite (Tiers 1-4) | Comprehensive requirement-driven opaque-box test suite covering all features with automated verification | M6 | ORIGINAL_REQUEST Acceptance Criteria |
| F17 | Clean Production Build & Adversarial Hardening | Zero TypeScript / Next.js errors on `npm run build && prisma generate` with adversarial test coverage | M6 | ORIGINAL_REQUEST Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Political & Frontline Heatmaps | Voronoi alliance territory calculation, frontline contested boundary detection, control panel toggle (F1, F2, F3) | none | DONE |
| M2 | Conquest & Intel Radar Overlays | Ghost Hunter Radar, Active Siege Radar, Inactive Farm Finder with momentum controls (F4, F5, F6) | M1 | DONE |
| M3 | Animated Troop Movement & Trajectory Tracker | Bézier flight curves, animated naval/mythical sprites, live ETA countdown timers, multi-origin sniping paths (F7, F8, F9, F10) | M1 | DONE |
| M4 | Tactical Alliance Pinboard & Operations | Tactical operation pins, priority levels, notes, persistent storage, 1-click export to `/snipe` and Route Planner (F11, F12, F13) | M1 | DONE |
| M5 | Interactive Minimap Radar Widget | Draggable/collapsible HUD, 1000x1000 world radar, interactive viewport frustum, click/drag pan sync (F14, F15) | M1 | DONE |
| M6 | Final E2E Integration, Adversarial Hardening & Build Verification | Pass 100% E2E tests (Tiers 1-4), Tier 5 adversarial stress testing, clean production build (F16, F17) | M1, M2, M3, M4, M5 | DONE |

## Interface Contracts

### 1. Voronoi & Political Heatmap Engine (`src/lib/map/voronoi.js`)
```typescript
interface VoronoiOptions {
  maxRadius: number; // Radial clamping limit in coordinate units (default 20.0)
  minTownCount: number; // Minimum alliance town threshold (default 2)
}

interface PoliticalTerritoryData {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
    properties: {
      allianceId: number;
      allianceName: string;
      color: string;
      townCount: number;
      dominantShare: number;
    };
  }>;
}

interface ContestedFrontlineData {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: GeoJSON.LineString | GeoJSON.MultiLineString;
    properties: {
      allianceA: string;
      allianceB: string;
      tension: number; // 0.0 - 1.0
      islandId?: number;
      isContestedIsland: boolean;
    };
  }>;
}

function computeAllianceVoronoi(towns: any[], alliances: any[], options?: VoronoiOptions): PoliticalTerritoryData;
function computeContestedFrontlines(towns: any[], voronoiData: PoliticalTerritoryData): ContestedFrontlineData;
```

### 2. Intel Radar Overlay Filters (`src/lib/map/intelRadar.js`)
```typescript
interface IntelFilterState {
  ghostHunter: boolean;
  activeSiege: boolean;
  inactiveFarms: boolean;
  minGhostPoints: number;
  maxMomentumDelta: number; // e.g. 0 or negative
}

interface GhostTownData {
  townId: number;
  name: string;
  points: number;
  x: number;
  y: number;
  lng: number;
  lat: number;
  estimatedVacancyDays: number;
}

function filterIntelOverlays(towns: any[], players: any[], conquests: any[], filters: IntelFilterState): {
  ghosts: GeoJSON.FeatureCollection;
  sieges: GeoJSON.FeatureCollection;
  inactiveFarms: GeoJSON.FeatureCollection;
};
```

### 3. Trajectory & Animated Transit Engine (`src/lib/map/trajectories.js`)
```typescript
interface TrajectoryPoint {
  x: number;
  y: number;
  lng: number;
  lat: number;
}

interface ActiveTransit {
  id: string;
  originTownId: number;
  targetTownId: number;
  originName: string;
  targetName: string;
  originCoords: TrajectoryPoint;
  targetCoords: TrajectoryPoint;
  curveCoordinates: [number, number][]; // Sampled LngLat points
  unitType: "bireme" | "trireme" | "colony_ship" | "manticore" | "harpy" | "pegasus" | "transport";
  startTime: number; // Unix timestamp ms
  landingTime: number; // Unix timestamp ms
  durationSeconds: number;
}

function calculateArcTrajectory(origin: TrajectoryPoint, target: TrajectoryPoint, camber?: number): [number, number][];
function getTransitProgress(transit: ActiveTransit, currentTimeMs: number): {
  currentLngLat: [number, number];
  rotationDegrees: number;
  remainingSeconds: number;
  isCompleted: boolean;
};
```

### 4. Tactical Pinboard System (`src/lib/map/tacticalPins.js`)
```typescript
type PinType = "PRIMARY_TARGET" | "SECONDARY_TARGET" | "STACK_BIREMES" | "BREAK_SIEGE";
type PinPriority = "CRITICAL" | "HIGH" | "NORMAL";

interface TacticalPin {
  id: string;
  worldId: string;
  townId: number;
  townName: string;
  townX: number;
  townY: number;
  lng: number;
  lat: number;
  type: PinType;
  priority: PinPriority;
  notes: string;
  author: string;
  createdAt: number;
  targetReturnTime?: number;
}

function getTacticalPins(worldId: string): TacticalPin[];
function saveTacticalPin(worldId: string, pin: TacticalPin): TacticalPin[];
function removeTacticalPin(worldId: string, pinId: string): boolean;
function exportPinToSniper(pin: TacticalPin): string; // URL with query params
function exportPinToPlanner(pin: TacticalPin): { targetTownId: number; targetName: string };
```

### 5. Minimap Radar Synchronization (`src/components/map/MinimapRadar.js`)
```typescript
interface MinimapProps {
  towns: any[];
  alliances: any[];
  viewState: {
    longitude: number;
    latitude: number;
    zoom: number;
  };
  onNavigate: (coords: { lng: number; lat: number; zoom?: number }) => void;
  className?: string;
}
```

## Code Layout
- `src/lib/map/voronoi.js` — Voronoi territory tessellation, radial clamping, frontline tension math (M1)
- `src/lib/map/intelRadar.js` — Ghost town vacancy estimator, siege radar, inactive momentum filters (M2)
- `src/lib/map/trajectories.js` — Arcing Bézier curve generator, animated progress, rotation math (M3)
- `src/lib/map/tacticalPins.js` — Pinboard data store, export helpers, pin types (M4)
- `src/components/map/MinimapRadar.js` — 1000x1000 world radar canvas, camera viewport frustum, pan handlers (M5)
- `src/components/map/TacticalPinModal.js` — Drop / edit / remove operation pin modal & export buttons (M4)
- `src/components/map/IntelRadarControls.js` — Radar toggle pills, ghost/farm/siege sliders (M2)
- `src/components/map/PoliticalHeatmapLegend.js` — Alliance territory legend, opacity, contested toggle (M1)
- `src/components/map/AnimatedTroopLayer.js` — MapLibre canvas/custom WebGL animated sprite layer (M3)
- `src/app/map/page.js` — Main map integration connecting all tactical overlays, layers, and HUD widgets (M1-M5)
- `tests/e2e/tactical_suite.test.js` — Comprehensive E2E tests for R1-R5 features (M6)
