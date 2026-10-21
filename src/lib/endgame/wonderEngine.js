/**
 * src/lib/endgame/wonderEngine.js
 * Domain engine for Grepolis World Wonders (A világ csodái).
 * Grounded in official InnoGames primary sources (KB #4479, #380, #609, #414, #603).
 */

export const WONDER_METADATA = {
  pyramid: {
    code: 'pyramid',
    nameHu: 'Gízai Nagy Piramis',
    nameEn: 'Great Pyramid of Giza',
    bonusHu: '+1500 a raktárban',
    bonusEn: '+1,500 warehouse capacity in all towns',
    iconUrl: 'https://tools-files.innogamescdn.com/support-knowledgebase/article/4479/c4deaee837d5d1261d24fe131ff5ab04'
  },
  gardens: {
    code: 'gardens',
    nameHu: 'Babilon függő kertjei',
    nameEn: 'Hanging Gardens of Babylon',
    bonusHu: '+3% nyersanyagtermelés',
    bonusEn: '+3% resource production in all towns',
    iconUrl: 'https://tools-files.innogamescdn.com/support-knowledgebase/article/4479/a53e2a4d14e23879e0856f9d23f1bec3'
  },
  statue: {
    code: 'statue',
    nameHu: 'Szobor Zeusz Olümpia',
    nameEn: 'Statue of Zeus at Olympia',
    bonusHu: '+5% áldástermelés Zeusz-nél',
    bonusEn: '+5% favor production with Zeus',
    iconUrl: 'https://tools-files.innogamescdn.com/support-knowledgebase/article/4479/8aa927fb1aa1722c2fd332a45da7119c'
  },
  temple: {
    code: 'temple',
    nameHu: 'Artemisz temploma Ephesusban',
    nameEn: 'Temple of Artemis at Ephesus',
    bonusHu: '+5% áldástermelés az összes istennél',
    bonusEn: '+5% favor production with all gods',
    iconUrl: 'https://tools-files.innogamescdn.com/support-knowledgebase/article/4479/771a656bb88f399e117f3ceba8832575'
  },
  mausoleum: {
    code: 'mausoleum',
    nameHu: 'A Halikarnasszusz mauzóleum',
    nameEn: 'Mausoleum at Halicarnassus',
    bonusHu: 'A mitológiai egységek 5%-kal kevesebb erőforrást igényelnek',
    bonusEn: '-5% myth unit resource costs',
    iconUrl: 'https://tools-files.innogamescdn.com/support-knowledgebase/article/4479/1e8d7e6b60b2657263823faad60b7d95'
  },
  colossus: {
    code: 'colossus',
    nameHu: 'A rhódoszi kolosszus',
    nameEn: 'Colossus of Rhodes',
    bonusHu: '10%-kal csökkenti a diadalmenet időtartamát',
    bonusEn: '-10% Victory Procession duration',
    iconUrl: 'https://tools-files.innogamescdn.com/support-knowledgebase/article/4479/2e1d0781c9abce63f2f764394e73f8ab'
  },
  lighthouse: {
    code: 'lighthouse',
    nameHu: 'Az alexandriai világítótorony',
    nameEn: 'Lighthouse of Alexandria',
    bonusHu: '5%-kal csökkenti a föníciai kereskedő költségeit',
    bonusEn: '-5% Phoenician Merchant costs',
    iconUrl: 'https://tools-files.innogamescdn.com/support-knowledgebase/article/4479/2d173b6949bc09b6a25e872ad19c7180'
  }
};

/**
 * Base Wonder costs and timers at 1x World Speed (KB #4479)
 * Format per level: [wood, stone, silver, buildTimeSeconds, favorReductionSecondsPerCast]
 */
