"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, MapPin, Users, Trophy, Castle, Ghost, Navigation, Compass, Layers } from 'lucide-react';

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
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    }, 250);

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
    if (onSelectResult) onSelectResult(type, item);
  };

  const hasResults = results && (
    (results.players && results.players.length > 0) ||
    (results.alliances && results.alliances.length > 0) ||
    (results.towns && results.towns.length > 0) ||
    results.island
  );

  return (
    <div className="relative flex items-center gap-2" style={{ zIndex: 100 }}>
      {/* Search Input Bar */}
      <div 
        className="glass-panel flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700/80 bg-slate-900/90 shadow-2xl backdrop-blur-md transition-all focus-within:border-primary/80 focus-within:ring-2 focus-within:ring-primary/20"
        style={{ width: '380px' }}
      >
        <Search size={18} className="text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (hasResults) setIsOpen(true); }}
          placeholder="Search player, alliance, town, or '503, 479'..."
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

      {/* Categorized Dropdown Results */}
      {isOpen && (
        <div 
          ref={dropdownRef}
          className="absolute top-full left-0 mt-2 w-[460px] max-h-[480px] overflow-y-auto rounded-2xl glass-panel bg-slate-900/95 border border-slate-700/80 shadow-2xl p-2 flex flex-col gap-2 animate-fade-in scrollbar-thin scrollbar-thumb-slate-700"
          style={{ zIndex: 110 }}
        >
          {/* Island Coordinate Result */}
          {results?.island && (
            <div className="border-b border-slate-800/80 pb-2 mb-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2.5 py-1 flex items-center gap-1.5">
                <MapPin size={12} className="text-primary" /> Island Coordinates Match
              </div>
              <div
                onClick={() => handleSelect('island', results.island)}
                className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-800/80 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-primary/20 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                    <MapPin size={16} />
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">Island ({results.island.x}, {results.island.y})</div>
                    <div className="text-xs text-slate-400">
                      Type #{results.island.type} • +{results.island.resourcePlus} / -{results.island.resourceMinus}
                    </div>
                  </div>
                </div>
                <span className="text-xs font-mono px-2 py-1 rounded bg-slate-800 text-primary border border-primary/30">
                  Jump to Island
                </span>
              </div>
            </div>
          )}

          {/* Towns Category */}
          {results?.towns && results.towns.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2.5 py-1 flex items-center gap-1.5">
                <Castle size={12} className="text-emerald-400" /> Towns ({results.towns.length})
              </div>
              {results.towns.map(town => (
                <div
                  key={town.id}
                  onClick={() => handleSelect('town', town)}
                  className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-800/80 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                      <Castle size={16} />
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm group-hover:text-emerald-300">{town.name}</div>
                      <div className="text-xs text-slate-400">
                        {town.player ? town.player.name : <span className="text-rose-400 font-medium">Ghost Town</span>}
                        {town.player?.alliance && ` • ${town.player.alliance.name}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-emerald-400">{town.points.toLocaleString()} pts</div>
                    <div className="text-[10px] text-slate-500">({town.islandX}, {town.islandY}) Slot #{town.islandSlot ?? '0'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Players Category */}
          {results?.players && results.players.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2.5 py-1 flex items-center gap-1.5">
                <Trophy size={12} className="text-amber-400" /> Players ({results.players.length})
              </div>
              {results.players.map(player => (
                <div
                  key={player.id}
                  onClick={() => handleSelect('player', player)}
                  className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-800/80 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                      <Trophy size={16} />
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm group-hover:text-amber-300">{player.name}</div>
                      <div className="text-xs text-slate-400">
                        Rank #{player.rank || '-'} {player.alliance?.name && `• ${player.alliance.name}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-amber-400">{player.points.toLocaleString()} pts</div>
                    <div className="text-[10px] text-slate-500">{player.allBp?.toLocaleString() || 0} BP</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Alliances Category */}
          {results?.alliances && results.alliances.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2.5 py-1 flex items-center gap-1.5">
                <Users size={12} className="text-purple-400" /> Alliances ({results.alliances.length})
              </div>
              {results.alliances.map(alliance => (
                <div
                  key={alliance.id}
                  onClick={() => handleSelect('alliance', alliance)}
                  className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-800/80 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                      <Users size={16} />
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm group-hover:text-purple-300">{alliance.name}</div>
                      <div className="text-xs text-slate-400">
                        Rank #{alliance.rank || '-'} • {alliance.members || 0} members • {alliance.towns || 0} cities
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-purple-400">{alliance.points.toLocaleString()} pts</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!hasResults && !loading && (
            <div className="p-6 text-center text-slate-400 text-sm">
              No players, alliances, or towns found for <span className="text-white font-semibold">"{query}"</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
