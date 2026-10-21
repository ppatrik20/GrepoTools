'use client';

import React, { useState } from 'react';
import {
  Castle, Sparkles, Shield, AlertTriangle, Clock,
  TrendingUp, Users, Plus, CheckCircle2, Package
} from 'lucide-react';
import { WONDER_TYPES } from '@/lib/endgame/wonderEngine';

// Official InnoGames Grepolis asset sprites
const WONDER_ARTWORK = {
  PYRAMID: 'https://gpall.innogamescdn.com/images/game/wonder/wonder_pyramid_great.png',
  COLOSSUS: 'https://gpall.innogamescdn.com/images/game/wonder/wonder_colossus.png',
  LIGHTHOUSE: 'https://gpall.innogamescdn.com/images/game/wonder/wonder_lighthouse.png',
  MAUSOLEUM: 'https://gpall.innogamescdn.com/images/game/wonder/wonder_mausoleum.png',
  STATUE: 'https://gpall.innogamescdn.com/images/game/wonder/wonder_statue.png',
  TEMPLE: 'https://gpall.innogamescdn.com/images/game/wonder/wonder_temple.png',
  GARDENS: 'https://gpall.innogamescdn.com/images/game/wonder/wonder_gardens.png'
};

export default function WonderCommandPanel({
  endgameState,
  canCoordinate,
  canManageLogistics,
  onRefresh,
  onUpsertProject,
  onAddContribution
}) {
  const wonders = endgameState?.wonders?.projects || [];
  const [selectedProjectId, setSelectedProjectId] = useState(wonders[0]?.id || null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPledgeModal, setShowPledgeModal] = useState(false);

  // Form states for registering new project
  const [newIslandId, setNewIslandId] = useState('');
  const [newWonderType, setNewWonderType] = useState('COLOSSUS');
  const [newStage, setNewStage] = useState(0);

  // Form states for contribution
  const [woodPledge, setWoodPledge] = useState(10000);
  const [stonePledge, setStonePledge] = useState(10000);
  const [silverPledge, setSilverPledge] = useState(10000);
  const [favorPledge, setFavorPledge] = useState(0);

  const activeProject = wonders.find(w => w.id === selectedProjectId) || wonders[0] || null;

  const handleRegisterProject = async (e) => {
    e.preventDefault();
    if (!newIslandId) return;
    await onUpsertProject({
      islandId: Number(newIslandId),
      wonderType: newWonderType,
      currentStage: Number(newStage)
    });
    setShowAddModal(false);
    setNewIslandId('');
  };

  const handlePledgeResources = async (e) => {
    e.preventDefault();
    if (!activeProject) return;
    await onAddContribution({
      projectId: activeProject.id,
      resourceWood: Number(woodPledge),
      resourceStone: Number(stonePledge),
      resourceSilver: Number(silverPledge),
      favorCastsCount: Number(favorPledge)
    });
    setShowPledgeModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Overview Banner */}
      <div className="p-6 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Castle className="w-6 h-6 text-amber-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">World Wonder Tactical War Room</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Era of World Wonders
            </span>
          </div>
          <p className="text-sm text-slate-300">
            Construct 4 of 7 World Wonders to claim victory, or hold all 7 to achieve Master of the World status.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {(canCoordinate || canManageLogistics) && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer"
            >
              <Plus size={16} />
              <span>Claim Wonder Site</span>
            </button>
          )}
        </div>
      </div>

      {/* Wonder Sites Carousel / Selector */}
      {wonders.length === 0 ? (
        <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-2xl text-center space-y-3">
          <Castle className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">No Wonder Sites Registered</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Your team has not yet designated an island wonder site. Locate a 100% alliance-held island with a wonder building spot and claim it.
          </p>
          {(canCoordinate || canManageLogistics) && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-amber-500 text-slate-950 font-bold text-sm rounded-xl"
            >
              Register First Wonder
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {wonders.map((w) => {
            const isSelected = (activeProject?.id === w.id);
            const artwork = WONDER_ARTWORK[w.wonderType] || WONDER_ARTWORK.COLOSSUS;
            const typeDef = WONDER_TYPES[w.wonderType];

            return (
              <div
                key={w.id}
                onClick={() => setSelectedProjectId(w.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col items-center text-center space-y-2 ${
                  isSelected
                    ? 'bg-amber-500/15 border-amber-500 shadow-md shadow-amber-500/20'
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center relative">
                  <img
                    src={artwork}
                    alt={w.wonderType}
                    className="w-full h-full object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <span className="absolute bottom-0 right-0 px-1 py-0.2 bg-slate-950/90 text-amber-400 text-[10px] font-mono font-bold rounded">
                    L{w.currentStage}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white truncate max-w-[100px]">
                    {typeDef?.name || w.wonderType}
                  </h4>
                  <p className="text-[10px] font-mono text-slate-400">Island #{w.islandId}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Active Wonder Detail Dashboard */}
      {activeProject && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Stage & Progress Card */}
          <div className="lg:col-span-2 space-y-6">
            <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center">
                    <img
                      src={WONDER_ARTWORK[activeProject.wonderType] || WONDER_ARTWORK.COLOSSUS}
                      alt={activeProject.wonderType}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {WONDER_TYPES[activeProject.wonderType]?.name || activeProject.wonderType}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">
                      Island #{activeProject.islandId} • Stage {activeProject.currentStage} / 10
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPledgeModal(true)}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/20"
                  >
                    <Package size={14} />
                    <span>Pledge Transport</span>
                  </button>
                </div>
              </div>

              {/* Stage Stepper Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Construction Progress</span>
                  <span className="text-amber-400 font-bold">{activeProject.currentStage * 10}%</span>
                </div>
                <div className="w-full h-3 bg-slate-950 rounded-full border border-slate-800 overflow-hidden flex">
                  {Array.from({ length: 10 }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`flex-1 border-r border-slate-950/60 transition-all ${
                        idx < activeProject.currentStage
                          ? 'bg-amber-500'
                          : idx === activeProject.currentStage
                          ? 'bg-amber-500/40 animate-pulse'
                          : 'bg-slate-800'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Resource Requirements Breakdown */}
              {activeProject.requirements && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-800/80">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-xs text-amber-200/70 font-semibold block">Wood Required</span>
                    <span className="text-base font-mono font-bold text-white">
                      {(activeProject.stageWoodCollected || 0).toLocaleString()} / {(activeProject.requirements.wood || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-xs text-slate-300 font-semibold block">Stone Required</span>
                    <span className="text-base font-mono font-bold text-white">
                      {(activeProject.stageStoneCollected || 0).toLocaleString()} / {(activeProject.requirements.stone || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-xs text-cyan-200/70 font-semibold block">Silver Required</span>
                    <span className="text-base font-mono font-bold text-white">
                      {(activeProject.stageSilverCollected || 0).toLocaleString()} / {(activeProject.requirements.silver || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* Favor & Speed Boost Indicators */}
              <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-slate-300">Divine Favor Max Cap (50% rule):</span>
                  <span className="text-purple-300 font-mono font-bold">
                    {activeProject.dailyFavorAccrualCap ? `${activeProject.dailyFavorAccrualCap.toLocaleString()} favor/day` : 'Active'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Clock size={14} />
                  <span>Base stage duration:</span>
                  <span className="text-amber-400 font-mono font-bold">
                    {activeProject.baseTimeSec ? `${Math.round(activeProject.baseTimeSec / 3600)}h` : '--'}
                  </span>
                </div>
              </div>
            </div>

            {/* Recent Transport Convoys Log */}
            <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-3">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp size={16} className="text-amber-400" />
                <span>Logistics & Transport Convoys</span>
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(!activeProject.contributions || activeProject.contributions.length === 0) ? (
                  <p className="text-xs text-slate-500 py-3 text-center">No transport contributions recorded yet.</p>
                ) : (
                  activeProject.contributions.map((c) => (
                    <div
                      key={c.id}
                      className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{c.member?.playerName || 'Operative'}</span>
                        <span className="text-slate-400 text-[11px] font-mono">
                          +{((c.resourceWood || 0) + (c.resourceStone || 0) + (c.resourceSilver || 0)).toLocaleString()} res
                        </span>
                        {c.favorCastsCount > 0 && (
                          <span className="text-purple-400 text-[11px] font-mono">
                            +{c.favorCastsCount} favor
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Fortification & Island Security Audit */}
          <div className="space-y-6">
            <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <Shield className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Wonder Island Fortress Audit</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Island #{activeProject.islandId}</p>
                </div>
              </div>

              {activeProject.fortressAudit ? (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-300">Island Control:</span>
                    <span className={`text-xs font-bold font-mono ${
                      activeProject.fortressAudit.is100PercentAllianceHeld
                        ? 'text-emerald-400'
                        : 'text-red-400'
                    }`}>
                      {activeProject.fortressAudit.is100PercentAllianceHeld ? '100% Alliance-Held' : 'Compromised!'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-300">Vulnerability Score:</span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      {activeProject.fortressAudit.vulnerabilityScore} / 100
                    </span>
                  </div>

                  {activeProject.fortressAudit.vacationModeTownsCount > 0 && (
                    <div className="p-3 bg-amber-950/30 border border-amber-700/50 rounded-xl flex items-center gap-2 text-amber-300 text-xs">
                      <AlertTriangle size={16} className="shrink-0 text-amber-400" />
                      <span>
                        {activeProject.fortressAudit.vacationModeTownsCount} city on island has vacation mode active (defenses disabled on wonder islands!).
                      </span>
                    </div>
                  )}

                  {activeProject.fortressAudit.joinLockTownsCount > 0 && (
                    <div className="p-3 bg-blue-950/30 border border-blue-700/50 rounded-xl flex items-center gap-2 text-blue-300 text-xs">
                      <Clock size={16} className="shrink-0 text-blue-400" />
                      <span>
                        {activeProject.fortressAudit.joinLockTownsCount} city held by player with &lt;72h alliance tenure (72h join lock prevents sending resources).
                      </span>
                    </div>
                  )}

                  {!activeProject.fortressAudit.is100PercentAllianceHeld && (
                    <div className="p-3 bg-red-950/40 border border-red-800 rounded-xl flex items-center gap-2 text-red-200 text-xs">
                      <AlertTriangle size={16} className="shrink-0 text-red-400" />
                      <span>
                        Foreign cities detected on island! If a hostile city is founded or conquered, wonder construction stops immediately and current stage is destroyed!
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Audit loading...</p>
              )}
            </div>

            {/* Strategic Rulebook Card */}
            <div className="p-5 bg-slate-950 border border-slate-800/80 rounded-2xl text-xs space-y-2 text-slate-400">
              <h5 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                InnoGames World Wonder Rules
              </h5>
              <ul className="list-disc pl-4 space-y-1">
                <li>Island must be 100% controlled by your alliance to begin.</li>
                <li>Losing a single city on the island destroys ongoing construction.</li>
                <li>72-hour lock: Operatives joining cannot send resources for 72h.</li>
                <li>Vacation mode cities on wonder islands can still be attacked!</li>
                <li>Favor max daily acceleration is capped at 50% of the stage time.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Claim / Register Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Register Wonder Island Site</h3>
            <form onSubmit={handleRegisterProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Island ID
                </label>
                <input
                  type="number"
                  required
                  value={newIslandId}
                  onChange={(e) => setNewIslandId(e.target.value)}
                  placeholder="e.g. 1042"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  World Wonder Type
                </label>
                <select
                  value={newWonderType}
                  onChange={(e) => setNewWonderType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm"
                >
                  {Object.entries(WONDER_TYPES).map(([k, def]) => (
                    <option key={k} value={k}>{def.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Current In-Game Stage (0..10)
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={newStage}
                  onChange={(e) => setNewStage(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 text-slate-950 font-bold text-xs rounded-xl"
                >
                  Register Site
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pledge Contribution Modal */}
      {showPledgeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Pledge Transport Convoy</h3>
            <form onSubmit={handlePledgeResources} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Wood</label>
                <input
                  type="number"
                  value={woodPledge}
                  onChange={(e) => setWoodPledge(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Stone</label>
                <input
                  type="number"
                  value={stonePledge}
                  onChange={(e) => setStonePledge(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Silver</label>
                <input
                  type="number"
                  value={silverPledge}
                  onChange={(e) => setSilverPledge(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-purple-300 uppercase mb-1">
                  Divine Favor Boost (Casts)
                </label>
                <input
                  type="number"
                  value={favorPledge}
                  onChange={(e) => setFavorPledge(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-purple-700 rounded-xl text-white text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPledgeModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl"
                >
                  Record Pledge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
