"use client";

import React, { useState, useEffect } from 'react';
import { 
  X, Maximize2, MapPin, Castle, Trophy, Users, Swords, Shield, 
  Activity, Copy, ExternalLink, Navigation, Compass, Calendar, ArrowRight
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

export default function CommandDrawer({
  entity, // { type: 'town' | 'island' | 'player' | 'alliance', data: any }
  onClose,
  onExpandToModal,
  worldId = 'hu119',
  onSelectEntity,
  onSetRouteOrigin,
  onSetRouteTarget,
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
    if (!pts || pts < 600) return 'Stage 1 • Hamlet';
    if (pts < 2400) return 'Stage 2 • Village';
    if (pts < 5500) return 'Stage 3 • Town';
    if (pts < 10000) return 'Stage 4 • City';
    return 'Stage 5 • Metropolis';
  };

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
              {entity.type === 'island' ? `Island (${entity.data.x}, ${entity.data.y})` : entity.data.name}
            </h2>
            <div className="text-xs text-slate-400 flex items-center gap-1.5 truncate">
              <span className="capitalize">{entity.type}</span>
              {entity.data.points && <span>• <strong className="text-emerald-400 font-mono">{entity.data.points.toLocaleString()} pts</strong></span>}
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
        {(entity.type === 'player' || entity.type === 'alliance') && (
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors border-b-2 ${
              activeTab === 'history' 
                ? 'border-primary text-primary' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            7-Day Momentum
          </button>
        )}
      </div>

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700">
        {copiedMsg && (
          <div className="p-2 text-xs font-semibold text-center rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-fade-in">
            {copiedMsg}
          </div>
        )}

        {/* TOWN VIEW */}
        {entity.type === 'town' && (
          <div className="space-y-4">
            {/* Stage & Details Card */}
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Town Evolution</span>
                <span className="px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 font-bold">
                  {getStageName(entity.data.points)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Island Coordinates</span>
                <span className="font-mono text-white">
                  ({entity.data.islandX || entity.data.x}, {entity.data.islandY || entity.data.y}) • Slot #{entity.data.islandSlot ?? '0'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Player</span>
                <span 
                  onClick={() => fetchedData?.town?.player && onSelectEntity?.({ type: 'player', data: fetchedData.town.player })}
                  className="text-white font-medium hover:underline cursor-pointer"
                >
                  {entity.data.player || fetchedData?.town?.player?.name || 'Ghost Town'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Alliance</span>
                <span 
                  onClick={() => fetchedData?.town?.player?.alliance && onSelectEntity?.({ type: 'alliance', data: fetchedData.town.player.alliance })}
                  className="text-primary font-medium hover:underline cursor-pointer"
                >
                  {entity.data.alliance || fetchedData?.town?.player?.alliance?.name || 'None'}
                </span>
              </div>
            </div>

            {/* Route Planning Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onSetRouteOrigin?.(entity.data)}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-primary/20 text-primary hover:bg-primary/30 border border-primary/40 text-xs font-bold transition-all"
              >
                <Navigation size={14} /> Set as Origin
              </button>
              <button
                onClick={() => onSetRouteTarget?.(entity.data)}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-bold transition-all"
              >
                <Compass size={14} /> Set as Target
              </button>
            </div>

            {/* Quick BB-Code Copy */}
            <button
              onClick={() => copyToClipboard(`[town]${entity.data.id}[/town]`, 'Copied [town] BB-Code!')}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors border border-slate-700"
            >
              <Copy size={13} /> Copy Town BB-Code
            </button>
          </div>
        )}

        {/* ISLAND VIEW */}
        {entity.type === 'island' && (
          <div className="space-y-4">
            {/* Island Info Card */}
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Colonization Status</span>
                <span className="font-bold text-white">
                  {entity.data.colonizedCount} / {entity.data.availableTowns + entity.data.colonizedCount} Cities
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Resource Buffs</span>
                <span>
                  <strong className="text-emerald-400">+{entity.data.resourcePlus}</strong> / <strong className="text-rose-400">-{entity.data.resourceMinus}</strong>
                </span>
              </div>
            </div>

            {/* Island Towns List */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Cities on Island ({fetchedData?.towns?.length || 0})
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {fetchedData?.towns?.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => onSelectEntity?.({ type: 'town', data: t })}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-white text-xs truncate">{t.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {t.player?.name || 'Ghost'} {t.player?.alliance?.name && `• ${t.player.alliance.name}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold text-emerald-400">{t.points.toLocaleString()} pts</div>
                      <div className="text-[10px] text-slate-500">Slot #{t.islandSlot ?? '0'}</div>
                    </div>
                  </div>
                ))}
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
                <span className="font-mono text-white font-bold">{entity.data.abp?.toLocaleString() || 0}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-blue-400 flex items-center gap-1"><Shield size={12} /> Defense (DBP)</span>
                <span className="font-mono text-white font-bold">{entity.data.dbp?.toLocaleString() || 0}</span>
              </div>
            </div>

            {/* Player Towns */}
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Top Cities ({fetchedData?.towns?.length || 0})
              </div>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {fetchedData?.towns?.slice(0, 15).map(t => (
                  <div
                    key={t.id}
                    onClick={() => onSelectEntity?.({ type: 'town', data: t })}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 cursor-pointer transition-colors"
                  >
                    <div className="font-bold text-white text-xs truncate">{t.name}</div>
                    <div className="text-xs font-mono text-emerald-400 font-bold">{t.points.toLocaleString()} pts</div>
                  </div>
                ))}
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
                    <div className="text-xs font-mono text-purple-400 font-bold">{m.points.toLocaleString()} pts</div>
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
