# Orchestration Plan: Next-Generation Grepolis World Map Tactical Command Suite

## Objective
Implement R1-R5 on the Grepolis World Map web application:
- R1: Political & Frontline Heatmaps (Voronoi Alliance Spheres of Influence, contested boundary outlines, toggle in control panel)
- R2: Conquest & Intel Radar Overlays (Ghost Hunter Radar, Active Siege / Contest Radar, Inactive Farm Finder)
- R3: Animated Troop Movement & Trajectory Tracker (animated ships/mythical sprites gliding on Bézier curves, countdown timers, multi-origin sniping paths)
- R4: Tactical Alliance Pinboard & Operation Markers (Primary Target, Stack Biremes, Break Siege, notes/priority, one-click export to snipe/planner, persistent storage)
- R5: Interactive Minimap Radar Widget (1000x1000 world overview with active viewport camera rectangle, pan on click/drag)
- Verification: clean production build, prisma generate, unit/component tests, full acceptance criteria verification.

## Execution Phases

### Phase 0: Survey & Architecture Discovery (Parallel)
- Dispatch 3 Explorers / Spec Miners:
  - Explorer 1 (`survey_explorer_1`): Map existing codebase structure, Next.js / React map components (MapLibre, Deck.gl, Canvas, etc.), state management, Prisma schema, existing API routes.
  - Explorer 2 (`survey_explorer_2`): Map Route Planner, Snipe tool, Town/Player/Alliance data models, coordinate systems (1000x1000 grid / ocean sectors), storage mechanisms.
  - Spec Miner (`survey_spec_miner_3`): Extract and formalize all UI/UX and algorithmic requirements for R1-R5 from ORIGINAL_REQUEST.md and existing UI patterns.
- Merge findings into `PROJECT.md` with Feature Inventory, Milestones, Architecture, Code Layout, Interface Contracts.

### Phase 1: Dual Track Launch
- Track A (E2E Testing Track): Spawn E2E Test Writer / Orchestrator to build comprehensive tests and publish `TEST_READY.md`.
- Track B (Implementation Milestones):
  - M1: Political & Frontline Heatmaps (Voronoi & Contested Zones)
  - M2: Conquest & Intel Radar Overlays (Ghost, Siege, Inactive)
  - M3: Animated Troop Movement & Trajectory Tracker
  - M4: Tactical Alliance Pinboard & Operation Markers
  - M5: Interactive Minimap Radar Widget

### Phase 2: Milestone Iteration Loops (Direct / Delegated)
For each milestone:
- Spawn 3 Explorers -> 1 Worker -> 2 Reviewers -> 2 Challengers -> 1 Forensic Auditor -> Gate Evaluation.

### Phase 3: Final E2E Verification & Adversarial Coverage Hardening
- Run full test suite (`npm run build && prisma generate`, E2E tests).
- Adversarial hardening and final forensic audit.
- Final completion handoff report.
