/**
 * CityPlannerEngine — Deep in-process domain module for Grepolis city specialization,
 * farm population math, building demolition reclamation, troop categorization,
 * combat stat aggregation, transport sufficiency, and town persistence adapter.
 */

export const FARM_CAPACITY_BY_LEVEL = Object.freeze({
  1: 14,
  2: 28,
  3: 44,
  4: 63,
  5: 85,
  6: 109,
  7: 135,
  8: 164,
  9: 196,
  10: 230,
  11: 268,
  12: 308,
  13: 351,
  14: 397,
  15: 446,
  16: 498,
  17: 554,
  18: 613,
  19: 675,
  20: 740,
  21: 809,
  22: 882,
  23: 958,
  24: 1038,
  25: 1121,
  26: 1209,
  27: 1300,
  28: 1395,
  29: 1494,
  30: 1597,
  31: 1704,
  32: 1815,
  33: 1930,
  34: 2049,
  35: 2173,
  36: 2300,
  37: 2432,
  38: 2568,
  39: 2709,
  40: 3200,
  41: 3272,
  42: 3344,
  43: 3416,
  44: 3488,
  45: 3560,
});

export const BUILDING_POPULATION_TABLE = Object.freeze({
  main: { id: 'main', name: 'Senate', base: 1.17, factor: 1.25, maxLevel: 25 },
  temple: { id: 'temple', name: 'Temple', base: 5.0, factor: 1.12, maxLevel: 30 },
  market: { id: 'market', name: 'Marketplace', base: 2.0, factor: 1.15, maxLevel: 30 },
  wall: { id: 'wall', name: 'City Wall', base: 2.0, factor: 1.2, maxLevel: 25 },
  barracks: { id: 'barracks', name: 'Barracks', base: 1.5, factor: 1.18, maxLevel: 30 },
  docks: { id: 'docks', name: 'Harbor', base: 2.0, factor: 1.18, maxLevel: 30 },
  lumber: { id: 'lumber', name: 'Timber Camp', base: 1.0, factor: 1.15, maxLevel: 40 },
  stoner: { id: 'stoner', name: 'Quarry', base: 1.0, factor: 1.15, maxLevel: 40 },
  ironer: { id: 'ironer', name: 'Silver Mine', base: 1.0, factor: 1.15, maxLevel: 40 },
  academy: { id: 'academy', name: 'Academy', base: 2.0, factor: 1.18, maxLevel: 36 },
  farm: { id: 'farm', name: 'Farm', base: 0, factor: 1.0, maxLevel: 45 },
});

export const DEFAULT_DEMOLITION_TARGETS = Object.freeze({
  main: 15,
  temple: 1,
  market: 10,
  wall: 0,
  barracks: 10,
  docks: 15,
  lumber: 25,
  stoner: 20,
  ironer: 25,
  academy: 30,
});

