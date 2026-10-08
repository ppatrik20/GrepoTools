'use client';
import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Crosshair, Plus, Trash2, Clock, Swords, Shield, RefreshCw, ArrowRight, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import SnipeQueueItem from '@/components/SnipeQueueItem';
import { 
  planAttackOperation, 
  resolveOperationTargeting 
} from '@/lib/operations/OperationPlanner';
import { LocalOperationsAdapter } from '@/lib/operations/OperationsStorage';

function SnipeTimerContent() {
  const { activeWorldId, activeWorld } = useApp();
  const searchParams = useSearchParams();
  const targetTownId = searchParams.get('targetTownId');
  const originTownId = searchParams.get('originTownId');

  const [targetTime, setTargetTime] = useState('');
  const [travelTime, setTravelTime] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState('attack');
  const [serverOffset, setServerOffset] = useState(0);
  
  const [queue, setQueue] = useState([]);

  // Ingest query parameters from Route Planner (/snipe?targetTownId=...&originTownId=...)
  useEffect(() => {
    if (!targetTownId && !originTownId) return;

    async function ingestParams() {
      try {
        const worldParam = activeWorldId || 'hu119';
        let originPayload = null;
        let targetPayload = null;

        if (originTownId) {
          const res = await fetch(`/api/world/town/${originTownId}?world=${worldParam}`);
          if (res.ok) originPayload = await res.json();
        }
        if (targetTownId) {
          const res = await fetch(`/api/world/town/${targetTownId}?world=${worldParam}`);
          if (res.ok) targetPayload = await res.json();
        }

        const targeting = resolveOperationTargeting({
          originPayload,
          targetPayload,
          activeWorld
        });

        if (targeting.label) setLabel(targeting.label);
        if (targeting.travelTime) setTravelTime(targeting.travelTime);
        if (targeting.type) setType(targeting.type);
      } catch (err) {
        console.error("Failed to ingest snipe query params:", err);
      }
    }

    ingestParams();
  }, [targetTownId, originTownId, activeWorldId, activeWorld]);

  // Load from local storage for active world
  useEffect(() => {
    if (!activeWorldId) return;
    setQueue(LocalOperationsAdapter.getQueue(activeWorldId));
  }, [activeWorldId]);

  // Save to local storage
  useEffect(() => {
    if (!activeWorldId) return;
    LocalOperationsAdapter.setQueue(activeWorldId, queue);
  }, [queue, activeWorldId]);

  const addToQueue = (e) => {
    e.preventDefault();
    if (!targetTime || !travelTime) return;

    const newOp = planAttackOperation({
      targetLandingTime: targetTime,
      travelTime,
      label,
      type
    });

    setQueue([...queue, newOp].sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime()));
    
    setLabel('');
    setTargetTime('');
    setTravelTime('');
  };

  const removeOp = (id) => {
    setQueue(queue.filter(op => op.id !== id));
  };

  const clearQueue = () => {
    setQueue([]);
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-5 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded">
              World: {activeWorld?.name || activeWorldId?.toUpperCase()}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            <Crosshair size={28} className="text-primary" /> Operations Launch Queue
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Track outbound attack and support launch windows with real-time ±10s ATR indicators.
          </p>
        </div>

        <Link href="/snipe/recall" className="btn btn-primary text-xs">
          Open Midpoint Recall Sniper →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Add Operation Form */}
        <div className="glass-panel p-6 bg-slate-900/90 rounded-2xl">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Plus size={18} className="text-primary" /> Schedule Operation
          </h2>
          <form onSubmit={addToQueue} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Operation Label</label>
              <input 
                type="text" 
                placeholder="e.g. CS Nuke to Island 44"
                className="input-field" 
                value={label}
                onChange={e => setLabel(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Target Landing Time</label>
                <input 
                  type="text" 
                  placeholder="HH:MM:SS"
                  className="input-field font-mono text-center" 
                  value={targetTime}
                  onChange={e => setTargetTime(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Travel Duration</label>
                <input 
                  type="text" 
                  placeholder="HH:MM:SS"
                  className="input-field font-mono text-center" 
                  value={travelTime}
                  onChange={e => setTravelTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Movement Type</label>
              <select 
                className="input-field font-semibold"
                value={type}
                onChange={e => setType(e.target.value)}
              >
                <option value="attack">Attack (Offensive)</option>
                <option value="support">Support (Defensive)</option>
                <option value="cs">Colony Ship (CS)</option>
              </select>
            </div>

            <button type="submit" className="btn btn-primary text-xs py-2 mt-2">
              <Plus size={15} /> Add to Queue
            </button>
          </form>
        </div>

        {/* Queue List */}
        <div className="glass-panel p-6 bg-slate-900/90 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Clock size={18} className="text-accent" /> Active Launch Queue ({queue.length})
              </h2>
              {queue.length > 0 && (
                <button onClick={clearQueue} className="text-xs text-rose-400 hover:underline">
                  Clear All
                </button>
              )}
            </div>

            {queue.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                No active operations scheduled.
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1">
                {queue.map(op => (
                  <SnipeQueueItem 
                    key={op.id}
                    op={op}
                    onRemove={removeOp}
                    serverOffset={serverOffset}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default function SnipeTimerPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center p-12 text-slate-400">
        <Loader2 className="animate-spin mr-2" size={24} /> Loading Operations Queue...
      </div>
    }>
      <SnipeTimerContent />
    </Suspense>
  );
}
