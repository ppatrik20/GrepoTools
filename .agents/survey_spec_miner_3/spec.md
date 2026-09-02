# Technical & Functional Specification: Next-Gen Grepolis Tactical Command Suite (R1 – R5)

**Document Version**: 1.0.0  
**Status**: Authoritative Architectural & Functional Specification  
**Scope**: Requirements R1 through R5 (Political Heatmaps, Intel Overlays, Animated Troop Tracker, Alliance Pinboard, Minimap Radar)  
**Target Environment**: Next.js 16 (App Router), React 19, MapLibre GL 5.24, Prisma ORM 6.19 (PostgreSQL), Tailwind CSS 4

---

## 1. Global Mathematical & Spatial Foundation (Coordinate Reference System)

Grepolis world topology is structured as a $1000 \times 1000$ discrete coordinate grid, subdivided into 100 Ocean Sectors ($10 \times 10$ oceans, from Ocean 00 to Ocean 99). The map rendering layer maps this world coordinate system onto a standardized Web Mercator / Equirectangular projection in MapLibre GL.

### 1.1 Coordinate Conversion Equations

The global coordinate space spans $1000$ tiles along each axis. Each tile consists of $128\text{ px}$, creating a global canvas of $128,000 \times 128,000\text{ px}$.

1. **World Coordinates $(X_w, Y_w) \in [0, 1000]$ to MapLibre Lng/Lat $(\lambda, \phi)$**:
   $$\lambda = \left(\frac{X_w}{1000}\right) \times 360^\circ - 180^\circ$$
   $$\phi = -\left[\left(\frac{Y_w}{1000}\right) \times 180^\circ - 90^\circ\right] = 90^\circ - \left(\frac{Y_w}{1000}\right) \times 180^\circ$$

2. **MapLibre Lng/Lat $(\lambda, \phi)$ to World Coordinates $(X_w, Y_w)$**:
   $$X_w = \left(\frac{\lambda + 180^\circ}{360^\circ}\right) \times 1000$$
   $$Y_w = \left(\frac{90^\circ - \phi}{180^\circ}\right) \times 1000$$

3. **Sub-Tile Pixel Coordinates to Global Coordinates**:
   For an island located at tile $(I_x, I_y)$ with slot offset $(\Delta x_{slot}, \Delta y_{slot})$:
   $$P_x = I_x \times 128 + \Delta x_{slot} + \Delta x_{dir}$$
   $$P_y = I_y \times 128 + (I_x \bmod 2 \times 64) + \Delta y_{slot} + \Delta y_{dir}$$
   $$\lambda = \left(\frac{P_x}{128000}\right) \times 360^\circ - 180^\circ, \quad \phi = -\left[\left(\frac{P_y}{128000}\right) \times 180^\circ - 90^\circ\right]$$

4. **Ocean Sector Index Formula**:
   $$\text{Ocean ID} = \lfloor X_w / 100 \rfloor \times 10 + \lfloor Y_w / 100 \rfloor \quad (\text{Formatted as } OXY, \text{e.g. } X_w=542, Y_w=480 \implies O54)$$

---

## 2. R1: Political & Frontline Heatmaps (Alliance Spheres of Influence)

### 2.1 Objective
Provide real-time visualization of territorial control across the world. Grouping individual city control into continuous territorial polygons (spheres of influence) color-coded by alliance, while mathematically isolating contested frontline zones where opposing military factions meet.

```
+-----------------------------------------------------------------------------------+
| R1: POLITICAL & FRONTLINE HEATMAP PIPELINE                                        |
|                                                                                   |
| [Town Data Collection] -> [Voronoi Partitioning (d3-delaunay)]                    |
|                                    |                                              |
|                                    v                                              |
|                     [Territory Radius Clamping (R_max)]                           |
|                                    |                                              |
|                                    v                                              |
|                   [Alliance Dissolve / Union (Turf.js)]                           |
|                                    |                                              |
|            +-----------------------+-----------------------+                      |
|            |                                               |                      |
|            v                                               v                      |
|  [Alliance Spheres Layer]                      [Frontline Edge Detection]         |
|  - Fill Opacity: 0.25                          - Competing Delaunay Edges         |
|  - Stroke Color: Alliance Hex                  - Island-Level Entropy Scoring     |
|  - Smooth Bézier Boundaries                    - Pulsing Frontline Halo Layer     |
+-----------------------------------------------------------------------------------+
```

### 2.2 Algorithm & Implementation Architecture

