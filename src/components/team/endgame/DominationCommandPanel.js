'use client';

import React, { useState } from 'react';
import {
  Crown, Flame, Target, Users, ShieldAlert,
  Compass, ArrowUpRight, CheckCircle2, ChevronRight
} from 'lucide-react';

export default function DominationCommandPanel({
  endgameState,
  canCoordinate,
  onRefresh,
  onToggleIsland
}) {
  const domination = endgameState?.domination || {};
  const progress = domination.progress || {
    currentPercentage: 0,
    targetPercentage: 40,
    isThresholdReached: false,
    townsNeededForTarget: 0
  };

  const isLastStand = endgameState?.endgamePhase === 'LAST_STAND';
  const targetPct = endgameState?.dominationTargetPct || 40.0;
  const currentPct = progress.currentPercentage || 0;

  // Sample or simulated expansion targets
  const [selectedOcean, setSelectedOcean] = useState('ALL');

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-900 border border-red-500/30 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Flame className="w-6 h-6 text-red-500" />
            <h2 className="text-xl font-bold text-white tracking-wide">Domination Tactical Command</h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
              isLastStand
                ? 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
            }`}>
              {isLastStand ? 'LAST STAND IN PROGRESS' : 'Regular Domination Era'}
            </span>
          </div>
          <p className="text-sm text-slate-300">
            Secure control of valid island towns to reach the domination threshold ({targetPct}%) and trigger the Last Stand.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-right">
            <span className="text-[10px] text-slate-400 block uppercase font-mono">Current Control</span>
            <span className="text-lg font-bold font-mono text-red-400">{currentPct.toFixed(2)}%</span>
          </div>
          <div className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-right">
            <span className="text-[10px] text-slate-400 block uppercase font-mono">Required</span>
            <span className="text-lg font-bold font-mono text-white">{targetPct.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Domination Progress Meter */}
      <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Domination Threshold Meter</h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {domination.teamTownsCount || 0} / {domination.totalTownsCount || 0} Valid Towns
          </span>
        </div>

        <div className="w-full h-4 bg-slate-950 rounded-full border border-slate-800 overflow-hidden relative">
          <div
            className={`h-full transition-all duration-500 ${
              progress.isThresholdReached ? 'bg-red-500' : 'bg-amber-500'
            }`}
            style={{ width: `${Math.min(100, (currentPct / targetPct) * 100)}%` }}
          />
          {/* Target Marker Pin */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg"
            style={{ left: `${Math.min(100, targetPct)}%` }}
            title={`Domination Target: ${targetPct}%`}
          />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between text-xs text-slate-400 pt-1">
          <span>
            {progress.isThresholdReached
              ? '✓ Target percentage attained! Last Stand can be triggered.'
              : `${progress.townsNeededForTarget} more valid cities needed to activate Last Stand.`}
          </span>
          <span className="font-mono text-amber-300">
            Half-Gap Decay: Requirement drops every 14 days if unclaimed
          </span>
        </div>
      </div>

      {/* Grid: Last Stand & Strategic Mechanics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Last Stand Status or Hold Buffer */}
        <div className="lg:col-span-2 space-y-6">
          {isLastStand ? (
            <div className="p-6 bg-red-950/20 border border-red-500/40 rounded-2xl space-y-4">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-8 h-8 text-red-500 animate-pulse" />
                <div>
                  <h3 className="text-base font-bold text-white">Last Stand Active Countdown</h3>
                  <p className="text-xs text-red-300">
                    Defend valid cities and hold above the threshold until the timer reaches zero!
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-red-900/40 flex items-center justify-around text-center">
                <div>
                  <span className="text-xs text-slate-400 block font-mono">Duration</span>
                  <span className="text-xl font-bold font-mono text-white">
                    {domination.lastStandDurationHours ? `${domination.lastStandDurationHours / 24} Days` : '14 Days'}
                  </span>
                </div>
                <div className="w-px h-8 bg-slate-800" />
                <div>
                  <span className="text-xs text-slate-400 block font-mono">Safety Buffer</span>
                  <span className="text-xl font-bold font-mono text-emerald-400">
                    +12 Towns
                  </span>
                </div>
                <div className="w-px h-8 bg-slate-800" />
                <div>
                  <span className="text-xs text-slate-400 block font-mono">Status</span>
                  <span className="text-xl font-bold font-mono text-amber-400">
                    HOLDING
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Top Operative City Concentrations</h3>
                </div>
                <span className="text-xs text-slate-400 font-mono">Valid Islands Only</span>
              </div>

              <p className="text-xs text-slate-400">
                In Domination, only the alliance&apos;s top members by valid town count determine your dominance ratio.
              </p>

              <div className="space-y-2">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-slate-500 font-mono">#1</span>
                    <span className="font-semibold text-white">Leading Commander</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-slate-400">48 Valid Towns</span>
                    <span className="text-amber-400 font-bold">2.4%</span>
                  </div>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-slate-500 font-mono">#2</span>
                    <span className="font-semibold text-white">Frontline General</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-slate-400">39 Valid Towns</span>
                    <span className="text-amber-400 font-bold">1.9%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Valid Island Filter & Guidance */}
          <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Compass size={16} className="text-amber-400" />
              <span>Valid Island Criteria & InnoGames Domination Rules</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-400">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80">
                <span className="font-bold text-white block mb-1">Eligible Islands (Large Islands)</span>
                <span>Only standard colonizable islands (20 town spots with farm villages) count towards the domination pool.</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80">
                <span className="font-bold text-red-300 block mb-1">Excluded (Small Rocks & Temples)</span>
                <span>Small rock islands, temple islands, and ghost rocks are strictly excluded from the domination pool.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Strategic Expansion Targets */}
        <div className="space-y-6">
          <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-red-400" />
                <h3 className="text-sm font-bold text-white">High-Priority Expansion Targets</h3>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Hostile and unclaimed towns on high-density valid islands that yield maximum domination percentage.
            </p>

            <div className="space-y-2">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <h5 className="font-bold text-white">Ephesus [542|481]</h5>
                  <span className="text-[11px] text-slate-400 font-mono">Ocean 54 • Island #201</span>
                </div>
                <div className="text-right font-mono">
                  <span className="text-emerald-400 font-bold block">+0.08%</span>
                  <span className="text-[10px] text-slate-500">Hostile Town</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <h5 className="font-bold text-white">Corinth [538|490]</h5>
                  <span className="text-[11px] text-slate-400 font-mono">Ocean 54 • Island #201</span>
                </div>
                <div className="text-right font-mono">
                  <span className="text-emerald-400 font-bold block">+0.08%</span>
                  <span className="text-[10px] text-slate-500">Ghost City</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 bg-slate-950 border border-slate-800/80 rounded-2xl text-xs space-y-2 text-slate-400">
            <h5 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
              Domination Objective
            </h5>
            <p>
              Once Last Stand is won, the world enters peaceful countdown mode and no more town conquests can occur. Hold the line!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
