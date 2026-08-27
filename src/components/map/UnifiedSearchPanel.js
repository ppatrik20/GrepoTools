"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, MapPin, Users, Trophy, Castle, Ghost, Navigation, Compass } from 'lucide-react';

export function normalizeTownData(rawTown) {
  if (!rawTown) return null;
  const pName = typeof rawTown.player === 'object' ? rawTown.player?.name : (rawTown.player || 'Ghost Town');
  const aName = typeof rawTown.player === 'object' 
    ? rawTown.player?.alliance?.name 
    : (typeof rawTown.alliance === 'object' ? rawTown.alliance?.name : (rawTown.alliance || 'None'));
  
  return {
    id: rawTown.id,
    name: rawTown.name || `Town #${rawTown.id}`,
    points: Number(rawTown.points || rawTown.pts || 0),
    islandX: Number(rawTown.islandX ?? rawTown.x ?? 500),
    islandY: Number(rawTown.islandY ?? rawTown.y ?? 500),
    islandSlot: Number(rawTown.islandSlot ?? rawTown.slot ?? 0),
    player: pName || 'Ghost Town',
    playerId: typeof rawTown.player === 'object' ? rawTown.player?.id : (rawTown.playerId || null),
    alliance: aName || 'None',
    allianceId: typeof rawTown.player === 'object' ? rawTown.player?.alliance?.id : (rawTown.allianceId || null),
    stage: rawTown.stage || 1,
    townColor: rawTown.townColor || '#94a3b8',
    isGhost: !pName || pName === 'Ghost Town'
  };
}