#### 2.2.1 Voronoi Generation vs. Alternative Comparison
- **`d3-delaunay` (Recommended)**: Executes $O(N \log N)$ Delaunay triangulation and dual Voronoi diagram generation. Benchmarks show $10,000$ points computed in under $18\text{ ms}$ on a single Web Worker thread.
- **Turf.js `voronoi`**: Wrapper around `d3-voronoi` (legacy $O(N^2)$ worst-case, $5\times$ slower).
- **GPU WebGL Shader / Voronoi Distance Field**: Extreme rendering speed for raster heatmaps, but lacks crisp vector GeoJSON boundary styling, hover inspection, and precise frontline stroke rendering.
- **Architectural Decision**: Compute Voronoi partitioning in a background Web Worker using `d3-delaunay`, clamp cells to a maximum territorial influence circle ($R_{\text{max}} = 20\text{ nautical units} \approx 2560\text{ px}$), union adjacent cells belonging to the same alliance using `polygon-clipping` or `@turf/dissolve`, and feed the resulting `GeoJSON.FeatureCollection` into MapLibre GL `fill` and `line` layers.

#### 2.2.2 Mathematical Formulation for Territorial Clamping
For each town $T_i = (x_i, y_i)$ belonging to alliance $A_k$, the unconstrained Voronoi cell $V_i$ is defined by:
$$V_i = \{ P \in \mathbb{R}^2 \mid \|P - T_i\| \le \|P - T_j\| \quad \forall j \ne i \}$$

To prevent Voronoi cells from expanding infinitely into uninhabited ocean space, each cell is intersected with a radial influence disk $D_i(r_i)$:
$$V_i^{\text{clamped}} = V_i \cap D_i(r_i), \quad r_i = r_{\text{base}} \times \left(1 + \beta \cdot \frac{\text{Points}(T_i)}{13716}\right)$$
Where:
- $r_{\text{base}} = 15.0\text{ units}$ (world grid units)
- $\beta = 0.5$ (scaling factor up to $1.5\times$ base radius for maxed 13,716-point cities)

#### 2.2.3 Alliance Territorial Union & Smoothing
For each alliance $A_k \in \mathcal{A}_{\text{top}}$, the total territorial polygon $\Omega_k$ is the geometric union of all clamped cells:
$$\Omega_k = \bigcup_{T_i \in \text{Towns}(A_k)} V_i^{\text{clamped}}$$
The polygon boundary coordinates are simplified with Douglas-Peucker ($\epsilon = 0.05$) and rounded via Chaikin's corner-cutting algorithm (2 iterations) to produce smooth territorial contours.

#### 2.2.4 Contested Frontline Zone Detection

Two distinct frontline detection algorithms are deployed:

1. **Island-Level Multi-Alliance Contest Scoring (Micro-Frontline)**:
   For an island $I$ populated by $M$ towns distributed across alliances $\{A_1, A_2, \dots, A_m\}$:
   $$\text{ContestScore}(I) = -\sum_{j=1}^{m} p_j \log_2(p_j), \quad p_j = \frac{\text{Towns}(A_j, I)}{M}$$
   - If $m \ge 2$ and $\text{ContestScore}(I) \ge 0.8$: The island is classified as **Active Hotspot Island**.
   - Render styling: Red-orange pulsing outline (`#f97316`) with a dashed neon halo.

2. **Delaunay Border Edge Tension Calculation (Macro-Frontline)**:
   For every edge $E_{ij} = (T_i, T_j)$ in the Delaunay triangulation:
   - If $\text{Alliance}(T_i) \ne \text{Alliance}(T_j)$, and both $\text{Alliance}(T_i), \text{Alliance}(T_j) \in \mathcal{A}_{\text{top}}$:
   - Frontline segment $F_{ij}$ is the shared Voronoi boundary line between $V_i$ and $V_j$.
   - **Tension Metric**:
     $$\mathcal{T}(E_{ij}) = \frac{\sqrt{\text{Points}(T_i) \times \text{Points}(T_j)}}{\|T_i - T_j\|}$$
   - Render styling: Frontline segments where $\mathcal{T} \ge \tau_{\text{threshold}}$ are rendered as glowing, high-contrast red lines (`#ef4444`, `line-width: 3px`, `line-blur: 2px`) with animated dash offsets.

### 2.3 UI Layer Configuration & State Management

```typescript
// MapLibre Layer Specifications for R1
export const POLITICAL_LAYERS = {
  spheresFill: {
    id: "alliance-spheres-fill",
    type: "fill",
    source: "alliance-territory-source",
    paint: {
      "fill-color": ["get", "allianceColor"],
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        2.0, 0.35,
        5.5, 0.22,
        8.0, 0.10
      ]
    }
  },
  spheresBorder: {
    id: "alliance-spheres-border",
    type: "line",
    source: "alliance-territory-source",
    paint: {
      "line-color": ["get", "allianceColor"],
      "line-width": 1.5,
      "line-opacity": 0.8
    }
  },
  frontlineGlow: {
    id: "contested-frontline-glow",
    type: "line",
    source: "contested-frontline-source",
    paint: {
      "line-color": "#ef4444",
      "line-width": 4.5,
      "line-blur": 3,
      "line-opacity": 0.85
    }
  },
  frontlineCore: {
    id: "contested-frontline-core",
    type: "line",
    source: "contested-frontline-source",
    paint: {
      "line-color": "#ffffff",
      "line-width": 1.5,
      "line-dasharray": [4, 2]
    }
  }
};
```

