# Handoff Report — Worker Snipe Fix (Iteration 2)

## 1. Observation

1. **API Contract Discrepancy**:
   - In `src/app/api/world/town/[id]/route.js` lines 85–90, the endpoint returns:
     ```javascript
     return NextResponse.json({
       town,
       history,
       activity,
       conquests
     });
     ```
2. **Component Parameter Ingestion Defect**:
   - In `src/app/snipe/page.js` lines 36 and 40, `originTown` and `targetTown` were assigned directly from `await res.json()`.
   - In `src/app/snipe/recall/page.js` lines 39 and 64, `targetTown` and `originTown` were assigned directly from `await res.json()`.
   - As a result, properties `town.name`, `town.id`, `town.islandX`, `town.islandY`, `town.islandSlot` were accessed on the wrapper object where they evaluated to `undefined`.
3. **Fix Implemented**:
   - In `src/app/snipe/page.js`:
     ```javascript
     if (originTownId) {
       const res = await fetch(`/api/world/town/${originTownId}?world=${worldParam}`);
       if (res.ok) {
         const data = await res.json();
         originTown = data.town || data;
       }
     }
     if (targetTownId) {
       const res = await fetch(`/api/world/town/${targetTownId}?world=${worldParam}`);
       if (res.ok) {
         const data = await res.json();
         targetTown = data.town || data;
       }
     }
     ```
   - In `src/app/snipe/recall/page.js`:
     ```javascript
     if (targetTownId) {
       const res = await fetch(`/api/world/town/${targetTownId}?world=${worldParam}`);
       if (res.ok) {
         const data = await res.json();
         const targetTown = data.town || data;
         if (targetTown?.name) {
           ...
         }
       }
     }
     if (originTownId) {
       const res = await fetch(`/api/world/town/${originTownId}?world=${worldParam}`);
       if (res.ok) {
         const data = await res.json();
         const originTown = data.town || data;
         if (originTown?.name) {
           setMovAttacker(originTown.name);
           setMovAttackerId(originTown.id);
         }
       }
     }
     ```
   - In `src/lib/traveltime.js`: Added and exported `unwrapTownPayload(data)`.
4. **Automated Test Results**:
   - `npx vitest run`:
     - `src/lib/snipe_ingestion.test.js`: 5 passed
     - `src/lib/adversarial_verification.test.js`: 11 passed
     - `src/lib/traveltime.test.js`: 21 passed
     - Total: 37 passed across 3 test files in 700ms.
5. **Build Verification**:
   - `npm run build` (`next build && prisma generate`):
     - Compiled successfully in 7.1s
     - Generated static pages (14/14) in 644ms
     - Generated Prisma Client (v6.19.3) in 189ms
     - 0 errors.

---

## 2. Logic Chain

1. From Observation 1, `/api/world/town/[id]` nests the town record inside `{ town: {...}, history, activity, conquests }`.
2. From Observation 2, direct assignment from `res.json()` caused `originTown.name` and `targetTown.name` to be `undefined`, generating broken operation labels (`undefined → undefined`) and inaccurate fallback coordinate calculations.
3. From Observation 3, unwrapping `const town = data.town || data` extracts the town object regardless of whether it is wrapped in `{ town: {...} }` or passed flat.
4. With the unwrapped town record, `originTown.name`, `targetTown.name`, `originTown.islandX`, `targetTown.islandX`, `originTown.islandSlot`, and `targetTown.islandSlot` are accurately resolved.
5. `calculateDistance(originTown, targetTown)` computes accurate Euclidean / same-island distances, `calculateTravelTimeSeconds` yields accurate travel times, and defense groups / attacker fields populate cleanly in `/snipe/recall`.
6. From Observation 4 and Observation 5, all unit and adversarial tests pass and the production build compiles cleanly with zero errors.

---

## 3. Caveats

- `scripts/sync.js` SQLite synchronization relies on external Grepolis server network requests; test suite runs against local mock API structures and deterministic coordinate fixtures.
- No caveats regarding API contracts or UI rendering.

---

## 4. Conclusion

- The API payload unwrapping issue identified by Challenger 2 has been completely resolved across `src/app/snipe/page.js` and `src/app/snipe/recall/page.js`.
- Helper function `unwrapTownPayload` is available and thoroughly tested.
- All 37 vitest tests pass and production build (`next build && prisma generate`) succeeded with 0 errors.

---

## 5. Verification Method

1. **Automated Unit Tests**:
   ```bash
   npx vitest run
   ```
   Output: 37 tests passed across 3 test files.

2. **Production Build**:
   ```bash
   npm run build
   ```
   Output: Next.js build and Prisma Client generation pass with 0 errors.
