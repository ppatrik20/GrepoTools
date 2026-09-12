import React, { useEffect, useState } from 'react';
import { X, Users, Trophy, Shield, Swords, Activity, MapPin, ExternalLink, Calendar } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';

function formatNumber(num) {
  if (num === undefined || num === null) return "0";
  return num.toLocaleString();
}

export default function DeepDiveModal({ entity, onClose, worldId = 'hu119' }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [viewType, setViewType] = useState('area');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    async function fetchData() {
      if (!entity?.data?.id) return;
      setLoading(true);
      try {
        if (entity.type === 'town') {
          const res = await fetch(`/api/world/town/${entity.data.id}?world=${worldId}`);
          if (res.ok) setData(await res.json());
        } else if (entity.type === 'player') {
          const res = await fetch(`/api/world/player/${entity.data.id}?world=${worldId}`);
          if (res.ok) setData(await res.json());
        } else if (entity.type === 'alliance') {
          const res = await fetch(`/api/world/alliance/${entity.data.id}?world=${worldId}`);
          if (res.ok) setData(await res.json());
        }
      } catch (err) {
        console.error("DeepDiveModal error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [entity, worldId]);

  if (!entity || !entity.data) return null;

  const renderIcon = () => {
    if (entity.type === 'alliance') return <Users size={26} className="text-accent" />;
    if (entity.type === 'player') return <Trophy size={26} className="text-primary" />;
    return <MapPin size={26} className="text-emerald-400" />;
  };

  const getEntityTitle = () => {
    return entity.data.name || (entity.type === 'town' ? `Town #${entity.data.id}` : 'Intelligence Report');
  };

  const getPlayerName = () => {
    if (entity.type === 'player') return entity.data.name;
    if (typeof entity.data.player === 'object') return entity.data.player?.name || 'Ghost Town';
    if (typeof entity.data.player === 'string') return entity.data.player;
    if (data?.town?.player?.name) return data.town.player.name;
    return 'Ghost Town';
  };

  const getAllianceName = () => {
    if (entity.type === 'alliance') return entity.data.name;
    if (typeof entity.data.alliance === 'object') return entity.data.alliance?.name;
    if (typeof entity.data.alliance === 'string') return entity.data.alliance;
    if (typeof entity.data.player === 'object' && entity.data.player?.alliance?.name) return entity.data.player.alliance.name;
    if (data?.town?.player?.alliance?.name) return data.town.player.alliance.name;
    return null;
  };

  const totalPoints = entity.data.points || entity.data.pts || data?.town?.points || 0;
  const islandSlot = entity.data.islandSlot ?? entity.data.slot ?? data?.town?.islandSlot ?? '-';
  const coordsX = entity.data.islandX || entity.data.x || data?.town?.islandX;
  const coordsY = entity.data.islandY || entity.data.y || data?.town?.islandY;

  return (
    <div 
      className="grepo-modal-backdrop animate-fade-in"
      onClick={(e) => { if(e.target === e.currentTarget) onClose(); }}
    >
      <div 
        className="glass-panel w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl relative flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Close Button */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors z-10"
          title="Close (Esc)"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-4 mb-6 border-b border-slate-800 pb-4 pr-8">
          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 shrink-0">
            {renderIcon()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold text-white tracking-tight truncate">{getEntityTitle()}</h2>
              <span className="text-xs font-mono bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded shrink-0">
                World {worldId.toUpperCase()}
              </span>
            </div>
            {entity.type === 'player' && getAllianceName() && (
              <div className="text-sm font-semibold text-accent mt-0.5 truncate">
                {getAllianceName()}
              </div>
            )}
            {entity.type === 'town' && (
              <div className="text-sm font-medium text-slate-300 mt-0.5 truncate">
                {getPlayerName()} {getAllianceName() ? ` • [${getAllianceName()}]` : ''}
              </div>
            )}
            <div className="text-xs text-slate-400 capitalize mt-1">
              {entity.type} Intelligence
              {coordsX !== undefined && coordsY !== undefined && ` • Coordinates (${coordsX}, ${coordsY})`}
            </div>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-center">
            <Trophy size={18} className="text-amber-400 mx-auto mb-1" />
            <div className="text-2xl font-mono font-bold text-white">
              {formatNumber(totalPoints)}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">Total Points</div>
          </div>

          {(entity.type === 'player' || entity.type === 'alliance') ? (
            <>
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-center">
                <Swords size={18} className="text-rose-400 mx-auto mb-1" />
                <div className="text-2xl font-mono font-bold text-white">
                  {formatNumber(entity.data.abp)}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">Attack BP</div>
              </div>
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-center">
                <Shield size={18} className="text-blue-400 mx-auto mb-1" />
                <div className="text-2xl font-mono font-bold text-white">
                  {formatNumber(entity.data.dbp)}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">Defense BP</div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-center">
                <Activity size={18} className="text-emerald-400 mx-auto mb-1" />
                <div className="text-2xl font-mono font-bold text-emerald-400">
                  {data?.activity?.pointDelta ? `+${data.activity.pointDelta}` : '0'}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">7-Day Growth</div>
              </div>
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-center">
                <MapPin size={18} className="text-primary mx-auto mb-1" />
                <div className="text-2xl font-mono font-bold text-white">
                  #{islandSlot}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">Island Slot</div>
              </div>
            </>
          )}
        </div>

        {/* 7-Day History Chart */}
        <div className="mb-6 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Activity size={16} className="text-primary" /> 7-Day Progress & Delta History
            </h3>
            <div className="flex gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
              <button 
                type="button"
                onClick={() => setViewType('area')}
                className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                  viewType === 'area' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Total Curve
              </button>
              <button 
                type="button"
                onClick={() => setViewType('bar')}
                className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                  viewType === 'bar' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Daily Gains
              </button>
            </div>
          </div>

          {loading ? (
            <div className="h-56 flex items-center justify-center text-slate-500 text-sm animate-pulse">
              Loading chart history...
            </div>
          ) : data?.history?.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {viewType === 'area' ? (
                  <AreaChart data={data.history}>
                    <defs>
                      <linearGradient id="deepColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} domain={['auto', 'auto']} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff' }}
                      formatter={(val) => [formatNumber(val), 'Points']}
                    />
                    <Area type="monotone" dataKey="points" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#deepColor)" />
                  </AreaChart>
                ) : (
                  <BarChart data={data.history}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff' }}
                      formatter={(val) => [formatNumber(val), 'Delta']}
                    />
                    <Bar dataKey="delta" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center text-slate-500 text-xs">
              No historical data points logged yet for this entity.
            </div>
          )}
        </div>

        {/* Conquests History */}
        <div>
          <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
            <Swords size={16} className="text-rose-400" /> Conquest History & Log
          </h3>
          {loading ? (
            <div className="py-6 text-center text-slate-500 text-sm animate-pulse">Loading conquest log...</div>
          ) : data?.conquests?.length > 0 ? (
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
              {data.conquests.map((c) => {
                const isGain = c.newPlayerId === entity.data.id || c.newAllianceId === entity.data.id;
                return (
                  <div 
                    key={c.id} 
                    className="flex justify-between items-center p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        entity.type === 'town' 
                          ? 'bg-primary/20 text-primary' 
                          : isGain 
                          ? 'bg-emerald-500/20 text-emerald-400' 
                          : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {entity.type === 'town' ? 'TRANSFERRED' : isGain ? 'CONQUERED' : 'LOST'}
                      </span>
                      <span className="text-slate-300">
                        {entity.type === 'town' 
                          ? `${c.oldPlayerObj?.name || 'Ghost'} → ${c.newPlayerObj?.name || 'Ghost'}`
                          : `Town #${c.townId} (${formatNumber(c.townPoints)} pts)`}
                      </span>
                    </div>
                    <div className="text-slate-400 font-mono">
                      {new Date(c.timestamp).toLocaleDateString()} {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center text-slate-500 text-xs bg-slate-950/30 rounded-xl">
              No conquests recorded for this entity.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