---

## 3. R2: Conquest & Intel Radar Overlays

### 3.1 Overview
Tactical radar modes overlay filtered intelligence directly onto the world map, allowing players to instantly target ghost towns, identify active conquest sieges, and farm inactive players.

```
+-----------------------------------------------------------------------------------+
| R2: RADAR OVERLAY SUITE                                                           |
|                                                                                   |
|  [👻 GHOST HUNTER RADAR]       [⚔️ ACTIVE SIEGE RADAR]     [💤 INACTIVE FARM FINDER] |
|  - player === 'Ghost Town'    - Recent Conquers (24h/48h)  - Momentum = 0 pts/7d  |
|  - Point Decay Age Estimator  - Snipe Attack Targets       - DBP = 0, ABP = 0     |
|  - Spectral Glow Indicator    - Dynamic Radar Ping Halo    - Loot Capacity Metric |
+-----------------------------------------------------------------------------------+
```

### 3.2 👻 Ghost Hunter Radar Specification

#### 3.2.1 Ghost Town Identification
- Criteria: `playerId === null || player === 'Ghost Town' || isGhost === true`.
- In Grepolis, ghost towns gradually lose building levels and point values daily through structural decay.

#### 3.2.2 Vacancy Age Calculation Formula
When exact conquest/abandonment timestamps are unavailable from historical snapshots:
$$\text{DecayRate}_{\text{pts/day}} \approx 100 \times \left(\frac{\text{CurrentPoints}}{5000}\right)^{0.5} \quad (\text{Scaled by World Speed } W_{\text{speed}})$$
$$\text{EstimatedVacancyDays} = \max\left(1, \frac{\text{InitialEstimatedPoints} - \text{CurrentPoints}}{\text{DecayRate}_{\text{pts/day}}}\right)$$

When `TownHistory` / `Conquest` logs exist:
$$\text{VacancyAgeSeconds} = \text{CurrentTimestamp} - \text{Timestamp}(\text{LastOwnershipEvent})$$
$$\text{FormattedAge} = \text{floor}(\Delta t / 86400)\text{d } \text{floor}((\Delta t \bmod 86400) / 3600)\text{h}$$

#### 3.2.3 Marker & Visual Specs
- **Marker Icon**: Custom Ghost / Skull SVG badge (`#a855f7` / `#c084fc` purple-violet spectral glow).
- **Glow Ring**: Pulsing halo with radius proportional to points: $R_{\text{halo}} = 6 + \frac{\text{Points}}{1500}\text{ px}$.
- **Quick Badge**: Points badge floating above town (`e.g., 8,420 pts • Ghost (3d 14h)`).

---

### 3.3 ⚔️ Active Siege / Contest Radar Specification

#### 3.3.1 Contest Criteria
Towns matching any of the following conditions within a rolling time window $T_{\text{window}} \in [6\text{h}, 72\text{h}]$:
1. Entry in `Conquest` table within $T_{\text{window}}$.
2. Town has active `SnipeOperation` rows with `status === 'PENDING'`.
3. High frequency of player/alliance transfers or point shifts in `TownHistory`.

#### 3.3.2 Radar Ping Visual Animation Engine
To represent high-tension contested zones without performance overhead, MapLibre GL evaluates an animated uniform timestamp:
```javascript
// Radar Ping Pulse Step in MapLibre RequestAnimationFrame
const pulseRadius = (performance.now() % 2000) / 2000 * 30 + 8; // 8px to 38px
const pulseOpacity = 1.0 - ((performance.now() % 2000) / 2000);
map.setPaintProperty('active-siege-ping', 'circle-radius', pulseRadius);
map.setPaintProperty('active-siege-ping', 'circle-opacity', pulseOpacity);
```

#### 3.3.3 Visual Attributes
- **Target Symbol**: Dual crossed swords (`#ef4444` red) + shield breach icon.
- **Transfer Direction Tag**: Pill showing `OldAlliance` $\rightarrow$ `NewAlliance`.

---

### 3.4 💤 Inactive Farm Finder Specification

#### 3.4.1 Inactivity & Momentum Mathematical Score
Player activity is calculated across a 7-day rolling window from `PlayerHistory`:
$$\Delta \text{Pts}_{7\text{d}} = \sum \Delta \text{Points}, \quad \Delta \text{ABP}_{7\text{d}} = \sum \Delta \text{ABP}, \quad \Delta \text{DBP}_{7\text{d}} = \sum \Delta \text{DBP}$$
$$\text{ActivityScore} = w_1 \cdot \ln(1 + \max(0, \Delta \text{Pts}_{7\text{d}})) + w_2 \cdot \ln(1 + \Delta \text{ABP}_{7\text{d}}) + w_3 \cdot \ln(1 + \Delta \text{DBP}_{7\text{d}})$$
Where default weights are $w_1 = 0.5, w_2 = 0.3, w_3 = 0.2$.

