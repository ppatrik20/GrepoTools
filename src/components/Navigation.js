'use client';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  Globe, User, ChevronDown, RefreshCw, Search, 
  Map, Trophy, Shield, Crosshair, BarChart3, Settings, 
  FileText, Check, AlertCircle, Users, LogIn, LogOut,
  Menu, X
} from 'lucide-react';
import { Modal, Badge, Button, Input } from '@/components/ui';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [now, setNow] = useState(new Date());

  const worldDropdownRef = useRef(null);
  const searchAbortRef = useRef(null);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
        <div className="container flex justify-between items-center w-full" style={{ padding: 0 }}>
          
          {/* Left: Brand & World Selector & Player Profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <span className="gradient-text font-bold text-lg sm:text-xl tracking-tight">GrepoTools</span>
            </Link>

            {/* World Switcher Dropdown */}
            <div className="relative" ref={worldDropdownRef}>
              <button
                type="button"
                onClick={() => setWorldDropdownOpen(!worldDropdownOpen)}
                className="flex items-center gap-1.5 sm:gap-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm transition-all cursor-pointer"
                aria-expanded={worldDropdownOpen}
              >
                <Globe size={14} className="text-blue-400 shrink-0" />
                <span className="font-semibold text-slate-200 truncate max-w-[90px] sm:max-w-none">
                  {activeWorld?.name || activeWorldId?.toUpperCase()}
                </span>
                <span className="bg-blue-500/15 text-blue-400 font-mono text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md hidden xs:inline">
                  {activeWorld?.speed || 1}x
                </span>
                <ChevronDown size={13} className="text-slate-400 shrink-0" />
              </button>

              {worldDropdownOpen && (
                <div className="absolute left-0 mt-2 w-72 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl z-50 p-2 animate-in fade-in zoom-in-95 duration-100">
                  <div className="text-[11px] font-semibold text-slate-400 px-3 py-1.5 uppercase tracking-wider">
                    Select Active World
                  </div>
                  <div className="max-h-60 overflow-y-auto flex flex-col gap-1">
                    {worlds.map(w => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => {
                          switchWorld(w.id);
                          setWorldDropdownOpen(false);
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-xl text-left text-sm transition-colors cursor-pointer ${
                          w.id.toLowerCase() === activeWorldId.toLowerCase()
                            ? 'bg-blue-600/20 border border-blue-500/40 text-white' 
                            : 'hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        <div>
                          <div className="font-medium text-white">{w.name}</div>
                          <div className="text-xs text-slate-400">
                            {w.worldType?.toUpperCase()} • {w.speed}x speed • {w.counts?.players || 0} players
                          </div>
                        </div>
                        {w.id.toLowerCase() === activeWorldId.toLowerCase() && <Check size={16} className="text-blue-400" />}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-slate-800 mt-2 pt-2">
                    <Link
                      href="/world"
                      onClick={() => setWorldDropdownOpen(false)}
                      className="flex items-center justify-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 p-1.5 rounded-xl hover:bg-slate-800/50 w-full"
                    >
                      <Settings size={13} /> Manage / Add Worlds
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Active Player Profile Button */}
            <button
              type="button"
              onClick={() => setPlayerModalOpen(true)}
              className="flex items-center gap-1.5 sm:gap-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm transition-all cursor-pointer"
              title="Click to switch active player"
            >
              <User size={14} className="text-indigo-400 shrink-0" />
              <span className="font-semibold text-slate-200 truncate max-w-[85px] sm:max-w-none">
                {activePlayer ? activePlayer.name : 'Choose Player'}
              </span>
              {activePlayer && (
                <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                  #{activePlayer.rank || '-'}
                </span>
              )}
            </button>

            {/* Sync Status Button (Desktop) */}
            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={syncing}
              className="hidden xl:flex items-center gap-1.5 bg-slate-900/50 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
              title="Click to force world sync"
            >
              <RefreshCw size={12} className={syncing ? "animate-spin text-blue-400" : "text-slate-400"} />
              <span>
                {activeWorld?.lastSync 
                  ? `Synced ${Math.max(0, Math.floor((now - new Date(activeWorld.lastSync)) / 60000))}m ago` 
                  : 'Not synced'}
              </span>
            </button>

            {syncMessage && (
              <span className="text-xs text-blue-400 font-mono animate-fade-in hidden lg:inline">
                {syncMessage}
              </span>
            )}
          </div>

          {/* Right: Desktop Navigation Links (hidden < lg) */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs xl:text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </Link>
              );
            })}

            {/* Auth Session Widget (Desktop) */}
            <div className="flex items-center gap-2 pl-3 ml-2 border-l border-slate-800">
              {user ? (
                <div className="flex items-center gap-2.5">
                  {isUnverified && (
                    <Link
                      href="/verify"
                      className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition animate-pulse"
                    >
                      <AlertCircle size={13} className="text-amber-400" />
                      <span>Verify Town</span>
                    </Link>
                  )}
                  <div className="flex flex-col text-right">
                    <span className="text-xs font-bold text-white leading-tight">
                      {user.username}
                    </span>
                    <span className="text-[10px] font-mono text-amber-400 uppercase leading-tight">
                      {isGlobalAdmin ? 'Global Admin' : currentTeam?.role === 'TEAM_ADMIN' ? 'Team Admin' : 'Team Member'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={logout}
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/60 rounded-xl text-slate-400 hover:text-red-400 transition cursor-pointer"
                    title="Sign Out"
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-300 transition"
                >
                  <LogIn size={13} />
                  <span>Sign In</span>
                </Link>
              )}
            </div>
          </div>

          {/* Right: Mobile Hamburger Button (visible < lg) */}
          <div className="flex lg:hidden items-center gap-2">
            {user ? (
              <span className="text-xs font-mono text-amber-400 font-bold truncate max-w-[80px]">
                {user.username}
              </span>
            ) : (
              <Link
                href="/login"
                className="p-1.5 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/30"
                title="Sign In"
              >
                <LogIn size={16} />
              </Link>
            )}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

        </div>
      </nav>

      {/* Mobile Drawer Navigation (Slide-in / Backdrop Overlay) */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 top-[64px] z-50 bg-slate-950/80 backdrop-blur-md lg:hidden flex flex-col p-4 animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="glass-panel bg-slate-900/95 border border-slate-700/80 rounded-2xl p-4 flex flex-col gap-2 shadow-2xl max-h-[calc(100vh-80px)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
              Navigation Menu
            </div>

            {navLinks.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600/20 text-white border border-blue-500/40'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <Icon size={18} className={isActive ? 'text-blue-400' : 'text-slate-400'} />
                  <span>{label}</span>
                </Link>
              );
            })}

            <div className="border-t border-slate-800 my-2 pt-2 flex flex-col gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleTriggerSync}
                isLoading={syncing}
                icon={RefreshCw}
                className="w-full justify-start"
              >
                Sync Current World
              </Button>

              {user ? (
                <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 mt-1">
                  <div>
                    <div className="text-xs font-bold text-white">{user.username}</div>
                    <div className="text-[10px] text-amber-400 font-mono uppercase">
                      {isGlobalAdmin ? 'Global Admin' : currentTeam?.role || 'Member'}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    icon={LogOut}
                    className="text-red-400 hover:text-red-300"
                  >
                    Logout
                  </Button>
                </div>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 p-2.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-xl font-bold text-sm"
                >
                  <LogIn size={16} /> Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Switch Player Modal (Accessible Unified Modal) */}
      <Modal
        isOpen={playerModalOpen}
        onClose={() => setPlayerModalOpen(false)}
        title="Switch Active Player"
        subtitle={`Select your in-game identity for world ${activeWorldId?.toUpperCase() || ''}`}
        icon={User}
        maxWidth="md"
        footer={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPlayerModalOpen(false)}
          >
            Done
          </Button>
        }
      >
        {/* Search Input */}
        <div className="relative">
          <Input
            icon={Search}
            type="text"
            placeholder="Search player name in this world..."
            value={playerSearchQuery}
            onChange={(e) => setPlayerSearchQuery(e.target.value)}
            autoFocus
          />
          {searchingPlayers && (
            <RefreshCw size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-400 pointer-events-none" />
          )}
        </div>

        {/* Current Active Player Details */}
        {activePlayer && (
          <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 flex justify-between items-center">
            <div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wider">Currently Active:</div>
              <div className="font-bold text-indigo-400 text-base">{activePlayer.name}</div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                Rank #{activePlayer.rank} • {activePlayer.points?.toLocaleString()} pts • {activePlayer.towns} cities
              </div>
            </div>
            <Badge variant="accent" dot>
              Active
            </Badge>
          </div>
        )}

        {/* Search Results List */}
        <div className="max-h-60 overflow-y-auto flex flex-col gap-1.5 pr-1">
          {playerSearchResults.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                switchPlayer(p.name);
                setPlayerModalOpen(false);
                setPlayerSearchQuery('');
              }}
              className="flex justify-between items-center p-2.5 rounded-xl hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700 text-left transition-colors cursor-pointer"
            >
              <div>
                <div className="font-semibold text-slate-200">{p.name}</div>
                <div className="text-xs text-slate-400 font-mono">
                  {p.alliance?.name ? `[${p.alliance.name}] • ` : ''}{p.points?.toLocaleString()} pts
                </div>
              </div>
              <span className="text-xs text-blue-400 font-mono font-medium">Select →</span>
            </button>
          ))}

          {playerSearchQuery.length >= 2 && playerSearchResults.length === 0 && !searchingPlayers && (
            <div className="text-center py-6 text-slate-400 text-xs">
              No players found matching &quot;{playerSearchQuery}&quot;.
            </div>
          )}

          {playerSearchQuery.length < 2 && (
            <div className="text-center py-4 text-slate-500 text-xs">
              Type at least 2 characters to search players in this world.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
