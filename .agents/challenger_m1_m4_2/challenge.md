# Adversarial Challenge Report — Challenger 2

## Challenge Summary

**Overall risk assessment**: **HIGH**

Empirical testing confirmed robust implementations for MapLibre Multi-LOD layer transitions, the physical proportion scaling curve ($0.007 \times 2^Z$), same-island 40-step quadratic Bézier trajectory rendering, and nested object safety via `normalizeTownData`.

However, a **HIGH** severity API response contract mismatch was empirically discovered in query parameter ingestion for `/snipe` and `/snipe/recall`. When navigating from the Route Planner tool via the "Send to Sniper Tool" button (`/snipe?targetTownId={id}&originTownId={id}` or `/snipe/recall?targetTownId={id}&originTownId={id}`), the target and origin towns fail to ingest properly because `/api/world/town/[id]` returns `{ town: {...}, history: [...], activity: {...}, conquests: [...] }`, but the receiving pages attempt to access flat properties (`data.name`, `data.islandX`) directly on the wrapper object.

---

## Challenges

### [HIGH] Challenge 1: API Response Contract Mismatch in `/snipe` and `/snipe/recall` Parameter Ingestion

- **Assumption challenged**: The sniper tools assume `/api/world/town/[id]` returns a flat `Town` object (`{ id, name, islandX, islandY, ... }`).
- **Attack scenario**: 
  1. A user in the Route Planner on the map selects Origin City "Athens" (ID: 101) and Target City "Sparta" (ID: 102).
  2. The user clicks "Send to Sniper Tool", which links to `/snipe?targetTownId=102&originTownId=101` or navigates to `/snipe/recall?targetTownId=102&originTownId=101`.
  3. `fetch('/api/world/town/101')` returns `{ town: { id: 101, name: 'Athens', islandX: 500, islandY: 500, ... }, history: [...], activity: {...}, conquests: [...] }`.
  4. In `src/app/snipe/page.js`: `originTown.name` evaluates to `undefined`, `targetTown.name` evaluates to `undefined`.
     - The operation label becomes `"undefined → undefined"`.
     - `calculateDistance(originTown, targetTown)` receives objects with `undefined` `islandX`/`islandY`, falling back to `(500, 500)` for both, resulting in an erroneous distance calculation of `2.35` units instead of the true nautical distance.
  5. In `src/app/snipe/recall/page.js`: `targetTown.name` is `undefined`, causing `if (targetTown?.name)` to evaluate to `false`. The target town is never added to the defense groups list, and `setMovAttacker` is never populated.
- **Blast radius**: Breaks the end-to-end integration between Route Planner (R3) and Sniper / Recall Sniper tools (R3.5). Users clicking the link from the world map receive a broken/corrupt form state.
- **Mitigation**:
  In `src/app/snipe/page.js` and `src/app/snipe/recall/page.js`, un-nest the town object from the API response payload:
  ```javascript
  const data = await res.json();
  const town = data.town || data;
  ```

---

## Stress Test Results

| # | Test Scenario | Expected Behavior | Actual Behavior | Result |
|---|---------------|-------------------|-----------------|--------|
| 1 | **MapLibre LOD Stack Zoom Thresholds** | Clusters (z2.0–5.5), Landmasses (z≥5.0), 3D Towns (z≥6.5), Flags (z≥6.8), Labels (z≥8.5) | Strict minzoom/maxzoom layer hierarchy matches specification | **PASS** |
| 2 | **Calibrated Scaling Curve $0.007 \times 2^Z$** | Exact scale values $0.224$ (z5) to $28.672$ (z12) | Matches formula across all discrete and continuous zoom levels | **PASS** |
| 3 | **40 Island Terrain Sprites & Stage Models** | All 40 colonizable island types (1–16, 37–60) and 5 town stages loaded without missing image warnings | All 40 types registered in `assetLoader.js` and handled in layer expressions | **PASS** |
| 4 | **Same-Island Bézier Trajectory Control Points** | 40-step quadratic Bézier arc between distinct slots on same island with elevated apex ($\ge 0.0008$) | Generates 41 valid coordinates; start matches origin, end matches target, apex elevated | **PASS** |
| 5 | **Identical Slot Trajectory Edge Case** | Origin and target at identical slot/coordinates | Returns `null` cleanly (no degenerate 0-length line) | **PASS** |
| 6 | **Nested Object Safety (`normalizeTownData`)** | Handles `{ player: { name, alliance: { name } } }`, strings, nulls, and ghosts without React child crashes | Output contains strictly primitive strings and numbers; 0 React child crashes | **PASS** |
| 7 | **`/snipe` Query Parameter Ingestion** | Ingests `targetTownId` and `originTownId`, sets label `Origin → Target`, and computes travel duration | Evaluates `originTown.name` as `undefined` due to wrapper object `{ town: {...} }` | **FAIL** |
| 8 | **`/snipe/recall` Query Parameter Ingestion** | Ingests `targetTownId` and creates city group; ingests `originTownId` and sets attacker | Evaluates `targetTown.name` as `undefined`, failing `if (targetTown?.name)` condition | **FAIL** |
| 9 | **Production Build Verification** | `npm run build && prisma generate` compiles cleanly | Next.js 16.2.7 Turbopack builds with 0 TypeScript / compilation errors | **PASS** |
| 10 | **Vitest Automated Suite Execution** | All unit and regression tests pass | 28/28 tests passed (17 in `traveltime.test.js`, 11 in `adversarial_verification.test.js`) | **PASS** |

---

## Unchallenged Areas

- **Backend SQLite Database Synchronization (`scripts/sync.js`)**: Real-time Grepolis server synchronization relies on live external Grepolis network access, which is mocked and verified via unit/integration routes.
- **WebGL Hardware Acceleration on Specific GPU Drivers**: Simulated via MapLibre GL mock environment.