export const SPECIALIZATION_PRESETS = Object.freeze({
  LS_NUKE: {
    id: 'LS_NUKE',
    label: 'Light Ship Nuke',
    desc: 'Maximized Naval Offense (Light Ships, Level 0 Wall & Barracks)',
    category: 'NAVAL',
    isOffensive: true,
    units: { light_ship: 300 },
    buildingTargets: {
      main: 15,
      barracks: 0,
      docks: 20,
      academy: 30,
      temple: 1,
      market: 10,
      wall: 0,
      lumber: 30,
      stoner: 20,
      ironer: 25,
      farm: 45,
    },
  },
  BIR_WALL: {
    id: 'BIR_WALL',
    label: 'Bireme Wall',
    desc: 'Full Naval Defense Bireme stack for fast port defense',
    category: 'NAVAL',
    isOffensive: false,
    units: { bireme: 360 },
    buildingTargets: {
      main: 15,
      barracks: 0,
      docks: 20,
      academy: 30,
      temple: 1,
      market: 10,
      wall: 0,
      lumber: 35,
      stoner: 25,
      ironer: 20,
      farm: 45,
    },
  },
  LAND_OFF: {
    id: 'LAND_OFF',
    label: 'Land Offense Nuke',
    desc: 'Heavy Slinger & Hoplite land nuke with Fast Transport ships and Light Ship escort',
    category: 'LAND',
    isOffensive: true,
    units: { slinger: 1120, hoplite: 800, fast_transport: 120, light_ship: 30 },
    buildingTargets: {
      main: 15,
      barracks: 20,
      docks: 10,
      academy: 30,
      temple: 1,
      market: 10,
      wall: 0,
      lumber: 25,
      stoner: 25,
      ironer: 30,
      farm: 45,
    },
  },
  LAND_DEF: {
    id: 'LAND_DEF',
    label: 'Land Defense Stack',
    desc: 'Balanced Swordsman, Archer, and Hoplite defense with Fast Transports',
    category: 'LAND',
    isOffensive: false,
    units: { swordsman: 640, archer: 640, hoplite: 640, fast_transport: 120 },
    buildingTargets: {
      main: 20,
      barracks: 20,
      docks: 10,
      academy: 30,
      temple: 5,
      market: 10,
      wall: 25,
      lumber: 25,
      stoner: 30,
      ironer: 25,
      farm: 45,
    },
  },
  MANTI_NUKE: {
    id: 'MANTI_NUKE',
    label: 'Manticore Flying Nuke',
    desc: 'Flying island-hopping Manticore strike force (no transport ships needed)',
    category: 'MYTHIC',
    isOffensive: true,
    units: { manticore: 65 },
    buildingTargets: {
      main: 15,
      barracks: 5,
      docks: 1,
      academy: 30,
      temple: 25,
      market: 10,
      wall: 0,
      lumber: 25,
      stoner: 25,
      ironer: 25,
      farm: 45,
    },
  },
  GRIFF_NUKE: {
    id: 'GRIFF_NUKE',
    label: 'Griffin Flying Nuke',
    desc: 'Flying island-hopping Griffin strike force (no transport ships needed)',
    category: 'MYTHIC',
    isOffensive: true,
    units: { griffin: 80 },
    buildingTargets: {
      main: 15,
      barracks: 5,
      docks: 1,
      academy: 30,
      temple: 25,
      market: 10,
      wall: 0,
      lumber: 25,
      stoner: 25,
      ironer: 25,
      farm: 45,
    },
  },
});

