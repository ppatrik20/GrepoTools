"use client";

import React, { useState } from 'react';
import { 
  Radio, Ghost, Swords, Moon, ChevronDown, ChevronUp, 
  Sliders, RotateCcw
} from 'lucide-react';

export const DEFAULT_RADAR_FILTERS = {
  ghostHunter: false,
  activeSiege: false,
  inactiveFarms: false,
  minGhostPoints: 0,
  maxMomentumDelta: 0,
  recentHours: 48
};

/**
 * IntelRadarControls: Symmetrical Floating HUD for Tactical Overlays (Milestone 2)
 * Positioned at: top-20 left-4 z-30 (mirroring PoliticalHeatmapLegend at top-20 right-4)
 */
export default function IntelRadarControls({
  filters = DEFAULT_RADAR_FILTERS,
  onChange,
  counts = { ghosts: 0, sieges: 0, inactiveFarms: 0, total: 0 },
  className = ""
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const activeFilters = { ...DEFAULT_RADAR_FILTERS, ...filters };
  const totalDetected = (counts.ghosts || 0) + (counts.sieges || 0) + (counts.inactiveFarms || 0);
  const isAnyActive = Boolean(activeFilters.ghostHunter || activeFilters.activeSiege || activeFilters.inactiveFarms);

  const updateFilter = (key, value) => {
    if (onChange) {
      onChange(prev => ({
        ...prev,
        [key]: value
      }));
    }
  };

  const handleToggleAll = (enable) => {
    if (onChange) {
      onChange(prev => ({
        ...prev,
        ghostHunter: enable,
        activeSiege: enable,
        inactiveFarms: enable
      }));
    }
  };

  const handleResetDefaults = () => {
    if (onChange) {
      onChange(DEFAULT_RADAR_FILTERS);
    }
  };

  // Collapsed Pill HUD
  if (isCollapsed) {
    return (
      <div 
        className={`glass-panel flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-900/90 border border-cyan-500/40 shadow-xl cursor-pointer hover:bg-slate-800/90 transition-all ${className}`}
        onClick={() => setIsCollapsed(false)}
        title="Expand Tactical Intel Radar HUD"
      >
        <div className={`p-1.5 rounded-lg border ${
          isAnyActive 
            ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' 
            : 'bg-slate-800 text-slate-400 border-slate-700'
        }`}>
          <Radio size={16} className={isAnyActive ? "animate-pulse" : ""} />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-white leading-tight">Intel Radar</span>
          <span className="text-[10px] text-cyan-300 font-mono">
            {isAnyActive ? `${totalDetected} Targets Active` : 'Standby / OFF'}
          </span>
        </div>
        <ChevronDown size={14} className="text-slate-400 ml-1" />
      </div>
    );
  }

  return (
    <div 
      className={`glass-panel w-84 sm:w-88 flex flex-col gap-3 p-3.5 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-xl animate-fade-in ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Radio size={16} className={isAnyActive ? "animate-pulse" : ""} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wide uppercase">Tactical Intel Radar</h3>
            <p className="text-[10px] text-slate-400">Automated Target Acquisition</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {totalDetected > 0 && (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
              {totalDetected} Detected
            </span>
          )}
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Collapse Radar HUD"
            aria-label="Collapse Radar HUD"
          >
            <ChevronUp size={16} />
          </button>
        </div>
      </div>

      {/* Radar Mode Toggle Cards */}
      <div className="space-y-2">
        {/* 1. Ghost Hunter Radar */}
        <div 
          onClick={() => updateFilter('ghostHunter', !activeFilters.ghostHunter)}
          className={`p-2.5 rounded-xl border transition-all cursor-pointer select-none flex flex-col gap-1.5 ${
            activeFilters.ghostHunter
              ? 'bg-cyan-950/40 border-cyan-500/60 shadow-md shadow-cyan-950/40'
              : 'bg-slate-800/40 border-slate-700/40 hover:bg-slate-800/70'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg border ${
                activeFilters.ghostHunter
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                <Ghost size={14} />
              </div>
              <div>
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  Ghost Hunter Radar
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Abandoned cities & vacancy decay
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold border ${
                activeFilters.ghostHunter
                  ? 'bg-cyan-500/30 text-cyan-200 border-cyan-500/50'
                  : 'bg-slate-900/80 text-slate-400 border-slate-700'
              }`}>
                {counts.ghosts || 0}
              </span>
              <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${
                activeFilters.ghostHunter ? 'bg-cyan-500' : 'bg-slate-700'
              }`}>
                <div className={`w-3 h-3 rounded-full bg-white transition-transform ${
                  activeFilters.ghostHunter ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </div>
            </div>
          </div>
        </div>

        {/* 2. Active Siege / Contest Radar */}
        <div 
          onClick={() => updateFilter('activeSiege', !activeFilters.activeSiege)}
          className={`p-2.5 rounded-xl border transition-all cursor-pointer select-none flex flex-col gap-1.5 ${
            activeFilters.activeSiege
              ? 'bg-rose-950/40 border-rose-500/60 shadow-md shadow-rose-950/40'
              : 'bg-slate-800/40 border-slate-700/40 hover:bg-slate-800/70'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg border ${
                activeFilters.activeSiege
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                <Swords size={14} className={activeFilters.activeSiege ? 'animate-pulse' : ''} />
              </div>
              <div>
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  Active Siege Radar
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Contested towns & recent conquests
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold border ${
                activeFilters.activeSiege
                  ? 'bg-rose-500/30 text-rose-200 border-rose-500/50'
                  : 'bg-slate-900/80 text-slate-400 border-slate-700'
              }`}>
                {counts.sieges || 0}
              </span>
              <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${
                activeFilters.activeSiege ? 'bg-rose-500' : 'bg-slate-700'
              }`}>
                <div className={`w-3 h-3 rounded-full bg-white transition-transform ${
                  activeFilters.activeSiege ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Inactive Farm Finder */}
        <div 
          onClick={() => updateFilter('inactiveFarms', !activeFilters.inactiveFarms)}
          className={`p-2.5 rounded-xl border transition-all cursor-pointer select-none flex flex-col gap-1.5 ${
            activeFilters.inactiveFarms
              ? 'bg-amber-950/40 border-amber-500/60 shadow-md shadow-amber-950/40'
              : 'bg-slate-800/40 border-slate-700/40 hover:bg-slate-800/70'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg border ${
                activeFilters.inactiveFarms
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                <Moon size={14} />
              </div>
              <div>
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  Inactive Farm Finder
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Stagnant players & low momentum
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold border ${
                activeFilters.inactiveFarms
                  ? 'bg-amber-500/30 text-amber-200 border-amber-500/50'
                  : 'bg-slate-900/80 text-slate-400 border-slate-700'
              }`}>
                {counts.inactiveFarms || 0}
              </span>
              <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${
                activeFilters.inactiveFarms ? 'bg-amber-500' : 'bg-slate-700'
              }`}>
                <div className={`w-3 h-3 rounded-full bg-white transition-transform ${
                  activeFilters.inactiveFarms ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Sliders Section */}
      <div className="space-y-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
          <span className="flex items-center gap-1">
            <Sliders size={12} className="text-primary" /> RADAR THRESHOLDS
          </span>
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors"
            title="Reset to default thresholds"
          >
            <RotateCcw size={10} /> Reset
          </button>
        </div>

        {/* Slider 1: Min Ghost Points */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-300 font-medium flex items-center gap-1">
              <Ghost size={11} className="text-cyan-400" /> Min Ghost Points
            </span>
            <span className="text-cyan-300 font-mono font-bold">
              {Number(activeFilters.minGhostPoints).toLocaleString()} pts
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="13716"
            step="250"
            value={activeFilters.minGhostPoints}
            onChange={(e) => updateFilter('minGhostPoints', parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <div className="flex justify-between text-[9px] font-mono text-slate-500 px-0.5">
            <span onClick={() => updateFilter('minGhostPoints', 0)} className="cursor-pointer hover:text-cyan-300">0</span>
            <span onClick={() => updateFilter('minGhostPoints', 3000)} className="cursor-pointer hover:text-cyan-300">3k</span>
            <span onClick={() => updateFilter('minGhostPoints', 6000)} className="cursor-pointer hover:text-cyan-300">6k</span>
            <span onClick={() => updateFilter('minGhostPoints', 10000)} className="cursor-pointer hover:text-cyan-300">10k+</span>
          </div>
        </div>

        {/* Slider 2: Max Momentum Delta */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-300 font-medium flex items-center gap-1">
              <Moon size={11} className="text-amber-400" /> Max Momentum Delta
            </span>
            <span className="text-amber-300 font-mono font-bold">
              {activeFilters.maxMomentumDelta === 0 ? "≤ 0 (Stagnant)" : `≤ ${activeFilters.maxMomentumDelta.toLocaleString()} pts`}
            </span>
          </div>
          <input
            type="range"
            min="-50000"
            max="0"
            step="500"
            value={activeFilters.maxMomentumDelta}
            onChange={(e) => updateFilter('maxMomentumDelta', parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
          />
          <div className="flex justify-between text-[9px] font-mono text-slate-500 px-0.5">
            <span onClick={() => updateFilter('maxMomentumDelta', -50000)} className="cursor-pointer hover:text-amber-300">-50k</span>
            <span onClick={() => updateFilter('maxMomentumDelta', -10000)} className="cursor-pointer hover:text-amber-300">-10k</span>
            <span onClick={() => updateFilter('maxMomentumDelta', -2500)} className="cursor-pointer hover:text-amber-300">-2.5k</span>
            <span onClick={() => updateFilter('maxMomentumDelta', 0)} className="cursor-pointer hover:text-amber-300">0</span>
          </div>
        </div>

        {/* Slider 3: Recent Conquests Window */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-300 font-medium flex items-center gap-1">
              <Swords size={11} className="text-rose-400" /> Conquest Recency
            </span>
            <span className="text-rose-300 font-mono font-bold">
              {activeFilters.recentHours}h ({Math.round(activeFilters.recentHours / 24)}d)
            </span>
          </div>
          <input
            type="range"
            min="12"
            max="168"
            step="6"
            value={activeFilters.recentHours}
            onChange={(e) => updateFilter('recentHours', parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-400"
          />
          <div className="flex justify-between text-[9px] font-mono text-slate-500 px-0.5">
            <span onClick={() => updateFilter('recentHours', 12)} className="cursor-pointer hover:text-rose-300">12h</span>
            <span onClick={() => updateFilter('recentHours', 24)} className="cursor-pointer hover:text-rose-300">24h</span>
            <span onClick={() => updateFilter('recentHours', 48)} className="cursor-pointer hover:text-rose-300">48h</span>
            <span onClick={() => updateFilter('recentHours', 168)} className="cursor-pointer hover:text-rose-300">7d</span>
          </div>
        </div>
      </div>

      {/* Tactical Quick Action Footer */}
      <div className="flex items-center justify-between pt-1 text-xs">
        <div className="flex gap-1.5">
          <button
            onClick={() => handleToggleAll(true)}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition-colors"
          >
            All ON
          </button>
          <button
            onClick={() => handleToggleAll(false)}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition-colors"
          >
            All OFF
          </button>
        </div>
        
        <div className="text-[10px] font-mono text-slate-400">
          Status: <span className={isAnyActive ? "text-emerald-400 font-bold" : "text-slate-500"}>
            {isAnyActive ? "SCANNING" : "IDLE"}
          </span>
        </div>
      </div>
    </div>
  );
}
