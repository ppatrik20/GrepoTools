# Original User Request

## 2026-08-30T18:44:15Z

# Complete the Next-Generation Grepolis World Map & Command Center

Working directory: d:\Dev\Web\Grepolis
Integrity mode: development

Transform the Grepolis World Map into a high-performance, pixel-accurate tactical command viewer and intelligence suite in Next.js / MapLibre GL.

## Requirements

### R1. Complete 4K Asset Pipeline & Pixel-Perfect Terrain Alignment
- Standardize and load all 40 island terrain types(`island_1` to `island_60`), all 5 town growth stages (`town_1` Hamlet to `town_5` Metropolis), and empty colonization slot icons (`empty_slot`).
- Ensure all sprites load dynamically with zero missing image warnings or WebGL canvas dropouts.
- Eliminate synthetic ring fallbacks on all islands that have official town slot definitions, positioning towns and colonization slots along coastal bay shorelines.
- Scale island landmasses and town sprites using the calibrated physical proportion curve ($\delegated 0.007 \times 2^Z*) so towns remain locked to their shoreline bays across zoom levels 5 to 12.

### R2. In-Map Tactical & Intelligence Command Suite
- Deliver a floating top-center search bar with instant categorized autocomplete (Players, Alliances, Towns, Coordinates e.g. `503, 479`) with full keyboard navigation (Arrow Up/Down, Enter, Esc, and `Ctrl+K` focus).
- Provide a persistent sliding intelligence drawer (`CommandDrawer`) that displays city stats, growth stages, island slot distributions, player battle points (ABP/DBP), and 7-day momentum charts while keeping the map fully interactive.
- Ensure all entity selections and searches handle nested player/alliance objects safely without React child rendering crashes.

### R3. Real-Time Troop Route & Distance Tool
- Provide an interactive naval and mythical troop travel time calculator.
- Calculate accurate travel times for both same-island transit (slot separation distance) and inter-island nautical voyages using official Grepolis speed formulas scaled by active world speeds.
- Render an arcing dashed flight/naval trajectory line on MapLibre between selected origin and target cities.
- Provide a one-click action linking origin and target cities into the Recall Sniper tool (`/snipe`).

### R4. Multi-LOD Layer Stack & Alliance Flags
- Render clustered density bubbles at macro zoom (zoom 2 to 5.5).
- Transition smoothly to 4K island landmasses at zoom ≥ 5.0.
- Render 3D architectural town models and empty slots at zoom ≥ 6.5.
- Display dynamic alliance flag badges floating directly above 3D town models tinted with live alliance hex colors at zoom ≥ 6.8.
- Display town name labels with high-contrast halos at zoom ≥ 8.5.

## Acceptance Criteria

### Asset Integrity & Rendering
- [ ] MapLibre loads all island sprites, town stage sprites, and empty slot foundations with zero console warnings (`styleimagemissing` clean).
- [ ] No square background box artifacts on any sprite (all assets have clean alpha cutouts).
- [ ] Island landmasses and coastal town slots visually align in correct proportions across zoom levels 6 through 12.

### Command Suite & Search
- [ ] Search input supports keyboard navigation (`ArrowDown`, `ArrowUp`, `Enter`, `Escape`) and selects items without page reload or errors.
- [ ] Searching or clicking towns, players, alliances, or coordinates never crashes React with object child errors.
- [ ] Selecting an entity opens the sliding intelligence drawer without obscuring the full map view.

### Route Planner
- [ ] Selecting two towns displays distinct, realistic travel durations for all naval fleet units (Biremes, Light Ships, Colony Ships) and flying mythical units (Pegasus, Harpy, Manticore, Griffin).
- [ ] Same-island movements calculate realistic on-island transit durations (2–30 mins) rather than 0 or a static 1 min clamp.
- [ ] Inter-island movements calculate exact Euclidean travel times matching Grepolis formulas.

### Production Build & Stability
- [ ] `npm run build && prisma generate` passes with 0 TypeScript/Next.js errors.
