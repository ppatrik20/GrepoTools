'use client';
import React, { useState } from 'react';
import { Target, Search, Clock, AlertCircle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatDuration } from '@/lib/operations/OperationPlanner';

export default function DummyFinder({ originTownId, durationSeconds, worldSpeed = 2, worldId }) {
  const { activeWorldId } = useApp();
  const effectiveWorldId = worldId || activeWorldId || 'hu119';
  const [unitSpeed, setUnitSpeed] = useState(13); // Default light ship speed
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!originTownId) {
      setError('Origin town ID is required (select a valid town for your group).');
      return;
    }
    if (!durationSeconds || durationSeconds <= 0) {
      setError('Duration must be greater than 0.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/snipe/dummy-targets?world=${encodeURIComponent(effectiveWorldId)}&origin_id=${originTownId}&duration=${durationSeconds}&unit_speed=${unitSpeed}&world_speed=${worldSpeed}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch dummy targets');
      
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/90">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
          <Target size={15} className="text-primary" /> Dummy Target Finder
        </h3>
        <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">Min: {durationSeconds}s</span>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        Find a ghost town or neutral target far enough away to execute your {Math.ceil(durationSeconds / 60)} min recall timer.
      </p>
      
      <div className="flex flex-wrap items-end gap-2.5 mb-3">
        <div>
          <label className="text-[11px] font-semibold text-slate-400 block mb-1">Unit Speed</label>
          <input 
            type="number" 
            className="input-field py-1 px-2 w-20 text-center font-mono text-xs font-bold"
            value={unitSpeed}
            onChange={(e) => setUnitSpeed(parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-400 block mb-1">World Speed</label>
          <input 
            type="number" 
            step="0.5"
            className="input-field py-1 px-2 w-20 text-center font-mono text-xs font-bold opacity-75"
            value={worldSpeed}
            disabled
          />
        </div>
        <button 
          onClick={handleSearch}
          disabled={loading}
          className="btn btn-primary text-xs py-1.5 px-3.5 h-[34px]"
        >
          <Search size={13} /> {loading ? 'Searching...' : 'Find Safe Targets'}
        </button>
      </div>

      {error && (
        <div className="p-2.5 mb-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-lg flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
          {results.map((target) => (
            <div 
              key={target.id} 
              className="flex justify-between items-center bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-xs hover:border-slate-700"
            >
              <div>
                <span className="font-bold text-slate-200">{target.name}</span>
                <span className="text-slate-400 font-mono ml-2">
                  ({target.islandX}, {target.islandY}) • {target.playerName}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <Clock size={12} />
                <span>{formatDuration(target.travelTime)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
