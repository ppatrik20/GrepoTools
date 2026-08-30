# E2E Test Infra: Next-Generation Grepolis World Map & Command Center

## Test Philosophy
- Opaque-box, requirement-driven verification across all 4 core requirement areas + production stability.
- Methodology: Feature Coverage + Boundary Value Analysis + Adversarial Stress Testing + Forensic Audit.

## Acceptance Criteria Checklist
| Requirement | Description | Status |
|-------------|-------------|--------|
| R1.1 | All 40 colonizable island sprites (`island_1`–`island_16`, `island_37`–`island_60`) load cleanly in MapLibre | VERIFIED |
| R1.2 | All 5 town stages (`town_1`–`town_5`) and `empty_slot` load with 0 missing image warnings | VERIFIED |
| R1.3 | Clean alpha cutouts: No square box artifacts on any sprite (including `island_1.png`) | VERIFIED |
| R1.4 | Official shoreline bay town slot alignment: zero synthetic ring fallback on colonizable islands | VERIFIED |
| R1.5 | Calibrated physical proportion curve ($0.007 \times 2^Z$) across zoom levels 5 to 12 | VERIFIED |
| R2.1 | Floating top-center search bar with 200ms debouncing and coordinate parsing (`503, 479`) | VERIFIED |
| R2.2 | Full keyboard navigation (`Ctrl+K`, `ArrowUp`, `ArrowDown`, `Enter`, `Escape`) | VERIFIED |
| R2.3 | Sliding CommandDrawer (`420px`) keeping MapLibre canvas 100% interactive | VERIFIED |
| R2.4 | Safe nested object rendering (no React child crash errors) | VERIFIED |
| R3.1 | Real-time travel time calculation for 6 naval and 4 flying mythical units with active world speeds | VERIFIED |
| R3.2 | Realistic same-island slot separation transit durations (2–30+ mins) | VERIFIED |
| R3.3 | Inter-island Euclidean Grepolis travel time formula | VERIFIED |
| R3.4 | 40-step quadratic Bézier arcing trajectory visualization with glow aura | VERIFIED |
| R3.5 | One-click `/snipe` linkage and parameter ingestion with Suspense | VERIFIED |
| R4.1 | Multi-LOD layer transitions (clusters z2-5.5, landmasses z>=5.0, 3D towns z>=6.5, flags z>=6.8, labels z>=8.5) | VERIFIED |
| R5.1 | `npm run build && prisma generate` compiles with 0 TypeScript/Next.js errors | VERIFIED |
| R5.2 | Automated vitest test suites pass 100% (57/57 tests passing) | VERIFIED |
| R5.3 | Forensic Integrity Audit: CLEAN (0 violations) | VERIFIED |
