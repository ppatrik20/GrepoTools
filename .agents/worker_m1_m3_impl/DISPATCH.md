## 2026-08-30T18:50:33Z
You are the Implementation Worker for Milestones 1 & 3 of the Next-Generation Grepolis World Map & Command Center.
Your working directory is: d:\Dev\Web\Grepolis\.agents\worker_m1_m3_impl
Authoritative user request: d:\Dev\Web\Grepolis\.agents\ORIGINAL_REQUEST.md
Scope and project definitions: d:\Dev\Web\Grepolis\PROJECT.md and d:\Dev\Web\Grepolis\TEST_INFRA.md

You MUST read d:\Dev\Web\Grepolis\.agents\ORIGINAL_REQUEST.md first.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Tasks to implement:
1. **Clean `public/map/islands/island_1.png` Alpha Noise (Requirement R1)**:
   - `public/map/islands/island_1.png` has ~89,979 background pixels with residual alpha (alpha 21–27), causing a square box artifact on dark sea backgrounds.
   - Clean the alpha channel (clamp alpha <= 30 to 0) so `island_1.png` has a 100% clean alpha cutout identical to the other 39 island PNGs. Verify that corner pixels have alpha = 0.
2. **Calibrated Physical Proportion Scaling Curve (Requirement R1, R4)**:
   - In `src/app/map/page.js`, ensure the `island-sprites` layer icon-size uses the calibrated physical curve: $0.007 \times 2^Z$ across zoom levels 5 to 12 (e.g., zoom 5: 0.224, zoom 6: 0.448, zoom 7: 0.896, zoom 8: 1.792, zoom 9: 3.584, zoom 10: 7.168, zoom 11: 14.336, zoom 12: 28.672).
3. **Shoreline Bay Slot Positioning (Requirement R1)**:
   - In `src/lib/geojson.js`, verify that town slots for all 40 colonizable island types (1–16, 37–60) strictly use the official 581 shoreline offsets defined in `src/lib/map/island_definitions.json`. Ensure no synthetic ring fallback is triggered on colonizable islands.
4. **Recall Sniper (`/snipe`) Parameter Ingestion (Requirement R3)**:
   - In `src/app/snipe/page.js` and `src/app/snipe/recall/page.js`, add `useSearchParams` ingestion (or wrap in Suspense) so that when navigating from the Route Planner tool (`/snipe?targetTownId=...&originTownId=...`), the target/origin town IDs are parsed and pre-selected in the sniper/recall forms.
5. **Same-Island Trajectory Arc (Requirement R3)**:
   - In `src/app/map/page.js`, when origin and target towns are on the same island, calculate the trajectory line between the actual town slot coordinates rather than identical island center coordinates, so an arcing trajectory line is rendered properly between same-island towns.
6. **Production Build & Test Verification**:
   - Run `npm run build && prisma generate` to verify 0 TypeScript/Next.js errors.
   - Run `npx vitest run` to verify all unit tests pass.

Deliverables:
- Write `changes.md` and `handoff.md` in your working directory `d:\Dev\Web\Grepolis\.agents\worker_m1_m3_impl`.
- Document all modified files, test outputs, and build verification.
- Update `progress.md` with status.
- Send a completion message to parent with summary and file paths.