const CANONICAL_UNIT_PATTERNS = [
  { key: 'fast_transport', category: 'NAVAL', isNaval: true, flying: false, patterns: ['fast_transport', 'small_transporter', 'fast transport', 'gyors szállító', 'gyors szallito'] },
  { key: 'slow_transport', category: 'NAVAL', isNaval: true, flying: false, patterns: ['slow_transport', 'big_transporter', 'transport_ship', 'transport ship', 'szállítóhajó', 'szallitohajo'] },
  { key: 'light_ship', category: 'NAVAL', isNaval: true, flying: false, patterns: ['light_ship', 'attack_ship', 'light ship', 'jelzőhajó', 'jelzohajo', 'tűzhajó', 'tuzhajo'] },
  { key: 'bireme', category: 'NAVAL', isNaval: true, flying: false, patterns: ['bireme', 'biréma', 'birema'] },
  { key: 'trireme', category: 'NAVAL', isNaval: true, flying: false, patterns: ['trireme', 'triréma', 'trirema'] },
  { key: 'fire_ship', category: 'NAVAL', isNaval: true, flying: false, patterns: ['fire_ship', 'demolition_ship', 'fire ship', 'demolition ship', 'gyújtóhajó', 'gyujtohajo'] },
  { key: 'colony_ship', category: 'NAVAL', isNaval: true, flying: false, patterns: ['colony_ship', 'colonize_ship', 'colony ship', 'gyarmatosító', 'gyarmatosito'] },
  { key: 'manticore', category: 'MYTHIC', isNaval: false, flying: true, patterns: ['manticore', 'mantikór', 'mantikor'] },
  { key: 'griffin', category: 'MYTHIC', isNaval: false, flying: true, patterns: ['griffin', 'griff'] },
  { key: 'harpy', category: 'MYTHIC', isNaval: false, flying: true, patterns: ['harpy', 'hárpia', 'harpia'] },
  { key: 'pegasus', category: 'MYTHIC', isNaval: false, flying: true, patterns: ['pegasus', 'pegazus'] },
  { key: 'ladon', category: 'MYTHIC', isNaval: false, flying: true, patterns: ['ladon', 'ladón'] },
  { key: 'minotaur', category: 'MYTHIC', isNaval: false, flying: false, patterns: ['minotaur', 'minótaurosz', 'minotaurosz'] },
  { key: 'cyclops', category: 'MYTHIC', isNaval: false, flying: false, patterns: ['cyclops', 'zyklop', 'küklopsz', 'kuklopsz'] },
  { key: 'medusa', category: 'MYTHIC', isNaval: false, flying: false, patterns: ['medusa', 'medúsza', 'medusza'] },
  { key: 'centaur', category: 'MYTHIC', isNaval: false, flying: false, patterns: ['centaur', 'kentaur'] },
  { key: 'cerberus', category: 'MYTHIC', isNaval: false, flying: false, patterns: ['cerberus', 'kerberosz'] },
  { key: 'erinys', category: 'MYTHIC', isNaval: false, flying: false, patterns: ['erinys', 'fury', 'fúria', 'furia', 'erinnüsz', 'erinnusz'] },
  { key: 'calydonian_boar', category: 'MYTHIC', isNaval: false, flying: false, patterns: ['calydonian_boar', 'boar', 'vadkan'] },
  { key: 'godsent', category: 'MYTHIC', isNaval: false, flying: false, patterns: ['godsent', 'istenek küldöttje', 'istenek kuldottje'] },
  { key: 'hydra', category: 'MYTHIC', isNaval: true, flying: false, patterns: ['hydra', 'hidra'] },
  { key: 'siren', category: 'MYTHIC', isNaval: true, flying: false, patterns: ['siren', 'szirén', 'sziren'] },
  { key: 'satyr', category: 'MYTHIC', isNaval: false, flying: false, patterns: ['satyr', 'szatír', 'szatir'] },
  { key: 'spartoi', category: 'MYTHIC', isNaval: false, flying: false, patterns: ['spartoi', 'szpartoi'] },
  { key: 'swordsman', category: 'LAND', isNaval: false, flying: false, patterns: ['swordsman', 'sword', 'kardforgató', 'kardforgato'] },
  { key: 'slinger', category: 'LAND', isNaval: false, flying: false, patterns: ['slinger', 'parittyás', 'parittyas'] },
  { key: 'archer', category: 'LAND', isNaval: false, flying: false, patterns: ['archer', 'íjász', 'ijasz'] },
  { key: 'hoplite', category: 'LAND', isNaval: false, flying: false, patterns: ['hoplite', 'hoplita'] },
  { key: 'horseman', category: 'LAND', isNaval: false, flying: false, patterns: ['horseman', 'rider', 'lovas'] },
  { key: 'chariot', category: 'LAND', isNaval: false, flying: false, patterns: ['chariot', 'harci szekér', 'harci szeker'] },
  { key: 'catapult', category: 'LAND', isNaval: false, flying: false, patterns: ['catapult', 'katapult'] },
  { key: 'militia', category: 'LAND', isNaval: false, flying: false, patterns: ['militia', 'milícia', 'milicia'] },
];

