"use client";

import React from 'react';
import { 
  Navigation, X, ArrowLeftRight, Clock, Anchor, Shield, 
  Flame, Wind, Compass, Sparkles, Send
} from 'lucide-react';
import Link from 'next/link';

// Official Grepolis base unit speeds
const NAVAL_UNITS = [
  { id: 'bireme', name: 'Bireme (Birema)', baseSpeed: 15, role: 'Defense', icon: Shield, color: '#38bdf8' },
  { id: 'light_ship', name: 'Light Ship (Gyújtó)', baseSpeed: 13, role: 'Offense', icon: Flame, color: '#f87171' },
  { id: 'fast_transporter', name: 'Fast Transport (Gyors)', baseSpeed: 15, role: 'Transport', icon: Wind, color: '#34d399' },
  { id: 'slow_transporter', name: 'Slow Transport (Lassú)', baseSpeed: 8, role: 'Transport', icon: Anchor, color: '#94a3b8' },
  { id: 'trireme', name: 'Trireme (Trirema)', baseSpeed: 9, role: 'Hybrid', icon: Shield, color: '#a78bfa' },
  { id: 'colonize_ship', name: 'Colony Ship (Gyarmatosító)', baseSpeed: 3, role: 'Conquest', icon: Compass, color: '#fbbf24' }
];

const MYTHICAL_FLYING_UNITS = [
  { id: 'pegasus', name: 'Pegasus', baseSpeed: 35, color: '#67e8f9' },
  { id: 'harpy', name: 'Harpy', baseSpeed: 25, color: '#f43f5e' },
  { id: 'manticore', name: 'Manticore', baseSpeed: 22, color: '#fb923c' },
  { id: 'griffin', name: 'Griffin', baseSpeed: 18, color: '#eab308' }
];

export function calculateDistance(origin, target) {
  if (!origin || !target) return 0;
  const ox = origin.islandX || origin.x || 500;
  const oy = origin.islandY || origin.y || 500;
  const tx = target.islandX || target.x || 500;
  const ty = target.islandY || target.y || 500;
  return Math.sqrt(Math.pow(tx - ox, 2) + Math.pow(ty - oy, 2));
}

export function calculateTravelTimeSeconds(distance, unitBaseSpeed, worldSpeed = 3, unitSpeed = 1) {
  if (distance <= 0) return 0;
  // Official Grepolis formula: (distance * 50 / (speed * worldSpeed * unitSpeed)) in minutes -> * 60 for seconds
  const minutes = (distance * 50) / (unitBaseSpeed * worldSpeed * unitSpeed);
  return Math.round(minutes * 60);
}

export function formatDuration(totalSeconds) {
  if (totalSeconds <= 0) return '00:00:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function RoutePlannerTool({
  origin,
  target,
  onSwap,
  onClear,
  onClose,
  worldSpeed = 3,
  unitSpeed = 1
}) {
  const distance = calculateDistance(origin, target);

  return (
    <div className="glass-panel fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl p-4 backdrop-blur-xl animate-fade-in w-[520px] max-w-[95vw]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30">
            <Navigation size={16} />
          </div>
          <span className="font-bold text-white text-sm">Troop Route & Travel Times</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            {worldSpeed}x Speed
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Close Route Tool"
        >
          <X size={16} />
        </button>
      </div>

      {/* Origin -> Target Selector */}
      <div className="flex items-center gap-2 mb-3 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800">
        {/* Origin */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase text-primary tracking-wider">Origin</div>
          <div className="font-bold text-white text-xs truncate">
            {origin ? origin.name : <span className="text-slate-500 italic">Select origin on map...</span>}
          </div>
          {origin && (
            <div className="text-[10px] text-slate-400 font-mono">
              ({origin.islandX || origin.x}, {origin.islandY || origin.y})
            </div>
          )}
        </div>

        {/* Swap Button */}
        <button
          onClick={onSwap}
          disabled={!origin || !target}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-800 transition-colors shrink-0"
          title="Swap Origin and Target"
        >
          <ArrowLeftRight size={14} />
        </button>

        {/* Target */}
        <div className="flex-1 min-w-0 text-right">
          <div className="text-[10px] font-bold uppercase text-emerald-400 tracking-wider">Target</div>
          <div className="font-bold text-white text-xs truncate">
            {target ? target.name : <span className="text-slate-500 italic">Select target on map...</span>}
          </div>
          {target && (
            <div className="text-[10px] text-slate-400 font-mono">
              ({target.islandX || target.x}, {target.islandY || target.y})
            </div>
          )}
        </div>
      </div>

      {/* Distance Metric */}
      {origin && target && (
        <div className="flex items-center justify-between text-xs px-2 mb-3 text-slate-400">
          <span>Grid Distance: <strong className="text-white font-mono">{distance.toFixed(2)}</strong> units</span>
          <span className="text-emerald-400 font-semibold font-mono">~{(distance * 128).toFixed(0)} pixels</span>
        </div>
      )}

      {/* Unit Speed Table */}
      {origin && target ? (
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
          <div className="text-[10px] font-bold uppercase text-slate-400 px-1">Naval Fleet Times</div>
          <div className="grid grid-cols-2 gap-1.5">
            {NAVAL_UNITS.map(unit => {
              const seconds = calculateTravelTimeSeconds(distance, unit.baseSpeed, worldSpeed, unitSpeed);
              const Icon = unit.icon;
              return (
                <div key={unit.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon size={14} style={{ color: unit.color }} className="shrink-0" />
                    <span className="text-[11px] text-slate-200 truncate">{unit.name.split(' (')[0]}</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-white">{formatDuration(seconds)}</span>
                </div>
              );
            })}
          </div>

          <div className="text-[10px] font-bold uppercase text-slate-400 px-1 mt-2">Flying Mythical Times</div>
          <div className="grid grid-cols-2 gap-1.5">
            {MYTHICAL_FLYING_UNITS.map(unit => {
              const seconds = calculateTravelTimeSeconds(distance, unit.baseSpeed, worldSpeed, unitSpeed);
              return (
                <div key={unit.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Sparkles size={13} style={{ color: unit.color }} className="shrink-0" />
                    <span className="text-[11px] text-slate-200 truncate">{unit.name}</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-white">{formatDuration(seconds)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-4 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl">
          Click any town on the map to set Origin, then click another town to calculate live travel times.
        </div>
      )}

      {/* Action footer */}
      {origin && target && (
        <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between gap-2">
          <button
            onClick={onClear}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            Clear Route
          </button>
          <Link
            href={`/snipe?targetTownId=${target.id}&originTownId=${origin.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all shadow-md"
          >
            <Send size={12} /> Send to Sniper Tool
          </Link>
        </div>
      )}
    </div>
  );
}
