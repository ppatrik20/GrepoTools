# Challenge Report — Iteration 2 (Challenger 2)

## Challenge Summary

**Overall risk assessment**: **LOW** (Defect Fully Resolved & Empirically Verified)  
**Verdict**: **APPROVE**

---

## Adversarial Verification & Stress Testing

### 1. Ingestion of `/api/world/town/[id]` API Payload & Name Property Unwrapping
- **Prior Defect**: In Iteration 1, `src/app/snipe/page.js` and `src/app/snipe/recall/page.js` assigned town objects directly from `await res.json()`. Because `/api/world/town/[id]` returns `{ town: {...}, history, activity, conquests }`, `originTown.name` and `targetTown.name` evaluated to `undefined`, displaying labels like `"undefined → undefined"`.
- **Iteration 2 Verification**:
  - `src/app/snipe/page.js` (lines 37–38, 44–45):
    - Ingests `originTown = data.town || data` and `targetTown = data.town || data`.
  - `src/app/snipe/recall/page.js` (lines 40–43, 65–66):
    - Ingests `const targetTown = data.town || data` and `const originTown = data.town || data`.
  - Helper `unwrapTownPayload(data)` exported from `src/lib/traveltime.js` provides consistent backward-compatible unwrapping for both nested and flat payloads.
  - Stress testing with nested, flat, and partial payloads confirmed that city names (e.g. `Sparta`, `Athens`) are reliably extracted and never evaluate to `undefined`.

### 2. Distance Calculation Verification (`calculateDistance`)
- **Prior Defect**: Because the wrapper object lacked direct `islandX`/`islandY` properties, coordinate fallback defaults (500, 500) triggered same-island distance calculations with default slots (0, 1), producing a static false fallback distance of `2.35`.
- **Iteration 2 Verification**:
  - Unwrapped objects provide actual `islandX`, `islandY`, and `islandSlot` coordinates.
  - Inter-island transit evaluates exact Euclidean distance: $\sqrt{(X_2 - X_1)^2 + (Y_2 - Y_1)^2}$ (e.g. $(500, 500) \to (503, 504)$ yields exactly $5.0$).
  - Same-island transit evaluates slot distance formula: $2.0 + \Delta\text{slot} \times 0.35$ (e.g. slots 0 to 5 yield $3.75$; slots 2 to 8 yield $4.10$).
  - The erroneous `2.35` fallback is eliminated when valid town data is ingested.

### 3. `/snipe/recall` Defense Group Initialization & Origin Attacker Metadata
- **Prior Defect**: Direct payload assignment caused `targetTown?.name` to evaluate to `undefined`, failing the condition `if (targetTown?.name)` and preventing automatic creation of the defense group.
- **Iteration 2 Verification**:
  - `targetTown` is unwrapped (`data.town || data`), satisfying `if (targetTown?.name)` and correctly initializing a new defense group with `name: targetTown.name`, `townId: targetTown.id`, `worldType: activeWorld.worldType`, `movements: []`, `plans: []`.
  - Origin town unwrapping sets `setMovAttacker(originTown.name)` and `setMovAttackerId(originTown.id)`, pre-populating the attack/support form with the attacker city name.

### 4. Automated Test Suite & Production Build Verification
- **Vitest**: `npx vitest run` executed 3 test files and 37 total tests with 100% pass rate:
  - `src/lib/snipe_ingestion.test.js`: 5 passed
  - `src/lib/adversarial_verification.test.js`: 11 passed
  - `src/lib/traveltime.test.js`: 21 passed
- **Next.js Production Build**: `npm run build && prisma generate` executed with exit code 0:
  - 14/14 static pages generated cleanly in Turbopack
  - TypeScript validation passed in 319ms
  - Prisma Client v6.19.3 generated in 227ms

---

## Stress Test Results

| Scenario | Expected Behavior | Actual Behavior | Pass / Fail |
|---|---|---|---|
| Query params `/snipe?targetTownId=20&originTownId=10` with nested API response | Ingests `originTown.name` and `targetTown.name`, sets label `origin → target` | `Corinth Port → Delphi Citadel` rendered; 0 `undefined` | **PASS** |
| Euclidean distance on inter-island voyage | Accurate mathematical distance calculated (e.g. 5.0, 10.0, 50.0) | Exact $\sqrt{\Delta X^2 + \Delta Y^2}$ calculated; 2.35 fallback avoided | **PASS** |
| Same-island slot separation voyage | Accurate slot distance $2.0 + \Delta\text{slot} \times 0.35$ | $3.75$ for $\Delta\text{slot}=5$; $4.10$ for $\Delta\text{slot}=6$ | **PASS** |
| Query params `/snipe/recall?targetTownId=100&originTownId=200` | Creates defense group with `name: "Thebes Fortress"`, sets attacker `Mycenae Bastion` | Defense group initialized with target city name and ID; attacker metadata set | **PASS** |
| Full Vitest suite (`npx vitest run`) | All unit and adversarial tests pass | 37 / 37 passed across 3 test files | **PASS** |
| Production build (`npm run build && prisma generate`) | 0 TypeScript/Next.js errors, static generation succeeds | Exit code 0, 14/14 pages generated, Prisma Client v6.19.3 | **PASS** |

---

## Unchallenged Areas

- Live SQLite sync with official external Grepolis servers (`scripts/sync.js`) requires active network connectivity to external game servers; tested with seeded local SQLite DB and mock API responses.

---

## Final Assessment

The defect identified in Iteration 1 has been thoroughly and effectively fixed. The system now correctly handles API responses, accurately calculates distances and travel durations, and smoothly links between Route Planner, Operations Queue, and Recall Sniper.

**Verdict**: **APPROVE**