export const DEFAULT_GREPOLIS_UNITS = Object.freeze([
  { id: 'swordsman', name: 'Swordsman', population: 1, attack: 5, def_hack: 14, def_pierce: 8, def_distance: 30, is_naval: false, flying: false },
  { id: 'slinger', name: 'Slinger', population: 1, attack: 23, def_hack: 7, def_pierce: 8, def_distance: 2, is_naval: false, flying: false },
  { id: 'archer', name: 'Archer', population: 1, attack: 8, def_hack: 6, def_pierce: 25, def_distance: 12, is_naval: false, flying: false },
  { id: 'hoplite', name: 'Hoplite', population: 1, attack: 16, def_hack: 18, def_pierce: 12, def_distance: 7, is_naval: false, flying: false },
  { id: 'horseman', name: 'Horseman', population: 3, attack: 55, def_hack: 18, def_pierce: 1, def_distance: 24, is_naval: false, flying: false },
  { id: 'chariot', name: 'Chariot', population: 4, attack: 56, def_hack: 76, def_pierce: 16, def_distance: 56, is_naval: false, flying: false },
  { id: 'catapult', name: 'Catapult', population: 15, attack: 100, def_hack: 30, def_pierce: 30, def_distance: 30, is_naval: false, flying: false },
  { id: 'slow_transport', name: 'Transport Ship', population: 7, attack: 20, def_hack: 1, def_pierce: 0, def_distance: 0, is_naval: true, flying: false },
  { id: 'fast_transport', name: 'Fast Transport Ship', population: 5, attack: 20, def_hack: 1, def_pierce: 0, def_distance: 0, is_naval: true, flying: false },
  { id: 'bireme', name: 'Bireme', population: 8, attack: 24, def_hack: 160, def_pierce: 0, def_distance: 0, is_naval: true, flying: false },
  { id: 'light_ship', name: 'Light Ship', population: 10, attack: 200, def_hack: 60, def_pierce: 0, def_distance: 0, is_naval: true, flying: false },
  { id: 'fire_ship', name: 'Fire Ship', population: 8, attack: 20, def_hack: 1, def_pierce: 0, def_distance: 0, is_naval: true, flying: false },
  { id: 'trireme', name: 'Trireme', population: 16, attack: 180, def_hack: 250, def_pierce: 0, def_distance: 0, is_naval: true, flying: false },
  { id: 'colony_ship', name: 'Colony Ship', population: 170, attack: 0, def_hack: 500, def_pierce: 0, def_distance: 0, is_naval: true, flying: false },
  { id: 'manticore', name: 'Manticore', population: 45, attack: 945, def_hack: 170, def_pierce: 225, def_distance: 505, is_naval: false, flying: true },
  { id: 'griffin', name: 'Griffin', population: 35, attack: 860, def_hack: 350, def_pierce: 370, def_distance: 100, is_naval: false, flying: true },
  { id: 'harpy', name: 'Harpy', population: 14, attack: 266, def_hack: 105, def_pierce: 70, def_distance: 1, is_naval: false, flying: true },
  { id: 'pegasus', name: 'Pegasus', population: 20, attack: 100, def_hack: 900, def_pierce: 250, def_distance: 300, is_naval: false, flying: true },
  { id: 'minotaur', name: 'Minotaur', population: 30, attack: 420, def_hack: 675, def_pierce: 300, def_distance: 560, is_naval: false, flying: false },
  { id: 'cyclops', name: 'Cyclops', population: 40, attack: 756, def_hack: 945, def_pierce: 10, def_distance: 1310, is_naval: false, flying: false },
  { id: 'medusa', name: 'Medusa', population: 18, attack: 425, def_hack: 625, def_pierce: 435, def_distance: 375, is_naval: false, flying: false },
  { id: 'centaur', name: 'Centaur', population: 12, attack: 156, def_hack: 150, def_pierce: 450, def_distance: 60, is_naval: false, flying: false },
  { id: 'cerberus', name: 'Cerberus', population: 30, attack: 210, def_hack: 825, def_pierce: 300, def_distance: 1575, is_naval: false, flying: false },
  { id: 'erinys', name: 'Erinys', population: 55, attack: 1210, def_hack: 688, def_pierce: 688, def_distance: 895, is_naval: false, flying: false },
  { id: 'calydonian_boar', name: 'Calydonian Boar', population: 20, attack: 250, def_hack: 450, def_pierce: 950, def_distance: 100, is_naval: false, flying: false },
  { id: 'godsent', name: 'Godsent', population: 3, attack: 35, def_hack: 40, def_pierce: 40, def_distance: 40, is_naval: false, flying: false },
  { id: 'hydra', name: 'Hydra', population: 50, attack: 1035, def_hack: 715, def_pierce: 0, def_distance: 0, is_naval: true, flying: false },
]);

