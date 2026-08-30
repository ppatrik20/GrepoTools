/**
 * Helper to safely convert Date, epoch number, or ISO string to epoch milliseconds.
 * @param {Date|number|string} input 
 * @returns {number} Epoch in milliseconds
 */
function toEpochMs(input) {
  if (input instanceof Date) return input.getTime();
  if (typeof input === 'number') return input;
  const d = new Date(input);
  return d.getTime();
}

/**
 * Calculates the travel time in seconds between coordinates.
 * @param {number} x1 - Origin X
 * @param {number} y1 - Origin Y
 * @param {number} x2 - Target X
 * @param {number} y2 - Target Y
 * @param {number} unitSpeed - Base speed of the slowest unit in the command
 * @param {number} worldSpeed - Speed multiplier of the world
 * @param {object} modifiers - Research and buff flags
 * @returns {number} Travel time in seconds
 */
export function calculateTravelTime(x1, y1, x2, y2, unitSpeed, worldSpeed, modifiers = {}) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance === 0) {
    return 300; // Minimum travel time on the same island (5 minutes)
  }

  let speedMultiplier = 1.0;
  if (modifiers.cartographyResearched) speedMultiplier += 0.10;
  if (modifiers.hasLighthouse) speedMultiplier += 0.15;
  if (modifiers.atalantaLevel) speedMultiplier += (0.09 + modifiers.atalantaLevel * 0.01);
  if (modifiers.speedBuff) speedMultiplier += modifiers.speedBuff; // items, spells

  const travelConstant = 500;
  const baseDelay = 300; // Grepolis naval constant delay (5 minutes)

  const calculatedSeconds = baseDelay + (distance * travelConstant) / (unitSpeed * worldSpeed * speedMultiplier);
  return Math.round(calculatedSeconds);
}

/**
 * Calculates the launch and recall timings for planned cancel delay D.
 * @param {Date|number|string} targetReturnTime - The target time to land (e.g. CS arrival +/- 1s)
 * @param {number} cancelDelaySeconds - Outward travel duration before recall (D)
 * @returns {object} Timing details
 */
export function calculateRecallTiming(targetReturnTime, cancelDelaySeconds) {
  const D = cancelDelaySeconds; // outward travel duration before recall
  if (D > 600) {
    throw new Error("Recall sniping requires cancel delay to be <= 10 minutes (600 seconds).");
  }

  const targetReturnEpoch = toEpochMs(targetReturnTime);
  
  // Send time is (2 * D) before the target return time
  const sendEpoch = targetReturnEpoch - (2 * D * 1000);
  const sendTime = new Date(sendEpoch);

  // Recall time is exactly halfway between send and return (D seconds after send)
  const recallEpoch = sendEpoch + (D * 1000);
  const recallTime = new Date(recallEpoch);

  return {
    sendTime,
    recallTime,
    cancelDelaySeconds: D,
    totalElapsedSeconds: 2 * D
  };
}

/**
 * Calculates the exact recall time given an actual launch time and target landing time.
 * Formula: RecallTime = LaunchTime + (TargetTime - LaunchTime) / 2
 * @param {Date|number|string} targetReturnTime 
 * @param {Date|number|string} actualLaunchTime 
 * @returns {object} Timing details
 */
export function calculateMidpointRecall(targetReturnTime, actualLaunchTime) {
  const tReturn = toEpochMs(targetReturnTime);
  const tLaunch = toEpochMs(actualLaunchTime);
  
  const diffMs = tReturn - tLaunch;
  if (diffMs <= 0) {
    throw new Error("Actual launch time must be before target return time.");
  }

  const halfDiffMs = Math.round(diffMs / 2);
  const cancelDelaySeconds = Math.round(halfDiffMs / 1000);

  if (cancelDelaySeconds > 600) {
    throw new Error(`Cancel delay of ${cancelDelaySeconds}s exceeds Grepolis 10-minute (600s) cancel window.`);
  }

  const sendTime = new Date(tLaunch);
  const recallTime = new Date(tLaunch + halfDiffMs);

  return {
    sendTime,
    recallTime,
    cancelDelaySeconds,
    totalElapsedSeconds: cancelDelaySeconds * 2
  };
}

/**
 * Formats duration in seconds to standard HH:MM:SS format.
 * @param {number} seconds 
 * @returns {string} Formatted string
 */
export function formatDuration(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Calculates Euclidean nautical distance between two towns, or same-island slot distance.
 * @param {object} origin 
 * @param {object} target 
 * @returns {number} Distance in game units
 */
export function calculateDistance(origin, target) {
  if (!origin || !target) return 0;
  if (origin.id && target.id && origin.id === target.id) return 0;

  const ox = Number(origin.islandX ?? origin.x ?? 500);
  const oy = Number(origin.islandY ?? origin.y ?? 500);
  const tx = Number(target.islandX ?? target.x ?? 500);
  const ty = Number(target.islandY ?? target.y ?? 500);
  
  const islandDist = Math.sqrt(Math.pow(tx - ox, 2) + Math.pow(ty - oy, 2));

  // If on the SAME island (island coordinates match):
  if (islandDist < 0.01) {
    const slot1 = Number(origin.islandSlot ?? 0);
    const slot2 = Number(target.islandSlot ?? 1);
    const slotDiff = Math.abs(slot2 - slot1) || 1;
    // On-island distance scale: 2.0 to 8.0 units (2.0 + Delta_slot * 0.35)
    return 2.0 + slotDiff * 0.35;
  }

  return islandDist;
}

/**
 * Calculates official travel duration in seconds based on distance, unit base speed, and world multipliers.
 * @param {number} distance 
 * @param {number} unitBaseSpeed 
 * @param {number} worldSpeed 
 * @param {number} unitSpeed 
 * @returns {number} Duration in seconds
 */
export function calculateTravelTimeSeconds(distance, unitBaseSpeed, worldSpeed = 3, unitSpeed = 1) {
  const dist = Number(distance || 0);
  const speed = Number(unitBaseSpeed || 10);
  const wSpeed = Math.max(1, Number(worldSpeed || 3));
  const uSpeed = Math.max(1, Number(unitSpeed || 1));

  if (dist <= 0) return 0;
  
  // Official Grepolis travel time formula:
  // Duration (minutes) = (distance * 50) / (speed * worldSpeed * unitSpeed)
  const minutes = (dist * 50) / (speed * wSpeed * uSpeed);
  return Math.max(30, Math.round(minutes * 60));
}

/**
 * Unwraps town payload from /api/world/town/[id] response or returns town directly if flat.
 * @param {object} data 
 * @returns {object|null} Unwrapped town object
 */
export function unwrapTownPayload(data) {
  if (!data) return null;
  return data.town || data;
}

/**
 * Parses HH:MM:SS string to total seconds.
 * @param {string} str 
 * @returns {number} Seconds
 */
export function parseDuration(str) {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(str) || 0;
}
