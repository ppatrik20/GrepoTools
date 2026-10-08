import React from 'react';
import {
  Sparkles, Swords, ShieldAlert, Layers, Radar
} from 'lucide-react';

export default function TeamRoadmapTab() {
  return (
    <div className="space-y-6">
      <div className="p-6 bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-800 rounded-2xl space-y-2">
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-amber-400" />
          <span>Tactical Command Modules Roadmap</span>
        </h2>
        <p className="text-sm text-slate-400 max-w-3xl">
          The capability-based RBAC system is fully wired to seamlessly govern these advanced upcoming tactical modules.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Feature 1: Operation Rooms */}
        <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 hover:border-amber-500/40 transition-all shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                <Swords size={20} />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Operation Rooms (Synchronous Landings)</h3>
                <span className="text-xs text-red-400 font-semibold">Offensive Coordination</span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              RBAC Connected
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Coordinate synchronized CS siege strikes, timing windows, anti-timing buffer offsets, and wave schedules across alliance wings.
          </p>
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500">Required Capability:</span>
            <span className="font-mono font-bold text-amber-400">OPERATIONS_COORDINATE</span>
          </div>
        </div>

        {/* Feature 2: Bireme Defense Dispatcher */}
        <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 hover:border-blue-500/40 transition-all shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Bireme Defense Dispatcher</h3>
                <span className="text-xs text-blue-400 font-semibold">Emergency Reinforcements</span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              RBAC Connected
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Emergency siege alarm dispatcher that calculates nearest available bireme stacks, naval travel times, and sends 1-click reinforcement orders.
          </p>
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500">Required Capability:</span>
            <span className="font-mono font-bold text-blue-400">DEFENSE_COORDINATE</span>
          </div>
        </div>

        {/* Feature 3: Coalition Frontline Heatmap */}
        <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 hover:border-emerald-500/40 transition-all shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Layers size={20} />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Coalition Frontline Heatmap</h3>
                <span className="text-xs text-emerald-400 font-semibold">Territorial Dominance</span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              RBAC Connected
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Live ocean border and island pressure heatmap highlighting contested warzones, safe-core islands, and strategic frontlines across pacts.
          </p>
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500">Required Capability:</span>
            <span className="font-mono font-bold text-emerald-400">COALITIONS_MANAGE</span>
          </div>
        </div>

        {/* Feature 4: Ghost Town Radar */}
        <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 hover:border-purple-500/40 transition-all shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Radar size={20} />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Ghost Town Radar & Claim Lock</h3>
                <span className="text-xs text-purple-400 font-semibold">Asset Reclamation</span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              RBAC Connected
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Automated detection of abandoned ghost towns above 5k points with built-in team reservation locks to avoid friendly fire claims.
          </p>
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500">Required Capability:</span>
            <span className="font-mono font-bold text-purple-400">GHOST_RADAR_RESERVE</span>
          </div>
        </div>
      </div>
    </div>
  );
}
