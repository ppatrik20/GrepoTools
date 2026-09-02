# Handoff Report — Milestone 1 Explorer 3 (UI Controls & Legend)

## 1. Observation
- In `src/app/map/page.js` lines 351-364, the top action bar is rendered as:
  ```jsx
  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center justify-center">
    <UnifiedSearchPanel
      worldId={activeWorldId}
      onSelectResult={handleSelectSearchResult}
      onToggleGhosts={() => setShowGhostsOnly(prev => !prev)}
      showGhostsOnly={showGhostsOnly}
      onToggleRouteTool={() => setIsRouteToolActive(prev => !prev)}
      isRouteToolActive={isRouteToolActive}
      onToggleEmptySlots={() => setShowEmptySlots(prev => !prev)}
      showEmptySlots={showEmptySlots}
    />
  </div>
  ```
- In `src/components/map/UnifiedSearchPanel.js` lines 194-237, the quick action buttons cluster currently renders ghost filter, empty slots toggle, and route planner buttons inside a glassmorphic panel.
- In `src/app/map/page.js` lines 376-386, the `<Map>` component uses `initialViewState={{ longitude: 0, latitude: 0, zoom: 2 }}` and manages camera state internally. Programmatic camera adjustments are invoked only on explicit search selection via `mapRef.current.flyTo`.
- In `src/app/map/page.js` lines 944-1045, the left sidebar displays top 8 alliances with color customization and world stats.
- In `PROJECT.md` Section 1 Interface Contracts (lines 66-98), `computeAllianceVoronoi` produces `PoliticalTerritoryData` (properties: `allianceId`, `allianceName`, `color`, `townCount`, `dominantShare`), and `computeContestedFrontlines` produces `ContestedFrontlineData` (properties: `allianceA`, `allianceB`, `tension`, `isContestedIsland`).

## 2. Logic Chain
1. **View Mode Segmented Control**: Adding a segmented pill switch `[ 🌐 Geo | 🛡️ Political ]` into `UnifiedSearchPanel.js` (linked to `viewMode` state in `src/app/map/page.js`) places the primary map paradigm control directly in the user's focal action bar (supported by Observation in `UnifiedSearchPanel.js`).
2. **Dedicated Legend Floating HUD**: Designing `PoliticalHeatmapLegend.js` as a floating, collapsible card at `absolute top-20 right-4 z-30` provides users with real-time access to alliance color swatches, town counts, dominance percentages, live opacity slider (`min=0.10 max=0.80`), and contested frontline toggle without colliding with the left sidebar or top search panel.
3. **Camera State Invariance**: In React-Map-GL, keeping `<Map>` mounted with a stable `key` and toggling overlay sources/layers conditionally based on `viewMode === 'political'` guarantees that WebGL camera matrices (`longitude`, `latitude`, `zoom`, `pitch`, `bearing`) remain completely undisturbed during mode switches and opacity adjustments (supported by Observation in `page.js` line 376).
4. **Performance via Memoization**: Memoizing `computeAllianceVoronoi` and `computeContestedFrontlines` on `[data, topAlliances, customColors]` guarantees 60 FPS performance, eliminating unnecessary geometry re-calculations when the user toggles view modes or drags the opacity slider.

## 3. Caveats
- The Voronoi computation mathematical engine (`src/lib/map/voronoi.js`) is being investigated by Milestone 1 Explorer 1 and layer rendering performance by Explorer 2. The UI controls and legend designed here consume the interface contract specified in `PROJECT.md`.
- In smaller mobile viewports (< 640px), the legend should automatically default to its collapsed floating badge state to prevent visual crowding.

## 4. Conclusion
1. Add `viewMode` (`'geographic' | 'political'`) and `onToggleViewMode` props to `UnifiedSearchPanel.js` with a segmented pill toggle (`Globe` / `Shield` icons).
2. Create `src/components/map/PoliticalHeatmapLegend.js` featuring collapsible HUD container, live opacity slider, contested frontlines toggle, alliance territory list with custom color pickers, town counts, dominance share bars, and map highlight callbacks.
3. In `src/app/map/page.js`, conditionally render `PoliticalHeatmapLegend` and Voronoi GeoJSON layers when `viewMode === 'political'`, with zero camera reset side effects.

## 5. Verification Method
1. Inspect `src/components/map/UnifiedSearchPanel.js` and verify segmented mode switch markup and props.
2. Inspect `src/components/map/PoliticalHeatmapLegend.js` and verify implementation of all required controls (opacity slider, contested toggle, color pickers, dominance %, collapse/expand).
3. Test camera invariance by panning to a non-zero coordinate and zooming in, toggling between Geo and Political views, and verifying viewState remains identical.
4. Run project build and test commands:
   ```bash
   npm run build
   ```