function matchCanonicalUnitMetadata(unit) {
  if (!unit) return null;
  const idStr = String(unit.id || '').toLowerCase().trim();
  const nameStr = String(unit.name || '').toLowerCase().trim();
  const combined = `${idStr} ${nameStr}`;

  for (const entry of CANONICAL_UNIT_PATTERNS) {
    if (entry.key === idStr || entry.key === nameStr) {
      return entry;
    }
    for (const pattern of entry.patterns) {
      if (idStr === pattern || nameStr === pattern || combined.includes(pattern)) {
        return entry;
      }
    }
  }
  return null;
}

/**
 * Resolves the canonical key (e.g. 'light_ship', 'slinger', 'fast_transport')
 * for a unit regardless of English, internal ID, or localized name.
 */
export function resolveCanonicalUnitKey(unit) {
  if (typeof unit === 'string') {
    const matched = matchCanonicalUnitMetadata({ id: unit, name: unit });
    return matched ? matched.key : unit.toLowerCase().trim();
  }
  const matched = matchCanonicalUnitMetadata(unit);
  if (matched) return matched.key;
  return String(unit?.id || unit?.name || '').toLowerCase().trim();
}

/**
 * Classifies a unit into 'NAVAL' | 'LAND' | 'MYTHIC'.
 */
export function classifyTroopCategory(unit) {
  if (!unit) return 'LAND';

  const explicitCategory = String(unit.category || '').toUpperCase();
  if (explicitCategory === 'NAVAL' || explicitCategory === 'LAND' || explicitCategory === 'MYTHIC') {
    return explicitCategory;
  }

  const matched = matchCanonicalUnitMetadata(unit);
  if (matched) {
    return matched.category;
  }

  if (unit.is_mythic || unit.mythic || unit.god || unit.flying) {
    return 'MYTHIC';
  }

  if (unit.is_naval || unit.isNaval) {
    return 'NAVAL';
  }

  return 'LAND';
}

/**
 * Calculates maximum Farm population for a given farm level and research/building modifiers.
 * Thermal Baths adds +10% to base farm capacity; Plow adds +200 population.
 */
export function getFarmMaxPopulation({
  farmLevel = 45,
  plowResearched = false,
  hasThermalBaths = false,
} = {}) {
  const numericLevel = Number(farmLevel);
  if (Number.isNaN(numericLevel) || numericLevel <= 0) {
    return 0;
  }
  const clampedLevel = Math.min(45, Math.max(1, Math.floor(numericLevel)));
  const baseCapacity = FARM_CAPACITY_BY_LEVEL[clampedLevel] || 0;
  const withThermalBaths = hasThermalBaths ? Math.round(baseCapacity * 1.1) : baseCapacity;
  return withThermalBaths + (plowResearched ? 200 : 0);
}

/**
 * Calculates cumulative population consumed by a building at a given level.
 */
export function getBuildingPopulation(buildingId, level) {
  const numericLevel = Number(level);
  if (!buildingId || Number.isNaN(numericLevel) || numericLevel <= 0) {
    return 0;
  }
  const normalizedKey = String(buildingId).replace(/Level$/, '').toLowerCase().trim();
  const config = BUILDING_POPULATION_TABLE[normalizedKey];
  if (!config || !config.base) {
    return 0;
  }

  const clampedLevel = Math.min(config.maxLevel || 45, Math.floor(numericLevel));
  let pop = 0;
  for (let i = 1; i <= clampedLevel; i++) {
    pop += Math.round(config.base * Math.pow(config.factor, i - 1));
  }
  return pop;
}

/**
 * Computes total population consumed across all buildings in a city.
 * Supports both `{ main: 20, wall: 15 }` and `{ mainLevel: 20, wallLevel: 15 }` shapes.
 */
