# Context: Next-Generation Grepolis World Map & Command Center

## Project Objective
Transform the Grepolis World Map into a high-performance, pixel-accurate tactical command viewer and intelligence suite in Next.js / MapLibre GL.

## Requirements Breakdown
1. **R1: Complete 4K Asset Pipeline & Pixel-Perfect Terrain Alignment**
   - 40 island terrain types (`island_1` to `island_60`)
   - 5 town growth stages (`town_1` Hamlet to `town_5` Metropolis)
   - Empty colonization slot icons (`empty_slot`)
   - Zero missing image warnings (`styleimagemissing` clean)
   - Coastal bay shoreline alignment (eliminate synthetic ring fallbacks on islands with slot definitions)
   - Physical proportion curve: $0.007 \times 2^Z$ for islands and town sprites across zoom 5 to 12.

2. **R2: In-Map Tactical & Intelligence Command Suite**
   - Floating top-center search bar with instant categorized autocomplete (Players, Alliances, Towns, Coordinates e.g. `503, 479`)
   - Keyboard navigation (Arrow Up/Down, Enter, Esc, Ctrl+K focus)
   - Persistent sliding intelligence drawer (`CommandDrawer`) with city stats, growth stages, island slot distributions, player battle points (ABP/DBP), 7-day momentum charts
   - Safe nested object handling (no React child crashes when rendering player/alliance objects)

3. **R3: Real-Time Troop Route & Distance Tool**
   - Interactive naval and mythical troop travel time calculator
   - Same-island transit durations (2–30 mins based on slot separation distance)
   - Inter-island Euclidean travel times matching official Grepolis formulas with active world speeds
   - Arcing dashed flight/naval trajectory line rendered on MapLibre
   - One-click link into Recall Sniper tool (`/snipe`)

4. **R4: Multi-LOD Layer Stack & Alliance Flags**
   - Clustered density bubbles at zoom 2 to 5.5
   - 4K island landmasses at zoom >= 5.0
   - 3D architectural town models and empty slots at zoom >= 6.5
   - Alliance flag badges floating above 3D town models tinted with live alliance hex colors at zoom >= 6.8
   - Town name labels with high-contrast halos at zoom >= 8.5

5. **R5: Production Build & Stability**
   - `npm run build && prisma generate` passes with 0 TypeScript/Next.js errors.
