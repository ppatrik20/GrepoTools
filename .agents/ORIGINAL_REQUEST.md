# Original User Request

## 2026-09-02T16:55:48Z

# Next-Generation Grepolis World Map: Tactical Command Suite & Intelligence Overlays

Working directory: d:\Dev\Web\Grepolis
Integrity mode: development

Transform the Grepolis World Map into a comprehensive, military-grade strategy command viewer featuring political territory influence heatmaps, intel radar overlays, animated troop transit trajectories, alliance tactical pinboards, and a global minimap radar.

## Requirements

### R1. Political & Frontline Heatmaps (Voronoi Alliance Spheres of Influence)
- Render dynamic, GPU-accelerated alliance territory polygons (Voronoi cells or convex boundary hulls) based on town ownership, tinted with official alliance hex colors.
- Visually demarcate core alliance territory vs. high-tension contested frontline border zones where rival coalitions clash.
- Provide an interactive map toggle in the top control panel switching between **Geographic View** and **Political / Frontline View**.

### R2. Conquest & Intel Radar Overlays
- Build dedicated, toggleable tactical radar overlays:
  - **👻 Ghost Hunter Radar**: Highlights unowned/ghost towns with point indicators and vacancy age.
  - **⚔️ Active Siege / Contest Radar**: Highlights contested towns or islands undergoing heavy ownership shifts.
  - **💤 Inactive Farm Finder**: Identifies inactive players with low point momentum for rapid raid targeting.

### R3. Animated Troop Movement & Trajectory Tracker
- Upgrade the Route Planner to render smooth, animated travel trajectories (visual ship and mythical flying unit sprites gliding along the arcing Bézier flight paths).
- Include live ETA countdown timers floating above the travelling unit icons.
- Support multi-origin sniping paths to coordinate coordinated landings on a single target city.

### R4. Tactical Alliance Pinboard & Operation Markers
- Provide a collaborative in-map pinboard system allowing players to drop tactical markers on any town or coordinate:
  - Operation Pins: `Primary Target`, `Secondary Target`, `Stack Biremes`, `Break Siege`.
  - Custom notes and priority tags (`Critical`, `High`, `Normal`).
  - One-click export to the Recall Sniper (`/snipe`) and Planner tools.

### R5. Interactive Minimap Radar Widget
- Embed a draggable/collapsible minimap radar widget in the bottom corner showing the full 1000x1000 world overview with active viewport camera rectangle.
- Clicking or dragging anywhere on the minimap immediately pans the main MapLibre camera to that ocean sector.

## Acceptance Criteria

### Political & Frontline Heatmaps
- [ ] Toggling "Political View" renders smooth, semi-transparent Voronoi / boundary polygons color-coded by top alliances without tanking frame rate (60 FPS maintained).
- [ ] Islands with multiple rival alliances show highlighted contested boundary outlines.

### Intel Radar Overlays
- [ ] "Ghost Hunter" filter clearly distinguishes ghost towns from player towns with prominent custom markers.
- [ ] Inactive / farm radar highlights low-momentum targets with instant filter controls.

### Animated Troop Tracker & Transit
- [ ] Calculating a route displays an animated unit icon (naval ship or mythical flyer) traversing the arcing trajectory.
- [ ] Arrival countdown displays real-time seconds ticking down to zero.

### Tactical Pinboard & Operations
- [ ] Clicking any town allows adding or removing a tactical operation pin (`Primary Target`, `Bireme Bunker`, etc.).
- [ ] Pins persist across sessions (in local storage or database) and render distinctly above town sprites.

### Minimap Radar Widget
- [ ] Bottom radar displays global island distribution with an interactive bounding box indicating current viewport.
- [ ] Clicking any sector on the radar smoothly centers the main map on those coordinates.

### Production Build & Stability
- [ ] `npm run build && prisma generate` compiles cleanly with 0 TypeScript/Next.js errors.
