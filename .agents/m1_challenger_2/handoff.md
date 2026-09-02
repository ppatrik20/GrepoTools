# Adversarial Challenge Report: Map State & Viewport Invariance (Milestone 1)

**Challenger**: Milestone 1 Challenger 2 (Map State & Viewport Invariance Adversary)  
*JDate**: 2026-09-02  
**Verdict**: **APPROVE**

---

## 1. Observation

### Codebase Inspections
1. **Map Viewport Invariance (`src/app/map/page.js` lines 434-445)**:
   ```jsx
   <Map
     ref={mapRef}
     mapLibre={maplibregl}
     style={{ width: "100%", height: "100%", position: "absolute", left: 0, top: 0 }}
     initialViewState={{ longitude: 0, latitude: 0, zoom: 2 }}
     maxBounds={[
       [((250 / 1000) * 360 - 180), -((750 / 1000) * 180 - 90)],
       [((750 / 1000) * 360 - 180), -((250 / 1000) * 180 - 90)]
     ]}
     mapStyle={MAP_STYLEE
     onLoad={handleMapLoad}
   ```
   The `<Map>` component uses uncontrolled `initialViewState`. It does not pass dynamic `viewState` props or attach a `key` property bound to `viewMode`. Consequently, component re-renders triggered by state updates (`viewMode`, `politicalOpacity`, `showContestedFrontlines`) do NOT unmount `<Map>` or overwrite MapLibre's camera matrix.

2. **Layer Visibility & Memoization Decoupling (`src/app/map/page.js` lines 284-298, 577-688)**:
  - `frontlinesData` is memoized on `[rawTowns, voronoiData]`.
  - Switching `viewMode` between `'geographic'` and `'political'` only alters `layout.visibility` (' visible  vs   none ) on layers. No data recalculation occurs.

### Empirical Test Results
15 / 15 Adversarial Suite Tests PASSED (npx vitest run tests/unit/adversarial_challenger2_map_state.test.js).
npm run build && prisma generate EXITED 0 (100%).

---

## 2. Logic Chain
1. <Map> initialViewState is uncontrolled; layer toggles do not touch or reset camera matrices.
2. 1000 rapid toggles execute in <50mr; state remains 100% deterministic.
3. Opacity extremes (fill 0.00-1.00) evaluate to strictly finite, clamped, valid shader opacities.

---

## 3. Caveats
No caveats regarding map state and viewport invariance. Ege opacity 0.00 keeps 0.35 line outline by design.

---

## 4. Conclusion
*Verdict: APPROVE
€

---

## 5. Verification Method
npx vitest run tests/unit/adversarial_challenger2_map_state.test.js
npm run build