export function computeTotalBuildingPopulation(buildings = {}) {
  if (!buildings || typeof buildings !== 'object') return 0;

  let total = 0;
  for (const buildingId of Object.keys(BUILDING_POPULATION_TABLE)) {
    const rawLevel =
      buildings[buildingId] !== undefined
        ? buildings[buildingId]
        : buildings[`${buildingId}Level`];
    const level = Number(rawLevel) || 0;
    if (level > 0) {
      total += getBuildingPopulation(buildingId, level);
    }
  }
  return total;
}

/**
 * Simulates population reclaimed by demolishing buildings from `currentBuildings` down to `targetBuildings`.
 * Fixes the Light Ship conversion bug (Light Ships cost 10 population, Biremes cost 8, Slingers cost 1).
 */
export function simulateDemolitionReclaim({ currentBuildings = {}, targetBuildings = {} } = {}) {
  let populationSaved = 0;
  const breakdown = {};

  for (const buildingId of Object.keys(BUILDING_POPULATION_TABLE)) {
    const currentRaw =
      currentBuildings?.[buildingId] !== undefined
        ? currentBuildings[buildingId]
        : currentBuildings?.[`${buildingId}Level`];
    const currentLevel = Math.max(0, Number(currentRaw) || 0);

    const hasExplicitTarget =
      targetBuildings &&
      (targetBuildings[buildingId] !== undefined ||
        targetBuildings[`${buildingId}Level`] !== undefined);

    const targetRaw =
      targetBuildings?.[buildingId] !== undefined
        ? targetBuildings[buildingId]
        : targetBuildings?.[`${buildingId}Level`];
    const targetLevel = hasExplicitTarget
      ? Math.max(0, Number(targetRaw) || 0)
      : currentLevel;

    if (currentLevel > targetLevel) {
      const saved =
        getBuildingPopulation(buildingId, currentLevel) -
        getBuildingPopulation(buildingId, targetLevel);
      if (saved > 0) {
        populationSaved += saved;
        breakdown[buildingId] = saved;
      }
    }
  }

  return {
    populationSaved,
    lightShipsEquivalent: Math.floor(populationSaved / 10),
    biremesEquivalent: Math.floor(populationSaved / 8),
    slingersEquivalent: populationSaved,
    breakdown,
  };
}

/**
 * Applies a specialization preset (`SPECIALIZATION_PRESETS[presetKey]`) to a catalog of units,
 * returning a `{ [unit.id]: count }` map keyed by the catalog's unit IDs.
 */
export function applyPresetToUnits(presetKey, units = DEFAULT_GREPOLIS_UNITS) {
  const preset = SPECIALIZATION_PRESETS[presetKey];
  if (!preset) return {};

  const catalog = Array.isArray(units) && units.length > 0 ? units : DEFAULT_GREPOLIS_UNITS;
  const resolvedCounts = {};

  for (const [canonicalTargetKey, count] of Object.entries(preset.units)) {
    const targetNormalized = resolveCanonicalUnitKey(canonicalTargetKey);
    const matchedUnit = catalog.find(
      (u) =>
        resolveCanonicalUnitKey(u) === targetNormalized ||
        String(u.id || '').toLowerCase() === targetNormalized
    );
    if (matchedUnit) {
      resolvedCounts[matchedUnit.id] = count;
    } else {
      resolvedCounts[canonicalTargetKey] = count;
    }
  }

  return resolvedCounts;
}

/**
 * Compiles a complete city & army plan including max population, building population,
 * demolition reclaim, free population, combat stats, and naval transport sufficiency.
 */
