"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Trophy, Swords, Shield, Clock,
  Activity, ArrowRight, Search, Zap, Crosshair, Users, Target, X, Pin, Loader2,
  ArrowUpRight, ArrowDownRight, Minus, Skull, HelpCircle, MapPin, RefreshCw
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, AreaChart, Area } from 'recharts';
import DeepDiveModal from '@/components/DeepDiveModal';
import { Modal, Button, Badge } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { WorldOperationsAdapter } from '@/lib/world/WorldOperationsAdapter';

const numberFormatter = new Intl.NumberFormat('en-US');
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1
});

function formatNumber(num) {
  if (num === undefined || num === null) return '0';
  return numberFormatter.format(Number(num) || 0);
}

function formatCompactNumber(num) {
  if (num === undefined || num === null) return '0';
  const val = Number(num) || 0;
  if (Math.abs(val) >= 10000) {
    return compactFormatter.format(val);
  }
  return numberFormatter.format(val);
}

export default function ScoreboardDashboard() {
  const { activeWorldId } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const storageLoadedRef = useRef(false);
  
  const [conquestFilter, setConquestFilter] = useState('');
  
  const [allianceSearch, setAllianceSearch] = useState('');
  const [allianceIsSearching, setAllianceIsSearching] = useState(false);
  const [allianceSearchResults, setAllianceSearchResults] = useState([]);

  const [playerSearch, setPlayerSearch] = useState('');
  const [playerIsSearching, setPlayerIsSearching] = useState(false);
  const [playerSearchResults, setPlayerSearchResults] = useState([]);

  const [allianceMetric, setAllianceMetric] = useState('pts');
  const [playerMetric, setPlayerMetric] = useState('pts');
  
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [selectedHourlyEntity, setSelectedHourlyEntity] = useState(null);
  const [hourlyData, setHourlyData] = useState([]);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [hourlyViewType, setHourlyViewType] = useState('bar');
  const [showFaq, setShowFaq] = useState(false);

  // Pinned Entities
  const [pinnedPlayers, setPinnedPlayers] = useState([]);
  const [pinnedAlliances, setPinnedAlliances] = useState([]);

  const refreshPinnedBatch = useCallback(async (ids, type) => {
    if (!ids || ids.length === 0 || !activeWorldId) return;
    const setList = type === 'alliance' ? setPinnedAlliances : setPinnedPlayers;
    try {
      const d = await WorldOperationsAdapter.fetchMomentumData({
        worldId: activeWorldId,
        type,
        playerIds: type === 'player' ? ids : [],
        allianceIds: type === 'alliance' ? ids : [],
        ids
      });
      const results = d.results || [];
      const resultMap = new Map(results.map(r => [Number(r.id), r]));

      setList(prev => prev.map(p => {
        const idNum = Number(p.id);
        if (resultMap.has(idNum)) {
          const fresh = resultMap.get(idNum);
          return { ...p, ...fresh, _isFetchingTrend: false };
        }
        return { ...p, _isFetchingTrend: false };
      }));
    } catch (err) {
      console.error(`Error refreshing pinned ${type}s:`, err);
      setList(prev => prev.map(p => ids.map(Number).includes(Number(p.id)) ? { ...p, _isFetchingTrend: false } : p));
    }
  }, [activeWorldId]);

  const handleManualRefresh = async () => {
    if (refreshing || !activeWorldId) return;
    setRefreshing(true);
    try {
      const [scoreRes] = await Promise.all([
        WorldOperationsAdapter.fetchScoreboardData(activeWorldId),
        refreshPinnedBatch(pinnedPlayers.map(p => p.id), 'player'),
        refreshPinnedBatch(pinnedAlliances.map(a => a.id), 'alliance'),
      ]);
      if (scoreRes && !scoreRes.error && scoreRes.alliances && scoreRes.players) {
        setData(scoreRes);
      }
    } catch (e) {
      console.error("Manual refresh error:", e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!activeWorldId) return;
    setLoading(true);
    storageLoadedRef.current = false;

    const { pinnedPlayers: initialPlayers, pinnedAlliances: initialAlliances } =
      WorldOperationsAdapter.loadPinnedEntities(activeWorldId);

    setPinnedPlayers(initialPlayers.map(item => ({ ...item, _isFetchingTrend: true })));
    setPinnedAlliances(initialAlliances.map(item => ({ ...item, _isFetchingTrend: true })));
    storageLoadedRef.current = true;

    // Immediately trigger fresh batch fetch for all pinned entities
    if (initialPlayers.length > 0) {
      refreshPinnedBatch(initialPlayers.map(x => x.id), 'player');
    }
    if (initialAlliances.length > 0) {
      refreshPinnedBatch(initialAlliances.map(x => x.id), 'alliance');
    }

    WorldOperationsAdapter.fetchScoreboardData(activeWorldId)
      .then(d => {
        if (d && !d.error && d.alliances && d.players) {
          setData(d);
        } else {
          setData(null);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Scoreboard fetch error:", err);
        setData(null);
        setLoading(false);
      });
  }, [activeWorldId, refreshPinnedBatch]);

  useEffect(() => {
    if (!activeWorldId || !storageLoadedRef.current) return;
    WorldOperationsAdapter.savePinnedEntities(activeWorldId, {
      pinnedPlayers,
      pinnedAlliances
    });
  }, [pinnedPlayers, pinnedAlliances, activeWorldId]);

  // Global Sidebar Search API (Alliances)
  useEffect(() => {
    if (allianceSearch.length >= 2 && activeWorldId) {
      setAllianceIsSearching(true);
      const timer = setTimeout(() => {
        WorldOperationsAdapter.searchWorldEntities({
          worldId: activeWorldId,
          query: allianceSearch,
          type: 'alliance'
        })
          .then(d => {
            setAllianceSearchResults(d.alliances || []);
            setAllianceIsSearching(false);
          })
          .catch(() => setAllianceIsSearching(false));
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setAllianceSearchResults([]);
      setAllianceIsSearching(false);
    }
  }, [allianceSearch, activeWorldId]);

  // Global Sidebar Search API (Players)
  useEffect(() => {
    if (playerSearch.length >= 2 && activeWorldId) {
      setPlayerIsSearching(true);
      const timer = setTimeout(() => {
        WorldOperationsAdapter.searchWorldEntities({
          worldId: activeWorldId,
          query: playerSearch,
          type: 'player'
        })
          .then(d => {
            setPlayerSearchResults(d.players || []);
            setPlayerIsSearching(false);
          })
          .catch(() => setPlayerIsSearching(false));
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setPlayerSearchResults([]);
      setPlayerIsSearching(false);
    }
  }, [playerSearch, activeWorldId]);

  const timeSince = (dateStr) => {
    const diff = Math.floor((new Date() - new Date(dateStr)) / 1000 / 60);
    if (diff < 60) return `${diff}m ago`;
    return `${Math.floor(diff / 60)}h ago`;
  };

  const getMetricColorHex = (metric) => {
    switch (metric) {
      case 'pts': return '#eab308';
      case 'abp': return '#ef4444';
      case 'dbp': return '#3b82f6';
      case 'allbp': return '#a855f7';
      case 'conquests': return '#22c55e';
      case 'losses': return '#f43f5e';
      default: return '#94a3b8';
    }
  };

  const getMetricIcon = (metric, size = 24, active = false) => {
    const color = active ? getMetricColorHex(metric) : '#64748b';
    switch (metric) {
      case 'pts': return <Trophy size={size} color={color} />;
      case 'abp': return <Swords size={size} color={color} />;
      case 'dbp': return <Shield size={size} color={color} />;
      case 'allbp': return <Zap size={size} color={color} />;
      case 'conquests': return <Target size={size} color={color} />;
      case 'losses': return <Skull size={size} color={color} />;
      default: return null;
    }
  };

  const getMetricLabel = (metric) => {
    switch (metric) {
      case 'pts': return 'Points';
      case 'abp': return 'Attack BP';
      case 'dbp': return 'Defense BP';
      case 'allbp': return 'Combat BP';
      case 'conquests': return 'Daily Conquests';
      case 'losses': return 'Daily Losses';
      default: return '';
    }
  };

  const filteredConquests = useMemo(() => {
    if (!data || !data.conquests) return [];
    if (!conquestFilter.trim()) return data.conquests;
    const term = conquestFilter.toLowerCase();
    return data.conquests.filter(c => 
      (c.townName || '').toLowerCase().includes(term) ||
      (c.oldPlayer || '').toLowerCase().includes(term) ||
      (c.newPlayer || '').toLowerCase().includes(term) ||
      (c.oldAlliance || '').toLowerCase().includes(term) ||
      (c.newAlliance || '').toLowerCase().includes(term)
    );
  }, [data, conquestFilter]);

  const togglePin = (item, isAlliance) => {
    const type = isAlliance ? 'alliance' : 'player';
    const list = isAlliance ? pinnedAlliances : pinnedPlayers;
    const setList = isAlliance ? setPinnedAlliances : setPinnedPlayers;
    const exists = list.some(p => p.id === item.id);

    if (exists) {
      setList(prev => prev.filter(p => p.id !== item.id));
    } else {
      setList(prev => [...prev, { ...item, _isFetchingTrend: true }]);
      refreshPinnedBatch([item.id], type);
    }
  };

  const getTrendPill = (item, metric) => {
    if (item._isFetchingTrend) {
      return (
        <span style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', color: '#a855f7' }}>
          <Loader2 size={12} className="animate-spin" />
        </span>
      );
    }

    let trendValue, gainsA, gainsB;
    if (metric === 'pts') { trendValue = item.trendPts; gainsA = item.gainsAPts; gainsB = item.gainsBPts; }
    if (metric === 'abp') { trendValue = item.trendAbp; gainsA = item.gainsAAbp; gainsB = item.gainsBAbp; }
    if (metric === 'dbp') { trendValue = item.trendDbp; gainsA = item.gainsADbp; gainsB = item.gainsBDbp; }

    if (trendValue === undefined || trendValue === null) return null;
    
    const tooltip = `Daily Gain vs Yesterday: +${formatNumber(gainsA)} (vs +${formatNumber(gainsB)} yesterday)`;

    if (trendValue > 0) {
      return (
        <span title={tooltip} className="tabular-nums" style={{ display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 'bold', color: '#4ade80', background: 'rgba(74, 222, 128, 0.1)', padding: '2px 6px', borderRadius: '4px', cursor: 'help' }}>
          <ArrowUpRight size={12} /> {trendValue}%
        </span>
      );
    } else if (trendValue < 0) {
      return (
        <span title={tooltip} className="tabular-nums" style={{ display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 'bold', color: '#f87171', background: 'rgba(248, 113, 113, 0.1)', padding: '2px 6px', borderRadius: '4px', cursor: 'help' }}>
          <ArrowDownRight size={12} /> {Math.abs(trendValue)}%
        </span>
      );
    } else {
      return (
        <span title={tooltip} className="tabular-nums" style={{ display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', background: 'rgba(148, 163, 184, 0.1)', padding: '2px 6px', borderRadius: '4px', cursor: 'help' }}>
          <Minus size={12} /> 0%
        </span>
      );
    }
  };

  const renderSidebarItem = (item, metric, isAlliance, index, isPinned = false) => {
    let mainValue = item[metric];

    if (metric === 'pts') { mainValue = item.points; }
    if (metric === 'allbp') { mainValue = item.allBp; }
    if (metric === 'conquests') { mainValue = item.conquests ?? item.count ?? 0; }
    if (metric === 'losses') { mainValue = item.losses ?? item.count ?? 0; }

    return (
      <div 
        key={`item-${item.id}-${isPinned ? 'pin' : 'reg'}`}
        style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px',
          marginBottom: '8px',
          borderRadius: '12px',
          background: isPinned ? 'rgba(59, 130, 246, 0.1)' : 'rgba(30, 41, 59, 0.4)', 
          border: isPinned ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onClick={() => setSelectedEntity({ type: isAlliance ? 'alliance' : 'player', data: item })}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.background = isPinned ? 'rgba(59, 130, 246, 0.2)' : 'rgba(30, 41, 59, 0.8)';
          e.currentTarget.style.borderColor = isPinned ? 'rgba(59, 130, 246, 0.5)' : 'rgba(255, 255, 255, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.background = isPinned ? 'rgba(59, 130, 246, 0.1)' : 'rgba(30, 41, 59, 0.4)';
          e.currentTarget.style.borderColor = isPinned ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.05)';
        }}
      >
        <div className="tabular-nums" style={{ width: '24px', textAlign: 'center', fontWeight: 'bold', color: isPinned ? '#3b82f6' : '#64748b', fontSize: '14px' }}>
          {isPinned ? <Pin size={14} color="#3b82f6" /> : index}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 'bold', color: '#f1f5f9', fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.name}
          </div>
          {!isAlliance && (
            <div style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
              {item.alliance?.name || 'No Alliance'}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
          <div className="tabular-nums" style={{ fontWeight: 'bold', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px', color: getMetricColorHex(metric) }}>
            {getTrendPill(item, metric)}
            {formatNumber(mainValue)}
            {getMetricIcon(metric, 14, true)}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            {metric !== 'abp' && metric !== 'allbp' && metric !== 'conquests' && metric !== 'losses' && (
              <div className="tabular-nums" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#94a3b8' }} title="Attack BP">
                <Swords size={10} color="#ef4444" /> {formatNumber(item.abp)}
              </div>
            )}
            {metric !== 'dbp' && metric !== 'allbp' && metric !== 'conquests' && metric !== 'losses' && (
              <div className="tabular-nums" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#94a3b8' }} title="Defense BP">
                <Shield size={10} color="#3b82f6" /> {formatNumber(item.dbp)}
              </div>
            )}
          </div>
        </div>

        <div 
          onClick={(e) => { e.stopPropagation(); togglePin(item, isAlliance); }}
          style={{ padding: '4px', opacity: 0.5, cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.opacity = 1}
          onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
          title={isPinned ? "Unpin" : "Pin"}
        >
          {isPinned ? <X size={14} color="#ef4444" /> : <Pin size={14} color="#94a3b8" />}
        </div>
      </div>
    );
  };

  const renderSidebarList = (entities, metric, search, searchResults, isSearching, isAlliance = false) => {
    if (!entities) {
      return (
        <div style={{ color: '#64748b', textAlign: 'center', padding: '1rem 0', fontSize: '0.875rem' }}>
          No data available.
        </div>
      );
    }
    let list = entities[metric] || [];
    list = list.map((item, i) => ({ ...item, _originalRank: i + 1 }));
    const pinned = isAlliance ? pinnedAlliances : pinnedPlayers;

    // Remove pinned from main list to avoid duplicates
    const pinnedIds = new Set(pinned.map(p => p.id));
    list = list.filter(item => !pinnedIds.has(item.id));

    if (search.trim().length >= 2) {
      list = searchResults.map(item => ({ ...item, _originalRank: '-' })).filter(item => !pinnedIds.has(item.id));
    } else if (search.trim()) {
       const lower = search.toLowerCase();
       list = list.filter(e => e.name.toLowerCase().includes(lower));
    }

    return (
      <>
        {pinned.map(item => renderSidebarItem(item, metric, isAlliance, '-', true))}
        {pinned.length > 0 && <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '12px 0' }} />}
        
        {isSearching ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0', color: '#a855f7' }}>
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '1rem 0', fontSize: '0.875rem' }}>No results found.</div>
        ) : (
          list.map((item) => renderSidebarItem(item, metric, isAlliance, item._originalRank, false))
        )}
      </>
    );
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const row = payload[0].payload || {};
      return (
        <div className="tabular-nums" style={{ backgroundColor: 'rgba(15, 23, 42, 0.96)', border: '1px solid rgba(255,255,255,0.12)', padding: '10px 12px', borderRadius: '8px', color: 'white', backdropFilter: 'blur(10px)', zIndex: 9999 }}>
          <p style={{ fontWeight: 'bold', margin: '0 0 4px 0' }}>{label}</p>
          <p style={{ fontSize: '13px', margin: 0, color: payload[0].fill, fontWeight: 600 }}>
            Daily Momentum: {payload[0].value > 0 ? `+${formatNumber(payload[0].value)}` : formatNumber(payload[0].value)}
          </p>
          {row.recentGain > 0 && (
            <p style={{ fontSize: '12px', margin: '4px 0 0 0', color: '#4ade80' }}>
              Last 65m Window: +{formatNumber(row.recentGain)} ↑
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const renderRankingNav = (currentMetric, setMetric) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', marginBottom: '16px' }}>
      {['pts', 'abp', 'dbp', 'allbp', 'conquests', 'losses'].map(m => {
        const isActive = currentMetric === m;
        return (
          <button 
            key={m} 
            onClick={() => setMetric(m)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              padding: '6px', 
              borderRadius: '8px', 
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              transition: 'all 0.3s ease',
              transform: isActive ? 'scale(1.15)' : 'scale(1)',
              filter: isActive ? `drop-shadow(0 0 8px ${getMetricColorHex(m)}80)` : 'none'
            }}
            title={getMetricLabel(m)}
          >
            {getMetricIcon(m, 20, isActive)}
            {isActive && (
              <div style={{ position: 'absolute', bottom: '-4px', left: '20%', right: '20%', height: '2px', borderRadius: '2px', background: getMetricColorHex(m) }} />
            )}
          </button>
        );
      })}
    </div>
  );

  // --- CHART RENDERING (6 PANELS, FILTERED/HIGHLIGHTED BY GLOBAL SEARCH) ---
  const prepareChartData = (entityGroup, metricKey, dataKeyMapping) => {
    if (!data || !data[entityGroup]) return [];
    const items = data[entityGroup][metricKey] || [];
    const globalQuery = (entityGroup === 'alliances' ? allianceSearch : playerSearch).trim().toLowerCase();

    if (globalQuery) {
      const matched = items.filter(item =>
        (item.name || '').toLowerCase().includes(globalQuery) ||
        (item.alliance?.name || '').toLowerCase().includes(globalQuery)
      );
      if (matched.length > 0) {
        return matched.slice(0, 15).map(item => ({
          ...item,
          momentum: item.momentum ?? item[dataKeyMapping] ?? 0,
          _isHighlighted: true
        }));
      }
      const fallbackSearchResults = entityGroup === 'alliances' ? allianceSearchResults : playerSearchResults;
      if (fallbackSearchResults.length > 0) {
        return fallbackSearchResults.slice(0, 15).map(r => ({
          ...r,
          name: r.name,
          momentum: r.momentum ?? r[dataKeyMapping] ?? 0,
          recentGain: r.recentGain ?? 0,
          _isHighlighted: true
        }));
      }
      return [];
    }

    return items.slice(0, 15);
  };

  const openHourlyModal = (dataPoint, entityGroup, metricKey, colorHex) => {
    const type = entityGroup === 'alliances' ? 'alliance' : 'player';
    setSelectedHourlyEntity({ ...dataPoint, type, metricKey, colorHex });
    setHourlyLoading(true);
    WorldOperationsAdapter.fetchHourlyHistory({
      worldId: activeWorldId,
      type,
      id: dataPoint.id
    })
      .then(d => {
        setHourlyData(d.history || []);
        setHourlyLoading(false);
      })
      .catch(() => setHourlyLoading(false));
  };

  const renderChartPanel = (title, icon, entityGroup, metricKey, dataKeyMapping, colorHex) => {
    const isSearching = entityGroup === 'alliances' ? allianceIsSearching : playerIsSearching;
    const chartData = prepareChartData(entityGroup, metricKey, dataKeyMapping);
    const hasData = chartData && chartData.length > 0;
    const topGain = hasData ? Number(chartData[0]?.momentum || 0) : 0;
    
    const internalHeight = Math.max(100, chartData.length * 36);

    const ClickableYAxisTick = ({ x, y, payload }) => {
      const rawName = String(payload?.value || '');
      const displayLabel = rawName.length > 15 ? `${rawName.slice(0, 14)}…` : rawName;
      return (
        <text
          x={x}
          y={y}
          dy={4}
          textAnchor="end"
          fill="#94a3b8"
          fontSize={11}
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            const entity = chartData.find(d => d.name === payload.value);
            if (entity) setSelectedEntity({ type: entityGroup === 'alliances' ? 'alliance' : 'player', data: entity });
          }}
          onMouseEnter={(e) => { e.target.style.fill = '#f1f5f9'; }}
          onMouseLeave={(e) => { e.target.style.fill = '#94a3b8'; }}
        >
          <title>{rawName}</title>
          {displayLabel}
        </text>
      );
    };

    return (
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '260px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'white', fontWeight: 'bold', marginBottom: '12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            {icon} {title}
          </div>
          {topGain > 0 && (
            <span
              className="tabular-nums"
              title="Top Daily Momentum Leader"
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                padding: '2px 8px',
                borderRadius: '9999px',
                background: `${colorHex}20`,
                color: colorHex,
                border: `1px solid ${colorHex}40`
              }}
            >
              Lead +{formatCompactNumber(topGain)}
            </span>
          )}
        </div>
        
        <div style={{ flex: 1, position: 'relative', overflowY: 'auto', scrollbarWidth: 'thin' }}>
          {isSearching ? (
             <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colorHex }}>
                <Loader2 size={24} className="animate-spin" />
             </div>
          ) : !hasData ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '13px' }}>
              No momentum data.
            </div>
          ) : (
            <div style={{ height: `${internalHeight}px`, minHeight: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 72, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={<ClickableYAxisTick />} width={125} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                  <Bar 
                    dataKey="momentum" 
                    radius={[0, 4, 4, 0]} 
                    maxBarSize={16}
                    onClick={(dataPoint) => openHourlyModal(dataPoint, entityGroup, metricKey, colorHex)}
                    style={{ cursor: 'pointer' }}
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={colorHex}
                        fillOpacity={entry._isHighlighted ? 1 : Math.max(0.35, 0.9 - (index * 0.04))}
                      />
                    ))}
                    <LabelList 
                      dataKey="recentGain" 
                      position="right" 
                      fill="#4ade80" 
                      fontSize={11} 
                      fontWeight="bold" 
                      formatter={(val) => {
                        const num = Number(val || 0);
                        return num > 0 ? `+${formatCompactNumber(num)} ↑` : '';
                      }} 
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    );
  };

  const chartAlliancesPts = useMemo(
    () => renderChartPanel("Alliance Points", <Activity size={16} color="#eab308" />, "alliances", "momentumPts", "momentumPts", "#eab308"),
    [data?.alliances?.momentumPts, allianceSearch, allianceIsSearching, allianceSearchResults]
  );
  const chartAlliancesAbp = useMemo(
    () => renderChartPanel("Alliance Attackers", <Crosshair size={16} color="#ef4444" />, "alliances", "momentumAbp", "momentumAbp", "#ef4444"),
    [data?.alliances?.momentumAbp, allianceSearch, allianceIsSearching, allianceSearchResults]
  );
  const chartAlliancesDbp = useMemo(
    () => renderChartPanel("Alliance Defenders", <Shield size={16} color="#3b82f6" />, "alliances", "momentumDbp", "momentumDbp", "#3b82f6"),
    [data?.alliances?.momentumDbp, allianceSearch, allianceIsSearching, allianceSearchResults]
  );
  
  const chartPlayersPts = useMemo(
    () => renderChartPanel("Player Points", <Activity size={16} color="#eab308" />, "players", "momentumPts", "momentumPts", "#eab308"),
    [data?.players?.momentumPts, playerSearch, playerIsSearching, playerSearchResults]
  );
  const chartPlayersAbp = useMemo(
    () => renderChartPanel("Player Attackers", <Crosshair size={16} color="#ef4444" />, "players", "momentumAbp", "momentumAbp", "#ef4444"),
    [data?.players?.momentumAbp, playerSearch, playerIsSearching, playerSearchResults]
  );
  const chartPlayersDbp = useMemo(
    () => renderChartPanel("Player Defenders", <Shield size={16} color="#3b82f6" />, "players", "momentumDbp", "momentumDbp", "#3b82f6"),
    [data?.players?.momentumDbp, playerSearch, playerIsSearching, playerSearchResults]
  );

  if (loading) {
    return (
      <div className="h-[calc(100vh-64px)] w-full bg-[#0b101e] text-slate-200 overflow-hidden flex flex-col items-center justify-center">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Trophy size={48} color="#eab308" style={{ marginBottom: '1rem' }} />
          <h2 style={{ fontSize: '1.25rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'white' }}>Loading Intelligence...</h2>
        </div>
      </div>
    );
  }

  if (!data || !data.alliances || !data.players) {
    return (
      <div className="h-[calc(100vh-64px)] w-full bg-[#0b101e] text-slate-200 overflow-hidden flex flex-col items-center justify-center">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', maxWidth: '420px', textAlign: 'center', padding: '24px' }}>
          <Trophy size={48} color="#64748b" />
          <h2 style={{ fontSize: '1.25rem', color: '#f1f5f9', margin: 0, fontWeight: 'bold' }}>Scoreboard intelligence unavailable</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>
            Unable to load tactical ranking and momentum data for {activeWorldId?.toUpperCase() || 'this world'}.
          </p>
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#3b82f6', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] w-full bg-[#0b101e] text-slate-200 overflow-hidden flex flex-col">
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* LEFT SIDEBAR: Alliances */}
        <div style={{ width: '400px', display: 'flex', flexDirection: 'column', padding: '24px', borderRight: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.01)', zIndex: 2 }}>
          <div style={{ marginBottom: '16px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 16px 0' }}>
              <Users size={24} color="#a855f7" /> Top Alliances
            </h1>
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}><Search size={16} color="#94a3b8" /></div>
              <input 
                type="text" 
                placeholder="Search alliances globally..." 
                className="input-field"
                style={{ width: '100%', paddingLeft: '36px', paddingRight: allianceSearch ? '32px' : '16px', paddingTop: '10px', paddingBottom: '10px', boxSizing: 'border-box' }}
                value={allianceSearch}
                onChange={e => setAllianceSearch(e.target.value)}
              />
              {allianceSearch && (
                <button
                  type="button"
                  onClick={() => setAllianceSearch('')}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}
                  aria-label="Clear alliance search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {renderRankingNav(allianceMetric, setAllianceMetric)}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px', scrollbarWidth: 'thin' }}>
            {renderSidebarList(data.alliances, allianceMetric, allianceSearch, allianceSearchResults, allianceIsSearching, true)}
          </div>
        </div>

        {/* MAIN CENTER PANE */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '24px', gap: '24px', scrollbarWidth: 'thin' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#94a3b8', margin: 0 }}>Daily Momentum (Since 2:00 AM)</h2>
            <HelpCircle size={16} color="#64748b" style={{ cursor: 'pointer' }} onClick={() => setShowFaq(true)} title="Momentum FAQ" />
            <button
              onClick={handleManualRefresh}
              title="Refresh Scoreboard & Pinned Data"
              disabled={refreshing}
              style={{ background: 'none', border: 'none', cursor: refreshing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} style={{ color: refreshing ? '#3b82f6' : '#64748b' }} />
            </button>
          </div>

          {/* 6 Momentum Charts: Alliances Top, Players Bottom */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
            {/* ALLIANCES ROW */}
            {chartAlliancesPts}
            {chartAlliancesAbp}
            {chartAlliancesDbp}
            
            {/* PLAYERS ROW */}
            {chartPlayersPts}
            {chartPlayersAbp}
            {chartPlayersDbp}
          </div>

          {/* Live Conquest Feed (Bottom Area) */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '600px', padding: 0, overflow: 'hidden' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Zap size={18} color="#f97316"/>
                <h2 style={{ fontSize: '1rem', fontWeight: 'bold', color: 'white', margin: 0 }}>Live Conquest Feed</h2>
                <span className="tabular-nums" style={{ padding: '4px 8px', borderRadius: '9999px', background: 'rgba(249, 115, 22, 0.2)', color: '#f97316', fontSize: '11px', fontWeight: 'bold' }}>
                  {formatNumber(filteredConquests.length)} events
                </span>
              </div>
              
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}><Search size={14} color="#94a3b8" /></div>
                <input 
                  type="text" 
                  placeholder="Filter feed..." 
                  className="input-field"
                  style={{ width: '256px', paddingLeft: '36px', paddingRight: '16px', paddingTop: '6px', paddingBottom: '6px', boxSizing: 'border-box' }}
                  value={conquestFilter}
                  onChange={e => setConquestFilter(e.target.value)}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#0f172a', zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <tr>
                    <th style={{ padding: '8px 24px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', fontSize: '11px' }}>Time</th>
                    <th style={{ padding: '8px 24px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', fontSize: '11px' }}>Town</th>
                    <th style={{ padding: '8px 24px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', fontSize: '11px' }}>Points</th>
                    <th style={{ padding: '8px 24px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', fontSize: '11px', textAlign: 'right' }}>Lost By</th>
                    <th style={{ padding: '8px 24px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', fontSize: '11px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '8px 24px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', fontSize: '11px' }}>Conquered By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConquests.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td className="tabular-nums" style={{ padding: '12px 24px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Clock size={12} color="#64748b"/> {timeSince(c.timestamp)}
                        </div>
                      </td>
                      <td style={{ padding: '12px 24px', fontWeight: '600', color: 'white', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {c.townName}
                          {c.townX && c.townY && (
                            <a href={`/map?x=${c.townX}&y=${c.townY}`} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="View on Map">
                              <MapPin size={12} />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="tabular-nums" style={{ padding: '12px 24px', color: '#cbd5e1', fontFamily: 'monospace', fontSize: '12px' }}>{formatNumber(c.townPoints)}</td>
                      <td style={{ padding: '12px 24px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <div 
                            onClick={() => c.oldPlayerId && c.oldPlayerObj && setSelectedEntity({ type: 'player', data: c.oldPlayerObj })}
                            style={{ color: '#f87171', fontWeight: '600', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: c.oldPlayerId ? 'pointer' : 'default' }}>{c.oldPlayer}</div>
                          <div 
                            onClick={() => c.oldAllianceId && c.oldAllianceObj && setSelectedEntity({ type: 'alliance', data: c.oldAllianceObj })}
                            style={{ fontSize: '10px', color: '#64748b', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: c.oldAllianceId ? 'pointer' : 'default' }}>{c.oldAlliance}</div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 24px', textAlign: 'center' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                          <ArrowRight size={12} color={!c.oldPlayerId || !c.newPlayerId ? '#a855f7' : (c.oldAllianceId === c.newAllianceId && c.oldAllianceId) ? '#3b82f6' : '#22c55e'} />
                        </div>
                      </td>
                      <td style={{ padding: '12px 24px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                          <div 
                            onClick={() => c.newPlayerId && c.newPlayerObj && setSelectedEntity({ type: 'player', data: c.newPlayerObj })}
                            style={{ color: '#4ade80', fontWeight: '600', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: c.newPlayerId ? 'pointer' : 'default' }}>{c.newPlayer}</div>
                          <div 
                            onClick={() => c.newAllianceId && c.newAllianceObj && setSelectedEntity({ type: 'alliance', data: c.newAllianceObj })}
                            style={{ fontSize: '10px', color: '#64748b', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: c.newAllianceId ? 'pointer' : 'default' }}>{c.newAlliance}</div>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredConquests.length === 0 && (
                    <tr><td colSpan="6" style={{ padding: '48px 24px', textAlign: 'center', color: '#64748b' }}>No conquests found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT SIDEBAR: Players */}
        <div style={{ width: '400px', display: 'flex', flexDirection: 'column', padding: '24px', borderLeft: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.01)', zIndex: 2 }}>
          <div style={{ marginBottom: '16px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 16px 0' }}>
              <Trophy size={24} color="#3b82f6" /> Top Players
            </h1>
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}><Search size={16} color="#94a3b8" /></div>
              <input 
                type="text" 
                placeholder="Search players globally..." 
                className="input-field"
                style={{ width: '100%', paddingLeft: '36px', paddingRight: playerSearch ? '32px' : '16px', paddingTop: '10px', paddingBottom: '10px', boxSizing: 'border-box' }}
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
              />
              {playerSearch && (
                <button
                  type="button"
                  onClick={() => setPlayerSearch('')}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}
                  aria-label="Clear player search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {renderRankingNav(playerMetric, setPlayerMetric)}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', paddingLeft: '8px', scrollbarWidth: 'thin' }}>
            {renderSidebarList(data.players, playerMetric, playerSearch, playerSearchResults, playerIsSearching, false)}
          </div>
        </div>
      </div>

      {/* DEEP DIVE MODAL */}
      {selectedEntity && (
        <DeepDiveModal 
          entity={selectedEntity} 
          onClose={() => setSelectedEntity(null)} 
          worldId={activeWorldId}
        />
      )}

      {/* HOURLY VELOCITY MODAL (Accessible Unified Modal) */}
      <Modal
        isOpen={Boolean(selectedHourlyEntity)}
        onClose={() => setSelectedHourlyEntity(null)}
        title={selectedHourlyEntity ? `Hourly Velocity: ${selectedHourlyEntity.name}` : 'Hourly Velocity'}
        subtitle="Daily gains breakdown since 2:00 AM Server Time"
        icon={Clock}
        maxWidth="3xl"
      >
        {selectedHourlyEntity && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Button
                size="xs"
                variant={hourlyViewType === 'bar' ? 'primary' : 'secondary'}
                onClick={() => setHourlyViewType('bar')}
              >
                Bar Chart (Hourly Deltas)
              </Button>
              <Button
                size="xs"
                variant={hourlyViewType === 'area' ? 'primary' : 'secondary'}
                onClick={() => setHourlyViewType('area')}
              >
                Area Chart (Cumulative Growth)
              </Button>
            </div>

            <div className="h-[300px] w-full relative">
              {hourlyLoading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 size={32} color={selectedHourlyEntity.colorHex} className="animate-spin" />
                </div>
              ) : hourlyData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                  No hourly data recorded yet today.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {hourlyViewType === 'bar' ? (
                    <BarChart data={hourlyData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }}
                        itemStyle={{ color: selectedHourlyEntity.colorHex, fontWeight: 'bold' }}
                        formatter={(val) => [val > 0 ? `+${formatNumber(val)}` : formatNumber(val), 'Gain']}
                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      />
                      <Bar 
                        dataKey={selectedHourlyEntity.metricKey.toLowerCase().includes('abp') ? 'abpDelta' : selectedHourlyEntity.metricKey.toLowerCase().includes('dbp') ? 'dbpDelta' : 'ptsDelta'} 
                        fill={selectedHourlyEntity.colorHex} 
                        radius={[4, 4, 0, 0]} 
                        isAnimationActive={false}
                      />
                    </BarChart>
                  ) : (
                    <AreaChart data={hourlyData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={selectedHourlyEntity.colorHex} stopOpacity={0.5}/>
                          <stop offset="95%" stopColor={selectedHourlyEntity.colorHex} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }}
                        itemStyle={{ color: selectedHourlyEntity.colorHex, fontWeight: 'bold' }}
                        formatter={(val) => [`${formatNumber(val)}`, 'Total']}
                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey={selectedHourlyEntity.metricKey.toLowerCase().includes('abp') ? 'cumulativeAbp' : selectedHourlyEntity.metricKey.toLowerCase().includes('dbp') ? 'cumulativeDbp' : 'cumulativePts'} 
                        stroke={selectedHourlyEntity.colorHex} 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorGradient)" 
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* MOMENTUM FAQ MODAL (Accessible Unified Modal) */}
      <Modal
        isOpen={showFaq}
        onClose={() => setShowFaq(false)}
        title="Momentum FAQ"
        subtitle="How daily momentum and reset windows are calculated"
        icon={HelpCircle}
        maxWidth="md"
        footer={
          <Button variant="primary" size="sm" onClick={() => setShowFaq(false)}>
            Got it
          </Button>
        }
      >
        <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
          <p>
            <strong className="text-white block mb-0.5">How does Daily Momentum work?</strong>
            The momentum charts display the total points or battle points gained by a player or alliance since the daily reset.
          </p>
          <p>
            <strong className="text-white block mb-0.5">When is the daily reset?</strong>
            The baseline is reset every day at exactly <strong className="text-emerald-400">2:00 AM Server Time</strong>. All gains shown are relative to the stats recorded at this specific time.
          </p>
          <p>
            <strong className="text-white block mb-0.5">What do the green arrows mean?</strong>
            A green arrow (<span className="text-emerald-400 font-bold">↑</span>) next to a bar indicates that the player or alliance has gained points within the last synchronization cycle (usually the last hour).
          </p>
        </div>
      </Modal>
    </div>
  );
}
