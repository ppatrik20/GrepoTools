"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Shield, 
  Users, 
  Edit3, 
  Check, 
  Search, 
  Loader2, 
  Palette, 
  Info,
  Castle,
  Award
} from 'lucide-react';

const PRESET_COLORS = [
  { name: 'Emerald', value: '#10b981' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Electric Blue', value: '#3b82f6' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Crimson', value: '#ef4444' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Lime', value: '#84cc16' },
  { name: 'Fuchsia', value: '#d946ef' },
];

export default function AllianceCoalitionModal({
  isOpen,
  onClose,
  coalitions = [],
  onSaveCoalitions,
  alliances: initialAlliances = [],
  worldId = 'hu119'
}) {
  const [localCoalitions, setLocalCoalitions] = useState(coalitions || []);
  const [allWorldAlliances, setAllWorldAlliances] = useState(initialAlliances || []);
  const [isLoadingAlliances, setIsLoadingAlliances] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Form State
  const [editingId, setEditingId] = useState(null);
  const [coalitionName, setCoalitionName] = useState('');
  const [coalitionColor, setCoalitionColor] = useState('#10b981');
  const [selectedAllianceNames, setSelectedAllianceNames] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Keep localCoalitions in sync with incoming prop
  useEffect(() => {
    if (coalitions) {
      setLocalCoalitions(coalitions);
    }
  }, [coalitions]);

  // Fetch full world alliances if list is small or empty
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function fetchAllAlliances() {
      if (allWorldAlliances.length > 20) return; // Already have full list
      setIsLoadingAlliances(true);
      try {
        const res = await fetch(`/api/world/alliances?world=${worldId}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success && Array.isArray(data.alliances)) {
            setAllWorldAlliances(data.alliances);
          }
        }
      } catch (err) {
        console.error("Failed to load all alliances for coalition modal:", err);
      } finally {
        if (isMounted) setIsLoadingAlliances(false);
      }
    }

    fetchAllAlliances();
    return () => { isMounted = false; };
  }, [isOpen, worldId, allWorldAlliances.length]);

  // Alliance lookup map
  const allianceMap = useMemo(() => {
    const map = new Map();
    allWorldAlliances.forEach(a => {
      if (a && a.name) {
        map.set(a.name.trim().toLowerCase(), a);
      }
    });
    return map;
  }, [allWorldAlliances]);

  // Calculate live aggregate stats for selected alliances in the form
  const formAggregateStats = useMemo(() => {
    let totalPoints = 0;
    let totalTowns = 0;
    let totalMembers = 0;

    selectedAllianceNames.forEach(name => {
      const a = allianceMap.get(name.trim().toLowerCase());
      if (a) {
        totalPoints += Number(a.points || 0);
        totalTowns += Number(a.towns || 0);
        totalMembers += Number(a.members || 0);
      }
    });

    return { totalPoints, totalTowns, totalMembers };
  }, [selectedAllianceNames, allianceMap]);

  // Filtered alliances for search
  const filteredAlliances = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return allWorldAlliances;
    }
    return allWorldAlliances.filter(a => {
      const nameMatch = (a.name || '').toLowerCase().includes(q);
      const rankMatch = String(a.rank || '').includes(q);
      return nameMatch || rankMatch;
    });
  }, [allWorldAlliances, searchQuery]);

  if (!isOpen) return null;

  // Handle start editing
  const startEditing = (coalition) => {
    setEditingId(coalition.id);
    setCoalitionName(coalition.name);
    setCoalitionColor(coalition.color || '#10b981');
    const memberNames = Array.isArray(coalition.alliances)
      ? coalition.alliances.map(m => (typeof m === 'string' ? m : m?.name)).filter(Boolean)
      : [];
    setSelectedAllianceNames(memberNames);
    setSearchQuery('');
    setSaveError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setCoalitionName('');
    setCoalitionColor('#10b981');
    setSelectedAllianceNames([]);
    setSearchQuery('');
    setSaveError(null);
  };

  const toggleAllianceSelection = (allyName) => {
    if (!allyName) return;
    setSelectedAllianceNames(prev => 
      prev.includes(allyName) ? prev.filter(a => a !== allyName) : [...prev, allyName]
    );
  };

  const removeAllianceSelection = (allyName) => {
    setSelectedAllianceNames(prev => prev.filter(a => a !== allyName));
  };

  // Submit create or edit
  const handleSaveForm = async () => {
    if (!coalitionName.trim() || selectedAllianceNames.length === 0) return;

    setIsSaving(true);
    setSaveError(null);

    // Collect alliance IDs and names
    const memberIds = [];
    const memberNames = [];
    selectedAllianceNames.forEach(name => {
      memberNames.push(name);
      const obj = allianceMap.get(name.trim().toLowerCase());
      if (obj && obj.id) {
        memberIds.push(obj.id);
      }
    });

    let updatedList;
    if (editingId) {
      updatedList = localCoalitions.map(c => {
        if (c.id === editingId) {
          return {
            ...c,
            name: coalitionName.trim(),
            color: coalitionColor,
            alliances: memberNames,
            allianceIds: memberIds
          };
        }
        return c;
      });
    } else {
      const newEntry = {
        id: `coalition_${Date.now()}`,
        name: coalitionName.trim(),
        color: coalitionColor,
        alliances: memberNames,
        allianceIds: memberIds
      };
      updatedList = [...localCoalitions, newEntry];
    }

    setLocalCoalitions(updatedList);

    try {
      if (onSaveCoalitions) {
        await onSaveCoalitions(updatedList);
      }
      cancelEditing();
    } catch (err) {
      console.error("Failed to save coalition:", err);
      setSaveError("Failed to persist changes to the database. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCoalition = async (id) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    const updated = localCoalitions.filter(c => c.id !== id);
    setLocalCoalitions(updated);
    setDeleteConfirmId(null);

    if (editingId === id) {
      cancelEditing();
    }

    try {
      if (onSaveCoalitions) {
        await onSaveCoalitions(updated);
      }
    } catch (err) {
      console.error("Failed to delete coalition:", err);
      setSaveError("Failed to delete coalition from database.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grepo-modal-backdrop animate-in fade-in duration-200">
      <div className="glass-panel w-full max-w-5xl rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Shield size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">Alliance Families & Coalitions</h2>
                <span className="px-2 py-0.5 text-[10px] font-mono uppercase rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Database Persisted
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Group main and sister/academy alliances. Their territory, maritime waters, and islands merge as 100% Clean!
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error Alert if any */}
        {saveError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <Info size={16} className="shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        {/* Modal Body - 2 Columns on Desktop */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-y-auto lg:overflow-hidden">
          
          {/* Left Column: Existing Coalitions List (5 cols) */}
          <div className="lg:col-span-5 p-5 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col gap-4 lg:overflow-y-auto bg-slate-950/30">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Users size={14} className="text-primary" /> Active Coalitions ({localCoalitions.length})
              </h3>
              {editingId && (
                <button
                  onClick={cancelEditing}
                  className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                >
                  + New Coalition
                </button>
              )}
            </div>

            {localCoalitions.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-slate-800 text-center flex flex-col items-center justify-center gap-2">
                <Shield size={32} className="text-slate-600" />
                <p className="text-xs text-slate-400 font-medium">No coalitions configured yet</p>
                <p className="text-[11px] text-slate-500 max-w-xs">
                  Use the editor on the right to group sister alliances. Once saved, their maritime boundaries and islands merge into unified friendly territories!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {localCoalitions.map(c => {
                  const isCurrentEdit = editingId === c.id;
                  const members = Array.isArray(c.alliances) ? c.alliances : [];
                  
                  // Compute stats for card
                  let cardPoints = 0;
                  let cardTowns = 0;
                  members.forEach(m => {
                    const name = typeof m === 'string' ? m : m?.name;
                    const meta = name ? allianceMap.get(name.trim().toLowerCase()) : null;
                    if (meta) {
                      cardPoints += Number(meta.points || 0);
                      cardTowns += Number(meta.towns || 0);
                    }
                  });

                  return (
                    <div 
                      key={c.id} 
                      className={`p-4 rounded-xl border transition-all ${
                        isCurrentEdit 
                          ? 'border-emerald-500/60 bg-emerald-500/10 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/30' 
                          : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div 
                            className="w-4 h-4 rounded-full shrink-0 shadow-md ring-2 ring-slate-800" 
                            style={{ backgroundColor: c.color }} 
                          />
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-white truncate flex items-center gap-2">
                              {c.name}
                              {isCurrentEdit && (
                                <span className="text-[10px] font-normal text-emerald-400 bg-emerald-500/20 px-1.5 py-0.2 rounded">
                                  Editing
                                </span>
                              )}
                            </h4>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => startEditing(c)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Edit Coalition"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteCoalition(c.id)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              deleteConfirmId === c.id
                                ? 'bg-rose-600 text-white font-bold text-[10px] px-2'
                                : 'text-rose-400 hover:text-rose-300 hover:bg-rose-950/40'
                            }`}
                            title={deleteConfirmId === c.id ? "Click again to confirm delete" : "Delete Coalition"}
                          >
                            {deleteConfirmId === c.id ? 'Confirm?' : <Trash2 size={15} />}
                          </button>
                        </div>
                      </div>

                      {/* Stats Tally */}
                      {(cardPoints > 0 || cardTowns > 0) && (
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400 font-mono">
                          <span className="flex items-center gap-1">
                            <Castle size={12} className="text-slate-500" /> {cardTowns.toLocaleString()} towns
                          </span>
                          <span>•</span>
                          <span>{cardPoints.toLocaleString()} pts</span>
                        </div>
                      )}

                      {/* Member Chips */}
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {members.map(m => {
                          const mName = typeof m === 'string' ? m : m?.name;
                          return (
                            <span 
                              key={mName} 
                              className="px-2 py-0.5 rounded-md bg-slate-800/90 border border-slate-700/60 text-slate-300 font-mono text-[11px]"
                            >
                              {mName}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Coalition Form (7 cols) */}
          <div className="lg:col-span-7 p-5 flex flex-col gap-4 lg:overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                {editingId ? <Edit3 size={15} /> : <Plus size={15} />}
                {editingId ? 'Edit Coalition & Member Alliances' : 'Create New Coalition / Family'}
              </h3>
              {editingId && (
                <button
                  onClick={cancelEditing}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800/60"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {/* Name and Color Selection */}
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1 block">
                  Coalition Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sion Family, WANTED Coalition, Greek Brotherhood..."
                  value={coalitionName}
                  onChange={e => setCoalitionName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-950 border border-slate-700/80 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors shadow-inner"
                />
              </div>

              {/* Color Presets + Custom Hex */}
              <div>
                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Palette size={13} className="text-primary" /> Coalition Banner Color
                  </span>
                  <span className="font-mono text-xs text-slate-400 uppercase">{coalitionColor}</span>
                </label>
                <div className="flex items-center flex-wrap gap-2">
                  {PRESET_COLORS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setCoalitionColor(p.value)}
                      className={`w-7 h-7 rounded-lg transition-transform flex items-center justify-center ${
                        coalitionColor.toLowerCase() === p.value.toLowerCase() 
                          ? 'scale-110 ring-2 ring-white shadow-lg' 
                          : 'hover:scale-105 opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: p.value }}
                      title={p.name}
                    >
                      {coalitionColor.toLowerCase() === p.value.toLowerCase() && (
                        <Check size={14} className="text-white drop-shadow" />
                      )}
                    </button>
                  ))}
                  
                  {/* Custom color picker */}
                  <div className="relative flex items-center ml-1">
                    <input
                      type="color"
                      value={coalitionColor}
                      onChange={e => setCoalitionColor(e.target.value)}
                      className="w-7 h-7 rounded-lg border border-slate-700 bg-transparent cursor-pointer p-0.5"
                      title="Custom Hex Color"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Alliances Chips */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                  Member Alliances ({selectedAllianceNames.length})
                </label>
                {selectedAllianceNames.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedAllianceNames([])}
                    className="text-[10px] text-slate-500 hover:text-slate-300 underline"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {selectedAllianceNames.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                  No member alliances selected yet. Search and click alliances below to add them.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-950/80 border border-slate-800 max-h-24 overflow-y-auto">
                  {selectedAllianceNames.map(name => {
                    const meta = allianceMap.get(name.trim().toLowerCase());
                    return (
                      <span 
                        key={name}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium"
                      >
                        <span>{name}</span>
                        {meta?.rank && (
                          <span className="text-[10px] text-emerald-400/70 font-mono">#{meta.rank}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAllianceSelection(name)}
                          className="text-emerald-400 hover:text-white ml-0.5"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Form Aggregate Preview */}
              {selectedAllianceNames.length > 0 && (
                <div className="mt-2 px-3 py-2 rounded-xl bg-slate-950/40 border border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Combined Strength:</span>
                  <div className="flex items-center gap-3">
                    <span className="text-white font-bold">{formAggregateStats.totalTowns.toLocaleString()} towns</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-bold">{formAggregateStats.totalPoints.toLocaleString()} pts</span>
                  </div>
                </div>
              )}
            </div>

            {/* Search & Pick from All World Alliances */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Search size={13} className="text-primary" /> Search All World Alliances ({allWorldAlliances.length})
                </label>
                {isLoadingAlliances && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" /> Loading all world alliances...
                  </span>
                )}
              </div>

              {/* Search input */}
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter by alliance name or rank..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-slate-600"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Alliances List */}
              <div className="flex-1 min-h-[160px] max-h-[220px] overflow-y-auto p-1 space-y-1 rounded-xl bg-slate-950/80 border border-slate-800">
                {filteredAlliances.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No alliances matching &ldquo;{searchQuery}&rdquo;
                  </div>
                ) : (
                  filteredAlliances.map(a => {
                    const aName = a.name;
                    const isSelected = selectedAllianceNames.includes(aName);
                    
                    // Check if already in another coalition
                    const otherCoalition = localCoalitions.find(c => 
                      c.id !== editingId && 
                      Array.isArray(c.alliances) && 
                      c.alliances.some(m => (typeof m === 'string' ? m : m?.name) === aName)
                    );

                    return (
                      <button
                        key={a.id || aName}
                        type="button"
                        onClick={() => toggleAllianceSelection(aName)}
                        className={`w-full px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-all text-left ${
                          isSelected
                            ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 shadow-sm'
                            : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-5 text-[10px] font-mono text-slate-500 text-right shrink-0">
                            #{a.rank || '-'}
                          </span>
                          <span className="font-bold truncate">{aName}</span>
                          {otherCoalition && (
                            <span 
                              className="text-[9px] px-1.5 py-0.2 rounded font-sans shrink-0 border"
                              style={{ 
                                borderColor: `${otherCoalition.color}40`, 
                                backgroundColor: `${otherCoalition.color}15`, 
                                color: otherCoalition.color 
                              }}
                            >
                              in {otherCoalition.name}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 shrink-0">
                          {a.towns !== undefined && (
                            <span className="hidden sm:inline">{Number(a.towns).toLocaleString()} towns</span>
                          )}
                          {a.points !== undefined && (
                            <span className="text-slate-300 font-semibold">{Number(a.points).toLocaleString()} pts</span>
                          )}
                          <div className={`w-4 h-4 rounded flex items-center justify-center ${
                            isSelected ? 'bg-emerald-500 text-black' : 'border border-slate-700'
                          }`}>
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-800 flex items-center gap-3">
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="px-4 py-2.5 rounded-xl font-semibold text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveForm}
                disabled={isSaving || !coalitionName.trim() || selectedAllianceNames.length === 0}
                className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Saving to Database...</span>
                  </>
                ) : (
                  <>
                    <Users size={15} />
                    <span>
                      {editingId ? 'Save Changes & Update Map' : 'Create Coalition & Merge Island Sovereignty'}
                    </span>
                  </>
                )}
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
