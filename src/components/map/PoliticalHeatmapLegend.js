"use client";

import React, { useState } from 'react';
import { 
  Shield, Swords, Eye, EyeOff, ChevronDown, ChevronUp, 
  Sliders, AlertTriangle 
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
          <span className="text-[10px] text-purple-300 font-mono">{Math.round(opacity * 100)}% Opacity</span>
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
          aria-label="Collapse Legend"
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
                          title={isHighlighted ? "Unhighlight on map" : "Highlight on map"}
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
