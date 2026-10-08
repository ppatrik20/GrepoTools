/**
 * OperationPlanner: Deep Headless Tactical Planning and Timing Engine
 * Consolidates nautical travel math, anti-timing launch windows (±10s),
 * conquest gap analysis (Revolt vs Siege), and midpoint recall scheduling.
 */

import {
  calculateDistance,
  calculateTravelTimeSeconds,
  calculateTravelTime,
  calculateRecallTiming,
  calculateMidpointRecall,
  formatDuration,
  parseDuration,
  unwrapTownPayload
} from '../traveltime.js';

import { COLONY_SHIP_SPEED, DEFAULT_UNIT_SPEED } from './units.js';

// Grepolis game constants
export const ANTI_TIMING_BUFFER_SECONDS = 10;
export const ANTI_TIMING_BUFFER_MS = 10000;
export const MAX_CANCEL_DELAY_SECONDS = 600; // 10 minutes

/**
 * Safely converts Date, epoch number, or ISO string to epoch milliseconds.
 * @param {Date|number|string} input 
 * @returns {number}
 */
function toEpochMs(input) {
  if (input instanceof Date) return input.getTime();
  if (typeof input === 'number') return input;
  const d = new Date(input);
  return d.getTime();
}

/**
 * Generates an operation ID with timestamp and pseudorandom suffix.
 * @returns {string}
 */
export function generateOperationId() {
  return Date.now().toString() + Math.random().toString(36).substring(7);
}

/**
 * Normalizes user time input ("HH:MM:SS" or "HH:MM") to a full Date object,
 * wrapping to tomorrow if the time has already passed today.
 * @param {string|Date|number} input 
 * @param {Date} [referenceNow=new Date()] 
 * @returns {Date}
 */
