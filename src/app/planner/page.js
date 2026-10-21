'use client';
import React, { useState, useEffect, useMemo } from 'react';
import CityManagerCard from '@/components/CommandCenter/CityManagerCard';
import { useApp } from '@/context/AppContext';
import {
  Shield,
  Swords,
  Anchor,
  Users,
  AlertTriangle,
  User,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  StatCard,
  Badge,
  Button,
  EmptyState,
} from '@/components/ui';
import {
  SPECIALIZATION_PRESETS,
  DEFAULT_DEMOLITION_TARGETS,
  DEFAULT_GREPOLIS_UNITS,
  classifyTroopCategory,
  applyPresetToUnits,
  compileCityPlan,
  TownPlannerAdapter,
} from '@/lib/planner/CityPlannerEngine';

const TROOP_TABS = [
  { id: 'ALL', label: 'All Forces' },
  { id: 'NAVAL', label: 'Naval Fleets' },
  { id: 'LAND', label: 'Land Forces' },
  { id: 'MYTHIC', label: 'Mythological' },
];

export default function PlannerPage() {
  const { activeWorldId, activeWorld, activePlayer } = useApp();
  const [units, setUnits] = useState([]);
  const [counts, setCounts] = useState({});
  const [activeCategoryTab, setActiveCategoryTab] = useState('ALL');
  const [loadingUnits, setLoadingUnits] = useState(true);

  const [towns, setTowns] = useState([]);
  const [selectedTownId, setSelectedTownId] = useState('');
  const [loadingTowns, setLoadingTowns] = useState(true);
  const [demolitionTargets, setDemolitionTargets] = useState(() => ({
    ...DEFAULT_DEMOLITION_TARGETS,
  }));

  useEffect(() => {
    let active = true;
    setLoadingUnits(true);
    TownPlannerAdapter.fetchTroopCatalog()
      .then((catalog) => {
        if (!active) return;
        setUnits(catalog.length > 0 ? catalog : [...DEFAULT_GREPOLIS_UNITS]);
        setLoadingUnits(false);
      })
      .catch((err) => {
        console.error(err);
        if (!active) return;
        setUnits([...DEFAULT_GREPOLIS_UNITS]);
        setLoadingUnits(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeWorldId || !activePlayer?.id) {
      setTowns([]);
      setLoadingTowns(false);
      return;
    }

    let active = true;
    setLoadingTowns(true);
    TownPlannerAdapter.fetchTownRoster({
      worldId: activeWorldId,
      playerId: activePlayer.id,
    })
      .then((roster) => {
        if (!active) return;
        setTowns(roster);
        if (roster.length > 0) {
          setSelectedTownId(roster[0].id.toString());
        } else {
          setSelectedTownId('');
        }
        setLoadingTowns(false);
      })
      .catch((err) => {
        console.error(err);
        if (!active) return;
        setTowns([]);
        setLoadingTowns(false);
      });

    return () => {
      active = false;
    };
  }, [activeWorldId, activePlayer?.id]);

  const handleCountChange = (unitId, val) => {
    const num = parseInt(val, 10);
    setCounts((prev) => ({
      ...prev,
      [unitId]: isNaN(num) || num < 0 ? 0 : num,
    }));
  };

  const applyPreset = (presetKey) => {
    const preset = SPECIALIZATION_PRESETS[presetKey];
    if (!preset) return;
    const nextCounts = applyPresetToUnits(presetKey, units);
    setCounts(nextCounts);
    if (preset.buildingTargets) {
      setDemolitionTargets((prev) => ({
        ...prev,
        ...preset.buildingTargets,
      }));
    }
  };

  const selectedTown = useMemo(
    () => towns.find((t) => t.id.toString() === selectedTownId),
    [towns, selectedTownId]
  );

  const handleTownChange = (updatedTown) => {
    if (!updatedTown?.id) return;
    setTowns((prev) =>
      prev.map((t) => (t.id === updatedTown.id ? { ...t, ...updatedTown } : t))
    );
  };

  const plan = useMemo(
    () =>
      compileCityPlan({
        town: selectedTown || { farmLevel: 40 },
        buildingTargets: demolitionTargets,
        troopCounts: counts,
        units,
        bunksResearched: selectedTown?.bunksResearched ?? true,
        plowResearched: selectedTown?.plowResearched ?? false,
        hasThermalBaths: selectedTown?.hasThermalBaths ?? false,
      }),
    [selectedTown, demolitionTargets, counts, units]
  );

  const filteredUnits = useMemo(() => {
    if (activeCategoryTab === 'ALL') return units;
    return units.filter(
      (unit) => classifyTroopCategory(unit) === activeCategoryTab
    );
  }, [units, activeCategoryTab]);

  const headerBadges = [
    {
      text: `World: ${activeWorld?.name || activeWorldId?.toUpperCase()}`,
      variant: 'primary',
      mono: true,
    },
    ...(activePlayer
      ? [
          {
            text: `Player: ${activePlayer.name}`,
            variant: 'accent',
            mono: true,
            dot: true,
          },
        ]
      : []),
  ];

  const {
    maxPopulation,
    effectiveBuildingPopulation,
    demolitionSavedPopulation,
    armyPopulation,
    freePopulation,
    combatStats,
    transportSummary,
  } = plan;

  return (
    <div className="flex flex-col gap-6 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Standardized Hero Header Banner */}
      <PageHeader
        title="City Specialization & Army Planner"
        subtitle="Simulate building demolitions, maximize free farm population, and validate naval transport capacity."
        icon={Shield}
        badges={headerBadges}
      />

      {loadingTowns ? (
        <Card className="text-center py-12">
          <p className="text-slate-400 text-sm animate-pulse">
            Loading Empire Towns...
          </p>
        </Card>
      ) : towns.length > 0 ? (
        <>
          {/* Town Selector Card */}
          <Card className="p-4 bg-slate-900/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label
                htmlFor="planner-town-select"
                className="text-sm font-semibold text-slate-300"
              >
                Select City:
              </label>
              <select
                id="planner-town-select"
                className="input-field max-w-xs font-semibold text-indigo-400 cursor-pointer"
                value={selectedTownId}
                onChange={(e) => setSelectedTownId(e.target.value)}
              >
                {towns.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.points?.toLocaleString()} pts • #{t.islandSlot})
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs text-slate-400 font-mono">
              Total Empire Cities:{' '}
              <strong className="text-white">{towns.length}</strong>
            </div>
          </Card>

          {/* City Manager & Demolition Simulator */}
          {selectedTown && (
            <CityManagerCard
              key={selectedTown.id}
              townId={selectedTown.id}
              worldId={activeWorldId}
              initialData={selectedTown}
              demolitionTargets={demolitionTargets}
              onTownChange={handleTownChange}
              onDemolitionTargetsChange={setDemolitionTargets}
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
                {Object.entries(SPECIALIZATION_PRESETS).map(([key, p]) => (
                  <Button
                    key={key}
                    size="xs"
                    variant="secondary"
                    onClick={() => applyPreset(key)}
                    title={p.desc}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </CardHeader>

            <CardContent>
              {/* Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                <StatCard
                  label="Free Farm Pop"
                  value={`${freePopulation} / ${maxPopulation}`}
                  variant={freePopulation < 0 ? 'amber' : 'emerald'}
                  icon={Users}
                />
                <StatCard
                  label="Buildings / Army Pop"
                  value={`${effectiveBuildingPopulation} / ${armyPopulation}`}
                  variant="default"
                />
                <StatCard
                  label="Total Attack Power"
                  value={combatStats.totalAttack.toLocaleString()}
                  variant="amber"
                  icon={Swords}
                />
                <StatCard
                  label="Naval / Transport Cap"
                  value={`${transportSummary.transportCapacity} / ${transportSummary.landTroopPopulation}`}
                  variant={transportSummary.isSufficient ? 'emerald' : 'amber'}
                  icon={Anchor}
                />
                <StatCard
                  label="Def (H / P / D)"
                  value={`${combatStats.totalDefHack}/${combatStats.totalDefPierce}/${combatStats.totalDefDistance}`}
                  variant="primary"
                  icon={Shield}
                />
              </div>

              {demolitionSavedPopulation > 0 && (
                <div className="mb-4 text-xs text-emerald-300 font-mono bg-emerald-950/30 border border-emerald-800/50 rounded-xl px-3.5 py-2">
                  Demolition Reclaim Active: +{demolitionSavedPopulation} farm population reclaimed from building targets.
                </div>
              )}

              {/* Transport Warning Banner */}
              {transportSummary.landTroopPopulation > 0 &&
                !transportSummary.isSufficient && (
                  <div className="mb-6 p-4 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle
                        size={16}
                        className="text-red-400 shrink-0"
                      />
                      <span>
                        <strong>Transport Deficit:</strong> You have{' '}
                        {transportSummary.landTroopPopulation} land troop
                        population, but only{' '}
                        {transportSummary.transportCapacity} transport capacity
                        ({transportSummary.transportDeficit} unembarked).
                      </span>
                    </div>
                    <div className="font-mono text-white shrink-0">
                      Need +<strong>{transportSummary.fastTransportsNeeded}</strong>{' '}
                      FTS (or +<strong>{transportSummary.slowTransportsNeeded}</strong>{' '}
                      TS)
                    </div>
                  </div>
                )}

              {/* Filterable Troop Category Tabs */}
              <div
                className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800"
                role="tablist"
                aria-label="Troop Categories"
              >
                <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  {TROOP_TABS.map((tab) => {
                    const isActive = activeCategoryTab === tab.id;
                    return (
                      <Button
                        key={tab.id}
                        size="xs"
                        role="tab"
                        aria-selected={isActive}
                        variant={isActive ? 'primary' : 'ghost'}
                        onClick={() => setActiveCategoryTab(tab.id)}
                      >
                        {tab.label}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setCounts({})}
                >
                  Clear Army
                </Button>
              </div>

              {/* Unit Inputs Grid */}
              {loadingUnits ? (
                <div className="text-center py-6 text-xs text-slate-400 animate-pulse">
                  Loading troop catalog...
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {filteredUnits.map((unit) => {
                    const count = counts[unit.id] || 0;
                    const inputId = `unit-input-${unit.id}`;
                    const category = classifyTroopCategory(unit);
                    const defHack = unit.def_hack ?? unit.defHack ?? 0;
                    const defPierce = unit.def_pierce ?? unit.defPierce ?? 0;
                    const defDist = unit.def_distance ?? unit.defDistance ?? 0;

                    return (
                      <div
                        key={unit.id}
                        className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between gap-2"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <label
                              htmlFor={inputId}
                              className="text-xs font-bold text-slate-200 truncate cursor-pointer"
                              title={unit.name}
                            >
                              {unit.name}
                            </label>
                            <Badge
                              size="sm"
                              variant={
                                category === 'NAVAL'
                                  ? 'primary'
                                  : category === 'MYTHIC'
                                  ? 'accent'
                                  : 'neutral'
                              }
                            >
                              {category}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono flex flex-wrap gap-1.5">
                            <span>Pop: {unit.population}</span>
                            <span className="text-amber-400">
                              Att: {unit.attack || 0}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Def: {defHack}/{defPierce}/{defDist}
                          </div>
                        </div>

                        <input
                          id={inputId}
                          type="number"
                          min="0"
                          value={count === 0 ? '' : count}
                          placeholder="0"
                          onChange={(e) =>
                            handleCountChange(unit.id, e.target.value)
                          }
                          className="input-field text-center font-mono font-bold text-sm bg-slate-900 py-1"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <EmptyState
          icon={User}
          title="No Towns Found"
          description={`No towns found for active player in world ${
            activeWorldId?.toUpperCase() || ''
          }. Make sure world data is synchronized or select an active player with towns.`}
        />
      )}
    </div>
  );
}
