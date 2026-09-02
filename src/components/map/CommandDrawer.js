"use client";

import React, { useState, useEffect } from 'react';
import { 
  X, Maximize2, MapPin, Castle, Trophy, Users, Swords, Shield, 
  Copy, ExternalLink, Navigation, Compass, Pin
} from 'lucide-react';
import { normalizeTownData } from './UnifiedSearchPanel';

export default function CommandDrawer({
  entity, // { type: 'town' | 'island' | 'player' | 'alliance', data: any }
  onClose,
  onExpandToModal,
  worldId = 'hu119',
  onSelectEntity,
  onSetRouteOrigin,
  onSetRouteTarget,
  onOpenPinModal,
  customColors = {}
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [fetchedData, setFetchedData] = useState(null);
  const [copiedMsg, setCopiedMsg] = useState('');

  useEffect(() => {
    async function fetchEntityData() {
      if (!entity?.data?.id && entity?.type !== 'island') return;
      setLoading(true);
      try {
        if (entity.type === 'town') {
          const res = await fetch(`/api/world/town/${entity.data.id}?world=${worldId}`);
          if (res.ok) setFetchedData(await res.json());
        } else if (entity.type === 'island') {
          const res = await fetch(`/api/world/island?world=${worldId}&x=${entity.data.x}&y=${entity.data.y}`);
          if (res.ok) setFetchedData(await res.json());
        } else if (entity.type === 'player') {
          const res = await fetch(`/api/world/player/${entity.data.id}?world=${worldId}`);
          if (res.ok) setFetchedData(await res.json());
        } else if (entity.type === 'alliance') {
          const res = await fetch(`/api/world/alliance/${entity.data.id}?world=${worldId}`);
          if (res.ok) setFetchedData(await res.json());
        }
      } catch (err) {
        console.error("CommandDrawer fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchEntityData();
  }, [entity, worldId]);

  if (!entity) return null;

  const copyToClipboard = (text, msg) => {
    navigator.clipboard.writeText(text);
    setCopiedMsg(msg);
    setTimeout(() => setCopiedMsg(''), 2500);
  };

  const getStageName = (pts) => {
    const p = Number(pts || 0);
    if (p < 600) return 'Stage 1 • Hamlet';
    if (p < 2400) return 'Stage 2 • Village';
    if (p < 5500) return 'Stage 3 • Town';
    if (p < 10000) return 'Stage 4 • City';
    return 'Stage 5 • Metropolis';
  };

  // Safe normalized town data
  const town = entity.type === 'town' ? normalizeTownData(entity.data) : null;
  const playerName = town ? (typeof town.player === 'string' ? town.player : (town.player?.name || 'Ghost Town')) : '';
  const allianceName = town ? (typeof town.alliance === 'string' ? town.alliance : (town.alliance?.name || 'None')) : '';

  return (
    <div 
      className="glass-panel fixed top-16 right-0 bottom-0 z-50 flex flex-col bg-slate-900/95 border-l border-slate-700/80 shadow-2xl backdrop-blur-xl animate-slide-left transition-all"
      style={{ width: '420px', maxWidth: '100vw' }}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-950/40">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-primary/20 text-primary shrink-0 border border-primary/30">
            {entity.type === 'town' && <Castle size={20} className="text-emerald-400" />}
            {entity.type === 'island' && <MapPin size={20} className="text-primary" />}
            {entity.type === 'player' && <Trophy size={20} className="text-amber-400" />}
            {entity.type === 'alliance' && <Users size={20} className="text-purple-400" />}
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-white text-base truncate">
              {entity.type === 'island' ? `Island (${entity.data.x}, ${entity.data.y})` : (entity.data.name || `ID #${entity.data.id}`)}
            </h2>
            <div className="text-xs text-slate-400 flex items-center gap-1.5 truncate">
              <span className="capitalize">{entity.type}</span>
              {entity.data.points !== undefined && (
                <span>• <strong className="text-emerald-400 font-mono">{Number(entity.data.points).toLocaleString()} pts</strong></span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onExpandToModal && (
            <button
              onClick={() => onExpandToModal(entity)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Expand to Full Intelligence Modal"
            >
              <Maximize2 size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close Drawer"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/20 px-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2.5 text-xs font-bold transition-colors border-b-2 ${
            activeTab === 'overview' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Overview & Intel
        </button>
      </div>

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700">
        {copiedMsg && (
          <div className="p-2 text-xs font-semibold text-center rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-fade-in">
            {copiedMsg}
          </div>
        )}

        {/* TOWN VIEW */}
        {entity.type === 'town' && town && (
          <div className="space-y-4">
            {/* Stage & Details Card */}
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Town Evolution</span>
                <span className="px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 font-bold">
                  {getStageName(town.points)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Island Coordinates</span>
                <span className="font-mono text-white">
                  ({town.islandX}, {town.islandY}) • Slot #{town.islandSlot}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Player</span>
                <span 
                  onClick={() => fetchedData?.town?.player && onSelectEntity?.({ type: 'player', data: fetchedData.town.player })}
                  className="text-white font-medium hover:underline cursor-pointer"
                >
                  {playerName}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Alliance</span>
                <span 
                  onClick={() => fetchedData?.town?.player?.alliance && onSelectEntity?.({ type: 'alliance', data: fetchedData.town.player.alliance })}
                  className="text-primary font-medium hover:underline cursor-pointer"
                >
                  {allianceName}
                </span>
              </div>
            </div>

            {/* Route Planning & Tactical Operations Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onSetRouteOrigin?.(town)}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-primary/20 text-primary hover:bg-primary/30 border border-primary/40 text-xs font-bold transition-all"
              >
                <Navigation size={14} /> Set as Origin
              </button>
              <button
                onClick={() => onSetRouteTarget?.(town)}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-bold transition-all"
              >
                <Compass size={14} /> Set as Target
              </button>
            </div>

            <button
              onClick={() => onOpenPinModal?.(town)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-xs font-bold transition-all"
            >
              <Pin size={14} /> Drop / Edit Tactical Pin
            </button>

            {/* Quick BB-Code Copy */}
            <button
              onClick={() => copyToClipboard(`[town]${town.id}[/town]`, 'Copied [town] BB-Code!')}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors border border-slate-700"
            >
              <Copy size={13} /> Copy Town BB-Code
            </button>
          </div>
        )}

        {/* ISLAND VIEW */}
        {entity.type === 'island' && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Colonization Status</span>
                <span className="font-bold text-white">
                  {entity.data.colonizedCount || 0} / {(entity.data.availableTowns || 0) + (entity.data.colonizedCount || 0)} Cities
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Resource Buffs</span>
                <span>
                  <strong className="text-emerald-400">+{entity.data.resourcePlus || 'none'}</strong> / <strong className="text-rose-400">-{entity.data.resourceMinus || 'none'}</strong>
                </span>
              </div>
            </div>

            {/* Island Towns List */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Cities on Island ({fetchedData?.towns?.length || 0})
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {fetchedData?.towns?.map((t) => {
                  const norm = normalizeTownData(t);
                  return (
                    <div
                      key={norm.id}
                      onClick={() => onSelectEntity?.({ type: 'town', data: norm })}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 cursor-pointer transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-white text-xs truncate">{norm.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {norm.player} {norm.alliance !== 'None' && `• ${norm.alliance}`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-mono font-bold text-emerald-400">{norm.points.toLocaleString()} pts</div>
                        <div className="text-[10px] text-slate-500">Slot #{norm.islandSlot}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => copyToClipboard(`[island]${entity.data.x}|${entity.data.y}[/island]`, 'Copied [island] BB-Code!')}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors border border-slate-700"
            >
              <Copy size={13} /> Copy Island BB-Code
            </button>
          </div>
        )}

        {/* PLAYER VIEW */}
        {entity.type === 'player' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <div className="text-[10px] text-slate-400 uppercase">World Rank</div>
                <div className="text-lg font-bold text-amber-400 font-mono">#{entity.data.rank || fetchedData?.player?.rank || '-'}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <div className="text-[10px] text-slate-400 uppercase">Total Cities</div>
                <div className="text-lg font-bold text-white font-mono">{fetchedData?.towns?.length || entity.data.towns || '-'}</div>
              </div>
            </div>

            {/* Battle Points */}
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1.5">
              <div className="text-xs font-bold text-slate-300 mb-1">Battle Points</div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-rose-400 flex items-center gap-1"><Swords size={12} /> Attack (ABP)</span>
                <span className="font-mono text-white font-bold">{Number(entity.data.abp || 0).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-blue-400 flex items-center gap-1"><Shield size={12} /> Defense (DBP)</span>
                <span className="font-mono text-white font-bold">{Number(entity.data.dbp || 0).toLocaleString()}</span>
              </div>
            </div>

            {/* Player Towns */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Top Cities ({fetchedData?.towns?.length || 0})
              </div>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {fetchedData?.towns?.slice(0, 15).map(t => {
                  const norm = normalizeTownData(t);
                  return (
                    <div
                      key={norm.id}
                      onClick={() => onSelectEntity?.({ type: 'town', data: norm })}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 cursor-pointer transition-colors"
                    >
                      <div className="font-bold text-white text-xs truncate">{norm.name}</div>
                      <div className="text-xs font-mono text-emerald-400 font-bold">{norm.points.toLocaleString()} pts</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ALLIANCE VIEW */}
        {entity.type === 'alliance' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-center">
                <div className="text-[10px] text-slate-400 uppercase">Rank</div>
                <div className="text-base font-bold text-purple-400 font-mono">#{entity.data.rank || '-'}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-center">
                <div className="text-[10px] text-slate-400 uppercase">Members</div>
                <div className="text-base font-bold text-white font-mono">{entity.data.members || '-'}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-center">
                <div className="text-[10px] text-slate-400 uppercase">Cities</div>
                <div className="text-base font-bold text-white font-mono">{entity.data.towns || '-'}</div>
              </div>
            </div>

            {/* Alliance Members */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Top Members ({fetchedData?.members?.length || 0})
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {fetchedData?.members?.slice(0, 15).map(m => (
                  <div
                    key={m.id}
                    onClick={() => onSelectEntity?.({ type: 'player', data: m })}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 cursor-pointer transition-colors"
                  >
                    <div className="font-bold text-white text-xs truncate">{m.name}</div>
                    <div className="text-xs font-mono text-purple-400 font-bold">{Number(m.points || 0).toLocaleString()} pts</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
