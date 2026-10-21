'use client';
import React, { useState, useEffect } from 'react';
import { Hammer } from 'lucide-react';
import {
  BUILDING_POPULATION_TABLE,
  DEFAULT_DEMOLITION_TARGETS,
  getBuildingPopulation,
  simulateDemolitionReclaim,
} from '@/lib/planner/CityPlannerEngine';

export { getBuildingPopulation };

const SIMULATABLE_BUILDINGS = Object.keys(BUILDING_POPULATION_TABLE).filter(
  (bId) => bId !== 'farm'
);

export default function DemolitionSimulator({
  currentLevels,
  targetLevels,
  onTargetsChange,
}) {
  const [targets, setTargets] = useState(
    () => targetLevels || { ...DEFAULT_DEMOLITION_TARGETS }
  );

  useEffect(() => {
    if (targetLevels) {
      setTargets(targetLevels);
    }
  }, [targetLevels]);

  const handleTargetChange = (buildingId, rawValue) => {
    const nextValue = Math.max(0, parseInt(rawValue, 10) || 0);
    const nextTargets = {
      ...targets,
      [buildingId]: nextValue,
    };
    setTargets(nextTargets);
    if (typeof onTargetsChange === 'function') {
      onTargetsChange(nextTargets);
    }
  };

  const reclaim = simulateDemolitionReclaim({
    currentBuildings: currentLevels || {},
    targetBuildings: targets,
  });

  return (
    <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md">
      <div className="flex items-center gap-2 mb-4">
        <Hammer size={18} className="text-primary" />
        <h3 className="text-lg font-bold text-white tracking-tight">
          Building Demolition Simulator
        </h3>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Simulate target levels to calculate reclaimable farm population for extra combat units.
      </p>

      <div className="grid grid-cols-2 gap-2.5 text-xs mb-5">
        {SIMULATABLE_BUILDINGS.map((bId) => {
          const inputId = `demolition-target-${bId}`;
          return (
            <div
              key={bId}
              className="flex justify-between items-center bg-slate-950/60 p-2 px-3 rounded-xl border border-slate-800"
            >
              <label
                htmlFor={inputId}
                className="capitalize font-medium text-slate-300 cursor-pointer"
              >
                {bId}:
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-mono text-[11px]">
                  Cur: {currentLevels?.[bId] || 0}
                </span>
                <input
                  id={inputId}
                  type="number"
                  min="0"
                  max="45"
                  value={targets[bId] ?? 0}
                  onChange={(e) => handleTargetChange(bId, e.target.value)}
                  className="input-field w-12 py-0.5 px-1 text-center font-mono text-xs font-bold"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 text-center">
        <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
          Population Reclaimed
        </div>
        <div className="text-3xl font-mono text-emerald-400 font-bold mt-1">
          +{reclaim.populationSaved}
        </div>
        <div className="text-xs text-slate-300 mt-2">
          Equivalent to:{' '}
          <span className="text-amber-400 font-bold">
            +{reclaim.lightShipsEquivalent} Light Ships
          </span>
          {' • '}
          <span className="text-sky-400 font-bold">
            +{reclaim.biremesEquivalent} Biremes
          </span>
          {' • '}
          <span className="text-primary font-bold">
            +{reclaim.slingersEquivalent} Slingers
          </span>
        </div>
      </div>
    </div>
  );
}
