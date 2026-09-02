# Milestone 1 Explorer 3: UI Controls & Political Heatmap Legend Analysis

**Author:** Milestone 1 Explorer 3 (UI Controls & Legend)  
**Date:** 2026-09-02  
**Target Files:**
- `src/app/map/page.js`
- `src/components/map/UnifiedSearchPanel.js`
- `src/components/map/PoliticalHeatmapLegend.js` (New Component)

---

## 1. Executive Summary

Milestone 1 introduces the **Political & Frontline Heatmaps** (Voronoi Alliance Spheres of Influence and Contested Frontline Overlays). To deliver a military-grade command viewer, users need:
1. **Interactive View Mode Toggle**: A seamless segmented control switch in the top floating action bar toggling between **Geographic View** and **Political / Frontline View**.
2. **`PoliticalHeatmapLegend` Component**: A collapsible, floating tactical HUD card displaying active alliance territories, official/custom hex colors, town counts, dominance percentages, live opacity slider, and contested frontline toggles.
3. **Camera State Invariance**: Zero disruption or reset to camera position (`center`, `zoom`, `pitch`, `bearing`) when toggling between viewing modes or adjusting overlay settings.

This document details the architectural design, UI/UX mechanics, component specifications, state management, and complete implementation blueprint.

---

## 2. UI Layout & View Mode Toggle Architecture

### 2.1 Current Top Control Bar Layout
In `src/app/map/page.js` (lines 352-363), the top bar hosts `UnifiedSearchPanel` centered at `top-4 left-1/2 -translate-x-1/2 z-40`:
- Search input (390px) with Ctrl+K shortcut.
- Quick action pills: `Ghosts` (`Ghost` icon), `Slots` (`Compass` icon), `Route` (`Navigation` icon).

### 2.2 View Mode Toggle Design (`Geographic` vs `Political`)
The View Mode Toggle is positioned inside `UnifiedSearchPanel`'s quick action cluster as a high-contrast **Segmented Mode Pill**:
- **Geographic View (`geographic`)**: Focuses on island geography, empty slots, terrain sprites, and discrete town points.
  - Icon: `<Globe size={14} />`
  - Active Style: `bg-blue-600/30 text-blue-300 border border-blue-500/50 shadow-sm`
- **Political View (`political`)**: Activates Voronoi alliance territory heatmaps, core alliance spheres, contested borderlines, and displays the `PoliticalHeatmapLegend`.
  - Icon: `<Shield size={14} />` (or `<Swords size={14} />`)
  - Active Style: `bg-purple-600/30 text-purple-300 border border-purple-500/50 shadow-sm`

```
+----------------------------------------------------------------------------------------------------+
|  [🔍 Search player, town, coords...] [Ctrl+K] | [ 🌐 Geo | 🛡️ Political ] | [👻 Ghosts] [🧭 Slots] [🚀 Route] |
+----------------------------------------------------------------------------------------------------+
```

### 2.3 Coexistence with Other UI Overlays
- **Left Sidebar (`World Overview`)**: Stays at `top-4 left-4 z-40`. Collapsible to `w-12`.
- **Top Bar (`UnifiedSearchPanel`)**: Stays at `top-4 left-1/2 -translate-x-1/2 z-40`.
- **Right Command Drawer (`CommandDrawer`)**: Slides out at `top-16 right-0 bottom-0 z-50` (width: 420px) when an entity is clicked.
- **`PoliticalHeatmapLegend`**: Placed as a floating HUD card at `top-20 right-4 z-30`. When `CommandDrawer` opens, it gracefully steps aside or can be collapsed into a floating badge.

---

## 3. `PoliticalHeatmapLegend.js` Component Design

