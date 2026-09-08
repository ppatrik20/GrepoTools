"use client";

import React, { useState } from 'react';
import { X, Plus, Trash2, Shield, Users } from 'lucide-react';

export default function AllianceCoalitionModal({
  isOpen,
  onClose,
  coalitions = [],
  onSaveCoalitions,
  alliances = []
}) {
  const [localCoalitions, setLocalCoalitions] = useState(coalitions);
  const [newCoalitionName, setNewCoalitionName] = useState('');
  const [newCoalitionColor, setNewCoalitionColor] = useState('#10b981');
  const [selectedAlliances, setSelectedAlliances] = useState([]);

  if (!isOpen) return null;

  const handleAddCoalition = () => {
    if (!newCoalitionName.trim() || selectedAlliances.length === 0) return;

    const newEntry = {
      id: `coalition_${Date.now()}`,
      name: newCoalitionName.trim(),
      color: newCoalitionColor,
      alliances: [...selectedAlliances]
    };

    const updated = [...localCoalitions, newEntry];
    setLocalCoalitions(updated);
    setNewCoalitionName('');
    setSelectedAlliances([]);
    if (onSaveCoalitions) onSaveCoalitions(updated);
  };

  const handleDeleteCoalition = (id) => {
    const updated = localCoalitions.filter(c => c.id !== id);
    setLocalCoalitions(updated);
    if (onSaveCoalitions) onSaveCoalitions(updated);
  };

  const toggleAllianceSelection = (allyName) => {
    setSelectedAlliances(prev => 
      prev.includes(allyName) ? prev.filter(a => a !== allyName) : [...prev, allyName]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="glass-panel w-full max-w-xl p-6 rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl flex flex-col gap-5 max-h-[85vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Shield size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">Alliance Families & Coalitions</h2>
              <p className="text-xs text-slate-400">Group main & sister/academy alliances so their islands merge as 100% Clean</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Existing Coalitions List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Coalitions ({localCoalitions.length})</h3>
          
          {localCoalitions.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
              No coalitions configured yet. Add your first alliance family below to merge sister alliances into clean territories!
            </div>
          ) : (
            localCoalitions.map(c => (
              <div key={c.id} className="p-3.5 rounded-xl border border-slate-800/80 bg-slate-950/60 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div 
                    className="w-4 h-4 rounded-full shrink-0 shadow" 
                    style={{ backgroundColor: c.color }} 
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">{c.name}</div>
                    <div className="text-xs text-slate-400 flex flex-wrap gap-1 mt-0.5">
                      {c.alliances.map(a => (
                        <span key={a} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteCoalition(c.id)}
                  className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors shrink-0"
                  title="Delete Coalition"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Create New Coalition Form */}
        <div className="pt-4 border-t border-slate-800 flex flex-col gap-3">
          <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
            <Plus size={14} /> Create Coalition / Family
          </h3>
          
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="e.g. Sion Family, WANTED Coalition..."
              value={newCoalitionName}
              onChange={e => setNewCoalitionName(e.target.value)}
              className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-700/80 text-white placeholder-slate-500 focus:outline-none focus:border-primary"
            />
            <input
              type="color"
              value={newCoalitionColor}
              onChange={e => setNewCoalitionColor(e.target.value)}
              className="w-9 h-9 rounded-xl border border-slate-700 bg-transparent cursor-pointer p-0.5"
              title="Coalition Color"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 font-medium mb-1.5 block">
              Select Member Alliances (Click to add):
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 rounded-xl bg-slate-950/80 border border-slate-800">
              {alliances.map(a => {
                const aName = a.name || a;
                const isSelected = selectedAlliances.includes(aName);
                return (
                  <button
                    key={aName}
                    type="button"
                    onClick={() => toggleAllianceSelection(aName)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                      isSelected 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm' 
                        : 'bg-slate-800/60 text-slate-400 hover:text-white border border-transparent'
                    }`}
                  >
                    {aName} {isSelected && '✓'}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleAddCoalition}
            disabled={!newCoalitionName.trim() || selectedAlliances.length === 0}
            className="w-full py-2.5 rounded-xl font-bold text-xs bg-primary hover:bg-primary/90 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-1.5"
          >
            <Users size={14} /> Add Coalition & Merge Island Sovereignty
          </button>
        </div>

      </div>
    </div>
  );
}
