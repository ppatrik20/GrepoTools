'use client';
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  Trash2, Plus, AlertTriangle, Crosshair, Shield, Clock, RefreshCw, 
  Target, Volume2, VolumeX, Save, CheckCircle2, ChevronRight, Swords, 
  ArrowRight, Copy, Check, Info, Sparkles, MapPin, Building, Search, Loader2
} from 'lucide-react';
import DummyFinder from '@/components/CommandCenter/DummyFinder';
import { useApp } from '@/context/AppContext';
import { calculateMidpointRecall, formatDuration } from '@/lib/traveltime';

function RecallSnipeContent() {
  const { activeWorldId, activeWorld, activePlayer } = useApp();
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [serverOffset, setServerOffset] = useState(0); // in seconds
  const [now, setNow] = useState(new Date());
  const [audioEnabled, setAudioEnabled] = useState(true);

  const searchParams = useSearchParams();
  const targetTownId = searchParams.get('targetTownId');
  const originTownId = searchParams.get('originTownId');

  // Autocomplete states for adding target city
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedTownId, setSelectedTownId] = useState(null);

  // Ingest query parameters from Route Planner (/snipe/recall?targetTownId=...&originTownId=...)
  useEffect(() => {
    if (!targetTownId && !originTownId) return;

    async function ingestParams() {
      try {
        const worldParam = activeWorldId || 'hu119';
        if (targetTownId) {
          const res = await fetch(`/api/world/town/${targetTownId}?world=${worldParam}`);
          if (res.ok) {
            const data = await res.json();
            const targetTown = data.town || data;
            if (targetTown?.name) {
              setGroups(prev => {
                const existing = prev.find(g => g.townId === targetTown.id || g.name.toLowerCase() === targetTown.name.toLowerCase());
                if (existing) {
                  setActiveGroupId(existing.id);
                  return prev;
                }
                const newGroup = {
                  id: Date.now().toString(),
                  name: targetTown.name,
                  townId: targetTown.id,
                  worldType: (activeWorld?.worldType || 'siege').toLowerCase(),
                  movements: [],
                  plans: []
                };
                setActiveGroupId(newGroup.id);
                return [...prev, newGroup];
              });
            }
          }
        }
        if (originTownId) {
          const res = await fetch(`/api/world/town/${originTownId}?world=${worldParam}`);
          if (res.ok) {
            const data = await res.json();
            const originTown = data.town || data;
            if (originTown?.name) {
              setMovAttacker(originTown.name);
              setMovAttackerId(originTown.id);
            }
          }
        }
      } catch (err) {
        console.error("Failed to ingest recall query params:", err);
      }
    }

    ingestParams();
  }, [targetTownId, originTownId, activeWorldId, activeWorld]);
  const [citySearchResults, setCitySearchResults] = useState([]);
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [cityFocusedIndex, setCityFocusedIndex] = useState(-1);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const cityInputRef = useRef(null);
  const cityDropdownRef = useRef(null);

  // Audio context for chirps
  const audioCtxRef = useRef(null);
  const playedChirpsRef = useRef({});

  // Input states for new movement
  const [movAttacker, setMovAttacker] = useState('');
  const [movAttackerId, setMovAttackerId] = useState(null);
  const [movType, setMovType] = useState('attack');
  const [movTime, setMovTime] = useState('');
  const [attackerSearchResults, setAttackerSearchResults] = useState([]);
  const [isSearchingAttacker, setIsSearchingAttacker] = useState(false);
  const [attackerFocusedIndex, setAttackerFocusedIndex] = useState(-1);
  const [showAttackerDropdown, setShowAttackerDropdown] = useState(false);
  const attackerInputRef = useRef(null);
  const movTimeInputRef = useRef(null);

  // Custom gap minutes input per gap ID
  const [customMins, setCustomMins] = useState({});

  // Toast / feedback message states
  const [copiedPlanId, setCopiedPlanId] = useState(null);
  const [savedOpMsg, setSavedOpMsg] = useState('');

  // Audio chirp player
  const playChirp = useCallback((freq = 880, type = 'sine', duration = 0.12, vol = 0.6) => {
    if (!audioEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio not available", e);
    }
  }, [audioEnabled]);

  // Load groups from localStorage for active world
  useEffect(() => {
    if (!activeWorldId) return;
    const saved = localStorage.getItem(`grepo-recall-groups_${activeWorldId}`) || localStorage.getItem('grepo-recall-groups');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setGroups(parsed);
        if (parsed.length > 0) setActiveGroupId(parsed[0].id);
      } catch (e) {
        console.error("Failed to parse recall groups", e);
      }
    } else {
      setGroups([]);
      setActiveGroupId(null);
    }
  }, [activeWorldId]);

  // Save groups to localStorage
  useEffect(() => {
    if (!activeWorldId) return;
    localStorage.setItem(`grepo-recall-groups_${activeWorldId}`, JSON.stringify(groups));
  }, [groups, activeWorldId]);

  // Tick every second & trigger audio chirps at T-10, T-5, T-3, T-2, T-1, T-0
  useEffect(() => {
    const interval = setInterval(() => {
      const currentTime = new Date();
      setNow(currentTime);

      const activeGrp = groups.find(g => g.id === activeGroupId);
      if (activeGrp && activeGrp.plans) {
        const stMs = currentTime.getTime() + (serverOffset * 1000);
        activeGrp.plans.forEach(plan => {
          const sendDiff = Math.floor((new Date(plan.sendTime).getTime() - stMs) / 1000);
          const recallDiff = Math.floor((new Date(plan.recallTime).getTime() - stMs) / 1000);

          [
            { diff: sendDiff, key: `send_${plan.id}` },
            { diff: recallDiff, key: `recall_${plan.id}` }
          ].forEach(({ diff, key }) => {
            if (diff >= 0 && diff <= 10) {
              const chirpKey = `${key}_${diff}`;
              if (!playedChirpsRef.current[chirpKey]) {
                playedChirpsRef.current[chirpKey] = true;
                if (diff === 0) {
                  playChirp(1200, 'triangle', 0.4, 0.9); // Launch / Recall now alert
                } else if (diff <= 3) {
                  playChirp(950, 'sine', 0.15, 0.7);
                } else if (diff === 5 || diff === 10) {
                  playChirp(700, 'sine', 0.1, 0.5);
                }
              }
            }
          });
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [groups, activeGroupId, serverOffset, playChirp]);

  const serverTime = new Date(now.getTime() + (serverOffset * 1000));

  const handleSyncTime = async () => {
    try {
      const start = Date.now();
      const res = await fetch('/api/time');
      const data = await res.json();
      const end = Date.now();
      const rtt = end - start;
      const serverTimeMs = data.serverTime + (rtt / 2);
      const diffMs = serverTimeMs - end;
      setServerOffset(Math.round(diffMs / 1000));
    } catch (e) {
      console.error("Failed to sync time", e);
    }
  };

  // --- Target City Autocomplete Search ---
  useEffect(() => {
    if (!newGroupName.trim() || newGroupName.length < 2 || !activeWorldId) {
      setCitySearchResults([]);
      setIsSearchingCity(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingCity(true);
      try {
        const res = await fetch(`/api/world/search?world=${activeWorldId}&q=${encodeURIComponent(newGroupName.trim())}`);
        const data = await res.json();
        
        let results = data.towns || [];
        
        // Prioritize active player's towns if any match
        if (activePlayer?.townsList?.length > 0) {
          const lower = newGroupName.toLowerCase();
          const ownMatches = activePlayer.townsList
            .filter(t => t.name.toLowerCase().includes(lower))
            .map(t => ({
              ...t,
              isOwn: true,
              player: { name: activePlayer.name }
            }));
          
          const ownIds = new Set(ownMatches.map(t => t.id));
          results = [...ownMatches, ...results.filter(t => !ownIds.has(t.id))];
        }

        setCitySearchResults(results.slice(0, 8));
      } catch (err) {
        console.error("City search failed", err);
      } finally {
        setIsSearchingCity(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [newGroupName, activeWorldId, activePlayer]);

  // --- Attacker / Origin Town Search ---
  useEffect(() => {
    if (!movAttacker.trim() || movAttacker.length < 2 || !activeWorldId) {
      setAttackerSearchResults([]);
      setIsSearchingAttacker(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingAttacker(true);
      try {
        const res = await fetch(`/api/world/search?world=${activeWorldId}&q=${encodeURIComponent(movAttacker.trim())}`);
        const data = await res.json();
        setAttackerSearchResults((data.towns || []).slice(0, 8));
      } catch (err) {
        console.error("Attacker search failed", err);
      } finally {
        setIsSearchingAttacker(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [movAttacker, activeWorldId]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(e.target) && e.target !== cityInputRef.current) {
        setShowCityDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addCityGroup = (name, townId = null) => {
    if (!name.trim()) return;
    const finalTownId = townId || activePlayer?.townsList?.find(t => t.name.toLowerCase() === name.toLowerCase())?.id || null;
    const worldType = (activeWorld?.worldType || 'siege').toLowerCase();

    const newGroup = {
      id: Date.now().toString(),
      name: name.trim(),
      townId: finalTownId,
      worldType,
      movements: [],
      plans: []
    };

    setGroups(prev => [...prev, newGroup]);
    setActiveGroupId(newGroup.id);
    setNewGroupName('');
    setSelectedTownId(null);
    setShowCityDropdown(false);
    setCityFocusedIndex(-1);
  };

  const deleteGroup = (id) => {
    const newGroups = groups.filter(g => g.id !== id);
    setGroups(newGroups);
    if (activeGroupId === id) {
      setActiveGroupId(newGroups.length > 0 ? newGroups[0].id : null);
    }
  };

  const activeGroup = groups.find(g => g.id === activeGroupId);

  const getTargetDate = (timeStr) => {
    const parts = timeStr.split(':').map(Number);
    const targetDate = new Date();
    if (parts.length === 3) {
      targetDate.setHours(parts[0], parts[1], parts[2], 0);
    } else if (parts.length === 2) {
      targetDate.setHours(parts[0], parts[1], 0, 0);
    }
    if (targetDate.getTime() < new Date().getTime()) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    return targetDate.toISOString();
  };

  const handleAddMovement = (e) => {
    if (e) e.preventDefault();
    if (!activeGroup || !movTime.trim()) return;
    
    const targetDateStr = getTargetDate(movTime.trim());

    const newMov = {
      id: Date.now().toString() + Math.random().toString(36).substring(7),
      attacker: movAttacker || 'Enemy Command',
      attackerId: movAttackerId,
      type: movType,
      arrivalTime: targetDateStr
    };

    const updatedGroups = groups.map(g => {
      if (g.id === activeGroup.id) {
        return {
          ...g,
          movements: [...g.movements, newMov].sort((a, b) => new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime())
        };
      }
      return g;
    });

    setGroups(updatedGroups);
    setMovAttacker('');
    setMovAttackerId(null);
    setAttackerSearchResults([]);
    setShowAttackerDropdown(false);
    setMovTime('');
    setMovType('attack');

    // Refocus attacker input for rapid-fire logging
    if (attackerInputRef.current) {
      attackerInputRef.current.focus();
    }
  };

  const deleteMovement = (movId) => {
    const updatedGroups = groups.map(g => {
      if (g.id === activeGroup.id) {
        return { ...g, movements: g.movements.filter(m => m.id !== movId) };
      }
      return g;
    });
    setGroups(updatedGroups);
  };

  // --- Gap Calculations (Revolt vs Siege) ---
  const calculateGaps = () => {
    if (!activeGroup || activeGroup.movements.length === 0) return [];
    
    const csMovements = activeGroup.movements.filter(m => m.type === 'cs');
    const gaps = [];
    const worldType = (activeGroup.worldType || activeWorld?.worldType || 'siege').toLowerCase();

    csMovements.forEach(cs => {
      const csTime = new Date(cs.arrivalTime).getTime();
      const beforeAttacks = activeGroup.movements.filter(m => m.type === 'attack' && new Date(m.arrivalTime).getTime() < csTime);
      const afterSupports = activeGroup.movements.filter(m => m.type !== 'attack' && new Date(m.arrivalTime).getTime() > csTime);

      const lastClear = beforeAttacks.length > 0 ? beforeAttacks[beforeAttacks.length - 1] : null;
      const firstSupport = afterSupports.length > 0 ? afterSupports[0] : null;

      if (worldType === 'revolt') {
        // In Revolt mode: CS landing immediately captures the town. Units MUST return BEFORE the CS!
        const gapEnd = csTime;
        const gapStart = lastClear ? new Date(lastClear.arrivalTime).getTime() : csTime - 60000;
        const returnTime = gapEnd - 1000; // 1s before CS

        gaps.push({
          id: `gap_before_${cs.id}`,
          mode: 'revolt',
          desc: `⚡ Defend Revolt CS (Return 1s BEFORE CS from ${cs.attacker})`,
          gapStart, 
          gapEnd, 
          returnTime,
          csArrival: csTime
        });
      } else {
        // In Siege mode: CS initiates a siege.
        // Primary Option: Break Siege (Return 1s AFTER CS before enemy support)
        const gapStart = csTime;
        const gapEnd = firstSupport ? new Date(firstSupport.arrivalTime).getTime() : csTime + 60000;
        const returnTime = gapStart + 1000; // 1s after CS
        
        gaps.push({
          id: `gap_after_${cs.id}`,
          mode: 'siege_break',
          desc: `🛡️ Break Siege (Return 1s AFTER CS from ${cs.attacker})`,
          gapStart, 
          gapEnd, 
          returnTime,
          csArrival: csTime
        });

        // Secondary Option: Pre-CS Defense (Return 1s BEFORE CS)
        gaps.push({
          id: `gap_before_${cs.id}`,
          mode: 'siege_defend',
          desc: `⚔️ Pre-CS Defense (Return 1s BEFORE CS from ${cs.attacker})`,
          gapStart: lastClear ? new Date(lastClear.arrivalTime).getTime() : csTime - 60000,
          gapEnd: csTime,
          returnTime: csTime - 1000,
          csArrival: csTime
        });
      }
    });

    return gaps;
  };

  const createPlanFromGap = (gap, minsAway) => {
    const returnTime = gap.returnTime;
    const sendTime = returnTime - (minsAway * 60 * 1000);
    
    if (sendTime < serverTime.getTime()) {
      alert("Cannot create a plan where Send Time is in the past! Please choose a smaller minute delay.");
      return;
    }

    const { recallTime } = calculateMidpointRecall(returnTime, sendTime);

    const newPlan = {
      id: Date.now().toString(),
      targetReturnTime: new Date(returnTime).toISOString(),
      sendTime: new Date(sendTime).toISOString(),
      recallTime: new Date(recallTime).toISOString(),
      gapDescription: gap.desc,
      delayMinutes: minsAway
    };

    const updatedGroups = groups.map(g => {
      if (g.id === activeGroup.id) {
        return { 
          ...g, 
          plans: [...g.plans, newPlan].sort((a,b) => new Date(a.sendTime).getTime() - new Date(b.sendTime).getTime()) 
        };
      }
      return g;
    });
    setGroups(updatedGroups);
  };

  const deletePlan = (planId) => {
    const updatedGroups = groups.map(g => {
      if (g.id === activeGroup.id) {
        return { ...g, plans: g.plans.filter(p => p.id !== planId) };
      }
      return g;
    });
    setGroups(updatedGroups);
  };

  const copyPlanTimings = (plan) => {
    const text = `[RECALL SNIPE PLAN - ${activeGroup?.name || 'City'}]\n` +
      `Target Landing: ${new Date(plan.targetReturnTime).toLocaleTimeString([], { hour12: false })}\n` +
      `🚀 STEP 1 (Launch): ${new Date(plan.sendTime).toLocaleTimeString([], { hour12: false })}\n` +
      `🛑 STEP 2 (Recall): ${new Date(plan.recallTime).toLocaleTimeString([], { hour12: false })}\n` +
      `Description: ${plan.gapDescription}`;
    
    navigator.clipboard.writeText(text);
    setCopiedPlanId(plan.id);
    setTimeout(() => setCopiedPlanId(null), 2500);
  };

  const savePlanToDatabase = async (plan) => {
    if (!activeGroup?.townId) {
      alert("Please associate a valid Town ID with this city to save to persistent operations.");
      return;
    }

    try {
      const res = await fetch('/api/snipe/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worldId: activeWorldId,
          targetTownId: activeGroup.townId,
          targetTownName: activeGroup.name,
          landingTime: plan.targetReturnTime,
          sendTime: plan.sendTime,
          recallTime: plan.recallTime,
          type: 'recall',
          label: plan.gapDescription || `Recall Snipe (${activeGroup.name})`
        })
      });

      if (res.ok) {
        setSavedOpMsg(`Plan saved to Tactical Operations!`);
        setTimeout(() => setSavedOpMsg(''), 3500);
      } else {
        const d = await res.json();
        alert(d.error || "Failed to save plan to database");
      }
    } catch (e) {
      console.error(e);
      alert("Network error saving plan");
    }
  };

  // Keyboard navigation for Target City input
  const handleCityKeyDown = (e) => {
    if (!showCityDropdown || citySearchResults.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCityGroup(newGroupName);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCityFocusedIndex(prev => (prev + 1) % citySearchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCityFocusedIndex(prev => (prev - 1 + citySearchResults.length) % citySearchResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (cityFocusedIndex >= 0 && cityFocusedIndex < citySearchResults.length) {
        const item = citySearchResults[cityFocusedIndex];
        addCityGroup(item.name, item.id);
      } else {
        addCityGroup(newGroupName);
      }
    } else if (e.key === 'Escape') {
      setShowCityDropdown(false);
    }
  };

  // Keyboard navigation for Attacker input
  const handleAttackerKeyDown = (e) => {
    if (!showAttackerDropdown || attackerSearchResults.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (movTimeInputRef.current) movTimeInputRef.current.focus();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAttackerFocusedIndex(prev => (prev + 1) % attackerSearchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAttackerFocusedIndex(prev => (prev - 1 + attackerSearchResults.length) % attackerSearchResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (attackerFocusedIndex >= 0 && attackerFocusedIndex < attackerSearchResults.length) {
        const item = attackerSearchResults[attackerFocusedIndex];
        setMovAttacker(`${item.name} (${item.player?.name || 'Ghost'})`);
        setMovAttackerId(item.id);
        setShowAttackerDropdown(false);
        if (movTimeInputRef.current) movTimeInputRef.current.focus();
      }
    } else if (e.key === 'Escape') {
      setShowAttackerDropdown(false);
    }
  };

  const gaps = calculateGaps();
  const worldConquestMode = (activeWorld?.worldType || 'siege').toLowerCase();

  // Find player's unadded cities for quick-chips
  const unaddedTowns = activePlayer?.townsList?.filter(
    t => !groups.some(g => g.townId === t.id || g.name.toLowerCase() === t.name.toLowerCase())
  ) || [];

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-5 gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-xs font-mono bg-primary/20 text-primary border border-primary/30 px-2.5 py-0.5 rounded-full font-bold">
              World: {activeWorld?.name || activeWorldId.toUpperCase()} ({worldConquestMode.toUpperCase()})
            </span>
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`text-xs px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 transition-colors font-medium ${
                audioEnabled 
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30' 
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              {audioEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
              {audioEnabled ? 'Audio Alerts ON' : 'Audio Muted'}
            </button>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Crosshair size={30} className="text-primary" /> Precision Midpoint Recall Sniper
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Bypass Grepolis ±10s Anti-Timing-Rule (ATR) variance by launching in advance and canceling at the exact mathematical midpoint.
          </p>
        </div>

        {/* Live Calibrated Clock */}
        <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-700/80 p-3 px-4 rounded-2xl shadow-xl shrink-0">
          <Clock size={20} className="text-primary" />
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Calibrated Server Time</div>
            <div className="text-xl font-mono font-bold text-white tracking-wider">
              {serverTime.toLocaleTimeString([], { hour12: false })}
            </div>
          </div>
          <button 
            onClick={handleSyncTime}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
            title="Calibrate against Grepolis server timestamp"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {savedOpMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm rounded-xl flex items-center gap-2 font-mono animate-fade-in">
          <CheckCircle2 size={16} /> {savedOpMsg}
        </div>
      )}

      {/* Target City Navigator & Autocomplete Add Bar */}
      <div className="glass-panel p-5 bg-slate-900/90 rounded-2xl flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* City Groups Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {groups.length === 0 ? (
              <span className="text-xs text-slate-500 italic py-1">No tracked defense cities yet. Add one to begin sniping.</span>
            ) : (
              groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => setActiveGroupId(g.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    g.id === activeGroupId 
                      ? 'bg-primary text-white shadow-lg ring-2 ring-primary/40' 
                      : 'bg-slate-950/70 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                >
                  <Building size={13} className={g.id === activeGroupId ? 'text-white' : 'text-primary'} />
                  <span>{g.name}</span>
                  <span className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full ${
                    g.id === activeGroupId ? 'bg-black/30 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {g.movements?.length || 0}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Autocomplete Add Target City Input */}
          <div className="relative w-full md:w-80">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  ref={cityInputRef}
                  type="text"
                  placeholder="Track Target City..."
                  value={newGroupName}
                  onChange={e => {
                    setNewGroupName(e.target.value);
                    setShowCityDropdown(true);
                    setCityFocusedIndex(-1);
                  }}
                  onFocus={() => {
                    if (citySearchResults.length > 0 || unaddedTowns.length > 0) {
                      setShowCityDropdown(true);
                    }
                  }}
                  onKeyDown={handleCityKeyDown}
                  className="input-field pl-9 pr-3 py-2 text-xs font-semibold"
                />
                {isSearchingCity && (
                  <RefreshCw size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary pointer-events-none" />
                )}
              </div>
              <button 
                type="button" 
                onClick={() => addCityGroup(newGroupName)}
                className="btn btn-primary text-xs py-2 px-3.5 shrink-0"
              >
                <Plus size={14} /> Add
              </button>
            </div>

            {/* City Autocomplete Dropdown */}
            {showCityDropdown && (citySearchResults.length > 0 || unaddedTowns.length > 0) && (
              <div 
                ref={cityDropdownRef}
                className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-slate-900/98 backdrop-blur-xl border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto"
              >
                {citySearchResults.length > 0 ? (
                  citySearchResults.map((town, idx) => (
                    <button
                      key={town.id || idx}
                      type="button"
                      onClick={() => addCityGroup(town.name, town.id)}
                      onMouseEnter={() => setCityFocusedIndex(idx)}
                      className={`w-full text-left p-2.5 px-3 flex items-center justify-between transition-colors border-b border-slate-800/60 last:border-0 ${
                        idx === cityFocusedIndex ? 'bg-primary/20 text-white' : 'hover:bg-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="font-bold text-xs flex items-center gap-1.5 truncate">
                          <span>{town.name}</span>
                          {town.isOwn && (
                            <span className="bg-accent/20 text-accent font-mono text-[10px] px-1.5 py-0.2 rounded font-semibold">
                              Your City
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                          {town.player?.name ? `Owner: ${town.player.name}` : 'Ghost'} • {town.points ? `${town.points.toLocaleString()} pts` : ''}
                        </div>
                      </div>
                      <span className="text-xs text-primary font-mono shrink-0">Select ↵</span>
                    </button>
                  ))
                ) : (
                  <div className="p-2.5 text-xs text-slate-400 text-center">
                    Type city name to search world...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick-add chips for player's own cities */}
        {unaddedTowns.length > 0 && (
          <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
              <Sparkles size={12} className="text-amber-400" /> Quick Add Your Cities:
            </span>
            {unaddedTowns.length <= 8 ? (
              unaddedTowns.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => addCityGroup(t.name, t.id)}
                  className="text-[11px] bg-slate-950/70 hover:bg-slate-800 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg border border-slate-800 transition-colors flex items-center gap-1 font-mono"
                >
                  <Plus size={11} className="text-primary" /> {t.name}
                </button>
              ))
            ) : (
              <>
                {unaddedTowns.slice(0, 5).map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => addCityGroup(t.name, t.id)}
                    className="text-[11px] bg-slate-950/70 hover:bg-slate-800 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg border border-slate-800 transition-colors flex items-center gap-1 font-mono"
                  >
                    <Plus size={11} className="text-primary" /> {t.name}
                  </button>
                ))}
                <div className="flex items-center gap-1 ml-1">
                  <select 
                    id="more-cities-select"
                    className="text-[11px] bg-slate-950/70 border border-slate-800 text-slate-300 rounded-lg px-2 py-1 outline-none focus:border-primary transition-colors cursor-pointer"
                  >
                    <option value="">+{unaddedTowns.length - 5} more...</option>
                    {unaddedTowns.slice(5).map(t => (
                      <option key={t.id} value={`${t.name}|${t.id}`}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const sel = document.getElementById('more-cities-select');
                      if (sel && sel.value) {
                        const [name, id] = sel.value.split('|');
                        addCityGroup(name, id);
                        sel.value = '';
                      }
                    }}
                    className="text-[11px] bg-primary hover:bg-primary-hover text-white px-2 py-1 rounded-lg font-bold transition-colors shadow"
                  >
                    Add
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {activeGroup ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* LEFT 2 COLUMNS: Incoming Movements, Detected Gaps, Active Timers */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            
            {/* 1. Incoming Movements Tracker */}
            <div className="glass-panel p-6 bg-slate-900/90 rounded-2xl">
              <div className="flex flex-wrap justify-between items-center mb-5 border-b border-slate-800 pb-4 gap-3">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Shield size={19} className="text-amber-400" /> Incoming Movements ({activeGroup.name})
                  </h2>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold border ${
                    worldConquestMode === 'revolt' 
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
                      : 'bg-primary/20 text-primary border-primary/30'
                  }`}>
                    {worldConquestMode === 'revolt' ? '⚡ REVOLT' : '🛡️ SIEGE'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => deleteGroup(activeGroup.id)}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 py-1 px-2.5 rounded-lg hover:bg-rose-500/10 transition-colors border border-rose-500/20"
                >
                  <Trash2 size={13} /> Remove City
                </button>
              </div>

              {/* Add Movement Row Form with Keyboard Support */}
              <form onSubmit={handleAddMovement} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 mb-5 bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800">
                {/* Attacker input */}
                <div className="sm:col-span-5 relative">
                  <input
                    ref={attackerInputRef}
                    type="text"
                    placeholder="Origin Town / Attacker..."
                    value={movAttacker}
                    onChange={e => {
                      setMovAttacker(e.target.value);
                      setShowAttackerDropdown(true);
                      setAttackerFocusedIndex(-1);
                    }}
                    onFocus={() => {
                      if (attackerSearchResults.length > 0) setShowAttackerDropdown(true);
                    }}
                    onKeyDown={handleAttackerKeyDown}
                    className="input-field py-2 px-3 text-xs"
                  />
                  {showAttackerDropdown && attackerSearchResults.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-slate-900/98 backdrop-blur-xl border border-slate-700/80 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                      {attackerSearchResults.map((t, idx) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setMovAttacker(`${t.name} (${t.player?.name || 'Ghost'})`);
                            setMovAttackerId(t.id);
                            setShowAttackerDropdown(false);
                            if (movTimeInputRef.current) movTimeInputRef.current.focus();
                          }}
                          onMouseEnter={() => setAttackerFocusedIndex(idx)}
                          className={`w-full text-left p-2 px-3 flex justify-between items-center text-xs transition-colors border-b border-slate-800/60 last:border-0 ${
                            idx === attackerFocusedIndex ? 'bg-primary/20 text-white' : 'hover:bg-slate-800 text-slate-200'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <div className="font-semibold text-white">{t.name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{t.player?.name || 'Ghost'} • {t.player?.alliance?.name || 'No Ally'}</div>
                          </div>
                          <span className="text-[11px] text-primary font-mono shrink-0">↵</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Movement Type */}
                <div className="sm:col-span-3">
                  <select
                    value={movType}
                    onChange={e => setMovType(e.target.value)}
                    className="input-field py-2 px-2.5 text-xs font-bold"
                  >
                    <option value="attack">⚔️ Clear Attack</option>
                    <option value="cs">🚢 Colony Ship (CS)</option>
                    <option value="support">🛡️ Support</option>
                  </select>
                </div>

                {/* Arrival Time Input */}
                <div className="sm:col-span-2">
                  <input
                    ref={movTimeInputRef}
                    type="text"
                    placeholder="HH:MM:SS"
                    value={movTime}
                    onChange={e => setMovTime(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddMovement();
                      }
                    }}
                    className="input-field py-2 px-2 text-xs font-mono text-center font-bold tracking-wider"
                    required
                  />
                </div>

                {/* Submit button */}
                <div className="sm:col-span-2">
                  <button type="submit" className="btn btn-primary text-xs py-2 w-full h-full">
                    <Plus size={14} /> Add
                  </button>
                </div>
              </form>

              {/* Movements Timeline Table */}
              {activeGroup.movements.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800/60">
                  No incoming attacks logged for this city. Add an incoming command above to start calculating snipes.
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                  {activeGroup.movements.map((mov) => {
                    const diffSecs = Math.floor((new Date(mov.arrivalTime).getTime() - serverTime.getTime()) / 1000);
                    const isPassed = diffSecs < 0;

                    return (
                      <div
                        key={mov.id}
                        className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all ${
                          mov.type === 'cs'
                            ? 'bg-rose-950/40 border-rose-500/60 shadow-lg'
                            : mov.type === 'attack'
                            ? 'bg-slate-950/70 border-slate-800'
                            : 'bg-blue-950/30 border-blue-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-1.5 rounded-lg shrink-0 ${
                            mov.type === 'cs' 
                              ? 'bg-rose-500/20 text-rose-400 font-bold' 
                              : mov.type === 'attack' 
                              ? 'bg-amber-500/20 text-amber-400 font-bold' 
                              : 'bg-blue-500/20 text-blue-400 font-bold'
                          }`}>
                            {mov.type === 'cs' ? <Crosshair size={15} /> : mov.type === 'attack' ? <Swords size={15} /> : <Shield size={15} />}
                          </div>
                          <div className="truncate">
                            <div className="font-bold text-slate-200 truncate">{mov.attacker}</div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              Arrival: <strong className="text-white">{new Date(mov.arrivalTime).toLocaleTimeString([], { hour12: false })}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`font-mono text-xs font-bold ${isPassed ? 'text-slate-500' : 'text-emerald-400'}`}>
                            {isPassed ? 'Impacted' : `in ${formatDuration(diffSecs)}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => deleteMovement(mov.id)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Detected Recall Snipe Gaps (Action Center) */}
            {gaps.length > 0 && (
              <div className="glass-panel p-6 bg-slate-900/90 rounded-2xl">
                <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Target size={19} className="text-emerald-400" /> Detected Recall Snipe Gaps ({gaps.length})
                  </h2>
                  <span className="text-xs text-slate-400 font-mono">
                    Targeting 1s {worldConquestMode === 'revolt' ? 'BEFORE CS' : 'after/before CS'}
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {gaps.map(gap => (
                    <div 
                      key={gap.id} 
                      className="p-4 bg-slate-950/70 rounded-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="font-bold text-slate-100 text-sm flex items-center gap-2">
                          <span>{gap.desc}</span>
                        </div>
                        <div className="text-xs text-emerald-400 font-mono mt-1 font-bold">
                          Target Landing Time: {new Date(gap.returnTime).toLocaleTimeString([], { hour12: false })}
                        </div>
                      </div>

                      {/* Delay Preset Buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        {[10, 5, 2, 1].map(mins => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => createPlanFromGap(gap, mins)}
                            className={`btn text-xs py-1.5 px-3 rounded-lg border font-bold ${
                              mins === 2 
                                ? 'bg-primary/20 hover:bg-primary/30 text-primary border-primary/40' 
                                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                            }`}
                          >
                            {mins}m Delay
                          </button>
                        ))}
                        
                        {/* Custom minutes input */}
                        <div className="flex items-center gap-1 ml-1">
                          <input
                            type="number"
                            min="0.5"
                            max="10"
                            step="0.5"
                            placeholder="Mins"
                            value={customMins[gap.id] || ''}
                            onChange={(e) => setCustomMins({ ...customMins, [gap.id]: e.target.value })}
                            className="input-field w-16 py-1.5 px-1.5 text-xs text-center font-mono font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const val = parseFloat(customMins[gap.id]);
                              if (val && val > 0 && val <= 10) {
                                createPlanFromGap(gap, val);
                              } else {
                                alert("Please enter a valid delay between 0.5 and 10 minutes.");
                              }
                            }}
                            className="btn text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 px-2.5 rounded-lg border border-slate-700"
                          >
                            Set
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Active Execution Timers (The Sniper Cockpit) */}
            {activeGroup.plans.length > 0 && (
              <div className="glass-panel p-6 bg-slate-900/95 rounded-2xl">
                <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Clock size={20} className="text-emerald-400" /> Active Recall Execution Timers ({activeGroup.plans.length})
                  </h2>
                  <span className="text-xs text-slate-400 font-mono">Live ATR Precision Clock</span>
                </div>

                <div className="flex flex-col gap-5">
                  {activeGroup.plans.map((plan, idx) => {
                    const sendDiff = Math.floor((new Date(plan.sendTime).getTime() - serverTime.getTime()) / 1000);
                    const recallDiff = Math.floor((new Date(plan.recallTime).getTime() - serverTime.getTime()) / 1000);

                    const isSendActive = sendDiff <= 0 && sendDiff >= -10;
                    const isSendPassed = sendDiff < -10;
                    const isRecallActive = recallDiff <= 0 && recallDiff >= -10;
                    const isRecallPassed = recallDiff < -10;

                    return (
                      <div 
                        key={plan.id} 
                        className={`p-6 rounded-2xl border transition-all ${
                          isSendActive || isRecallActive
                            ? 'bg-rose-950/50 border-rose-500 animate-pulse-glow shadow-2xl'
                            : 'bg-slate-950/80 border-slate-700/80 shadow-xl'
                        }`}
                      >
                        {/* Header of Plan */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3 mb-4">
                          <div>
                            <div className="font-extrabold text-base text-white flex items-center gap-2">
                              <span>Plan #{idx + 1}: {plan.gapDescription}</span>
                            </div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5">
                              Target Landing: <strong className="text-emerald-400">{new Date(plan.targetReturnTime).toLocaleTimeString([], { hour12: false })}</strong>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => copyPlanTimings(plan)}
                              className="btn text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 px-3 rounded-lg border border-slate-700 flex items-center gap-1.5"
                              title="Copy launch & recall timings to clipboard"
                            >
                              {copiedPlanId === plan.id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                              {copiedPlanId === plan.id ? 'Copied!' : 'Copy'}
                            </button>
                            <button
                              type="button"
                              onClick={() => savePlanToDatabase(plan)}
                              className="btn text-xs bg-primary/20 hover:bg-primary/30 text-primary py-1.5 px-3 rounded-lg border border-primary/40 flex items-center gap-1.5"
                              title="Save to Tactical Operations database"
                            >
                              <Save size={14} /> Save
                            </button>
                            <button
                              type="button"
                              onClick={() => deletePlan(plan.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors"
                              title="Delete Plan"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        {/* Step 1 & Step 2 Dual Execution Cockpit */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          
                          {/* STEP 1: SEND ATTACK */}
                          <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                            isSendActive 
                              ? 'bg-amber-950/60 border-amber-500 ring-2 ring-amber-500/50' 
                              : isSendPassed 
                              ? 'bg-slate-900/40 border-slate-800/60 opacity-60' 
                              : 'bg-slate-900/80 border-slate-800'
                          }`}>
                            <div>
                              <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                                <span>STEP 1: LAUNCH ATTACK / SUPPORT</span>
                                <span className="font-mono text-amber-400">T-0 OUTBOUND</span>
                              </div>
                              <div className="text-3xl sm:text-4xl font-mono font-black text-amber-400 tracking-wider my-2">
                                {new Date(plan.sendTime).toLocaleTimeString([], { hour12: false })}
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                              <span className={`text-xs font-mono font-bold ${
                                isSendActive ? 'text-amber-300 font-extrabold' : isSendPassed ? 'text-slate-500' : 'text-primary'
                              }`}>
                                {isSendActive ? '🚨 LAUNCH WINDOW ACTIVE (NOW!)' : isSendPassed ? 'Launched' : `Launch in ${formatDuration(sendDiff)}`}
                              </span>
                            </div>
                          </div>

                          {/* STEP 2: RECALL ATTACK */}
                          <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                            isRecallActive 
                              ? 'bg-rose-950/60 border-rose-500 ring-2 ring-rose-500/50' 
                              : isRecallPassed 
                              ? 'bg-slate-900/40 border-slate-800/60 opacity-60' 
                              : 'bg-slate-900/80 border-slate-800'
                          }`}>
                            <div>
                              <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                                <span>STEP 2: CANCEL & RECALL COMMAND</span>
                                <span className="font-mono text-rose-400">MIDPOINT CANCEL</span>
                              </div>
                              <div className="text-3xl sm:text-4xl font-mono font-black text-rose-400 tracking-wider my-2">
                                {new Date(plan.recallTime).toLocaleTimeString([], { hour12: false })}
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                              <span className={`text-xs font-mono font-bold ${
                                isRecallActive ? 'text-rose-300 font-extrabold' : isRecallPassed ? 'Recalled' : `Recall in ${formatDuration(recallDiff)}`
                              }`}>
                                {isRecallActive ? '🚨 CANCEL / RECALL COMMAND NOW!' : isRecallPassed ? 'Recalled' : `Recall in ${formatDuration(recallDiff)}`}
                              </span>
                            </div>
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

          {/* RIGHT COLUMN: Dummy Target Finder & ATR Tactical Guide */}
          <div className="flex flex-col gap-6">
            
            {/* Dummy Target Finder */}
            <DummyFinder 
              originTownId={activeGroup.townId}
              durationSeconds={600}
              worldSpeed={activeWorld?.speed || 2}
              worldId={activeWorldId}
            />

            {/* Tactical ATR Guide Card */}
            <div className="glass-panel p-5 bg-slate-900/80 rounded-2xl border border-slate-800">
              <h3 className="text-sm font-bold text-white mb-2.5 flex items-center gap-2">
                <Info size={16} className="text-primary" /> Why Midpoint Recall Works
              </h3>
              <div className="text-xs text-slate-300 leading-relaxed space-y-2">
                <p>
                  When launching standard attacks, Grepolis server applies random anti-timing rule (ATR) variance (±10s).
                </p>
                <p>
                  However, when you cancel an outbound attack, the return trip duration is calculated with <strong className="text-emerald-400">exact mathematical precision and zero ATR variance</strong>.
                </p>
                <p>
                  By recalling at the exact halfway mark, your troops will touch down at your destination city at the intended landing second.
                </p>
              </div>
            </div>

          </div>

        </div>
      ) : (
        <div className="glass-panel p-12 bg-slate-900/80 rounded-2xl text-center border border-slate-800">
          <Crosshair size={48} className="text-primary mx-auto mb-3 opacity-60" />
          <h2 className="text-xl font-bold text-white mb-1">No Defense City Selected</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-5">
            Select an existing city from the top bar or search for a town name to start calculating precision midpoint recall timings.
          </p>
        </div>
      )}
    </div>
  );
}

export default function RecallSnipePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center p-12 text-slate-400">
        <Loader2 className="animate-spin mr-2" size={24} /> Loading Recall Sniper...
      </div>
    }>
      <RecallSnipeContent />
    </Suspense>
  );
}