### 3.1 Interface Contract & Props
```typescript
interface AllianceTerritoryStat {
  allianceId: number;
  allianceName: string;
  color: string;
  townCount: number;
  dominantShare: number; // e.g. 0.342 for 34.2%
  points?: number;
  contestedCount?: number;
}

interface PoliticalHeatmapLegendProps {
  /** Voronoi territory feature data or calculated alliance stats */
  territories: AllianceTerritoryStat[];
  /** User-customized hex colors per alliance */
  customColors: Record<string, string>;
  /** Callback when user changes an alliance color */
  onColorChange: (allianceName: string, hexColor: string) => void;
  /** Active heatmap fill opacity (0.05 to 0.90) */
  opacity: number;
  /** Callback when opacity slider moves */
  onOpacityChange: (opacity: number) => void;
  /** Whether contested frontline outlines are visible */
  showContestedFrontlines: boolean;
  /** Callback to toggle contested frontline layer */
  onToggleContestedFrontlines: () => void;
  /** Currently highlighted alliance on map */
  highlightedAlliance?: string | null;
  /** Callback when user clicks/hovers to highlight an alliance */
  onHighlightAlliance?: (allianceName: string | null) => void;
  /** Callback when clicking an alliance name to open deep dive / focus */
  onAllianceClick?: (alliance: { id: number; name: string }) => void;
  /** Total contested borders count in active world */
  contestedFrontlineCount?: number;
  /** Custom CSS classes */
  className?: string;
}
```

### 3.2 Visual & Structural Architecture
1. **Collapsible Container**:
   - **Expanded Mode**: `w-80 glass-panel bg-slate-900/95 border border-slate-700/80 rounded-2xl p-4 shadow-2xl backdrop-blur-md space-y-3.5`
   - **Collapsed Mode**: `px-3 py-2 glass-panel bg-slate-900/90 border border-slate-700/80 rounded-xl shadow-xl flex items-center gap-2 cursor-pointer hover:border-purple-500/50`
2. **Header Bar**:
   - Title: `🛡️ Alliance Influence & Frontlines`
   - Active Pill / Sphere Count badge (`N Alliances`)
   - Minimize / Expand button (`ChevronUp` / `ChevronDown` or `Minimize2` / `Maximize2`)
3. **Tactical Controls Bar**:
   - **Opacity Slider**:
     - Range input: `min="0.10" max="0.80" step="0.05"`
     - Value readout: `Math.round(opacity * 100)%`
     - Label: `Sphere Opacity`
   - **Contested Frontlines Switch**:
     - Toggle pill: `⚔️ Contested Frontlines`
     - Glowing amber/rose accent when active.
4. **Alliance Territory Breakdown List**:
   - Scrollable container: `max-h-64 overflow-y-auto space-y-1.5 scrollbar-thin`
   - Rows sorted descending by `townCount` / `dominantShare`:
     - **Color Swatch & Picker**: Native `<input type="color">` embedded inside a sleek circular swatch.
     - **Alliance Name**: Truncated, bold font with click handler for deep dive modal.
     - **Town Count**: Castle icon + `XX towns`.
     - **Dominance Percentage**: Visual progress bar + `XX.X%` label.
     - **Highlight Action Button**: Toggles map highlight glow for that alliance.
5. **Contested Frontlines Summary Footer**:
   - Quick counter showing total contested border zones: `⚔️ ${count} Contested Borderlines Active`.

---

## 4. Seamless Layer Toggling & Camera Preservation

### 4.1 Root Causes of Camera Resets & Solutions
| Potential Issue | Cause | Solution |
|---|---|---|
| Map re-mounting | `<Map key={viewMode} ...>` changes key on toggle | **Never change the `key` prop on `<Map>`**. Keep key constant. |
| ViewState reset | Passing `viewState` without controlled `onMove` callback | Keep using uncontrolled camera with `initialViewState` and `mapRef.current.flyTo` for programmatic pans only. |
| Inadvertent `flyTo` calls | Toggling mode triggers search or navigation handlers | Ensure mode toggle handler ONLY executes `setViewMode('political')` or `setViewMode('geographic')`. |
| WebGL Context Recreation | Toggling custom styles or full map styles | Keep `mapStyle={MAP_STYLE}` constant; toggle overlay layers dynamically via React `<Source>` / `<Layer>`. |

### 4.2 Seamless Layer Mounting Mechanics
In `src/app/map/page.js`:
```jsx
{/* Voronoi Alliance Territory Spheres (Political View Only) */}
{viewMode === 'political' && voronoiTerritoryData && (
  <Source id="voronoi-source" type="geojson" data={voronoiTerritoryData}>
    <Layer
      id="voronoi-spheres-fill"
      type="fill"
      paint={{
        "fill-color": ["get", "color"],
        "fill-opacity": heatmapOpacity
      }}
    />
    <Layer
      id="voronoi-spheres-border"
      type="line"
      paint={{
        "line-color": ["get", "color"],
        "line-width": 1.5,
        "line-opacity": Math.min(heatmapOpacity + 0.35, 1.0)
      }}
    />
  </Source>
)}

{/* Contested Frontline Border Outlines */}
{viewMode === 'political' && showContestedFrontlines && contestedFrontlinesData && (
  <Source id="frontlines-source" type="geojson" data={contestedFrontlinesData}>
    <Layer
      id="contested-frontline-glow"
      type="line"
      paint={{
        "line-color": "#ef4444",
        "line-width": 4,
        "line-blur": 3,
        "line-opacity": 0.6
      }}
    />
    <Layer
      id="contested-frontline-lines"
      type="line"
      paint={{
        "line-color": "#fca5a5",
        "line-width": 2,
        "line-dasharray": [3, 2]
      }}
    />
  </Source>
)}
```

