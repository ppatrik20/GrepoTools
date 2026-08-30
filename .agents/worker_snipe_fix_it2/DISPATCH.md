## 2026-08-30T19:02:46Z
You are the Implementation Worker for Iteration 2 of the Next-Generation Grepolis World Map & Command Center.
Your working directory is: d:\Dev\Web\Grepolis\.agents\worker_snipe_fix_it2
Authoritative user request: d:\Dev\Web\Grepolis\.agents\ORIGINAL_REQUEST.md
Challenger report: d:\Dev\Web\Grepolis\.agents\challenger_m1_m4_2\handoff.md

You MUST read d:\Dev\Web\Grepolis\.agents\ORIGINAL_REQUEST.md first.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task to fix:
Challenger 2 discovered an API response structure nesting issue:
In `src/app/api/world/town/[id]/route.js`, the response JSON is formatted as:
`{ town: {...}, history, activity, conquests }`

In `src/app/snipe/page.js` and `src/app/snipe/recall/page.js`:
When fetching `/api/world/town/${id}`, the code currently expects a flat town object directly from `res.json()`.
You must unwrap the town payload:
`const data = await res.json();`
`const town = data.town || data;`
Ensure:
1. In `src/app/snipe/page.js`: `originTown` and `targetTown` are extracted from `data.town || data`, resolving `town.name`, `town.x`, `town.y`, etc., properly setting the label (e.g. `OriginTown → TargetTown`) and computing `calculateDistance(originTown, targetTown)`.
2. In `src/app/snipe/recall/page.js`: `targetTown` and `originTown` are extracted from `data.town || data`, properly setting the defense group name and origin attacker town name and ID.
3. Add/update tests in `src/lib/traveltime.test.js` or `src/lib/snipe_ingestion.test.js` to verify that API response structure `{ town: { id: '1', name: 'Sparta', x: 500, y: 500 } }` correctly extracts town properties.
4. Execute `npm run build && prisma generate` and `npx vitest run` to ensure 0 errors.

Deliverables:
- Write `changes.md` and `handoff.md` in `d:\Dev\Web\Grepolis\.agents\worker_snipe_fix_it2`.
- Update `progress.md`.
- Send completion message to parent.
