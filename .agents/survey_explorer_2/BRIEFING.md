# BRIEFING — 2026-09-02T19:00:30Z

## Mission
Investigate Grepolis codebase data models, APIs, existing tools (Route Planner, Recall Sniper), coordinate systems, ghost/inactive calculations, and persistence mechanisms to inform the Next-Generation Grepolis World Map implementation.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, data models & APIs analyst
- Working directory: d:\Dev\Web\Grepolis\.agents\survey_explorer_2
- Original parent: 948c56ec-8a62-4601-a3dc-1af31b696272
- Milestone: Survey & Architectural Analysis (Explorer 2)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify source code files
- Provide exact file paths, line numbers, and verbatim code references
- Analyze data models (Prisma), APIs, coordinates, ghost/inactive calculation, Route Planner, Recall Sniper, and state persistence

## Current Parent
- Conversation ID: 948c56ec-8a62-4601-a3dc-1af31b696272
- Updated: 2026-09-02T19:00:30Z

## Investigation State
- **Explored paths**: `prisma/schema.prisma`, `src/lib/geojson.js`, `src/lib/traveltime.js`, `src/lib/scoreboard.js`, `src/lib/syncEngine.js`, `src/app/map/page.js`, `src/components/map/RoutePlannerTool.js`, `src/app/snipe/page.js`, `src/app/snipe/recall/page.js`, all 27 API routes in `src/app/api/`.
- **Key findings**: Complete mapping of Prisma entities, coordinate and ocean calculation math, ghost town detection, travel speed and recall formulas, persistence breakdown (LocalStorage vs Prisma DB), and 27 REST route handlers.
- **Unexplored areas**: None within the scope of Explorer 2.

## Key Decisions Made
- Structured complete analysis in `analysis.md` and 5-component report in `handoff.md`.

## Artifact Index
- `.agents/survey_explorer_2/analysis.md` — Full structured analysis report
- `.agents/survey_explorer_2/handoff.md` — 5-component handoff report
- `.agents/survey_explorer_2/progress.md` — Liveness & progress tracker
- `.agents/survey_explorer_2/DISPATCH.md` — Dispatch logs
