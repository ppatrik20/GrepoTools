/**
 * src/lib/endgame/dominationEngine.js
 * Domain engine for Grepolis Domination (Dominancia).
 * Grounded in official InnoGames primary sources (KB #4485, #611, #612, #613).
 */

import { isLargeIsland } from './wonderEngine.js';

export const DOMINATION_CONSTANTS = {
  INITIAL_TARGET_PERCENTAGE: 40.0,
  DECAY_INTERVAL_DAYS: 14,
  MIN_DECAY_DIFF_PERCENTAGE: 2.0,
  LAST_STAND_DURATION_BY_SPEED: {
    1: 28,
    2: 21,
    3: 17.5,
    4: 14,
    5: 10.5,
    6: 7
  }
};

/**
 * Calculates current Domination percentage strictly over Valid Islands.
 */
export function calculateDominationPercentage({ allianceValidTowns = 0, totalValidIslandTowns = 1 }) {
  if (!totalValidIslandTowns || totalValidIslandTowns <= 0) return 0;
  const pct = (Number(allianceValidTowns) / Number(totalValidIslandTowns)) * 100;
  return Number(pct.toFixed(2));
}

/**
 * Calculates the next threshold value following bi-weekly decay (KB #4485).
 * Formula: New Target = Current Target - ((Current Target - Top Alliance %) / 2)
 * Stops when (Current Target - Top Alliance %) < 2%.
 */
export function calculateNextDecayThreshold(currentThreshold, topAlliancePercentage) {
  const current = Number(currentThreshold);
  const top = Number(topAlliancePercentage);
  const diff = current - top;

  if (diff < DOMINATION_CONSTANTS.MIN_DECAY_DIFF_PERCENTAGE) {
    return current;
  }

  const reduction = diff / 2;
  const newThreshold = current - reduction;
  return Number(newThreshold.toFixed(2));
}

/**
 * Returns exact Last Stand duration in days based on world speed.
 */
export function calculateLastStandDurationDays(worldSpeed = 1) {
  const speed = Math.round(Number(worldSpeed) || 1);
  return DOMINATION_CONSTANTS.LAST_STAND_DURATION_BY_SPEED[speed] || 14;
}

/**
 * Computes how many valid island towns the alliance can afford to lose before
 * dropping below the required Domination threshold during Last Stand.
 */
export function calculateTownSafetyBuffer({ currentValidTowns = 0, totalValidTowns = 1, targetPercentage = 40.0 }) {
  const needed = (Number(targetPercentage) / 100) * Number(totalValidTowns);
  const buffer = Math.floor(Number(currentValidTowns) - needed);
  return buffer;
}

/**
 * Simulates assembling the optimal alliance roster of size `allianceCap` across a coalition.
 * Prioritizes members with the most Valid Island towns (not total points!).
 */
export function simulateOptimalRosterMerge({
  coalitionMembers = [],
  validTownsByPlayerId = {},
  totalValidTowns = 1,
  allianceCap = 35
}) {
  const enriched = coalitionMembers.map(m => {
    const vTowns = Number(validTownsByPlayerId[m.playerId] || 0);
    return {
      ...m,
      validTowns: vTowns
    };
  });

  // Sort descending by validTowns, then by totalPoints
  enriched.sort((a, b) => {
    if (b.validTowns !== a.validTowns) {
      return b.validTowns - a.validTowns;
    }
    return (b.totalPoints || 0) - (a.totalPoints || 0);
  });

  const selectedMembers = enriched.slice(0, allianceCap);
  const projectedValidTowns = selectedMembers.reduce((sum, m) => sum + m.validTowns, 0);
  const projectedPercentage = calculateDominationPercentage({
    allianceValidTowns: projectedValidTowns,
    totalValidIslandTowns: totalValidTowns
  });

  return {
    selectedMembers,
    projectedValidTowns,
    projectedPercentage,
    totalMembersEvaluated: coalitionMembers.length,
    allianceCap
  };
}

/**
 * Evaluates and ranks expansion targets on Valid Islands into ROI tiers.
 */
export function rankDominationExpansionTargets({
  validIslandIds = new Set(),
  towns = [],
  intelRadar = {},
  isRevoltWorld = false
}) {
  const inactives = intelRadar.inactives instanceof Set
    ? intelRadar.inactives
    : new Set(intelRadar.inactives || []);

  const targets = [];

  for (const t of towns) {
    if (!validIslandIds.has(t.islandKey)) continue;

    const isGhost = Boolean(t.isGhost || !t.playerId || t.alliance === null || t.player === 'Ghost Town');
    const isInactive = inactives.has(t.playerId);

    let tier = 'TIER_3_CONTESTED';
    let priorityScore = 50;

    if (isGhost) {
      tier = 'TIER_1_GHOST';
      // On revolt worlds, ghost towns don't need a 12h revolt timer (KB #372), instant capture!
      priorityScore = isRevoltWorld ? 150 : 120;
    } else if (isInactive) {
      tier = 'TIER_2_INACTIVE';
      priorityScore = 100;
    }

    targets.push({
      id: t.id,
      name: t.name,
      points: t.points,
      player: t.player,
      playerId: t.playerId,
      alliance: t.alliance,
      islandKey: t.islandKey,
      isGhost,
      isInactive,
      tier,
      priorityScore
    });
  }

  return targets.sort((a, b) => b.priorityScore - a.priorityScore);
}

export function isDominationValidIsland(type) {
  return isLargeIsland(type);
}

export function calculateDominationProgress({ validTownsCount = 1, allianceTownsCount = 0, targetPercentage = 40.0 }) {
  const currentPercentage = calculateDominationPercentage({
    allianceValidTowns: allianceTownsCount,
    totalValidIslandTowns: validTownsCount
  });
  const isThresholdReached = currentPercentage >= targetPercentage;
  const townsNeededForTarget = Math.max(0, Math.ceil((targetPercentage / 100) * validTownsCount) - allianceTownsCount);
  return {
    currentPercentage,
    targetPercentage,
    isThresholdReached,
    townsNeededForTarget
  };
}

export function calculateDominationHalfGapDecay({ currentTargetPct, topAlliancePct }) {
  return calculateNextDecayThreshold(currentTargetPct, topAlliancePct);
}

export function calculateLastStandDurationHours(worldSpeed) {
  if (typeof worldSpeed === 'string') {
    const s = worldSpeed.toUpperCase();
    if (s === 'SLOW') return 336;
    if (s === 'NORMAL') return 252;
    if (s === 'FAST') return 168;
  }
  return Math.round(calculateLastStandDurationDays(worldSpeed) * 24);
}

export const rankExpansionTargets = rankDominationExpansionTargets;