export function compileCityPlan({
  town = {},
  buildingTargets = null,
  troopCounts = {},
  units = DEFAULT_GREPOLIS_UNITS,
  bunksResearched,
  plowResearched,
  hasThermalBaths,
} = {}) {
  const effectivePlow =
    plowResearched !== undefined ? Boolean(plowResearched) : Boolean(town?.plowResearched);
  const effectiveThermal =
    hasThermalBaths !== undefined ? Boolean(hasThermalBaths) : Boolean(town?.hasThermalBaths);
  const effectiveBunks =
    bunksResearched !== undefined
      ? Boolean(bunksResearched)
      : town?.bunksResearched !== undefined
      ? Boolean(town.bunksResearched)
      : true;

  const rawFarmLevel =
    town?.farmLevel ??
    town?.farm ??
    town?.buildings?.farm ??
    town?.buildings?.farmLevel ??
    buildingTargets?.farm ??
    40;
  const resolvedFarmLevel = Number(rawFarmLevel) > 0 ? Number(rawFarmLevel) : 40;

  const maxPopulation = getFarmMaxPopulation({
    farmLevel: resolvedFarmLevel,
    plowResearched: effectivePlow,
    hasThermalBaths: effectiveThermal,
  });

  const currentBuildings = town?.buildings || town || {};
  const buildingPopulation = computeTotalBuildingPopulation(currentBuildings);
  const demolition = buildingTargets
    ? simulateDemolitionReclaim({
        currentBuildings,
        targetBuildings: buildingTargets,
      })
    : {
        populationSaved: 0,
        lightShipsEquivalent: 0,
        biremesEquivalent: 0,
        slingersEquivalent: 0,
      };
  const demolitionSavedPopulation = demolition.populationSaved;
  const effectiveBuildingPopulation = Math.max(0, buildingPopulation - demolitionSavedPopulation);

  const catalog = Array.isArray(units) && units.length > 0 ? units : DEFAULT_GREPOLIS_UNITS;

  let armyPopulation = 0;
  let totalAttack = 0;
  let totalDefHack = 0;
  let totalDefPierce = 0;
  let totalDefDistance = 0;
  let landTroopPopulation = 0;
  let slowTransportCount = 0;
  let fastTransportCount = 0;

  const matchedKeys = new Set();

  for (const unit of catalog) {
    const canonicalKey = resolveCanonicalUnitKey(unit);
    let count = 0;
    if (troopCounts && troopCounts[unit.id] !== undefined) {
      count = Number(troopCounts[unit.id]) || 0;
      matchedKeys.add(String(unit.id));
    } else if (troopCounts && troopCounts[canonicalKey] !== undefined && !matchedKeys.has(canonicalKey)) {
      count = Number(troopCounts[canonicalKey]) || 0;
      matchedKeys.add(canonicalKey);
    }

    if (count <= 0) continue;

    const unitPop = Number(unit.population) || 0;
    const popUsed = count * unitPop;
    armyPopulation += popUsed;

    totalAttack += count * (Number(unit.attack) || 0);
    totalDefHack += count * (Number(unit.def_hack ?? unit.defHack) || 0);
    totalDefPierce += count * (Number(unit.def_pierce ?? unit.defPierce) || 0);
    totalDefDistance += count * (Number(unit.def_distance ?? unit.defDistance) || 0);

    if (canonicalKey === 'slow_transport') {
      slowTransportCount += count;
    } else if (canonicalKey === 'fast_transport') {
      fastTransportCount += count;
    }

    const meta = matchCanonicalUnitMetadata(unit);
    const isNaval =
      typeof unit.is_naval === 'boolean'
        ? unit.is_naval
        : typeof unit.isNaval === 'boolean'
        ? unit.isNaval
        : Boolean(meta?.isNaval);
    const isFlying =
      typeof unit.flying === 'boolean' ? unit.flying : Boolean(meta?.flying);

    if (!isNaval && !isFlying) {
      landTroopPopulation += popUsed;
    }
  }

  const slowTransportCapPerShip = effectiveBunks ? 26 : 20;
  const fastTransportCapPerShip = effectiveBunks ? 16 : 10;
  const transportCapacity =
    slowTransportCount * slowTransportCapPerShip +
    fastTransportCount * fastTransportCapPerShip;
  const transportDeficit = Math.max(0, landTroopPopulation - transportCapacity);
  const fastTransportsNeeded =
    transportDeficit > 0 ? Math.ceil(transportDeficit / fastTransportCapPerShip) : 0;
  const slowTransportsNeeded =
    transportDeficit > 0 ? Math.ceil(transportDeficit / slowTransportCapPerShip) : 0;
  const isSufficient = transportCapacity >= landTroopPopulation;

  const freePopulation = maxPopulation - effectiveBuildingPopulation - armyPopulation;

  return {
    maxPopulation,
    buildingPopulation,
    demolitionSavedPopulation,
    effectiveBuildingPopulation,
    armyPopulation,
    freePopulation,
    combatStats: {
      totalAttack,
      totalDefHack,
      totalDefPierce,
      totalDefDistance,
    },
    transportSummary: {
      landTroopPopulation,
      transportCapacity,
      transportDeficit,
      fastTransportsNeeded,
      slowTransportsNeeded,
      isSufficient,
    },
  };
}

