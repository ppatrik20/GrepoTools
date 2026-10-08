'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { 
  Target, Activity, Map as MapIcon, ShieldAlert, Crosshair, MapPin, 
  Globe, User, ArrowUpRight, ArrowDownRight, RefreshCw, Plus, Clock, Swords
} from 'lucide-react';
import { 
  LocalOperationsAdapter, 
  RemoteOperationsAdapter 
} from '@/lib/operations/OperationsStorage';

export default function CommandCenter() {
  const { activeWorld, activeWorldId, activePlayer, masterData, loadingPlayer, switchPlayer } = useApp();
  const [activeSnipes, setActiveSnipes] = useState([]);
  const [dbOperations, setDbOperations] = useState([]);
  const [loadingOps, setLoadingOps] = useState(true);

  // Load operations from DB and localStorage
  useEffect(() => {
    if (!activeWorldId) return;

    setLoadingOps(true);
    RemoteOperationsAdapter.fetchOperations({ worldId: activeWorldId })
      .then(ops => {
        setDbOperations(ops);
        setLoadingOps(false);
      })
      .catch(() => setLoadingOps(false));

    // Load active recall groups from local storage
    const loadedGroups = LocalOperationsAdapter.getRecallGroups(activeWorldId);
    setActiveSnipes(loadedGroups);
  }, [activeWorldId]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-slate-800 pb-5 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-primary/10 text-primary text-xs font-mono px-2.5 py-0.5 rounded-full border border-primary/20">
              World: {activeWorld?.name || activeWorldId.toUpperCase()} ({activeWorld?.speed}x • {activeWorld?.worldType?.toUpperCase()})
            </span>
            {activePlayer && (
              <span className="bg-accent/10 text-accent text-xs font-mono px-2.5 py-0.5 rounded-full border border-accent/20">
                Player: {activePlayer.name}
              </span>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Tactical Command Center</h1>
          <p className="text-slate-400 text-sm mt-1">
            {loadingPlayer ? "Loading empire intelligence..." :
             activePlayer ? `Welcome back, Commander ${activePlayer.name}. All systems operational.` :
             `No active player selected for ${activeWorldId.toUpperCase()}. Click the profile button above or select a player.`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/snipe/recall" className="btn btn-primary">
            <Crosshair size={16} /> New Snipe Plan
          </Link>
          <Link href="/map" className="btn bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">
            <MapIcon size={16} /> Open Map
          </Link>
        </div>
      </div>

      {/* Main 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (2 Cols wide on large screens): Empire Status & Operations */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Empire Summary Card */}
          <div className="glass-panel">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Activity size={18} className="text-primary" /> Empire Status
              </h2>
              {activePlayer && (
                <span className="text-xs text-slate-400 font-mono">
                  {activePlayer.alliance?.name ? `Alliance: ${activePlayer.alliance.name}` : 'Independent'}
                </span>
              )}
            </div>

            {loadingPlayer ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-pulse py-4">
                <div className="h-16 bg-slate-800/60 rounded-xl"></div>
                <div className="h-16 bg-slate-800/60 rounded-xl"></div>
                <div className="h-16 bg-slate-800/60 rounded-xl"></div>
                <div className="h-16 bg-slate-800/60 rounded-xl"></div>
              </div>
            ) : activePlayer ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                    <div className="text-xs text-slate-400 uppercase tracking-wider">Total Points</div>
                    <div className="text-2xl font-mono font-bold text-accent mt-0.5">
                      {activePlayer.points?.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                    <div className="text-xs text-slate-400 uppercase tracking-wider">Global Rank</div>
                    <div className="text-2xl font-mono font-bold text-white mt-0.5">
                      #{activePlayer.rank}
                    </div>
                  </div>
                  <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                    <div className="text-xs text-slate-400 uppercase tracking-wider">Town Count</div>
                    <div className="text-2xl font-mono font-bold text-primary mt-0.5">
                      {activePlayer.townsList?.length || activePlayer.towns}
                    </div>
                  </div>
                  <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                    <div className="text-xs text-slate-400 uppercase tracking-wider">Battle Points</div>
                    <div className="text-2xl font-mono font-bold text-emerald-400 mt-0.5">
                      {((activePlayer.abp || 0) + (activePlayer.dbp || 0)).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Recent Conquers vs Losses */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
                    <h3 className="text-xs font-semibold text-emerald-400 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                      <ArrowUpRight size={14} /> Recent Acquisitions
                    </h3>
                    {masterData?.recentConquers?.length > 0 ? (
                      <ul className="flex flex-col gap-2 text-sm">
                        {masterData.recentConquers.map(c => (
                          <li key={c.id} className="flex justify-between items-center text-slate-300 p-2.5 bg-slate-900/60 rounded-lg">
                            <span className="flex items-center gap-1.5 text-emerald-400">
                              <MapPin size={13}/> Town #{c.townId}
                            </span>
                            <span className="font-mono text-xs text-slate-400">{c.townPoints?.toLocaleString()} pts</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-slate-500 py-3 text-center">No recent conquers recorded.</div>
                    )}
                  </div>

                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
                    <h3 className="text-xs font-semibold text-rose-400 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                      <ArrowDownRight size={14} /> Recent Losses
                    </h3>
                    {masterData?.recentLosses?.length > 0 ? (
                      <ul className="flex flex-col gap-2 text-sm">
                        {masterData.recentLosses.map(c => (
                          <li key={c.id} className="flex justify-between items-center text-slate-300 p-2.5 bg-slate-900/60 rounded-lg">
                            <span className="flex items-center gap-1.5 text-rose-400">
                              <MapPin size={13}/> Town #{c.townId}
                            </span>
                            <span className="font-mono text-xs text-slate-400">{c.townPoints?.toLocaleString()} pts</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-slate-500 py-3 text-center">No recent losses recorded.</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8 bg-slate-950/40 rounded-xl border border-slate-800/60">
                <p className="text-slate-400 text-sm mb-3">No active player profile selected for this world.</p>
                <Link href="/stats" className="btn btn-primary text-xs">
                  Browse Scoreboard & Pick Player
                </Link>
              </div>
            )}
          </div>

          {/* Active Defense Operations Card */}
          <div className="glass-panel">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldAlert size={18} className="text-amber-400" /> Active Operations & Defense Plans
              </h2>
              <Link href="/snipe/recall" className="text-xs text-primary hover:underline flex items-center gap-1">
                Open Planner →
              </Link>
            </div>

            {loadingOps ? (
              <div className="py-6 text-center text-slate-500 text-sm animate-pulse">Loading operations...</div>
            ) : activeSnipes.length > 0 || dbOperations.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {activeSnipes.map(snipe => (
                  <Link 
                    href="/snipe/recall" 
                    key={snipe.id} 
                    className="flex justify-between items-center p-3.5 bg-slate-950/60 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition-all"
                  >
                    <div>
                      <div className="font-bold text-accent text-sm">{snipe.targetCity}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {snipe.worldType?.toUpperCase()} • {snipe.movements?.length || 0} tracked incoming attacks
                      </div>
                    </div>
                    <div className="text-xs font-mono text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-md">
                      {snipe.plans?.length || 0} Snipes Planned
                    </div>
                  </Link>
                ))}

                {dbOperations.map(op => (
                  <div 
                    key={op.id}
                    className="flex justify-between items-center p-3.5 bg-slate-950/40 border border-slate-800 rounded-xl"
                  >
                    <div>
                      <div className="font-bold text-slate-200 text-sm">{op.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Target: {op.targetTown?.name || `#${op.targetTownId}`} • Send: {new Date(op.sendTime).toLocaleTimeString()}
                      </div>
                    </div>
                    <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded font-mono">
                      {op.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 bg-slate-950/30 rounded-xl text-slate-500 text-sm">
                No active snipe operations or recall schedules.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Quick Tactical Tools & Navigation Cards */}
        <div className="flex flex-col gap-4">
          <Link href="/snipe/recall" className="glass-panel hover:border-accent/60 transition-all group block">
            <h3 className="flex items-center gap-2 text-white group-hover:text-accent font-bold transition-colors">
              <Crosshair size={18} className="text-accent" /> Precision Recall Sniper
            </h3>
            <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
              Bypass the ATR variance with exact midpoint cancel timings and audio countdowns.
            </p>
          </Link>
          
          <Link href="/planner" className="glass-panel hover:border-primary/60 transition-all group block">
            <h3 className="flex items-center gap-2 text-white group-hover:text-primary font-bold transition-colors">
              <Target size={18} className="text-primary" /> City & Army Optimizer
            </h3>
            <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
              Specialization tags (`NO_LS`, `LO_TS`, `ND_BIR`, Myth), building demolition simulator, and transport capacity validation.
            </p>
          </Link>

          <Link href="/map" className="glass-panel hover:border-blue-400/60 transition-all group block">
            <h3 className="flex items-center gap-2 text-white group-hover:text-blue-400 font-bold transition-colors">
              <MapIcon size={18} className="text-blue-400" /> Strategic World Map
            </h3>
            <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
              Inspect island slots, alliance clusters, color overrides, and copy BBCode coordinates.
            </p>
          </Link>

          <Link href="/stats" className="glass-panel hover:border-emerald-400/60 transition-all group block">
            <h3 className="flex items-center gap-2 text-white group-hover:text-emerald-400 font-bold transition-colors">
              <Activity size={18} className="text-emerald-400" /> Scoreboard & Momentum
            </h3>
            <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
              24h/7d player & alliance rankings, hourly delta charts, and pinned entity tracking.
            </p>
          </Link>

          <Link href="/world" className="glass-panel hover:border-slate-500 transition-all group block">
            <h3 className="flex items-center gap-2 text-slate-300 group-hover:text-white font-bold transition-colors">
              <Globe size={18} className="text-slate-400" /> Admin World Center
            </h3>
            <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
              Configure game worlds, manage server sync intervals, and monitor data ingestion.
            </p>
          </Link>
        </div>

      </div>
    </div>
  );
}