export const WONDER_LEVEL_TABLE_1X = [
  null, // 1-indexed
  { level: 1,  wood: 200000,   stone: 200000,   silver: 200000,   timeSec: 7020,   favorSec: 100 }, // 01:57:00, 00:01:40
  { level: 2,  wood: 400000,   stone: 400000,   silver: 400000,   timeSec: 14220,  favorSec: 150 }, // 03:57:00, 00:02:30
  { level: 3,  wood: 600000,   stone: 600000,   silver: 600000,   timeSec: 27420,  favorSec: 200 }, // 07:37:00, 00:03:20
  { level: 4,  wood: 1000000,  stone: 1000000,  silver: 1000000,  timeSec: 47220,  favorSec: 250 }, // 13:07:00, 00:04:10
  { level: 5,  wood: 1600000,  stone: 1600000,  silver: 1600000,  timeSec: 73980,  favorSec: 300 }, // 20:33:00, 00:05:00
  { level: 6,  wood: 2800000,  stone: 2800000,  silver: 2800000,  timeSec: 108000, favorSec: 350 }, // 30:00:00, 00:05:50
  { level: 7,  wood: 4800000,  stone: 4800000,  silver: 4800000,  timeSec: 149640, favorSec: 400 }, // 41:34:00, 00:06:40
  { level: 8,  wood: 8200000,  stone: 8200000,  silver: 8200000,  timeSec: 199020, favorSec: 450 }, // 55:17:00, 00:07:30
  { level: 9,  wood: 14000000, stone: 14000000, silver: 14000000, timeSec: 256380, favorSec: 500 }, // 71:13:00, 00:08:20
  { level: 10, wood: 23800000, stone: 23800000, silver: 23800000, timeSec: 321960, favorSec: 550 }  // 89:26:00, 00:09:10
];

/**
 * Checks if an island type belongs to the 20-slot large island category with farming villages and wonder spot.
 * Types 1..10 and 37..46
 */
export function isLargeIsland(type) {
  const t = Number(type);
  return (t >= 1 && t <= 10) || (t >= 37 && t <= 46);
}

/**
 * Calculates resource costs and timers scaled by world speed.
 * Per KB #4479: Resource costs = 1x cost * worldSpeed.
 */
export function getWonderLevelCosts(level, worldSpeed = 1) {
  const lvl = Math.max(1, Math.min(10, Number(level) || 1));
  const base = WONDER_LEVEL_TABLE_1X[lvl];
  const speed = Math.max(1, Number(worldSpeed) || 1);

  return {
    level: lvl,
    wood: base.wood * speed,
    stone: base.stone * speed,
    silver: base.silver * speed,
    baseBuildTimeSeconds: Math.round(base.timeSec / speed),
    favorReductionSeconds: base.favorSec
  };
}

/**
 * Calculates maximum allowable 400-favor acceleration casts before hitting the 50% cap.
 */
export function calculateMaxFavorReductions(level, worldSpeed = 1) {
  const costs = getWonderLevelCosts(level, worldSpeed);
  const maxAllowedReduction = Math.floor(costs.baseBuildTimeSeconds / 2);
  const maxCasts = Math.floor(maxAllowedReduction / costs.favorReductionSeconds);

  return {
    maxCasts,
    maxSecondsReduced: maxCasts * costs.favorReductionSeconds,
    minBuildTimeSeconds: costs.baseBuildTimeSeconds - (maxCasts * costs.favorReductionSeconds)
  };
}

/**
 * Calculates cumulative Wonder points for ranking.
 * Per level L, points = L. Sum for level N = N*(N+1)/2.
 * Winner of 4/7 gets +400 bonus points.
 */
export function calculateWonderPoints(stages = [], isWinner = false) {
  let totalPoints = 0;
  for (const s of stages) {
    const lvl = Math.max(0, Math.min(10, Number(s) || 0));
    totalPoints += (lvl * (lvl + 1)) / 2;
  }
  if (isWinner) {
    totalPoints += 400;
  }
  return totalPoints;
}

/**
 * Validates 72-hour alliance membership requirement for resource shipments and favor casts (KB #4479).
 */
export function isEligibleToContribute(joinedAt, now = new Date()) {
  if (!joinedAt) return false;
  const joinEpoch = new Date(joinedAt).getTime();
  const nowEpoch = new Date(now).getTime();
  const diffHours = (nowEpoch - joinEpoch) / (1000 * 60 * 60);
  return diffHours >= 72;
}

/**
 * Performs deep audit on a Wonder Fortress island.
 * Evaluates island type, empty foundation slots (inv_spo), and Vacation Mode hazard towns.
 */
