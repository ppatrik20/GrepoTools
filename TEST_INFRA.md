# E2E Test Infra: Next-Generation Grepolis World Map Tactical Command Suite

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Derived directly from `ORIGINAL_REQUEST.md` acceptance criteria across R1 through R5.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Workload) |
|---|---|---|:---:|:---:|:---:|:---:|
| F1 | Political Voronoi Territory Heatmaps | ORIGINAL_REQUEST §R1 | ≥5 | ≥5 | ✓ | ✓ |
| F2 | Contested Frontline Border Outlines | ORIGINAL_REQUEST §R1 | ≥5 | ≥5 | ✓ | ✓ |
| F3 | Map Control Panel Mode Toggle | ORIGINAL_REQUEST §R1 | ≥5 | ≥5 | ✓ | ✓ |
| F4 | Ghost Hunter Radar Overlay | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ | ✓ |
| F5 | Active Siege / Contest Radar | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ | ✓ |
| F6 | Inactive Farm Finder Overlay | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ | ✓ |
| F7 | Bézier Route Trajectory Upgrade | ORIGINAL_REQUEST §R3 | ≥5 | ≥5 | ✓ | ✓ |
| F8 | Animated Troop Transit Sprites | ORIGINAL_REQUEST §R3 | ≥5 | ≥5 | ✓ | ✓ |
| F9 | Live ETA Countdown Timers | ORIGINAL_REQUEST §R3 | ≥5 | ≥5 | ✓ | ✓ |
| F10 | Multi-Origin Sniping Coordination | ORIGINAL_REQUEST §R3 | ≥5 | ≥5 | ✓ | ✓ |
| F11 | Tactical Operation Pin Markers | ORIGINAL_REQUEST §R4 | ≥5 | ≥5 | ✓ | ✓ |
| F12 | Custom Notes & Priority Tagging | ORIGINAL_REQUEST §R4 | ≥5 | ≥5 | ✓ | ✓ |
| F13 | One-Click Export to Sniper/Planner | ORIGINAL_REQUEST §R4 | ≥5 | ≥5 | ✓ | ✓ |
| F14 | 1000x1000 Minimap Radar Widget | ORIGINAL_REQUEST §R5 | ≥5 | ≥5 | ✓ | ✓ |
| F15 | Minimap Click & Drag Camera Sync | ORIGINAL_REQUEST §R5 | ≥5 | ≥5 | ✓ | ✓ |

## Test Architecture
- Test Runner: `vitest` (`npx vitest run tests/e2e/tactical_suite.test.js` and component test suites).
- Test file location: `tests/e2e/tactical_suite.test.js` and `src/lib/map/*.test.js`.
- Test data: Synthetic multi-alliance world models with ghost towns, active sieges, inactive farms, multi-origin troop routes, tactical pins, and 1000x1000 coordinate bounds.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|---|---|---|
| 1 | Large-scale Coalition World War Operation | F1, F2, F3, F11, F12, F13, F10 | High |
| 2 | Island Siege Defense & Multi-Origin Bireme Sniping | F5, F8, F9, F10, F11, F13 | High |
| 3 | Rapid Ocean Ghost Hunting & Inactive Farming Sweep | F4, F6, F14, F15 | Medium |
| 4 | Deep Sea Transit Trajectory Planning & Minimap Navigation | F7, F8, F9, F14, F15 | Medium |
| 5 | Cross-Ocean Alliance Frontline Shift & Pinboard Coordination | F1, F2, F11, F12, F13 | High |

## Coverage Thresholds
- Tier 1: ≥75 test cases (5 × 15 features)
- Tier 2: ≥75 test cases (5 × 15 boundary cases)
- Tier 3: ≥15 pairwise combination tests
- Tier 4: ≥8 realistic application workload scenarios
- **Total Minimum Target**: ≥173 test assertions