- **Inactive Status**: $\text{ActivityScore} \le 0.1$ and player is not member of a protected alliance.
- **Estimated Lootable Resource Capacity**:
  Based on town warehouse level estimation from points:
  $$\text{WarehouseCap}(\text{Points}) \approx \min\left(25500, \text{floor}\left(1200 \times \left(\frac{\text{Points}}{500}\right)^{0.6}\right)\right)$$
  $$\text{EstimatedLootPerHour} \approx \text{ProductionRate} \times \text{HoursInactive}$$

#### 3.4.2 UI Filter Controls
- **Distance Slider**: Filter targets within $5\text{ to } 80\text{ nautical units}$ from the active selected town.
- **Points Range**: Minimum and maximum points slider (e.g., $1,500 - 9,000\text{ pts}$).
- **Inactivity Period**: Dropdown/slider ($1\text{ day}, 3\text{ days}, 7\text{ days}, 14+\text{ days}$).
- **Alliance Filter**: Toggle to exclude friendly/pact alliance tags.

---

## 4. R3: Animated Troop Movement & Trajectory Tracker

### 4.1 Trajectory Mathematical Modeling (Quadratic & Cubic Bézier Arcs)

Direct straight-line transit across nautical maps causes visual clutter and fails to evoke authentic naval/aerial routes. Curved Bézier trajectories provide distinct, readable flight corridors.

```
+-----------------------------------------------------------------------------------+
| R3: BÉZIER TRAJECTORY & ANIMATION PIPELINE                                        |
|                                                                                   |
| Origin (P_0) o====== Control Point (P_c) ======o Target (P_1)                     |
|                \         |                   /                                    |
|                 \        | Camber Offset h  /                                     |
|                  \       v                 /                                      |
|                   +----. B(t) .-----------+                                       |
|                          |                                                        |
|                          v                                                        |
|                 Unit Sprite at (x, y)                                             |
|                 Heading: theta = atan2(B'_y, B'_x)                                |
|                 ETA Floating Badge: [00:14:22]                                    |
+-----------------------------------------------------------------------------------+
```

#### 4.1.1 Quadratic Bézier Trajectory Formulation
Given Origin $P_0 = (\lambda_0, \phi_0)$ and Target $P_1 = (\lambda_1, \phi_1)$:
1. Chord Vector: $\vec{d} = P_1 - P_0 = (\Delta \lambda, \Delta \phi)$
2. Chord Distance: $L = \|\vec{d}\| = \sqrt{(\Delta \lambda)^2 + (\Delta \phi)^2}$
3. Midpoint: $M = \frac{P_0 + P_1}{2} = \left(\frac{\lambda_0 + \lambda_1}{2}, \frac{\phi_0 + \phi_1}{2}\right)$
4. Perpendicular Unit Normal Vector: $\vec{n} = \left(-\frac{\Delta \phi}{L}, \frac{\Delta \lambda}{L}\right)$
5. Camber Arc Height $h$:
   $$h = \max\left(0.18 \times L, 0.0012\right) \times \operatorname{sgn}(\Delta \lambda)$$
6. Control Point $P_c$:
   $$P_c = M + h \cdot \vec{n}$$
7. Continuous Curve Position $B(t)$ for $t \in [0, 1]$:
   $$B(t) = (1 - t)^2 P_0 + 2(1 - t)t P_c + t^2 P_1$$

#### 4.1.2 Tangent Vector & Sprite Heading Angle
To orient ship and mythical flyer sprites correctly along the curved flight path:
$$B'(t) = \frac{d B(t)}{dt} = 2(1 - t)(P_c - P_0) + 2t(P_1 - P_c)$$
$$\theta(t) = \operatorname{atan2}\left(B'_y(t), B'_x(t)\right) \times \frac{180^\circ}{\pi} \quad (\text{Degrees clockwise from East})$$

---

### 4.2 High-Precision Real-Time Clock Synchronization

Grepolis travel calculations depend on exact seconds. To eliminate client clock drift:

#### 4.2.1 Clock Sync Protocol
1. Client issues request to `/api/time` measuring timestamps:
   - $T_0$: Client request departure timestamp.
   - $T_{\text{server}}$: Server timestamp returned in payload.
   - $T_1$: Client response arrival timestamp.
2. Round-Trip Time ($RTT$) and Server Offset ($\delta$):
   $$RTT = T_1 - T_0, \quad \delta = T_{\text{server}} - \left(T_0 + \frac{RTT}{2}\right)$$
3. Synchronized Current Time:
   $$T_{\text{synced}}(t) = \text{Date.now}() + \delta$$

#### 4.2.2 Transit Progress & ETA Computation
For a troop movement operation with launch timestamp $T_{\text{launch}}$ and target arrival $T_{\text{target}}$:
$$\text{TotalDuration} = T_{\text{target}} - T_{\text{launch}}$$
$$\text{RemainingSeconds} = \max\left(0, \left\lfloor\frac{T_{\text{target}} - T_{\text{synced}}}{1000}\right\rfloor\right)$$
$$\text{Progress } t = \operatorname{clamp}\left(\frac{T_{\text{synced}} - T_{\text{launch}}}{\text{TotalDuration}}, 0.0, 1.0\right)$$

