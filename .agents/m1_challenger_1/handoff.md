# Handoff Report — Milestone 1 Challenger 1 (Voronoi & Spatial Adversary)

## Verdict
**REQUEST_CHANGES**

---

## 1. Observation

### Empirical Test Execution Commands & Results
- Command: `npx vitest run tests/unit/voronoi.test.js tests/unit/voronoi_stress.test.js tests/unit/voronoi_adversarial.test.js`
- Output:
  ```
  ✓ tests/unit/voronoi.test.js (7 tests)
  ✓ tests/unit/voronoi_stress.test.js (6 tests)
  ✓ tests/unit/voronoi_adversarial.test.js (10 tests)
  Test Files: 3 passed
  Tests: 23 passed
  ```

### Code Observations in `src/lib/map/voronoi.js`

1. **`NaN` / non-finite / invalid string coordinates produce `[null, null]` in GeoJSON**:
   - Location: `src/lib/map/voronoi.js:56-65`
     ```javascript
     const coords = allianceTowns.map(t => {
       const x = Number(t.islandX ?? t.x ?? 500);
       const y = Number(t.islandY ?? t.y ?? 500);
       const lng = (x / 1000) * 360 - 180;
       const lat = -((y / 1000) * 180 - 90);
       return [lng, lat, x, y];
     });
     ```
   - Observation: When `islandX` or `islandY` is `NaN`, `Infinity`, or `'invalid'`, `Number(...)` evaluates to `NaN` or `Infinity`. The polygon calculation produces `[NaN, NaN]` coordinates which `JSON.stringify()` serializes to `[null, null]`. MapLibre / WebGL fails to render when coordinate arrays contain `null`.

2. **Unhandled `null` or `undefined` elements inside `towns` array**:
   - Location: `src/lib/map/voronoi.js:33` and `src/lib/map/voronoi.js:114`
     ```javascript
     towns.forEach(t => {
       const raw = t.properties ? { ...t.properties, ...t } : t;
     ```
   - Observation: Calling `computeAllianceVoronoi([null], [])` or `computeContestedFrontlines([null], ...)` throws verbatim:
     `TypeError: Cannot read properties of null (reading 'properties')`.

3. **Unhandled `null` passed as `options` parameter**:
   - Location: `src/lib/map/voronoi.js:16`
     ```javascript
     export function computeAllianceVoronoi(towns = [], alliances = [], options = {}) {
       const maxRadius = options.maxRadius ?? 25.0;
     ```
   - Observation: Calling `computeAllianceVoronoi(towns, alliances, null)` bypasses default parameter `{}` and throws verbatim:
     `TypeError: Cannot read properties of null (reading 'maxRadius')`.

4. **Unhandled empty coordinates, null features, or MultiPolygons in `computeContestedFrontlines`**:
   - Location: `src/lib/map/voronoi.js:160-166`
     ```javascript
     const vFeatures = voronoiData?.features || [];
     for (let i = 0; i < vFeatures.length; i++) {
       for (let j = i + 1; j < vFeatures.length; j++) {
         const fA = vFeatures[i];
         const fB = vFeatures[j];
         if (fA.properties.allianceId !== fB.properties.allianceId) {
           const cA = fA.geometry.coordinates[0][0];
           const cB = fB.geometry.coordinates[0][0];
     ```
   - Observation: If `vFeatures` contains a feature with `coordinates: []`, `fA.geometry.coordinates[0]` is `undefined`, causing verbatim:
     `TypeError: Cannot read properties of undefined (reading '0')`. If `fA` is `null`, `fA.properties` throws `TypeError: Cannot read properties of null`.

5. **Scale & Performance Stress Results (Passed)**:
   - 1,000+ towns across 50 alliances: executed in < 100ms.
   - 5,000 towns across 100 alliances: executed in < 500ms.
   - Collinear towns (horizontal, vertical, diagonal): stable centroid calculations.
   - 5,000 repeated calls: executed in < 500ms with < 10MB heap delta (no memory leaks).

---

## 2. Logic Chain

1. From Observation 1, non-finite town coordinates propagate uninhibited through centroid and radial math into the GeoJSON coordinate arrays as `NaN`, outputting `[[[null, null], ...]]`. GeoJSON specification (RFC 7946 §3.1) and MapLibre GL GeoJSON source parser require finite float pairs `[number, number]`; `[null, null]` corrupts MapLibre bounding-box calculations and WebGL attribute buffers.
2. From Observation 2, upstream town arrays containing nullish entries (such as sparse arrays or filtered API responses) trigger an unhandled property access on `t.properties` at line 33 and line 114, crashing the entire UI render pass.
3. From Observation 3, standard JS idioms passing `null` for omitted options (`fn(towns, alliances, null)`) crash at line 16 because default parameter syntax does not catch explicit `null`.
4. From Observation 4, `computeContestedFrontlines` assumes every feature in `voronoiData.features` is non-null, has at least one linear ring with at least one coordinate, and is a single `Polygon`. If an empty polygon or `MultiPolygon` is passed (as defined in `PROJECT.md` interface contracts), it crashes.
5. Therefore, while core throughput, scale, collinearity, and memory performance are excellent, `src/lib/map/voronoi.js` requires input validation and defensive coordinate sanitization before Milestone 1 can be approved.

---

## 3. Caveats

- The current Voronoi implementation utilizes centroid-radial circular approximation rather than Voronoi/Delaunay Voronoi diagram tessellation (e.g. `d3-delaunay`). For alliances scattered across disconnected oceans (e.g. Ocean 00 and Ocean 99), the centroid lands in Ocean 55 where the alliance has no towns. This is an architectural approximation trade-off acceptable for Milestone 1 as long as coordinates remain valid numbers.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

The following mitigations are requested for `src/lib/map/voronoi.js`:
1. **Coordinate sanitization**: Filter out non-finite `x`/`y`/`islandX`/`islandY` (`!Number.isFinite(x) || !Number.isFinite(y)`) before calculating averages so `NaN`/`Infinity` never enter polygon coordinates.
2. **Null element safety**: Guard `towns.forEach(t => { if (!t) return; ... })` in both `computeAllianceVoronoi` and `computeContestedFrontlines`.
3. **Safe options handling**: Use `const opts = options || {};` to handle `options === null`.
4. **Defensive GeoJSON parsing**: Guard feature traversal in `computeContestedFrontlines` (`if (!fA?.geometry?.coordinates?.[0]?.[0]) continue;`).

---

## 5. Verification Method

To independently verify all stress tests and bug reproductions:
```bash
npx vitest run tests/unit/voronoi.test.js tests/unit/voronoi_stress.test.js tests/unit/voronoi_adversarial.test.js
```
Files to inspect:
- `src/lib/map/voronoi.js`
- `tests/unit/voronoi_stress.test.js`
- `tests/unit/voronoi_adversarial.test.js`