### 4.3 60 FPS Performance Guarantee
1. **Geometry Memoization**:
   ```javascript
   const voronoiTerritoryData = useMemo(() => {
     if (!data || !data.features) return null;
     return computeAllianceVoronoi(towns, topAlliances, { customColors });
   }, [data, topAlliances, customColors]);
   ```
   Toggling `viewMode` between `'geographic'` and `'political'` does NOT re-run Voronoi tessellation math — it immediately renders the cached GeoJSON `FeatureCollection`.
2. **Live Opacity Scrubbing**:
   Adjusting the opacity slider only updates the MapLibre paint property `fill-opacity` on the GPU without modifying GeoJSON vertices or reloading WebGL buffers.

---

## 5. Implementation Blueprint

### 5.1 `src/components/map/PoliticalHeatmapLegend.js` (Complete Implementation)
```jsx
"use client";

import React, { useState } from 'react';
import { 
  Shield, Swords, Eye, EyeOff, ChevronDown, ChevronUp, 
  Sliders, Castle, Sparkles, AlertTriangle 
} from 'lucide-react';

export default function PoliticalHeatmapLegend({
  territories = [],
  customColors = {},
  onColorChange,
  opacity = 0.35,
  onOpacityChange,
  showContestedFrontlines = true,
  onToggleContestedFrontlines,
  highlightedAlliance = null,
  onHighlightAlliance,
  onAllianceClick,
  contestedFrontlineCount = 0,
  className = ""
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Fallback / default territories if empty
  const displayTerritories = territories || [];

  if (isCollapsed) {
    return (
      <div 
        className={`glass-panel flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-900/90 border border-purple-500/40 shadow-xl cursor-pointer hover:bg-slate-800/90 transition-all ${className}`}
        onClick={() => setIsCollapsed(false)}
        title="Expand Political Heatmap Legend"
      >
        <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400">
          <Shield size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-white leading-tight">Political Heatmap</span>
          <span className="text-[10px] text-purple-300">{Math.round(opacity * 100)}% Opacity</span>
        </div>
        <ChevronDown size={14} className="text-slate-400 ml-1" />
      </div>
    );
  }

  return (
    <div 
      className={`glass-panel w-80 flex flex-col gap-3 p-3.5 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-xl animate-fade-in ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <Shield size={16} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wide uppercase">Political Spheres</h3>
            <p className="text-[10px] text-slate-400">Alliance Voronoi Influence</p>
          </div>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Collapse Legend"
        >
          <ChevronUp size={16} />
        </button>
      </div>

      {/* Opacity & Contested Controls */}
      <div className="space-y-2.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
        {/* Opacity Slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-300 font-medium flex items-center gap-1">
              <Sliders size={12} className="text-purple-400" /> Sphere Opacity
            </span>
            <span className="text-purple-300 font-mono font-bold">{Math.round(opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.10"
            max="0.80"
            step="0.05"
            value={opacity}
            onChange={(e) => onOpacityChange && onOpacityChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
        </div>

        {/* Contested Frontlines Toggle */}
        <button
          onClick={onToggleContestedFrontlines}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
            showContestedFrontlines
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm'
              : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Swords size={13} className={showContestedFrontlines ? 'text-rose-400 animate-pulse' : 'text-slate-400'} />
            Contested Frontlines
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900/80">
            {showContestedFrontlines ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>

      {/* Alliance Territory Breakdown */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[11px] text-slate-400 px-1 font-semibold">
          <span>ALLIANCE DOMINANCE</span>
          <span>TOWNS / SHARE</span>
        </div>

        <div className="max-h-52 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-slate-700">
          {displayTerritories.length > 0 ? (
            displayTerritories.map((item) => {
              const allyName = item.allianceName || item.name;
              const color = customColors[allyName] || item.color || '#8b5cf6';
              const townCount = item.townCount || item.towns || 0;
              const share = item.dominantShare !== undefined 
                ? (item.dominantShare * 100).toFixed(1) 
                : '0.0';
              const isHighlighted = highlightedAlliance === allyName;

              return (
                <div 
                  key={allyName}
                  className={`flex flex-col gap-1 p-2 rounded-xl transition-all border ${
                    isHighlighted 
                      ? 'bg-purple-500/20 border-purple-500/60 shadow-md' 
                      : 'bg-slate-800/40 border-slate-700/40 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    {/* Color Swatch / Picker & Name */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="relative shrink-0 flex items-center justify-center">
                        <div 
                          className="w-3.5 h-3.5 rounded-full border border-white/40 shadow-sm"
                          style={{ backgroundColor: color }}
                        />
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => onColorChange && onColorChange(allyName, e.target.value)}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          title={`Change color for ${allyName}`}
                        />
                      </div>
                      <span 
                        onClick={() => onAllianceClick && onAllianceClick({ id: item.allianceId, name: allyName })}
                        className="text-xs font-bold text-white truncate cursor-pointer hover:underline"
                        title={allyName}
                      >
                        {allyName}
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-mono text-slate-300">
                        {townCount} <span className="text-slate-500">c.</span>
                      </span>
                      <span className="text-[11px] font-mono font-bold text-purple-300">
                        {share}%
                      </span>
                      {onHighlightAlliance && (
                        <button
                          onClick={() => onHighlightAlliance(isHighlighted ? null : allyName)}
                          className={`p-1 rounded hover:bg-slate-700 text-slate-400 ${isHighlighted ? 'text-purple-400' : ''}`}
                          title="Highlight on map"
                        >
                          {isHighlighted ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Visual Share Bar */}
                  <div className="w-full bg-slate-900/80 rounded-full h-1 overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-300"
                      style={{ 
                        width: `${Math.min(parseFloat(share) * 1.5, 100)}%`, 
                        backgroundColor: color 
                      }}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-xs text-slate-400 text-center py-3">
              Calculating alliance spheres...
            </div>
          )}
        </div>
      </div>

      {/* Contested Summary Footer */}
      {contestedFrontlineCount > 0 && showContestedFrontlines && (
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-rose-300 bg-rose-500/10 px-2 py-1.5 rounded-lg border border-rose-500/20">
          <span className="flex items-center gap-1 font-medium">
            <AlertTriangle size={12} className="text-rose-400" /> Contested Sectors
          </span>
          <span className="font-mono font-bold">{contestedFrontlineCount}</span>
        </div>
      )}
    </div>
  );
}
```

### 5.2 Updates to `UnifiedSearchPanel.js`
Add `viewMode` and `onToggleViewMode` props:
```jsx
export default function UnifiedSearchPanel({
  worldId = 'hu119',
  onSelectResult,
  viewMode = 'geographic',
  onToggleViewMode,
  onToggleGhosts,
  showGhostsOnly,
  onToggleRouteTool,
  isRouteToolActive,
  onToggleEmptySlots,
  showEmptySlots
}) {
  ...
  return (
    <div className="relative flex items-center gap-2" style={{ zIndex: 100 }}>
      {/* Search Input Bar */}
      ...

      {/* Map View Mode Switch: Geographic vs Political */}
      <div className="flex items-center bg-slate-950/80 p-0.5 rounded-xl border border-slate-700/80 shadow-inner backdrop-blur-md">
        <button
          onClick={() => onToggleViewMode && onToggleViewMode('geographic')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            viewMode === 'geographic'
              ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
          }`}
          title="Geographic View (Standard Islands & Topography)"
        >
          <Globe size={14} className={viewMode === 'geographic' ? 'text-blue-400' : 'text-slate-400'} />
          <span className="hidden md:inline">Geo</span>
        </button>
        <button
          onClick={() => onToggleViewMode && onToggleViewMode('political')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            viewMode === 'political'
              ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
          }`}
          title="Political & Frontline View (Alliance Voronoi Spheres & Contested Borders)"
        >
          <Shield size={14} className={viewMode === 'political' ? 'text-purple-400 animate-pulse' : 'text-slate-400'} />
          <span className="hidden md:inline">Political</span>
        </button>
      </div>

      {/* Quick Action Buttons (Ghosts, Slots, Route) */}
      ...
    </div>
  );
}
```

### 5.3 Updates to `src/app/map/page.js`
In `src/app/map/page.js`:
1. Import `PoliticalHeatmapLegend` and `Globe`, `Shield` from `lucide-react`.
2. Introduce state variables:
   ```javascript
   const [viewMode, setViewMode] = useState('geographic'); // 'geographic' | 'political'
   const [heatmapOpacity, setHeatmapOpacity] = useState(0.35);
   const [showContestedFrontlines, setShowContestedFrontlines] = useState(true);
   const [highlightedAllianceVoronoi, setHighlightedAllianceVoronoi] = useState(null);
   ```
3. Compute Voronoi & Contested Frontlines GeoJSON and territory stats using `useMemo`:
   ```javascript
   const { voronoiTerritoriesGeoJSON, contestedFrontlinesGeoJSON, allianceTerritoryStats } = useMemo(() => {
     if (!data || !data.features || !topAlliances.length) {
       return { voronoiTerritoriesGeoJSON: null, contestedFrontlinesGeoJSON: null, allianceTerritoryStats: [] };
     }
     const towns = data.features.filter(f => f.properties.renderType === 'town');
     const voronoi = computeAllianceVoronoi(towns, topAlliances, { customColors });
     const frontlines = computeContestedFrontlines(towns, voronoi);
     
     // Derive breakdown stats
     const stats = (topAlliances || []).map(a => {
       const aTowns = towns.filter(t => t.properties.alliance === a.name).length;
       const totalTowns = towns.length || 1;
       return {
         allianceId: a.id,
         allianceName: a.name,
         color: customColors[a.name] || a.color,
         townCount: aTowns,
         dominantShare: aTowns / totalTowns,
         points: a.points
       };
     }).sort((a, b) => b.townCount - a.townCount);

     return {
       voronoiTerritoriesGeoJSON: voronoi,
       contestedFrontlinesGeoJSON: frontlines,
       allianceTerritoryStats: stats
     };
   }, [data, topAlliances, customColors]);
   ```
4. Render `PoliticalHeatmapLegend` conditionally when `viewMode === 'political'`:
   ```jsx
   {/* Floating Political Heatmap Legend */}
   {viewMode === 'political' && (
     <div className="absolute top-20 right-4 z-30 pointer-events-auto">
       <PoliticalHeatmapLegend
         territories={allianceTerritoryStats}
         customColors={customColors}
         onColorChange={(allyName, color) => setCustomColors(prev => ({ ...prev, [allyName]: color }))}
         opacity={heatmapOpacity}
         onOpacityChange={setHeatmapOpacity}
         showContestedFrontlines={showContestedFrontlines}
         onToggleContestedFrontlines={() => setShowContestedFrontlines(prev => !prev)}
         highlightedAlliance={highlightedAllianceVoronoi}
         onHighlightAlliance={setHighlightedAllianceVoronoi}
         onAllianceClick={(ally) => setSelectedEntity({ type: 'alliance', data: ally })}
         contestedFrontlineCount={contestedFrontlinesGeoJSON?.features?.length || 0}
       />
     </div>
   )}
   ```
5. Render `<Source>` and `<Layer>` for Voronoi fill, border, and frontline lines when `viewMode === 'political'`.

---

## 6. Verification and Validation Plan

1. **Camera Stability Test**:
   - Pan to coordinates `(550, 480)` and zoom in to `zoom: 7.5`.
   - Click "Political" toggle -> Verify camera does not move or zoom out.
   - Adjust opacity slider from `35%` to `70%` -> Verify smooth opacity update with 0 frame drops.
   - Click "Geo" toggle -> Verify camera stays at `(550, 480)` at `zoom: 7.5`.
2. **Interactivity Test**:
   - Change an alliance hex color via the color picker inside `PoliticalHeatmapLegend`.
   - Verify Voronoi polygon fill, border, town dots, and legend swatch all update to the new color simultaneously.
   - Click an alliance row -> Verify `CommandDrawer` or `DeepDiveModal` opens with alliance details.
3. **Contested Frontlines Toggle Test**:
   - Toggle "Contested Frontlines" ON/OFF -> Verify red dashed contested boundary lines appear/disappear instantly.
4. **Responsive Layout Test**:
   - Test on mobile viewport (width: 375px) -> Verify top segmented buttons collapse to icons and legend collapses into floating badge without overlapping center search bar.