---

### 4.3 Multi-Origin Sniping Trajectory Coordination

When executing offensive landing operations or defensive bireme bunkers, multiple cities coordinate landing at a single synchronized second $T_{\text{landing}}$:

```typescript
export interface SnipingCoordinationWave {
  operationId: string;
  targetTown: { id: number; name: string; coordinates: [number, number] };
  targetArrivalTimestamp: number; // T_landing
  origins: Array<{
    originTown: { id: number; name: string; coordinates: [number, number] };
    unitType: 'bireme' | 'light_ship' | 'colonize_ship' | 'manticore' | 'pegasus';
    unitBaseSpeed: number;
    travelDurationSeconds: number;
    requiredLaunchTimestamp: number; // T_landing - travelDurationSeconds * 1000
    progress: number; // Current t in [0, 1]
    status: 'SCHEDULED' | 'IN_TRANSIT' | 'LANDED';
  }>;
}
```

- **Visual Orchestration**: The map renders all active converging Bézier arcs simultaneously.
- Color coding:
  - Red / Orange arcs: Offensive strike nukes & Colony Ships.
  - Blue / Cyan arcs: Defensive Bireme support stacks.
  - Yellow / White arcs: Mythical flyer fast snipe units.
- Each animated sprite glides along its respective arc with an independent countdown badge.

---

## 5. R4: Tactical Alliance Pinboard & Operation Markers

### 5.1 Tactical Pin Taxonomy & Priority Matrix

| Pin Type | In-Game Icon / Glyph | Primary Purpose | Tactical Usage |
| :--- | :--- | :--- | :--- |
| `PRIMARY_TARGET` | 🔴 Red Crossed Swords | Main Conquest Target | Colony ship target, city takeover coordination |
| `SECONDARY_TARGET`| 🟠 Orange Target Reticle | Diversion / Wall Breach | Secondary attack wave, diversionary clearing |
| `STACK_BIREMES` | 🔵 Blue Shield Anchor | Defensive Bunker | Request naval defense stacks before CS landing |
| `BREAK_SIEGE` | ⚡ Purple Lightning Hammer| Break Active Enemy Siege | Coordinated attack wave to sink enemy CS bunker |
| `FARM_ZONE` | 💰 Gold Coin Pouch | High-Yield Raid Farm | Shared farming target for alliance resource growth |
| `WATCH_TOWER` | 👁️ Cyan Eye Sensor | Intelligence / Recon | Track enemy troop staging and fleet buildups |

---

### 5.2 Persistence & Database Architecture

#### 5.2.1 Database Schema (`prisma/schema.prisma`)
```prisma
enum PinType {
  PRIMARY_TARGET
  SECONDARY_TARGET
  STACK_BIREMES
  BREAK_SIEGE
  FARM_ZONE
  WATCH_TOWER
  CUSTOM
}

enum PinPriority {
  CRITICAL
  HIGH
  NORMAL
  LOW
}

model TacticalPin {
  id              String      @id @default(uuid())
  worldId         String      @default("hu119")
  pinType         PinType     @default(PRIMARY_TARGET)
  priority        PinPriority @default(NORMAL)
  targetTownId    Int
  targetTownName  String
  islandX         Int
  islandY         Int
  islandSlot      Int         @default(0)
  targetTime      DateTime?
  notes           String?     @db.Text
  requiredSupport Json?       // { biremes: 500, lightShips: 300, landDef: 2000 }
  authorId        Int?
  authorName      String      @default("Commander")
  isActive        Boolean     @default(true)
  expiresAt       DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  world           World?      @relation(fields: [worldId], references: [id], onDelete: Cascade)
  targetTown      Town?       @relation("TownTacticalPins", fields: [targetTownId, worldId], references: [id, worldId], onDelete: Cascade)

  @@index([worldId, isActive])
  @@index([targetTownId])
  @@index([targetTime])
}
```

#### 5.2.2 LocalStorage Schema (Offline & Rapid Client Storage)
Key: `grepo-tactical-pins_${worldId}`
```json
[
  {
    "id": "pin-uuid-849204",
    "pinType": "PRIMARY_TARGET",
    "priority": "CRITICAL",
    "targetTownId": 4820,
    "targetTownName": "Sparta Prime",
    "islandX": 542,
    "islandY": 480,
    "islandSlot": 4,
    "targetTime": "2026-09-02T19:30:00.000Z",
    "notes": "Clear harbour with 600 LS at 19:29:55. CS lands 19:30:00 sharp.",
    "authorName": "Warlord",
    "createdAt": "2026-09-02T17:00:00.000Z"
  }
]
```

---

### 5.3 One-Click Tool Integration & Export

