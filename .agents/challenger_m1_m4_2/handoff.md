# Handoff Report — Challenger 2

## 1. Observation

1. **MapLibre Multi-LOD Layer Stack & Zoom Thresholds**:
   - `src/app/map/page.js`:
     - Lines 522-539 (`islands-points`): `minzoom={2}`, `maxzoom={5.5}`.
     - Lines 542-607 (`island-sprites`): `minzoom={5.0}` with physical scaling expression:
       `['interpolate', ['exponential', 2], ['zoom'], 5, 0.224, 6, 0.448, 7, 0.896, 8, 1.792, 9, 3.584, 10, 7.168, 11, 14.336, 12, 28.672]`.
     - Lines 678-713 (`clusters`, `cluster-count`): `minzoom={2}`, `maxzoom={5.5}`.
     - Lines 742-769 (`town-sprites`): `minzoom={6.5}` with stages `town_1` through `town_5`.
     - Lines 650-670 (`empty-slots-sprites`): `minzoom={6.8}`.
     - Lines 773-794 (`town-flags`): `minzoom={6.8}` with `"circle-translate": [0, -18]`.
     - Lines 797-816 (`town-labels`): `minzoom={8.5}` with halo width 2.5 and halo color `#0b101e`.

2. **Same-Island Bézier Trajectory Generation**:
   - `src/app/map/page.js` lines 270-302:
     - `const arcHeight = Math.max(chordLen * 0.20, Math.abs(dLng) * 0.12, 0.0008);`
     - Evaluates 40 steps $(t = 0 \dots 1)$, generating 41 coordinates forming a quadratic Bézier curve.
     - Origin and target coordinates accurately resolve via `island_definitions.json` coastal bay offsets.

3. **Town Details API Response Structure**:
   - `src/app/api/world/town/[id]/route.js` lines 85-90:
     ```javascript
     return NextResponse.json({
       town,
       history,
       activity,
       conquests
     });
     ```

4. **Query Parameter Ingestion in `/snipe` and `/snipe/recall`**:
   - `src/app/snipe/page.js` lines 34-55:
     ```javascript
     if (originTownId) {
       const res = await fetch(`/api/world/town/${originTownId}?world=${worldParam}`);
       if (res.ok) originTown = await res.json();
     }
     if (targetTownId) {
       const res = await fetch(`/api/world/town/${targetTownId}?world=${worldParam}`);
       if (res.ok) targetTown = await res.json();
     }

     if (originTown && targetTown) {
       setLabel(`${originTown.name} → ${targetTown.name}`);
       const dist = calculateDistance(originTown, targetTown);
       ...
     }
     ```
   - `src/app/snipe/recall/page.js` lines 36-70:
     ```javascript
     if (targetTownId) {
       const res = await fetch(`/api/world/town/${targetTownId}?world=${worldParam}`);
       if (res.ok) {
         const targetTown = await res.json();
         if (targetTown?.name) {
           ...
         }
       }
     }
     if (originTownId) {
       const res = await fetch(`/api/world/town/${originTownId}?world=${worldParam}`);
       if (res.ok) {
         const originTown = await res.json();
         if (originTown?.name) {
           setMovAttacker(originTown.name);
           setMovAttackerId(originTown.id);
         }
       }
     }
     ```

5. **Safe Data Normalization**:
   - `src/components/map/UnifiedSearchPanel.js` lines 6-33 (`normalizeTownData`):
     Safely converts `{ player: { id, name, alliance: { id, name } } }` into flat primitive strings (`player: 'Name'`, `alliance: 'Alliance'`), preventing React object child errors.

6. **Build & Automated Test Commands**:
   - `npx next build` compiled successfully in 11.3s with 0 TypeScript/Next.js errors.
   - `npx vitest run` executed 2 test files (`traveltime.test.js` and `adversarial_verification.test.js`) with 28 passing tests.

---

## 2. Logic Chain

1. From Observation 1, the MapLibre layer stack follows the exact specified LOD hierarchy: macro density clusters (Z 2.0–5.5), 4K landmasses (Z ≥ 5.0), 3D town sprites (Z ≥ 6.5), alliance flags (Z ≥ 6.8), and name labels (Z ≥ 8.5).
2. The scaling curve expression `0.007 * 2^Z` produces the exact icon-size multiplier required ($0.224$ at Z5, $0.448$ at Z6, ..., $28.672$ at Z12).
3. From Observation 2, same-island transit trajectories between distinct slots compute non-zero chord lengths with an elevated apex height ($\ge 0.0008$), generating smooth 40-step quadratic Bézier arcs without flattening or degenerating into 0-length artifacts.
4. From Observation 5, `normalizeTownData` completely insulates UI components against React child crashes when dealing with relational database objects.
5. From Observation 3 and Observation 4, `/api/world/town/[id]` wraps the town record inside `{ town: {...}, history, activity, conquests }`.
6. When `/snipe/page.js` and `/snipe/recall/page.js` fetch `/api/world/town/[id]`, they treat the returned JSON payload directly as the town object.
7. Consequently, `originTown.name` and `targetTown.name` evaluate to `undefined`, the snipe label renders as `"undefined → undefined"`, `calculateDistance` falls back to default coordinates generating an inaccurate `2.35` distance, and `/snipe/recall` fails the `if (targetTown?.name)` check, failing to register the target city in defense groups.

---

## 3. Caveats

- Backend SQLite synchronization with real Grepolis servers (`scripts/sync.js`) requires live external network connectivity and was validated against the local seeded SQLite database and mock endpoint responses.
- Reviewer is constrained to review-only and did not modify application implementation code directly.

---

## 4. Conclusion

- **Verdict**: **REQUEST_CHANGES**
- **Required Fix**:
  In `src/app/snipe/page.js` (lines 35-55) and `src/app/snipe/recall/page.js` (lines 37-70), extract the inner town object from the API response payload:
  ```javascript
  const data = await res.json();
  const town = data.town || data;
  ```
  This will resolve the `undefined` name/distance bug in `/snipe` and restore automatic group creation in `/snipe/recall`.

---

## 5. Verification Method

1. **Automated Unit Tests**:
   ```bash
   npx vitest run
   ```
   All 28 tests across `traveltime.test.js` and `adversarial_verification.test.js` should pass.

2. **Production Build Verification**:
   ```bash
   npx next build
   ```
   Must pass with 0 errors.

3. **URL Parameter Ingestion Verification**:
   Navigate to `http://localhost:3000/snipe?targetTownId=1&originTownId=2` and verify that the operation label displays the actual city names (e.g. `Town A → Town B`) and correct travel duration, rather than `undefined → undefined`.