export default function UnifiedSearchPanel({
  worldId = 'hu119',
  onSelectResult,
  onToggleGhosts,
  showGhostsOnly,
  onToggleRouteTool,
  isRouteToolActive,
  onToggleEmptySlots,
  showEmptySlots
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Flatten all items for smooth keyboard navigation
  const flatItems = React.useMemo(() => {
    if (!results) return [];
    const list = [];
    if (results.island) {
      list.push({ type: 'island', item: results.island, key: `island-${results.island.x}-${results.island.y}` });
    }
    (results.towns || []).forEach(t => {
      list.push({ type: 'town', item: normalizeTownData(t), key: `town-${t.id}` });
    });
    (results.players || []).forEach(p => {
      list.push({ type: 'player', item: p, key: `player-${p.id}` });
    });
    (results.alliances || []).forEach(a => {
      list.push({ type: 'alliance', item: a, key: `alliance-${a.id}` });
    });
    return list;
  }, [results]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Global shortcut (Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Keyboard navigation inside search input
  const handleInputKeyDown = (e) => {
    if (!isOpen || flatItems.length === 0) {
      if (e.key === 'ArrowDown' && results) setIsOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % flatItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = flatItems[selectedIndex];
      if (current) {
        handleSelect(current.type, current.item);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/world/search?world=${worldId}&q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setIsOpen(true);
        }
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, worldId]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (type, item) => {
    setIsOpen(false);
    setQuery('');
    if (onSelectResult) {
      if (type === 'town') {
        onSelectResult('town', normalizeTownData(item));
      } else {
        onSelectResult(type, item);
      }
    }
  };

  return (
    <div className="relative flex items-center gap-2" style={{ zIndex: 100 }}>
      {/* Search Input Bar */}
      <div 
        className="glass-panel flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700/80 bg-slate-900/90 shadow-2xl backdrop-blur-md transition-all focus-within:border-primary/80 focus-within:ring-2 focus-within:ring-primary/20"
        style={{ width: '390px' }}
      >
        <Search size={18} className="text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onFocus={() => { if (flatItems.length > 0) setIsOpen(true); }}
          placeholder="Search player, alliance, town, or coords (503, 479)..."
          className="bg-transparent text-sm text-white placeholder-slate-400 focus:outline-none w-full"
        />
        {loading && <Loader2 size={16} className="text-primary animate-spin shrink-0" />}
        {query && !loading && (
          <button 
            onClick={() => { setQuery(''); setResults(null); setIsOpen(false); }}
            className="text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-slate-800"
          >
            <X size={14} />
          </button>
        )}
        <kbd className="hidden sm:inline-block text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
          Ctrl+K
        </kbd>
      </div>

      {/* Quick Action Buttons */}
      <div className="flex items-center gap-1.5 glass-panel p-1 rounded-xl border border-slate-700/80 bg-slate-900/90 shadow-xl backdrop-blur-md">
        {/* Toggle Ghost Towns */}
        <button
          onClick={onToggleGhosts}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            showGhostsOnly 
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-sm' 
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
          title="Filter Ghost Towns Only"
        >
          <Ghost size={14} className={showGhostsOnly ? 'text-rose-400 animate-pulse' : 'text-slate-400'} />
          <span className="hidden md:inline">Ghosts</span>
        </button>

        {/* Toggle Empty Slots */}
        <button
          onClick={onToggleEmptySlots}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            showEmptySlots 
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm' 
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
          title="Toggle Empty Colonization Slots"
        >
          <Compass size={14} className={showEmptySlots ? 'text-emerald-400' : 'text-slate-400'} />
          <span className="hidden md:inline">Slots</span>
        </button>

        {/* Route Planner Tool */}
        <button
          onClick={onToggleRouteTool}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            isRouteToolActive 
              ? 'bg-primary/30 text-primary border border-primary/60 shadow-sm' 
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
          title="Naval Route & Troop Travel Time Planner"
        >
          <Navigation size={14} className={isRouteToolActive ? 'text-primary animate-bounce' : 'text-slate-400'} />
          <span className="hidden md:inline">Route</span>
        </button>
      </div>

      {/* Categorized Dropdown Results with Keyboard Navigation */}
      {isOpen && (
        <div 
          ref={dropdownRef}
          className="absolute top-full left-0 mt-2 w-[480px] max-h-[480px] overflow-y-auto rounded-2xl glass-panel bg-slate-900/95 border border-slate-700/80 shadow-2xl p-2 flex flex-col gap-1 animate-fade-in scrollbar-thin scrollbar-thumb-slate-700"
          style={{ zIndex: 110 }}
        >
          {flatItems.length > 0 ? (
            flatItems.map((entry, index) => {
              const isSelected = index === selectedIndex;
              const { type, item, key } = entry;

              if (type === 'island') {
                return (
                  <div
                    key={key}
                    onClick={() => handleSelect('island', item)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all ${
                      isSelected ? 'bg-primary/25 border border-primary/50 shadow-md' : 'hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-primary/20 text-primary">
                        <MapPin size={16} />
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm">Island ({item.x}, {item.y})</div>
                        <div className="text-xs text-slate-400">
                          Type #{item.type} • +{item.resourcePlus} / -{item.resourceMinus}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-primary border border-primary/30">
                      Jump to Island
                    </span>
                  </div>
                );
              }

              if (type === 'town') {
                const normTown = normalizeTownData(item);
                return (
                  <div
                    key={key}
                    onClick={() => handleSelect('town', normTown)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all ${
                      isSelected ? 'bg-emerald-500/20 border border-emerald-500/50 shadow-md' : 'hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                        <Castle size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-white text-sm truncate">{normTown.name}</div>
                        <div className="text-xs text-slate-400 truncate">
                          {normTown.player} {normTown.alliance !== 'None' && `• ${normTown.alliance}`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold text-emerald-400">{normTown.points.toLocaleString()} pts</div>
                      <div className="text-[10px] text-slate-500">({normTown.islandX}, {normTown.islandY}) Slot #{normTown.islandSlot}</div>
                    </div>
                  </div>
                );
              }

              if (type === 'player') {
                const allyName = typeof item.alliance === 'object' ? item.alliance?.name : (item.alliance || '');
                return (
                  <div
                    key={key}
                    onClick={() => handleSelect('player', item)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all ${
                      isSelected ? 'bg-amber-500/20 border border-amber-500/50 shadow-md' : 'hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                        <Trophy size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-white text-sm truncate">{item.name}</div>
                        <div className="text-xs text-slate-400 truncate">
                          Rank #{item.rank || '-'} {allyName && `• ${allyName}`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold text-amber-400">{(item.points || 0).toLocaleString()} pts</div>
                      <div className="text-[10px] text-slate-500">{(item.allBp || 0).toLocaleString()} BP</div>
                    </div>
                  </div>
                );
              }

              if (type === 'alliance') {
                return (
                  <div
                    key={key}
                    onClick={() => handleSelect('alliance', item)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all ${
                      isSelected ? 'bg-purple-500/20 border border-purple-500/50 shadow-md' : 'hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 shrink-0">
                        <Users size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-white text-sm truncate">{item.name}</div>
                        <div className="text-xs text-slate-400 truncate">
                          Rank #{item.rank || '-'} • {item.members || 0} members • {item.towns || 0} cities
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold text-purple-400">{(item.points || 0).toLocaleString()} pts</div>
                    </div>
                  </div>
                );
              }

              return null;
            })
          ) : (
            !loading && (
              <div className="p-6 text-center text-slate-400 text-sm">
                No players, alliances, or towns found for <span className="text-white font-semibold">"{query}"</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