/**
 * Normalizes building levels object so it always includes `<buildingId>Level` keys for `/api/towns`.
 */
export function normalizeBuildingLevelsPayload(buildings = {}) {
  if (!buildings || typeof buildings !== 'object') return {};
  const buildingIds = [
    'main',
    'farm',
    'barracks',
    'docks',
    'wall',
    'temple',
    'lumber',
    'stoner',
    'ironer',
    'market',
    'academy',
  ];
  const normalized = {};
  for (const bId of buildingIds) {
    const raw =
      buildings[`${bId}Level`] !== undefined
        ? buildings[`${bId}Level`]
        : buildings[bId];
    if (raw !== undefined) {
      normalized[`${bId}Level`] = Math.max(0, parseInt(raw, 10) || 0);
    }
  }
  return normalized;
}

/**
 * Fetches player towns for a specific worldId and playerId.
 */
export async function fetchTownRoster({
  worldId = 'hu119',
  playerId,
  fetchImpl = fetch,
} = {}) {
  if (!playerId) return [];
  const normalizedWorldId = String(worldId || 'hu119').toLowerCase().trim();
  const params = new URLSearchParams({
    world: normalizedWorldId,
    playerId: String(playerId),
  });
  const response = await fetchImpl(`/api/towns?${params.toString()}`);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to fetch town roster');
  }
  return Array.isArray(data) ? data : [];
}

/**
 * Saves town specialization, researches, and building levels to `PUT /api/towns`,
 * always including `worldId` so non-default worlds never fail with 404.
 */
export async function saveTownConfiguration({
  worldId = 'hu119',
  townId,
  specialization,
  buildings,
  buildingLevels,
  plowResearched,
  hasThermalBaths,
  bunksResearched,
  cartographyResearched,
  mathResearched,
  hasTower,
  hasLighthouse,
  fetchImpl = fetch,
} = {}) {
  if (!townId) {
    throw new Error('Missing townId');
  }
  const normalizedWorldId = String(worldId || 'hu119').toLowerCase().trim();
  const resolvedBuildings = normalizeBuildingLevelsPayload(buildingLevels || buildings || {});

  const payload = {
    worldId: normalizedWorldId,
    townId,
    specialization,
    bunksResearched,
    plowResearched,
    cartographyResearched,
    mathResearched,
    hasThermalBaths,
    hasTower,
    hasLighthouse,
    buildingLevels: resolvedBuildings,
  };

  const response = await fetchImpl('/api/towns', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to save town configuration');
  }
  return data;
}

/**
 * Fetches the global Grepolis troop catalog from `/api/units`.
 */
export async function fetchTroopCatalog({ fetchImpl = fetch } = {}) {
  const response = await fetchImpl('/api/units');
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to fetch troop catalog');
  }
  const units = Array.isArray(data?.units)
    ? data.units
    : Array.isArray(data)
    ? data
    : [];
  return [...units].sort((a, b) => (a.population || 0) - (b.population || 0));
}

export const TownPlannerAdapter = Object.freeze({
  fetchTownRoster,
  saveTownConfiguration,
  fetchTroopCatalog,
});
