'use client';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  Globe, User, ChevronDown, RefreshCw, Clock, Search, 
  Map, Trophy, Shield, Crosshair, BarChart3, Settings, 
  FileText, Check, AlertCircle, Users, LogIn, LogOut
} from 'lucide-react';

export default function Navigation() {
  const pathname = usePathname();
  const { 
    worlds, 
    activeWorld, 
    activeWorldId, 
    switchWorld, 
    activePlayer, 
    switchPlayer,
    refreshWorlds,
    refreshActivePlayer,
    user,
    logout
  } = useApp();

  // Dropdown states
  const [worldDropdownOpen, setWorldDropdownOpen] = useState(false);
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [playerSearchResults, setPlayerSearchResults] = useState([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [now, setNow] = useState(new Date());

  const worldDropdownRef = useRef(null);
  const searchAbortRef = useRef(null);

  // Update live clock
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (worldDropdownRef.current && !worldDropdownRef.current.contains(event.target)) {
        setWorldDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search players for active world
  useEffect(() => {
    if (!playerModalOpen || playerSearchQuery.length < 2) {
      setPlayerSearchResults([]);
      setSearchingPlayers(false);
      return;
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const abortController = new AbortController();
    searchAbortRef.current = abortController;

    setSearchingPlayers(true);
    const delayDebounce = setTimeout(() => {
      fetch(`/api/world/search?world=${activeWorldId}&q=${encodeURIComponent(playerSearchQuery)}`, {
        signal: abortController.signal
      })
        .then(res => res.json())
        .then(data => {
          setPlayerSearchResults(data.players || []);
          setSearchingPlayers(false);
        })
        .catch(err => {
          if (err.name !== 'AbortError') setSearchingPlayers(false);
        });
    }, 250);

    return () => {
      clearTimeout(delayDebounce);
      abortController.abort();
    };
  }, [playerSearchQuery, playerModalOpen, activeWorldId]);

  // Trigger sync for active world
  const handleTriggerSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncMessage('');
    try {
      const res = await fetch(`/api/world/sync?world=${activeWorldId}&force=true`);
      const data = await res.json();
      if (data.success) {
        setSyncMessage(`World ${activeWorldId} synced!`);
        refreshWorlds();
        refreshActivePlayer();
      } else {
        setSyncMessage(data.error || 'Sync failed');
      }
    } catch (e) {
      setSyncMessage(e.message);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 4000);
    }
  };

  const isGlobalAdmin = user?.globalRole === 'GLOBAL_ADMIN';
  const teams = user?.teams || [];
  const currentTeam = teams.find(t => t.worldId === activeWorldId) || teams[0];
  const isUnverified = teams.length > 0 && !isGlobalAdmin && teams.every(t => t.status === 'UNVERIFIED');

  const navLinks = [
    { href: '/', label: 'Dashboard', icon: BarChart3 },
    { href: '/map', label: 'World Map', icon: Map },
    { href: '/stats', label: 'Scoreboard', icon: Trophy },
    { href: '/planner', label: 'City Planner', icon: Shield },
    { href: '/snipe/recall', label: 'Recall Sniper', icon: Crosshair },
    { href: '/reports', label: 'Reports', icon: FileText },
  ];

  if (user) {
    navLinks.push({ href: '/team', label: 'Team', icon: Users });
    if (isGlobalAdmin) {
      navLinks.push({ href: '/world', label: 'Admin', icon: Settings });
      navLinks.push({ href: '/admin/audit-logs', label: 'Audit Logs', icon: FileText });
    }
  }

  return (
    <>
      <nav className="navbar">
        <div className="container flex justify-between items-center" style={{ padding: 0 }}>
          
          {/* Left: Brand & World Selector & Player Profile */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="gradient-text font-bold text-xl tracking-tight">GrepoTools</span>
            </Link>

            {/* World Switcher Dropdown */}
            <div className="relative" ref={worldDropdownRef}>
              <button
                onClick={() => setWorldDropdownOpen(!worldDropdownOpen)}
                className="flex items-center gap-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 px-3 py-1.5 rounded-lg text-sm transition-all"
              >
                <Globe size={15} className="text-primary" />
                <span className="font-semibold text-slate-200">{activeWorld?.name || activeWorldId.toUpperCase()}</span>
                <span className="bg-primary/20 text-primary font-mono text-xs px-1.5 py-0.5 rounded">
                  {activeWorld?.speed || 1}x
                </span>
                <ChevronDown size={14} className="text-slate-400" />
              </button>

              {worldDropdownOpen && (
                <div className="absolute left-0 mt-2 w-72 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-xl shadow-2xl z-50 p-2 animate-in fade-in zoom-in-95 duration-100">
                  <div className="text-xs font-semibold text-slate-400 px-3 py-1.5 uppercase tracking-wider">
                    Select Active World
                  </div>
                  <div className="max-h-60 overflow-y-auto flex flex-col gap-1">
                    {worlds.map(w => (
                      <button
                        key={w.id}
                        onClick={() => {
                          switchWorld(w.id);
                          setWorldDropdownOpen(false);
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-lg text-left text-sm transition-colors ${
                          w.id.toLowerCase() === activeWorldId.toLowerCase()
                            ? 'bg-primary/20 border border-primary/40 text-white' 
                            : 'hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        <div>
                          <div className="font-medium">{w.name}</div>
                          <div className="text-xs text-slate-400">
                            {w.worldType?.toUpperCase()} • {w.speed}x speed • {w.counts?.players || 0} players
                          </div>
                        </div>
                        {w.id.toLowerCase() === activeWorldId.toLowerCase() && <Check size={16} className="text-primary" />}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-slate-800 mt-2 pt-2">
                    <Link
                      href="/world"
                      onClick={() => setWorldDropdownOpen(false)}
                      className="flex items-center justify-center gap-1.5 text-xs text-primary hover:text-primary-hover p-1.5 rounded hover:bg-slate-800/50 w-full"
                    >
                      <Settings size={13} /> Manage / Add Worlds
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Active Player Profile Button */}
            <button
              onClick={() => setPlayerModalOpen(true)}
              className="flex items-center gap-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 px-3 py-1.5 rounded-lg text-sm transition-all"
              title="Click to switch active player"
            >
              <User size={15} className="text-accent" />
              <span className="font-semibold text-slate-200">
                {activePlayer ? activePlayer.name : 'Choose Player'}
              </span>
              {activePlayer && (
                <span className="text-xs text-slate-400 font-mono">
                  #{activePlayer.rank || '-'}
                </span>
              )}
            </button>

            {/* Sync Status Button */}
            <button
              onClick={handleTriggerSync}
              disabled={syncing}
              className="hidden lg:flex items-center gap-2 bg-slate-900/50 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-all"
              title="Click to force world sync"
            >
              <RefreshCw size={12} className={syncing ? "animate-spin text-primary" : "text-slate-400"} />
              <span>
                {activeWorld?.lastSync 
                  ? `Synced ${Math.max(0, Math.floor((now - new Date(activeWorld.lastSync)) / 60000))}m ago` 
                  : 'Not synced'}
              </span>
            </button>

            {syncMessage && (
              <span className="text-xs text-primary font-mono animate-fade-in">
                {syncMessage}
              </span>
            )}
          </div>

          {/* Right: Navigation Links */}
          <div className="nav-links flex items-center gap-1">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`nav-link flex items-center gap-1.5 ${isActive ? 'active text-white' : 'text-slate-400'}`}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </Link>
              );
            })}

            {/* Auth Session Widget */}
            <div className="flex items-center gap-2 pl-3 ml-2 border-l border-slate-800">
              {user ? (
                <div className="flex items-center gap-2.5">
                  {isUnverified && (
                    <Link
                      href="/verify"
                      className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition animate-pulse"
                    >
                      <AlertCircle size={13} className="text-amber-400" />
                      <span>Verify Town</span>
                    </Link>
                  )}
                  <div className="hidden sm:flex flex-col text-right">
                    <span className="text-xs font-bold text-white leading-tight">
                      {user.username}
                    </span>
                    <span className="text-[10px] font-mono text-amber-400 uppercase leading-tight">
                      {isGlobalAdmin ? 'Global Admin' : currentTeam?.role === 'TEAM_ADMIN' ? 'Team Admin' : 'Team Member'}
                    </span>
                  </div>
                  <button
                    onClick={logout}
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/60 rounded-lg text-slate-400 hover:text-red-400 transition cursor-pointer"
                    title="Sign Out"
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-300 transition"
                >
                  <LogIn size={13} />
                  <span>Sign In</span>
                </Link>
              )}
            </div>
          </div>

        </div>
      </nav>

      {/* Switch Player Modal */}
      {playerModalOpen && (
        <div 
          className="grepo-modal-backdrop animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setPlayerModalOpen(false); }}
        >
          <div 
            className="glass-panel w-full max-w-md p-6 bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl relative my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <User size={18} className="text-accent" /> Switch Active Player
                </h3>
                <p className="text-xs text-slate-400">
                  Select your in-game identity for world <strong className="text-primary">{activeWorldId?.toUpperCase() || ''}</strong>
                </p>
              </div>
              <button 
                onClick={() => setPlayerModalOpen(false)}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mb-4">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search player name in this world..."
                value={playerSearchQuery}
                onChange={(e) => setPlayerSearchQuery(e.target.value)}
                className="input-field pl-9 pr-9 bg-slate-950/80 border-slate-700 text-sm"
                autoFocus
              />
              {searchingPlayers && (
                <RefreshCw size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary pointer-events-none" />
              )}
            </div>

            {/* Current Active Player Details */}
            {activePlayer && (
              <div className="mb-4 p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <div className="text-xs text-slate-400">Currently Active:</div>
                  <div className="font-bold text-accent text-base">{activePlayer.name}</div>
                  <div className="text-xs text-slate-400">
                    Rank #{activePlayer.rank} • {activePlayer.points?.toLocaleString()} pts • {activePlayer.towns} cities
                  </div>
                </div>
                <div className="text-xs bg-accent/20 text-accent font-semibold px-2 py-1 rounded">
                  Active
                </div>
              </div>
            )}

            {/* Search Results List */}
            <div className="max-h-60 overflow-y-auto flex flex-col gap-1.5">
              {playerSearchResults.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    switchPlayer(p.name);
                    setPlayerModalOpen(false);
                    setPlayerSearchQuery('');
                  }}
                  className="flex justify-between items-center p-2.5 rounded-lg hover:bg-slate-800 border border-slate-800/60 hover:border-slate-700 text-left transition-colors"
                >
                  <div>
                    <div className="font-semibold text-slate-200">{p.name}</div>
                    <div className="text-xs text-slate-400">
                      {p.alliance?.name ? `[${p.alliance.name}] • ` : ''}{p.points?.toLocaleString()} pts
                    </div>
                  </div>
                  <span className="text-xs text-primary font-mono">Select →</span>
                </button>
              ))}

              {playerSearchQuery.length >= 2 && playerSearchResults.length === 0 && !searchingPlayers && (
                <div className="text-center py-6 text-slate-400 text-sm">
                  No players found matching &quot;{playerSearchQuery}&quot;.
                </div>
              )}

              {playerSearchQuery.length < 2 && (
                <div className="text-center py-4 text-slate-500 text-xs">
                  Type at least 2 characters to search players in this world.
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setPlayerModalOpen(false)}
                className="btn text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 py-1.5 px-4 rounded-lg border border-slate-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
