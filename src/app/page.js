'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { 
  Target, Activity, Map as MapIcon, ShieldAlert, Crosshair, MapPin, 
  Globe, User, ArrowUpRight, ArrowDownRight, RefreshCw, Plus, Clock, Swords,
  Trophy, Shield, ExternalLink
} from 'lucide-react';
import { 
  LocalOperationsAdapter, 
  RemoteOperationsAdapter 
} from '@/lib/operations/OperationsStorage';
import { 
  Button, 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  StatCard, 
  Badge, 
  PageHeader, 
  SkeletonStatGrid,
  EmptyState 
} from '@/components/ui';

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

  const headerBadges = [
    {
      text: `World: ${activeWorld?.name || activeWorldId?.toUpperCase()} (${activeWorld?.speed || 1}x • ${activeWorld?.worldType?.toUpperCase() || 'REVOLT'})`,
      variant: 'primary',
      mono: true,
    },
    ...(activePlayer ? [{
      text: `Player: ${activePlayer.name}`,
      variant: 'accent',
      mono: true,
      dot: true,
    }] : [])
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Standardized Hero Header Banner */}
      <PageHeader
        title="Tactical Command Center"
        subtitle={
          loadingPlayer ? "Loading empire intelligence..." :
          activePlayer ? `Welcome back, Commander ${activePlayer.name}. All systems operational.` :
          `No active player selected for ${activeWorldId?.toUpperCase()}. Select a player above or in the scoreboard.`
        }
        badges={headerBadges}
        actions={
          <>
            <Link href="/snipe/recall">
              <Button variant="primary" size="md" icon={Crosshair}>
                New Snipe Plan
              </Button>
            </Link>
            <Link href="/map">
              <Button variant="secondary" size="md" icon={MapIcon}>
                Open Map
              </Button>
            </Link>
          </>
        }
      />

      {/* Main 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (2 Cols wide on large screens): Empire Status & Operations */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Empire Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle icon={Activity}>
                Empire Status
              </CardTitle>
              {activePlayer && (
                <Badge variant="neutral" size="sm">
                  {activePlayer.alliance?.name ? `Alliance: ${activePlayer.alliance.name}` : 'Independent'}
                </Badge>
              )}
            </CardHeader>

            <CardContent>
              {loadingPlayer ? (
                <SkeletonStatGrid count={4} />
              ) : activePlayer ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <StatCard
                      label="Total Points"
                      value={activePlayer.points?.toLocaleString()}
                      variant="accent"
                      icon={Trophy}
                    />
                    <StatCard
                      label="Global Rank"
                      value={`#${activePlayer.rank}`}
                      variant="default"
                      icon={Activity}
                    />
                    <StatCard
                      label="Town Count"
                      value={activePlayer.townsList?.length || activePlayer.towns}
                      variant="primary"
                      icon={Shield}
                    />
                    <StatCard
                      label="Battle Points"
                      value={((activePlayer.abp || 0) + (activePlayer.dbp || 0)).toLocaleString()}
                      variant="emerald"
                      icon={Swords}
                    />
                  </div>

                  {/* Recent Conquers vs Losses */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                          <ArrowUpRight size={14} /> Recent Acquisitions
                        </span>
                        <Badge variant="emerald" size="xs">Gain</Badge>
                      </div>
                      {masterData?.recentConquers?.length > 0 ? (
                        <ul className="flex flex-col gap-2 text-sm">
                          {masterData.recentConquers.map(c => (
                            <li key={c.id} className="flex justify-between items-center text-slate-300 p-2.5 bg-slate-900/60 rounded-lg border border-slate-800/50">
                              <span className="flex items-center gap-1.5 text-emerald-400">
                                <MapPin size={13}/> Town #{c.townId}
                              </span>
                              <span className="font-mono text-xs text-slate-400">{c.townPoints?.toLocaleString()} pts</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-xs text-slate-500 py-4 text-center">No recent conquers recorded.</div>
                      )}
                    </div>

                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-red-400 flex items-center gap-1.5 uppercase tracking-wider">
                          <ArrowDownRight size={14} /> Recent Losses
                        </span>
                        <Badge variant="danger" size="xs">Loss</Badge>
                      </div>
                      {masterData?.recentLosses?.length > 0 ? (
                        <ul className="flex flex-col gap-2 text-sm">
                          {masterData.recentLosses.map(c => (
                            <li key={c.id} className="flex justify-between items-center text-slate-300 p-2.5 bg-slate-900/60 rounded-lg border border-slate-800/50">
                              <span className="flex items-center gap-1.5 text-red-400">
                                <MapPin size={13}/> Town #{c.townId}
                              </span>
                              <span className="font-mono text-xs text-slate-400">{c.townPoints?.toLocaleString()} pts</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-xs text-slate-500 py-4 text-center">No recent losses recorded.</div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={User}
                  title="No Active Player Profile"
                  description="Select a player identity to unlock real-time empire monitoring, city specialization, and targeted defensive alerts."
                  actionLabel="Browse Scoreboard & Select Player"
                  onAction={() => {}}
                  actionIcon={Trophy}
                />
              )}
            </CardContent>
          </Card>

          {/* Active Defense Operations Card */}
          <Card>
            <CardHeader>
              <CardTitle icon={ShieldAlert} className="text-amber-400">
                Active Operations & Defense Plans
              </CardTitle>
              <Link href="/snipe/recall" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                Open Planner →
              </Link>
            </CardHeader>

            <CardContent>
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
                        <div className="font-bold text-indigo-400 text-sm">{snipe.targetCity}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {snipe.worldType?.toUpperCase()} • {snipe.movements?.length || 0} tracked incoming attacks
                        </div>
                      </div>
                      <Badge variant="primary" mono size="sm">
                        {snipe.plans?.length || 0} Snipes Planned
                      </Badge>
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
                      <Badge variant="amber" mono size="xs">
                        {op.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Crosshair}
                  title="No Active Operations"
                  description="Deploy precision recall snipes or schedule multi-city offensive operations using the tactical planner."
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Quick Tactical Tools & Navigation Cards */}
        <div className="flex flex-col gap-4">
          <Link href="/snipe/recall" className="group">
            <Card hoverEffect className="group-hover:border-indigo-500/50">
              <h3 className="flex items-center gap-2 text-white group-hover:text-indigo-400 font-bold text-sm transition-colors">
                <Crosshair size={18} className="text-indigo-400" /> Precision Recall Sniper
              </h3>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                Bypass the ATR variance with exact midpoint cancel timings and audio countdowns.
              </p>
            </Card>
          </Link>
          
          <Link href="/planner" className="group">
            <Card hoverEffect className="group-hover:border-blue-500/50">
              <h3 className="flex items-center gap-2 text-white group-hover:text-blue-400 font-bold text-sm transition-colors">
                <Target size={18} className="text-blue-400" /> City & Army Optimizer
              </h3>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                Specialization presets (NO_LS, LO_TS, ND_BIR, Mythic), building demolition simulator, and transport capacity checks.
              </p>
            </Card>
          </Link>

          <Link href="/map" className="group">
            <Card hoverEffect className="group-hover:border-cyan-500/50">
              <h3 className="flex items-center gap-2 text-white group-hover:text-cyan-400 font-bold text-sm transition-colors">
                <MapIcon size={18} className="text-cyan-400" /> Strategic World Map
              </h3>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                Interactive MapLibre canvas with political Voronoi dominance, radar scans, tactical pinboard, and coalition overlays.
              </p>
            </Card>
          </Link>

          <Link href="/stats" className="group">
            <Card hoverEffect className="group-hover:border-emerald-500/50">
              <h3 className="flex items-center gap-2 text-white group-hover:text-emerald-400 font-bold text-sm transition-colors">
                <Activity size={18} className="text-emerald-400" /> Scoreboard & Momentum
              </h3>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                24h/7d player & alliance rankings, hourly delta trends, and custom pinned operative tracking.
              </p>
            </Card>
          </Link>

          <Link href="/world" className="group">
            <Card hoverEffect className="group-hover:border-slate-500">
              <h3 className="flex items-center gap-2 text-slate-300 group-hover:text-white font-bold text-sm transition-colors">
                <Globe size={18} className="text-slate-400" /> Admin World Center
              </h3>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                Configure game worlds, trigger high-throughput sync pipelines, and audit data ingestion deltas.
              </p>
            </Card>
          </Link>
        </div>

      </div>
    </div>
  );
}
