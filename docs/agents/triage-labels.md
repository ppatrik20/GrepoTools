# Triage Labels & Taxonomy

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker, and documents the full label taxonomy.

## Canonical Triage Roles

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## Issue Types (4-Tier Hierarchy)

| Type Label   | Color     | Description                                                          |
| ------------ | --------- | -------------------------------------------------------------------- |
| `type:idea`  | `#C5DEF5` | Feature proposals, brainstorming, UX/mechanic enhancements           |
| `type:plan`  | `#7057FF` | Architectural plans, epics, roadmaps, and multi-slice initiatives    |
| `type:bug`   | `#D73A4A` | Bugs, regressions, calculation errors, or system defects             |
| `type:task`  | `#0075CA` | Concrete implementation tickets and tracer bullets                   |
| `type:docs`  | `#0052CC` | Documentation, ADRs, GLOSSARY, or operational guides                 |

## Priority Tiers

| Priority Label      | Color     | Description                                                            |
| ------------------- | --------- | ---------------------------------------------------------------------- |
| `priority:critical` | `#B60205` | System down, corrupted database/sync, blocking operations              |
| `priority:high`     | `#E99695` | Major feature broken, inaccurate calculation, severe regression        |
| `priority:normal`   | `#FEF2C0` | Normal priority: standard enhancement or minor issue                   |
| `priority:low`      | `#EEEEEE` | Low priority: nice-to-have polishing or minor tweak                    |

## Domain Areas

| Area Label        | Color     | Subsystem                                                          |
| ----------------- | --------- | ------------------------------------------------------------------ |
| `area:map`        | `#BFDADC` | World map rendering, WebGL engine, coordinate projections          |
| `area:intel`      | `#D4C5F9` | Tactical overlays, ghost radar, siege radar, farm finder           |
| `area:operations` | `#F9D0C4` | Route planner, Bézier troop transit, ETA math, sniper coordination |
| `area:pins`       | `#C2E0C6` | Tactical pinboard, target markers, alliance coordination           |
| `area:sync`       | `#FFA500` | World data ingestion, Grepolis API scraping, cache pipelines       |
| `area:auth`       | `#F9C80E` | Authentication, session management, roles, audit logging           |
| `area:ui`         | `#B3D4FC` | Design system primitives, HUD controls, responsive layout, a11y     |
| `area:arch`       | `#5319E7` | Core architecture, database schemas, performance, seam refactoring |

## Wayfinder Roles

| Wayfinder Label       | Color     | Meaning                                        |
| --------------------- | --------- | ---------------------------------------------- |
| `wayfinder:map`       | `#006B75` | Master roadmap issue with sub-issues           |
| `wayfinder:research`  | `#5319E7` | Research investigation ticket                  |
| `wayfinder:prototype` | `#BFD4F2` | Throwaway prototype ticket                     |
| `wayfinder:grilling`  | `#B60205` | Plan stress-testing / grilling ticket          |
| `wayfinder:task`      | `#1D76DB` | Execution ticket                               |