export function resolveTargetDate(input, referenceNow = new Date()) {
  if (input instanceof Date) return new Date(input.getTime());
  if (typeof input === 'number') return new Date(input);
  
  if (typeof input === 'string') {
    // Check if it's "HH:MM:SS" or "HH:MM"
    if (input.includes(':') && !input.includes('T') && !input.includes('-')) {
      const parts = input.split(':').map(Number);
      const targetDate = new Date(referenceNow.getTime());
      const hours = parts[0] || 0;
      const mins = parts[1] || 0;
      const secs = parts[2] || 0;
      targetDate.setHours(hours, mins, secs, 0);

      if (targetDate.getTime() < referenceNow.getTime()) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
      return targetDate;
    }
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return new Date(referenceNow.getTime());
}

/**
 * Plans an attack or Colony Ship operation, deriving travel time and the
 * official Grepolis anti-timing launch window (±10s).
 * 
 * @param {object} params
 * @param {object} [params.originTown]
 * @param {object} [params.targetTown]
 * @param {Date|string|number} params.targetLandingTime
 * @param {number} [params.unitBaseSpeed=3]
 * @param {number} [params.worldSpeed=3]
 * @param {number} [params.unitSpeed=1]
 * @param {object} [params.modifiers={}]
 * @param {string} [params.label]
 * @param {string} [params.type='attack']
 * @param {Date} [params.referenceNow=new Date()]
 * @returns {object} Immutable operation plan
 */
export function planAttackOperation({
  originTown,
  targetTown,
  targetLandingTime,
  unitBaseSpeed = COLONY_SHIP_SPEED,
  worldSpeed = 3,
  unitSpeed = 1,
  modifiers = {},
  label,
  type = 'attack',
  travelSeconds: explicitTravelSeconds,
  travelTime,
  referenceNow = new Date()
}) {
  const unwrappedOrigin = unwrapTownPayload(originTown);
  const unwrappedTarget = unwrapTownPayload(targetTown);

  const distance = calculateDistance(unwrappedOrigin, unwrappedTarget);
  let travelSeconds = explicitTravelSeconds;
  if (typeof travelSeconds !== 'number') {
    if (typeof travelTime === 'string' && travelTime.trim()) {
      travelSeconds = parseDuration(travelTime);
    } else {
      travelSeconds = calculateTravelTimeSeconds(
        distance,
        unitBaseSpeed,
        worldSpeed,
        unitSpeed,
        modifiers
      );
    }
  }
  const travelMs = travelSeconds * 1000;

  const targetDate = resolveTargetDate(targetLandingTime, referenceNow);
  const idealLaunchEpoch = targetDate.getTime() - travelMs;
  const idealLaunchDate = new Date(idealLaunchEpoch);

  const windowStart = new Date(idealLaunchEpoch - ANTI_TIMING_BUFFER_MS);
  const windowEnd = new Date(idealLaunchEpoch + ANTI_TIMING_BUFFER_MS);

  let resolvedLabel = label;
  if (!resolvedLabel) {
    if (unwrappedOrigin?.name && unwrappedTarget?.name) {
      resolvedLabel = `${unwrappedOrigin.name} → ${unwrappedTarget.name}`;
    } else if (unwrappedTarget?.name) {
      resolvedLabel = `Operation on ${unwrappedTarget.name}`;
    } else if (unwrappedOrigin?.name) {
      resolvedLabel = `Operation from ${unwrappedOrigin.name}`;
    } else {
      resolvedLabel = 'Unnamed Operation';
    }
  }

  return Object.freeze({
    id: generateOperationId(),
    label: resolvedLabel,
    type,
    originTown: unwrappedOrigin,
    targetTown: unwrappedTarget,
    targetDate,
    idealLaunchDate,
    windowStart,
    windowEnd,
    distance,
    travelSeconds,
    formattedDuration: formatDuration(travelSeconds),
    unitBaseSpeed,
    worldSpeed,
    unitSpeed,
    modifiers: { ...modifiers }
  });
}

/**
 * Calculates strategic conquest gaps for target city movements based on world conquest type.
 * In Revolt mode: Defending units must land 1s before CS to prevent conquest.
 * In Siege mode: Break Siege lands 1s after CS before supports; Pre-CS defense lands 1s before CS.
 * 
 * @param {object} params
 * @param {Array<object>} params.movements List of incoming attack/support/cs movements
 * @param {string} [params.worldType='siege'] 'revolt' or 'siege'
 * @returns {Array<object>} Strategic gap targets
 */
export function calculateConquestGaps({ movements = [], worldType = 'siege' } = {}) {
  if (!Array.isArray(movements) || movements.length === 0) return [];

  const csMovements = movements.filter(m => m.type === 'cs');
  const gaps = [];
  const normalizedWorldType = String(worldType || 'siege').toLowerCase().trim();

  csMovements.forEach(cs => {
    const csTime = toEpochMs(cs.arrivalTime);
    const beforeAttacks = movements
      .filter(m => m.type === 'attack' && toEpochMs(m.arrivalTime) < csTime)
      .sort((a, b) => toEpochMs(a.arrivalTime) - toEpochMs(b.arrivalTime));
    const afterSupports = movements
      .filter(m => m.type !== 'attack' && toEpochMs(m.arrivalTime) > csTime)
      .sort((a, b) => toEpochMs(a.arrivalTime) - toEpochMs(b.arrivalTime));

    const lastClear = beforeAttacks.length > 0 ? beforeAttacks[beforeAttacks.length - 1] : null;
    const firstSupport = afterSupports.length > 0 ? afterSupports[0] : null;

    if (normalizedWorldType === 'revolt') {
      // In Revolt mode: CS landing immediately captures the town. Units MUST return BEFORE the CS!
      const gapEnd = csTime;
      const gapStart = lastClear ? toEpochMs(lastClear.arrivalTime) : csTime - 60000;
      const returnTime = gapEnd - 1000; // 1s before CS

      gaps.push({
        id: `gap_before_${cs.id}`,
        mode: 'revolt',
        desc: `⚡ Defend Revolt CS (Return 1s BEFORE CS from ${cs.attacker || 'Enemy'})`,
        gapStart,
        gapEnd,
        returnTime,
        csArrival: csTime
      });
    } else {
      // In Siege mode: CS initiates a siege.
      // Primary Option: Break Siege (Return 1s AFTER CS before enemy support)
      const gapStart = csTime;
      const gapEnd = firstSupport ? toEpochMs(firstSupport.arrivalTime) : csTime + 60000;
      const returnTime = gapStart + 1000; // 1s after CS

      gaps.push({
        id: `gap_after_${cs.id}`,
        mode: 'siege_break',
        desc: `🛡️ Break Siege (Return 1s AFTER CS from ${cs.attacker || 'Enemy'})`,
        gapStart,
        gapEnd,
        returnTime,
        csArrival: csTime
      });

      // Secondary Option: Pre-CS Defense (Return 1s BEFORE CS)
      gaps.push({
        id: `gap_before_${cs.id}`,
        mode: 'siege_defend',
        desc: `⚔️ Pre-CS Defense (Return 1s BEFORE CS from ${cs.attacker || 'Enemy'})`,
        gapStart: lastClear ? toEpochMs(lastClear.arrivalTime) : csTime - 60000,
        gapEnd: csTime,
        returnTime: csTime - 1000,
        csArrival: csTime
      });
    }
  });

  return gaps;
}

/**
 * Schedules a midpoint recall snipe from planned return time and outward delay.
 * Validates against Grepolis 10-minute cancel limit and past-time constraints.
 * 
 * @param {object} params
 * @param {Date|number|string} params.targetReturnTime Target time to land back at city
 * @param {Date|number|string} [params.sendTime] Departure timestamp
 * @param {number} [params.sendDelayMinutes] Alternative: minutes outward before return
 * @param {Date|number|string} [params.serverTime] Optional server clock for past-time validation
 * @returns {object} Recall plan
 */
export function planRecallSnipe({
  targetReturnTime,
  sendTime,
  sendDelayMinutes,
  serverTime
}) {
  const returnEpoch = toEpochMs(targetReturnTime);
  let sendEpoch;

  if (typeof sendDelayMinutes === 'number') {
    sendEpoch = returnEpoch - (sendDelayMinutes * 60 * 1000);
  } else if (sendTime) {
    sendEpoch = toEpochMs(sendTime);
  } else {
    throw new Error("Must provide either sendTime or sendDelayMinutes.");
  }

  if (serverTime) {
    const serverEpoch = toEpochMs(serverTime);
    if (sendEpoch < serverEpoch) {
      throw new Error("Cannot create a plan where Send Time is in the past! Please choose a smaller minute delay.");
    }
  }

  if (sendEpoch >= returnEpoch) {
    throw new Error("Send time must be before target return time.");
  }

  const timing = calculateMidpointRecall(returnEpoch, sendEpoch);

  return Object.freeze({
    id: generateOperationId(),
    targetReturnTime: new Date(returnEpoch),
    sendTime: timing.sendTime,
    recallTime: timing.recallTime,
    cancelDelaySeconds: timing.cancelDelaySeconds,
    totalElapsedSeconds: timing.totalElapsedSeconds
  });
}

/**
 * Resolves and normalizes query parameter payloads from Route Planner / API.
 * Unboxes nested town objects, sets default Colony Ship speed, computes distance,
 * and derives canonical directional labels.
 * 
 * @param {object} params
 * @param {object} [params.originPayload]
 * @param {object} [params.targetPayload]
 * @param {object} [params.activeWorld={ speed: 3, unitSpeed: 1 }]
 * @returns {object}
 */
export function resolveOperationTargeting({
  originPayload,
  targetPayload,
  activeWorld = { speed: 3, unitSpeed: 1 }
} = {}) {
  const originTown = unwrapTownPayload(originPayload);
  const targetTown = unwrapTownPayload(targetPayload);

  let label = '';
  let travelTime = '';
  let travelSeconds = 0;
  let type = 'attack';
  let distance = 0;

  const originValid = originTown && originTown.name;
  const targetValid = targetTown && targetTown.name;

  if (originValid && targetValid) {
    label = `${originTown.name} → ${targetTown.name}`;
    distance = calculateDistance(originTown, targetTown);
    const worldSpeed = activeWorld?.speed || 3;
    const unitSpeed = activeWorld?.unitSpeed || 1;
    travelSeconds = calculateTravelTimeSeconds(distance, COLONY_SHIP_SPEED, worldSpeed, unitSpeed);
    travelTime = formatDuration(travelSeconds);
    type = 'cs';
  } else if (targetValid) {
    label = `Operation on ${targetTown.name}`;
  } else if (originValid) {
    label = `Operation from ${originTown.name}`;
  }

  return {
    label,
    travelTime,
    travelSeconds,
    type,
    distance,
    originTown,
    targetTown
  };
}

/**
 * Resolves query parameter targeting for Recall operations.
 * Auto-creates or selects existing defense group and sets attacker metadata.
 * 
 * @param {object} params
 * @param {object} [params.originPayload]
 * @param {object} [params.targetPayload]
 * @param {Array<object>} [params.existingGroups=[]]
 * @param {object} [params.activeWorld={ worldType: 'siege' }]
 * @returns {object}
 */
export function resolveRecallTargeting({
  originPayload,
  targetPayload,
  existingGroups = [],
  activeWorld = { worldType: 'siege' }
} = {}) {
  const groups = [...existingGroups];
  let activeGroupId = null;
  const targetTown = unwrapTownPayload(targetPayload);
  const originTown = unwrapTownPayload(originPayload);

  let newGroup = null;
  if (targetTown?.name) {
    const existing = groups.find(
      g => g.townId === targetTown.id || (g.name && g.name.toLowerCase() === targetTown.name.toLowerCase())
    );
    if (existing) {
      activeGroupId = existing.id;
    } else {
      newGroup = {
        id: 'grp_' + targetTown.id,
        name: targetTown.name,
        townId: targetTown.id,
        worldType: (activeWorld?.worldType || 'siege').toLowerCase(),
        movements: [],
        plans: []
      };
      activeGroupId = newGroup.id;
      groups.push(newGroup);
    }
  }

  let movAttacker = '';
  let movAttackerId = null;
  if (originTown?.name) {
    movAttacker = originTown.name;
    movAttackerId = originTown.id;
  }

  return {
    groups,
    activeGroupId,
    newGroup,
    movAttacker,
    movAttackerId,
    targetTown,
    originTown
  };
}

// Re-export underlying routines for full domain leverage
export {
  calculateDistance,
  calculateTravelTimeSeconds,
  calculateTravelTime,
  calculateRecallTiming,
  calculateMidpointRecall,
  formatDuration,
  parseDuration,
  unwrapTownPayload
};
