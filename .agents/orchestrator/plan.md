# Plan: Next-Generation Grepolis World Map & Command Center

## Phase 0: Survey & Codebase Exploration
- Spawn 3 Explorers in parallel to map:
  1. MapLibre GL setup, island sprite pipeline, town stage models, slot coordinates, projection/scaling math.
  2. Search bar, autocomplete, keyboard shortcuts, CommandDrawer components, nested player/alliance data structures.
  3. Route planner, distance calculation formulas (same-island and inter-island), troop travel speeds, MapLibre trajectory layer, /snipe integration.

## Phase 1: Architecture Synthesis & Project Mapping
- Synthesize Explorer reports into `PROJECT.md` (Feature Inventory, Architecture, Milestones, Interface Contracts, Code Layout).
- Create `TEST_INFRA.md` with full test criteria.

## Phase 2: Execution & Verification
- Execute Milestones through Explorer -> Worker -> Reviewer -> Challenger -> Auditor loop.
- Validate `npm run build && prisma generate` passes with 0 errors.

## Phase 3: Final Review & Delivery
- Validate against all acceptance criteria in `ORIGINAL_REQUEST.md`.
- Produce final completion report.
