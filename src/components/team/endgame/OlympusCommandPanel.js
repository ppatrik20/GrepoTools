'use client';

import React, { useState } from 'react';
import {
  Compass, Shield, Zap, Sparkles, AlertTriangle,
  Clock, ArrowRight, ShieldCheck, Flame, Navigation
} from 'lucide-react';
import { calculatePortalRouteTiming, calculateCurseAttritionCurve } from '@/lib/endgame/olympusEngine';

export default function OlympusCommandPanel({
  endgameState,
  canCoordinate,
  onRefresh
}) {
  const olympus = endgameState?.olympus || {};
  const temples = olympus.temples || [];
  const godBonuses = olympus.godBonuses || {};

  // Interactive Curse Simulation Slider
  const [curseDays, setCurseDays] = useState(14);
  const [initialTroops, setInitialTroops] = useState(20000);

  // Portal Jump Planner Form States
  const [originX, setOriginX] = useState(500);
  const [originY, setOriginY] = useState(500);
  const [destX, setDestX] = useState(550);
  const [destY, setDestY] = useState(550);
  const [portalX, setPortalX] = useState(520);
  const [portalY, setPortalY] = useState(520);
  const [portalRouteResult, setPortalRouteResult] = useState(null);

  // Calculate curse attrition preview
  const troopsRemaining = Math.round(initialTroops * Math.pow(0.95, curseDays));
  const troopsLost = initialTroops - troopsRemaining;
  const lostPct = ((troopsLost / initialTroops) * 100).toFixed(1);

  const handleCalculatePortalRoute = (e) => {
    e.preventDefault();
    try {
      const result = calculatePortalRouteTiming({
        originCoords: { x: Number(originX), y: Number(originY) },
        destinationCoords: { x: Number(destX), y: Number(destY) },
        portalTempleCoords: { x: Number(portalX), y: Number(portalY) },
        unitType: 'bireme',
        worldSpeed: endgameState?.worldSpeed || 1.0,
        unitSpeed: 1.0
      });
      setPortalRouteResult(result);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 bg-gradient-to-r from-blue-950/40 via-slate-900 to-slate-900 border border-blue-500/30 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Compass className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">Olympus War Room & Temple Network</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Era of Olympus
            </span>
          </div>
          <p className="text-sm text-slate-300">
            Capture Small and Large Temples for divine buffs, harness Portal Temples to jump across oceans, and conquer Olympus to achieve world supremacy.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-right">
            <span className="text-[10px] text-slate-400 block uppercase font-mono">Olympus Shield</span>
            <span className="text-sm font-bold font-mono text-emerald-400 flex items-center gap-1">
              <ShieldCheck size={14} /> ACTIVE
            </span>
          </div>
          <div className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-right">
            <span className="text-[10px] text-slate-400 block uppercase font-mono">Next Jump In</span>
            <span className="text-sm font-bold font-mono text-amber-400 flex items-center gap-1">
              <Clock size={14} /> 12d 18h
            </span>
          </div>
        </div>
      </div>

      {/* Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Temples & Portal Route Planner */}
        <div className="lg:col-span-2 space-y-6">
          {/* Portal Route Planner Card */}
          <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Navigation className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Two-Leg Portal Route & Anti-Timing Planner</h3>
              </div>
              <span className="text-xs text-blue-300 font-mono font-bold">Portal Fast-Travel</span>
            </div>

            <form onSubmit={handleCalculatePortalRoute} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase">
                    1. Origin Town (X | Y)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={originX}
                      onChange={(e) => setOriginX(e.target.value)}
                      className="w-1/2 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs"
                      placeholder="X"
                    />
                    <input
                      type="number"
                      value={originY}
                      onChange={(e) => setOriginY(e.target.value)}
                      className="w-1/2 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs"
                      placeholder="Y"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-blue-900/50 space-y-2">
                  <label className="block text-xs font-semibold text-blue-300 uppercase">
                    2. Portal Temple (X | Y)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={portalX}
                      onChange={(e) => setPortalX(e.target.value)}
                      className="w-1/2 px-2.5 py-1.5 bg-slate-900 border border-blue-700/60 rounded-lg text-white font-mono text-xs"
                      placeholder="X"
                    />
                    <input
                      type="number"
                      value={portalY}
                      onChange={(e) => setPortalY(e.target.value)}
                      className="w-1/2 px-2.5 py-1.5 bg-slate-900 border border-blue-700/60 rounded-lg text-white font-mono text-xs"
                      placeholder="Y"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase">
                    3. Target Town (X | Y)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={destX}
                      onChange={(e) => setDestX(e.target.value)}
                      className="w-1/2 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs"
                      placeholder="X"
                    />
                    <input
                      type="number"
                      value={destY}
                      onChange={(e) => setDestY(e.target.value)}
                      className="w-1/2 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs"
                      placeholder="Y"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Unit Type: Bireme (Speed: 15)</span>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/20 cursor-pointer"
                >
                  Calculate Route Comparison
                </button>
              </div>
            </form>

            {/* Portal Route Result Comparison */}
            {portalRouteResult && (
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                    <span className="text-xs text-slate-400 block font-semibold">Direct Route:</span>
                    <span className="text-sm font-bold font-mono text-white">
                      {(portalRouteResult.directDurationSec / 3600).toFixed(1)} Hours
                    </span>
                    <span className="text-[11px] text-slate-500 block">Standard naval transit</span>
                  </div>

                  <div className="p-3 bg-blue-950/30 rounded-lg border border-blue-800/60">
                    <span className="text-xs text-blue-300 block font-semibold">Portal Teleport Route:</span>
                    <span className="text-sm font-bold font-mono text-blue-400">
                      {(portalRouteResult.portalDurationSec / 3600).toFixed(1)} Hours
                    </span>
                    <span className="text-[11px] text-emerald-400 block font-semibold">
                      Time saved: {portalRouteResult.timeSavedSec > 0 ? `${(portalRouteResult.timeSavedSec / 3600).toFixed(1)}h` : 'Direct is faster'}
                    </span>
                  </div>
                </div>

                {/* InnoGames One-Way Warning Alert */}
                <div className="p-3 bg-amber-950/40 border border-amber-600/60 rounded-xl flex items-center gap-2.5 text-amber-200 text-xs">
                  <AlertTriangle size={18} className="shrink-0 text-amber-400" />
                  <span>{portalRouteResult.returnWarning}</span>
                </div>
              </div>
            )}
          </div>

          {/* Temple Roster & Divine Buffs */}
          <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Active Alliance Divine Buffs & Temples</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {temples.length} Temples Tracked
              </span>
            </div>

            {temples.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                No active temple records in database. Temples are mapped automatically on world synchronization.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {temples.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{t.buffName || `Temple #${t.islandKey}`}</span>
                        <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-300 text-[10px] rounded font-mono">
                          {t.templeCategory}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono capitalize">
                        God: {t.god || 'Neutral'} • Island {t.islandKey}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Olympus Curse Simulator & Rules */}
        <div className="space-y-6">
          {/* Olympus Curse Calculator */}
          <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Flame className="w-5 h-5 text-red-500" />
              <div>
                <h3 className="text-sm font-bold text-white">Olympus Curse Simulator</h3>
                <p className="text-[11px] text-slate-400">Compounding 5% Daily Garrison Attrition</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Initial Defensive Units</span>
                  <span className="font-mono font-bold text-white">{initialTroops.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min="5000"
                  max="100000"
                  step="5000"
                  value={initialTroops}
                  onChange={(e) => setInitialTroops(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Holding Duration (Days)</span>
                  <span className="font-mono font-bold text-red-400">{curseDays} Days</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="28"
                  value={curseDays}
                  onChange={(e) => setCurseDays(Number(e.target.value))}
                  className="w-full accent-red-500"
                />
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Garrison Remaining:</span>
                  <span className="font-mono font-bold text-emerald-400">{troopsRemaining.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Troops Lost to Curse:</span>
                  <span className="font-mono font-bold text-red-400">-{troopsLost.toLocaleString()} ({lostPct}%)</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">Recommended Relay:</span>
                <span className="text-amber-400 font-mono font-bold">Every 6 Hours</span>
              </div>
            </div>
          </div>

          {/* InnoGames Olympus Rulebook */}
          <div className="p-5 bg-slate-950 border border-slate-800/80 rounded-2xl text-xs space-y-2 text-slate-400">
            <h5 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
              InnoGames Olympus Rules
            </h5>
            <ul className="list-disc pl-4 space-y-1">
              <li>Olympus stays in place for a predetermined time, then teleports to a random spot on the map!</li>
              <li>When Olympus jumps, all defensive units inside are wiped.</li>
              <li>Small Temples grant alliance-wide passive buffs.</li>
              <li>Large Temples grant divine spells and god-specific power boosts.</li>
              <li>Portal Temples allow one-way instant teleportation.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