1. **Export to `/snipe`**:
   Clicking **"Send to Sniper"** on a Pin opens `/snipe` with deep-linked query parameters:
   $$\text{URL: } \texttt{/snipe?targetTownId=4820\&targetTime=19:30:00\&type=attack\&label=Op\%20Sparta}$$
   The Snipe Queue pre-populates the target landing time and target city automatically.

2. **Export to Route Planner**:
   Clicking **"Plan Route to Pin"** assigns the target city immediately as `routeTarget` in `RoutePlannerTool`.

3. **BB-Code Export Generator**:
   Generates official Grepolis Alliance Forum formatted BB-Code:
   ```text
   [b][size=12][color=#ef4444]⚔️ ALLIANCE OPERATION PIN: [town]4820[/town][/color][/size][/b]
   [b]Priority:[/b] [color=#ef4444]CRITICAL[/color]
   [b]Target City:[/b] Sparta Prime ([island]542|480[/island] Slot #4)
   [b]Target Landing Time:[/b] 19:30:00 (Server Time)
   [b]Tactical Orders:[/b] Clear harbour with 600 LS at 19:29:55. CS lands 19:30:00 sharp.
   [b]Created By:[/b] Warlord
   ```

---

## 6. R5: Interactive Minimap Radar Widget

### 6.1 Spatial Projection Matrix & Canvas Engine

The Interactive Minimap Radar Widget is an embedded floating tactical radar positioned in the bottom viewport corner. It renders the entire $1000 \times 1000$ world overview onto an accelerated $180 \times 180\text{ px}$ canvas.

