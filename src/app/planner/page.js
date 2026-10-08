'use client';
import React, { useState, useEffect } from 'react';
import CityManagerCard from '@/components/CommandCenter/CityManagerCard';
import { useApp } from '@/context/AppContext';
import { Shield, Swords, Anchor, Users, ArrowRight, Zap, AlertTriangle, CheckCircle2, ChevronRight, Layers, User } from 'lucide-react';
import { PageHeader, Card, CardHeader, CardTitle, CardContent, StatCard, Badge, Button, EmptyState } from '@/components/ui';

export default function PlannerPage() {
  const { activeWorldId, activeWorld, activePlayer, loadingPlayer } = useApp();
  const [units, setUnits] = useState([]);
  const [counts, setCounts] = useState({});
  const [maxPopulation, setMaxPopulation] = useState(3000);
  const [loadingUnits, setLoadingUnits] = useState(true);

  const [towns, setTowns] = useState([]);
  const [selectedTownId, setSelectedTownId] = useState('');
  const [loadingTowns, setLoadingTowns] = useState(true);

  // Specialization quick presets
  const PRESETS = {
    NO_LS: { label: 'Naval Offense (Fast Fire Ships)', desc: 'Maximizes Light Ships, Level 1 Wall, Level 0 Barracks', units: { light_ship: 280 } },
    LO_TS: { label: 'Land Offense (Slingers/Hoplites + Fast Transports)', desc: 'Heavy land nuke with fast transport capacity', units: { slinger: 1200, hoplite: 800, fast_transport: 125 } },
    ND_BIR: { label: 'Naval Defense (Bireme Wall)', desc: 'Full Bireme stack for fast port defense', units: { bireme: 320 } },
    LD_DEF: { label: 'Land Defense (Swords/Archers/Hoplites)', desc: 'Balanced defense against blunt, sharp, and distance', units: { swordsman: 900, archer: 900, hoplite: 900 } },
    MYTH_MANTICORE: { label: 'Mythic Offense (Manticore Flying Nuke)', desc: 'Flying island hopping strike force (No transports needed)', units: { manticore: 35 } }
  };

  useEffect(() => {
    // Fetch units
    fetch('/api/units')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.units)) {
          const sorted = data.units.sort((a, b) => (a.population || 0) - (b.population || 0));
          setUnits(sorted);
        }
        setLoadingUnits(false);
      })
      .catch(err => {
        console.error(err);
        setLoadingUnits(false);
      });
  }, []);

  // Fetch player towns for active world & player
  useEffect(() => {
    if (!activeWorldId || !activePlayer?.id) {
      setTowns([]);
      setLoadingTowns(false);
      return;
    }

    setLoadingTowns(true);
    fetch(`/api/towns?world=${activeWorldId}&playerId=${activePlayer.id}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setTowns(data);
          if (data.length > 0) setSelectedTownId(data[0].id.toString());
        } else {
          setTowns([]);
        }
        setLoadingTowns(false);
      })
      .catch(err => {
        console.error(err);
        setLoadingTowns(false);
      });
  }, [activeWorldId, activePlayer?.id]);

  const handleCountChange = (unitId, val) => {
    const num = parseInt(val, 10);
    setCounts(prev => ({
      ...prev,
      [unitId]: isNaN(num) || num < 0 ? 0 : num
    }));
  };

  const applyPreset = (presetKey) => {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    const newCounts = {};
    Object.entries(preset.units).forEach(([k, v]) => {
      const u = units.find(unit => unit.id.toLowerCase().includes(k) || unit.name.toLowerCase().includes(k.replace('_', ' ')));
      if (u) newCounts[u.id] = v;
    });
    setCounts(newCounts);
  };

  const selectedTown = towns.find(t => t.id.toString() === selectedTownId);

  // Army Calculations
  const usedPopulation = units.reduce((sum, u) => {
    return sum + (counts[u.id] || 0) * (u.population || 0);
  }, 0);

  const remainingPopulation = maxPopulation - usedPopulation;
  const totalAttack = units.reduce((sum, u) => sum + (counts[u.id] || 0) * (u.attack || 0), 0);
  const totalDefHack = units.reduce((sum, u) => sum + (counts[u.id] || 0) * (u.def_hack || 0), 0);
  const totalDefPierce = units.reduce((sum, u) => sum + (counts[u.id] || 0) * (u.def_pierce || 0), 0);
  const totalDefDistance = units.reduce((sum, u) => sum + (counts[u.id] || 0) * (u.def_distance || 0), 0);

  // Transport Ship Capacity Logic
  const bunksResearched = selectedTown?.bunksResearched || false;
  const TS_CAPACITY = bunksResearched ? 26 : 20;
  const FTS_CAPACITY = bunksResearched ? 16 : 10;

  const tsUnit = units.find(u => u.name.toLowerCase() === 'transport ship' || u.id === 'slow_transport');
  const ftsUnit = units.find(u => u.name.toLowerCase().includes('fast transport') || u.id === 'fast_transport');

  const tsCount = tsUnit ? (counts[tsUnit.id] || 0) : 0;
  const ftsCount = ftsUnit ? (counts[ftsUnit.id] || 0) : 0;

  const currentTransportCapacity = (tsCount * TS_CAPACITY) + (ftsCount * FTS_CAPACITY);
  
  // Calculate land troops population to see if transports are enough
  const landTroopsPopulation = units
    .filter(u => !u.is_naval && !u.flying)
    .reduce((sum, u) => sum + (counts[u.id] || 0) * (u.population || 0), 0);

  const transportDeficit = landTroopsPopulation - currentTransportCapacity;
  const requiredFTS = Math.ceil(landTroopsPopulation / FTS_CAPACITY);
  const requiredTS = Math.ceil(landTroopsPopulation / TS_CAPACITY);

  const headerBadges = [
    {
      text: `World: ${activeWorld?.name || activeWorldId?.toUpperCase()}`,
      variant: 'primary',
      mono: true,
    },
    ...(activePlayer ? [{
      text: `Player: ${activePlayer.name}`,
      variant: 'accent',
      mono: true,
      dot: true,
    }] : [])
  ];

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      {/* Standardized Hero Header Banner */}
      <PageHeader
        title="City Specialization & Army Planner"
        subtitle="Simulate building demolitions, maximize free farm population, and validate naval transport capacity."
        icon={Shield}
        badges={headerBadges}
      />

      {loadingTowns ? (
        <Card className="text-center py-12">
          <p className="text-slate-400 text-sm animate-pulse">Loading Empire Towns...</p>
        </Card>
      ) : towns.length > 0 ? (
        <>
          {/* Town Selector Card */}
          <Card className="p-4 bg-slate-900/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-slate-300">Select City:</label>
              <select 
                className="input-field max-w-xs font-semibold text-indigo-400 cursor-pointer"
                value={selectedTownId}
                onChange={e => setSelectedTownId(e.target.value)}
              >
                {towns.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.points?.toLocaleString()} pts • #{t.islandSlot})
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs text-slate-400 font-mono">
              Total Empire Cities: <strong className="text-white">{towns.length}</strong>
            </div>
          </Card>

          {/* City Manager & Demolition Simulator */}
          {selectedTown && (
            <CityManagerCard 
              key={selectedTown.id} 
              townId={selectedTown.id} 
              initialData={selectedTown} 
            />
          )}

          {/* Army & Transport Capacity Planner */}
          <Card>
            <CardHeader className="flex-col sm:flex-row items-start sm:items-center gap-3 pb-4">
              <div>
                <CardTitle icon={Swords}>
                  Troop Composition & Nuke Simulator
                </CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  Simulate ideal troop compositions and check transport ship sufficiency.
                </p>
              </div>

              {/* Specialization Quick Presets */}
              <div className="flex flex-wrap gap-2">
                {Object.entries(PRESETS).map(([key, p]) => (
                  <Button
                    key={key}
                    size="xs"
                    variant="secondary"
                    onClick={() => applyPreset(key)}
                    title={p.desc}
                  >
                    {key}
                  </Button>
                ))}
              </div>
            </CardHeader>

            <CardContent>
              {/* Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <StatCard
                  label="Used Population"
                  value={`${usedPopulation} / ${maxPopulation}`}
                  variant={remainingPopulation < 0 ? 'amber' : 'default'}
                />
                <StatCard
                  label="Total Attack Power"
                  value={totalAttack.toLocaleString()}
                  variant="amber"
                  icon={Swords}
                />
                <StatCard
                  label="Naval / Transport Cap"
                  value={`${currentTransportCapacity} / ${landTroopsPopulation}`}
                  variant={transportDeficit > 0 ? 'amber' : 'emerald'}
                  icon={Anchor}
                />
                <StatCard
                  label="Def (H / P / D)"
                  value={`${totalDefHack}/${totalDefPierce}/${totalDefDistance}`}
                  variant="primary"
                  icon={Shield}
                />
              </div>

              {/* Transport Warning Banner */}
              {landTroopsPopulation > 0 && transportDeficit > 0 && (
                <div className="mb-6 p-4 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-400 shrink-0" />
                    <span>
                      <strong>Transport Deficit:</strong> You have {landTroopsPopulation} land troop population, but only {currentTransportCapacity} transport capacity ({transportDeficit} unembarked).
                    </span>
                  </div>
                  <div className="font-mono text-white shrink-0">
                    Need ~<strong>{requiredFTS}</strong> FTS (or <strong>{requiredTS}</strong> TS)
                  </div>
                </div>
              )}

              {/* Unit Inputs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {units.map(unit => {
                  const count = counts[unit.id] || 0;
                  return (
                    <div key={unit.id} className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                      <div className="mb-2">
                        <div className="text-xs font-bold text-slate-200 truncate" title={unit.name}>
                          {unit.name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Pop: {unit.population} • Att: {unit.attack || 0}
                        </div>
                      </div>

                      <input
                        type="number"
                        min="0"
                        value={count === 0 ? '' : count}
                        placeholder="0"
                        onChange={e => handleCountChange(unit.id, e.target.value)}
                        className="input-field text-center font-mono font-bold text-sm bg-slate-900 py-1"
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <EmptyState
          icon={User}
          title="No Towns Found"
          description={`No towns found for active player in world ${activeWorldId?.toUpperCase() || ''}. Make sure world data is synchronized or select an active player with towns.`}
        />
      )}
    </div>
  );
}
