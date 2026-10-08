"use client";

import React, { useState, useEffect } from 'react';
import { 
  X, Pin, Trash2, Target, Shield, Swords, 
  ExternalLink, Navigation, Check, AlertTriangle, Clock
} from 'lucide-react';
import { 
  PIN_TYPES, 
  PIN_PRIORITIES, 
  saveTacticalPin, 
  removeTacticalPin, 
  exportPinToSniper, 
  exportPinToPlanner 
} from '@/lib/map/tacticalPins';
import { Modal, Button, Badge } from '@/components/ui';

export default function TacticalPinModal({
  isOpen,
  onClose,
  town,
  existingPin,
  worldId,
  onPinSaved,
  onPinDeleted,
  onExportToPlanner
}) {
  const [pinType, setPinType] = useState('PRIMARY_TARGET');
  const [priority, setPriority] = useState('NORMAL');
  const [notes, setNotes] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (existingPin) {
      setPinType(existingPin.type || 'PRIMARY_TARGET');
      setPriority(existingPin.priority || 'NORMAL');
      setNotes(existingPin.notes || '');
    } else {
      setPinType('PRIMARY_TARGET');
      setPriority('NORMAL');
      setNotes('');
    }
    setSavedSuccess(false);
  }, [existingPin, isOpen, town]);

  const timeoutRef = React.useRef(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!isOpen || !town) return null;

  const townName = town.name || `Town #${town.id}`;
  const townX = town.islandX ?? town.x ?? 500;
  const townY = town.islandY ?? town.y ?? 500;

  const handleSave = () => {
    const pinPayload = {
      id: existingPin?.id,
      townId: town.id,
      townName,
      townX,
      townY,
      type: pinType,
      priority,
      notes
    };

    const updatedPins = saveTacticalPin(worldId, pinPayload);
    setSavedSuccess(true);
    if (onPinSaved) onPinSaved(pinPayload, updatedPins);
    timeoutRef.current = setTimeout(() => {
      if (onClose) onClose();
    }, 600);
  };

  const handleDelete = () => {
    if (existingPin?.id) {
      removeTacticalPin(worldId, existingPin.id);
      if (onPinDeleted) onPinDeleted(existingPin.id);
      if (onClose) onClose();
    }
  };

  const currentPinDraft = {
    id: existingPin?.id,
    townId: town.id,
    townName,
    townX,
    townY,
    type: pinType,
    priority,
    notes
  };

  const sniperUrl = exportPinToSniper(currentPinDraft);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={townName}
      subtitle={`Coordinates: (${townX}, ${townY}) • Ocean ${Math.floor(townX / 100)}${Math.floor(townY / 100)}`}
      icon={Pin}
    >
      <div className="flex flex-col gap-4 text-white">
        {/* Operation Pin Type Selection */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Target size={13} className="text-primary" /> Operation Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(PIN_TYPES).map(([typeKey, meta]) => {
              const isSelected = pinType === typeKey;
              return (
                <button
                  key={typeKey}
                  type="button"
                  onClick={() => setPinType(typeKey)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all text-left ${
                    isSelected
                      ? 'bg-primary/20 border-primary text-white shadow-md'
                      : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-base">{meta.icon}</span>
                  <span className="truncate">{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Priority Level */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-amber-400" /> Priority Tier
          </label>
          <div className="flex gap-2">
            {Object.entries(PIN_PRIORITIES).map(([pKey, meta]) => {
              const isSelected = priority === pKey;
              return (
                <button
                  key={pKey}
                  type="button"
                  onClick={() => setPriority(pKey)}
                  className={`flex-1 py-1.5 px-2 rounded-lg border text-xs font-bold transition-all text-center ${
                    isSelected
                      ? `${meta.badge} border-current shadow`
                      : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Operation Notes */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <label className="font-semibold text-slate-300 uppercase tracking-wider">
              Operation Notes
            </label>
            <span className="text-[10px] text-slate-500 font-mono">
              {notes.length}/500
            </span>
          </div>
          <textarea
            rows={3}
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add alliance orders, landing seconds, CS escort composition, or defense stacking instructions..."
            className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary transition-colors resize-none"
          />
        </div>

        {/* One-Click Export Actions */}
        <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-2">
          <div className="text-[11px] text-slate-400">
            Export Target:
          </div>
          <div className="flex items-center gap-2">
            <a
              href={sniperUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-xs font-medium transition-colors"
            >
              <ExternalLink size={12} /> Sniper (/snipe)
            </a>
            <button
              type="button"
              onClick={() => {
                const planTarget = exportPinToPlanner(currentPinDraft);
                if (onExportToPlanner) onExportToPlanner(planTarget);
                if (onClose) onClose();
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-medium transition-colors"
            >
              <Navigation size={12} /> Route Planner
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          {existingPin ? (
            <Button
              variant="danger"
              size="xs"
              onClick={handleDelete}
              icon={Trash2}
            >
              Remove Pin
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              icon={savedSuccess ? Check : Pin}
            >
              {savedSuccess ? 'Saved!' : existingPin ? 'Update Pin' : 'Drop Pin'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