```
+-----------------------------------------------------------------------------------+
| R5: INTERACTIVE MINIMAP RADAR ARCHITECTURE                                        |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | [1000x1000 World Data]                                                      |  |
|  | -> Scaled down to 180x180 Canvas (Scale Factor S = 0.18)                    |  |
|  |                                                                             |  |
|  | +-----------------------+                                                   |  |
|  | | O44   O45 | O54   O55 |                                                   |  |
|  | |     .:::::|::::.      | <--- Macro Island Density & Territory Color       |  |
|  | |    :::[Active]::.     |                                                   |  |
|  | |    :::[Viewport]      | <--- Projected Viewport Camera Frustum            |  |
|  | |       ':::'           |                                                   |  |
|  | +-----------------------+                                                   |  |
|  |                                                                             |  |
|  | Mouse Click / Drag -> Inverse Coordinate Calculation -> map.easeTo(center)  |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

#### 6.1.1 Viewport Frustum Projection Mathematics
To draw the camera bounding box representing the user's active viewport on the minimap:
1. Extract viewport bounds from MapLibre: `bounds = map.getBounds()`:
   - $\lambda_{\text{west}} = \text{bounds.getWest()}$
   - $\lambda_{\text{east}} = \text{bounds.getEast()}$
   - $\phi_{\text{north}} = \text{bounds.getNorth()}$
   - $\phi_{\text{south}} = \text{bounds.getSouth()}$
2. Convert corner coordinates to World Coordinates $(X_w, Y_w)$:
   $$X_{\text{west}} = \left(\frac{\lambda_{\text{west}} + 180}{360}\right) \times 1000, \quad X_{\text{east}} = \left(\frac{\lambda_{\text{east}} + 180}{360}\right) \times 1000$$
   $$Y_{\text{north}} = \left(\frac{90 - \phi_{\text{north}}}{180}\right) \times 1000, \quad Y_{\text{south}} = \left(\frac{90 - \phi_{\text{south}}}{180}\right) \times 1000$$
3. Map to Canvas Coordinates $(x_c, y_c)$ for canvas width $W_c$ and height $H_c$:
   $$x_0 = \frac{X_{\text{west}}}{1000} \times W_c, \quad y_0 = \frac{Y_{\text{north}}}{1000} \times H_c$$
   $$\text{boxWidth} = \left(\frac{X_{\text{east}} - X_{\text{west}}}{1000}\right) \times W_c, \quad \text{boxHeight} = \left(\frac{Y_{\text{south}} - Y_{\text{north}}}{1000}\right) \times H_c$$
4. Render on Canvas:
   - Fill: `rgba(56, 189, 248, 0.20)` (Sky Blue transluscent)
   - Stroke: `rgba(56, 189, 248, 0.90)`, `lineWidth = 1.5`

---

### 6.2 Bidirectional Pan & Drag Event Engine

```typescript
export function handleMinimapPointerEvent(
  e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
  map: maplibregl.Map
) {
  const rect = canvas.getBoundingClientRect();
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

  const canvasX = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const canvasY = Math.max(0, Math.min(rect.height, clientY - rect.top));

  // 1. Transform Canvas Pixel to World Coordinate
  const targetWorldX = (canvasX / rect.width) * 1000;
  const targetWorldY = (canvasY / rect.height) * 1000;

  // 2. Transform World Coordinate to MapLibre Lng/Lat
  const targetLng = (targetWorldX / 1000) * 360 - 180;
  const targetLat = -((targetWorldY / 1000) * 180 - 90);

  // 3. Pan Main Camera Smoothly
  map.easeTo({
    center: [targetLng, targetLat],
    duration: 350,
    essential: true
  });
}
```

---

### 6.3 HUD Design & Draggable Widget Specifications

- **Default Anchor**: Bottom-left of screen (`bottom: 1.5rem`, `left: 1.5rem`, `z-index: 45`).
- **Collapsible Drawer Mode**: Mini toggle button collapses the radar into a $32 \times 32\text{ px}$ compass icon.
- **Ocean Sector HUD Badge**: Real-time ocean label overlay (e.g. `Viewing Ocean 54 • (542, 480)`).
- **Draggable Header**: Allows power users to reposition the floating widget anywhere across multi-monitor or widescreen displays.

---

## 7. Features Discovered Table

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | R1 (Political) | Voronoi Spheres of Influence | Computes alliance boundary polygons from city coordinates | Town array `{ x, y, alliance, points }` | GeoJSON MultiPolygons per alliance | Fallback to uncolored polygon if alliance undefined | `src/lib/geojson.js` & Delaunay spec |
| 2 | R1 (Political) | Clamped Influence Radius | Limits Voronoi cells to max radius around towns | Town points & base radius (15 units) | Clamped polygon boundary | Falls back to default circle if geometry invalid | Geometric Voronoi spec |
| 3 | R1 (Political) | Multi-Alliance Island Detection | Detects islands with 2+ rival alliances | Island town roster & alliance IDs | Hotspot classification & entropy score | Returns score 0 if single alliance | `src/lib/geojson.js` |
| 4 | R1 (Political) | Delaunay Frontline Edge Tension | Highlights high-friction borders between rival factions | Delaunay neighbor edges & city points | Tension score $\mathcal{T}$ & GeoJSON LineString | Edge ignored if towns in same alliance | Triangulation spec |
| 5 | R1 (Political) | Political/Geographic View Switcher | Instant UI toggle between physical islands and political map | UI toggle state boolean | Layer visibility toggle in MapLibre | Gracefully retains cached layer data | `src/app/map/page.js` |
| 6 | R2 (Intel) | Ghost Hunter Radar | Highlights unowned ghost towns with spectral glow | Town list `{ isGhost, player }` | Filtered ghost markers with point tags | Empty list if 0 ghosts found | `UnifiedSearchPanel.js` & `geojson.js` |
| 7 | R2 (Intel) | Ghost Vacancy Age Estimator | Calculates vacancy age from structural point loss | Current points & initial baseline points | Formatted age string (`Xd Yh`) | Defaults to `1d` if decay rate is 0 | Game mechanics analysis |
| 8 | R2 (Intel) | Active Siege / Contest Radar | Highlights cities with recent conquests or active attacks | `Conquest` table & active `SnipeOperation` | Pulsing red radar halo & crossed swords icon | No marker if town has 0 recent events | `prisma/schema.prisma` |
| 9 | R2 (Intel) | Inactive Farm Finder | Identifies inactive players for resource raids | `PlayerHistory` point & BP deltas | Ranked inactive list with loot capacity | Returns empty array if all active | `src/app/api/world/momentum` |
| 10 | R2 (Intel) | Inactivity Momentum Score | Computes weighted activity score ($\Delta\text{Pts}, \Delta\text{ABP}, \Delta\text{DBP}$) | Historical point records over 7 days | Score $\in [0, \infty)$ | Defaults to inactive if no history exists | `src/app/api/world/momentum` |
| 11 | R3 (Movement) | Bézier Trajectory Calculator | Generates curved flight arc across ocean sectors | Origin $(x_0, y_0)$, Target $(x_1, y_1)$ | GeoJSON 40-step curved LineString | Returns null if origin == target | `RoutePlannerTool.js` |
| 12 | R3 (Movement) | Tangent Heading Calculator | Computes instantaneous sprite orientation angle | Bézier first derivative $B'(t)$ | Angle $\theta \in [-180^\circ, 180^\circ]$ | Returns $0^\circ$ if tangent is zero vector | Vector kinematics spec |
| 13 | R3 (Movement) | Synchronized Clock Engine | NTP-style RTT drift compensation for countdown timers | Client timestamp & `/api/time` response | Corrected server epoch $T_{\text{synced}}$ | Fallback to local clock on network error | `src/app/api/time/route.js` |
| 14 | R3 (Movement) | Multi-Origin Sniping Visualizer | Coordinates multiple origin waves to single landing second | Array of origin cities, unit speeds, $T_{\text{target}}$ | Multi-arc animated canvas pipeline | Flags warning if launch time is in past | `src/app/snipe/page.js` |
| 15 | R4 (Pinboard) | Tactical Operation Pins | Drops tactical markers (`PRIMARY_TARGET`, etc.) on map | Town ID, pin type, priority, notes | Visual pin layer & popup card | Rejects pins missing target town ID | `CommandDrawer.js` & schema |
| 16 | R4 (Pinboard) | Pin Persistence Engine | Stores tactical pins across client sessions and database | Pin object payload | LocalStorage & PostgreSQL record | Falls back to LocalStorage if DB offline | `prisma/schema.prisma` |
| 17 | R4 (Pinboard) | 1-Click Export to `/snipe` | Pre-populates target town and landing times in Sniper | Tactical pin object | Navigates to `/snipe?...` | Default parameters if fields blank | `src/app/snipe/page.js` |
| 18 | R4 (Pinboard) | BB-Code Bulletin Generator | Generates Grepolis forum BB-Code bulletin | Pin title, coords, priority, orders | Formatted BB-Code text string | Omits optional fields if not populated | `CommandDrawer.js` |
| 19 | R5 (Minimap) | Global Minimap Radar | Renders 1000x1000 world map onto 180x180 HUD canvas | Island GeoJSON features | 2D Canvas raster overlay | Renders grid only if data loading | MapLibre camera spec |
| 20 | R5 (Minimap) | Viewport Frustum Projection | Maps active MapLibre camera bounds to minimap rectangle | `map.getBounds()` LngLat bounds | Canvas stroke/fill rectangle | Clamps to canvas edges if out of bounds | MapLibre camera spec |
| 21 | R5 (Minimap) | Minimap Pan & Drag Interaction | Translates click/drag on minimap to main camera pan | Pointer coordinates on canvas | Calls `map.easeTo({ center })` | Clamps coordinates to $[0, 1000]$ | Map coordinate math |
| 22 | R5 (Minimap) | Collapsible / Draggable HUD | Floating window with drag handle and collapse button | Window position & collapse boolean state | Responsive floating HUD UI | Resets to default position if dragged offscreen | UI design spec |

---

## 8. Edge Cases & Resilience Matrix

| # | Feature | Input / Condition | Observed / Required Behavior |
|---|---------|-------------------|-----------------------------|
| 1 | Voronoi Heatmap | Single town isolated in middle of ocean | Clamped to circular boundary with radius $R_{\text{max}} = 15\text{ units}$; does not stretch to world bounds. |
| 2 | Voronoi Heatmap | Two allied towns on identical island coordinates | Handled without division by zero; Delaunay colinear jitter ($+0.0001$) applied automatically. |
| 3 | Frontline Detection | Island with 5 different minor alliances | Entropy score correctly calculates distributed tension; only flags contested outline if top alliances involved. |
| 4 | Ghost Hunter | Town with 175 points (minimum possible) | Displays `Stage 1 • Hamlet Ghost (Decayed)`; vacancy age clamped to max threshold. |
| 5 | Active Siege Radar | Town conquered 3 times in 12 hours | Displays highest-tier contest alert with 3-ring pulse and chronological conquest history list. |
| 6 | Inactive Farm Finder | Player joined yesterday (no 7-day history) | Excluded from inactives to prevent attacking new active beginners. |
| 7 | Bézier Trajectory | Origin and target on identical coordinates | Returns distance 0, suppresses trajectory line rendering, displays warning in Route Tool. |
| 8 | Clock Sync | Client clock is 15 minutes slow | Offset $\delta = +900,000\text{ ms}$ computed; ETA countdown ticks accurately against Grepolis server. |
| 9 | Multi-Origin Snipe | Launch time already passed ($T_{\text{launch}} < \text{Now}$) | Displays visual red badge: `MISSED LAUNCH WINDOW by X seconds`; prevents launch. |
| 10 | Tactical Pinboard | LocalStorage full or private browsing quota | Catches error gracefully, switches to in-memory state, prompts to authenticate for DB sync. |
| 11 | Minimap Radar | Main map zoomed into single city slot (Zoom 11) | Frustum rectangle renders as small high-precision point indicator without crashing canvas rasterizer. |
| 12 | Minimap Drag | User drags pointer outside canvas bounds | Pointer captures clamped to canvas perimeter $[0, W_c]$ and $[0, H_c]$; camera tracks cleanly. |

---

## 9. Verification & Acceptance Criteria

1. **R1 Performance**: Voronoi calculation for 5,000+ towns finishes in $< 35\text{ ms}$ on Web Worker; MapLibre maintains steady 60 FPS during pan/zoom.
2. **R2 Filtering Precision**: Ghost towns, active sieges, and inactive momentum targets filter instantly with $< 50\text{ ms}$ UI response time.
3. **R3 Animation Accuracy**: Moving ship/flyer sprites follow the exact mathematical curvature of the Bézier arc, with correct heading angle $\theta(t)$ and sub-second synchronized ETA timers.
4. **R4 Pin Integration**: Creating a tactical pin persists locally/remotely, appears on the map, and exports directly to `/snipe` with all target parameters intact.
5. **R5 Minimap Synchronization**: Clicking or dragging any sector on the minimap immediately centers the main camera on those exact world coordinates with zero coordinate drift.
6. **Build & Type Cleanliness**: Clean compilation via `npm run build` and `prisma generate` with 0 TypeScript/Next.js errors.