export function auditWonderFortress({
  islandKey,
  islandType,
  availableTowns = 0,
  towns = [],
  teamMembers = [],
  intelByTownId = {}
}) {
  const isLarge = isLargeIsland(islandType);
  const available = Number(availableTowns) || 0;
  const hasEmptySlotHazard = isLarge && available > 0;

  // Build member vacation lookup
  const memberByPlayerId = new Map(
    (teamMembers || []).map(m => [Number(m.playerId), m])
  );

  // Group alliances
  const alliances = new Set();
  const vacationHazardTowns = [];

  for (const t of towns) {
    if (t.alliance) alliances.add(t.alliance);
    const pId = Number(t.playerId);
    const member = memberByPlayerId.get(pId);
    if (member && member.vacationModeActive) {
      vacationHazardTowns.push({
        townId: t.id,
        townName: t.name,
        playerId: pId,
        playerName: member.playerName,
        wallLevel: intelByTownId[t.id]?.wallLevel ?? null
      });
    }
  }

  const isFullyControlled = alliances.size <= 1;

  return {
    islandKey,
    islandType,
    isLargeIsland: isLarge,
    hasEmptySlotHazard,
    emptySlotsCount: available,
    isFullyControlled,
    vacationHazardTowns,
    townCount: towns.length
  };
}

/**
 * Ranks enemy wonder breach targets.
 * On wonder islands, defender morale is 100% disabled (KB #4479).
 */
export function rankEnemyWonderBreachTargets(enemyWonderIslands = [], intelRadar = {}, intelByTownId = {}) {
  const inactives = intelRadar.inactives instanceof Set
    ? intelRadar.inactives
    : new Set(intelRadar.inactives || []);

  const targets = [];

  for (const island of enemyWonderIslands) {
    for (const t of island.towns || []) {
      const isInactive = inactives.has(t.playerId);
      const intel = intelByTownId[t.id] || {};
      const wall = intel.wallLevel !== undefined ? intel.wallLevel : 25;
      
      // Calculate breach score (lower points, lower wall, inactive = higher score)
      let score = 100;
      if (isInactive) score += 50;
      score += Math.max(0, (25 - wall) * 2);
      if (t.points < 5000) score += 30;

      targets.push({
        townId: t.id,
        townName: t.name,
        player: t.player,
        playerId: t.playerId,
        points: t.points,
        alliance: island.alliance,
        islandKey: island.islandKey,
        wonderType: island.wonderType,
        wonderLevel: island.currentLevel,
        isInactive,
        wallLevel: wall,
        breachScore: score,
        moraleExempt: true // Official Grepolis rule: Defender morale disabled on Wonder islands
      });
    }
  }

  // Sort descending by breach score
  return targets.sort((a, b) => b.breachScore - a.breachScore);
}

export const WONDER_TYPES = WONDER_METADATA;

export function calculateWonderLevelRequirements(wonderType, level, worldSpeed = 1) {
  const costs = getWonderLevelCosts(level, worldSpeed);
  return {
    ...costs,
    totalResources: costs.wood + costs.stone + costs.silver
  };
}

export function calculateWonderConstructionTime(level, worldSpeed = 1) {
  return getWonderLevelCosts(level, worldSpeed).baseBuildTimeSeconds;
}

export function calculateWonderFavorMaxCap(worldSpeed = 1) {
  const speed = Math.max(1, Number(worldSpeed) || 1);
  return {
    maxTimeReductionPercent: 50,
    dailyFavorAccrualCap: 1200 * speed
  };
}

export function calculateWonderFortressAudit(params = {}) {
  const towns = (params.islandTowns || []).map(t => ({
    ...t,
    alliance: t.alliance || t.allianceId
  }));
  const allianceId = params.wonderAllianceId;
  const members = params.membersMap || new Map();
  const teamMembers = Array.from(members.values());

  const audit = auditWonderFortress({
    towns,
    teamMembers
  });

  let vacationCount = 0;
  let joinLockCount = 0;
  let foreignCount = 0;
  const now = Date.now();

  for (const t of towns) {
    if (allianceId && t.alliance && t.alliance !== allianceId) {
      foreignCount++;
    }
    const mem = members.get(t.playerId);
    if (mem?.vacationModeActive) vacationCount++;
    if (mem?.allianceJoinedAt && (now - new Date(mem.allianceJoinedAt).getTime() < 72 * 3600 * 1000)) {
      joinLockCount++;
    }
  }

  const isFullyControlled = audit.isFullyControlled && foreignCount === 0;

  let vulnerability = 0;
  if (!isFullyControlled) vulnerability += 60;
  if (audit.hasEmptySlotHazard) vulnerability += 20;
  if (vacationCount > 0) vulnerability += 15;
  if (joinLockCount > 0) vulnerability += 10;

  return {
    ...audit,
    is100PercentAllianceHeld: isFullyControlled,
    foreignTownsCount: foreignCount,
    vacationModeTownsCount: vacationCount,
    joinLockTownsCount: joinLockCount,
    vulnerabilityScore: Math.min(100, vulnerability)
  };
}
