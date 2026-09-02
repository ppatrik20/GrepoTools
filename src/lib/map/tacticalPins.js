/**
 * src/lib/map/tacticalPins.js
 * Tactical Alliance Pinboard & Operation Markers System
 * Milestone 4 (F11, F12, F13)
 */

export const PIN_TYPES = {
  PRIMARY_TARGET: { label: 'Primary Target', icon: '🎯', color: '#ef4444', badge: 'bg-red-500/20 text-red-300 border-red-500/40' },
  SECONDARY_TARGET: { label: 'Secondary Target', icon: '🎯', color: '#f59e0b', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  STACK_BIREMES: { label: 'Stack Biremes', icon: '🛡️', color: '#38bdf8', badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
  BREAK_SIEGE: { label: 'Break Siege', icon: '⚔️', color: '#ec4899', badge: 'bg-pink-500/20 text-pink-300 border-pink-500/40' }
};

export const PIN_PRIORITIES = {
  CRITICAL: { label: 'Critical', color: '#ef4444', rank: 3, badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  HIGH: { label: 'High', color: '#f59e0b', rank: 2, badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  NORMAL: { label: 'Normal', color: '#94a3b8', rank: 1, badge: 'bg-slate-700/40 text-slate-300 border-slate-600' }
};

const VALID_TYPES = Object.keys(PIN_TYPES);
const VALID_PRIORITIES = Object.keys(PIN_PRIORITIES);

/**
 * Retrieves all tactical operation pins for a world from storage.
 * 
 * @param {string} worldId - World identifier
 * @param {Object} storage - Storage adapter (defaults to localStorage)
 * @returns {Array<Object>} Array of TacticalPin objects
 */
export function getTacticalPins(worldId, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!worldId || !storage) return [];
  try {
    const raw = storage.getItem(`grepo_tactical_pins_${worldId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(p => p && p.id && p.townId);
  } catch (err) {
    console.error("Error reading tactical pins from storage:", err);
    return [];
  }
}

/**
 * Saves or updates a tactical operation pin in persistent storage.
 * 
 * @param {string} worldId - World identifier
 * @param {Object} pin - Tactical pin payload
 * @param {Object} storage - Storage adapter (defaults to localStorage)
 * @returns {Array<Object>} Updated array of pins
 */
export function saveTacticalPin(worldId, pin, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!worldId || !storage || !pin || !pin.townId) return [];

  const pins = getTacticalPins(worldId, storage);

  const townX = Number(pin.townX ?? pin.x ?? 500);
  const townY = Number(pin.townY ?? pin.y ?? 500);
  const lng = pin.lng ?? ((townX / 1000) * 360 - 180);
  const lat = pin.lat ?? (-((townY / 1000) * 180 - 90));

  const newPin = {
    id: pin.id || `pin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    worldId,
    townId: pin.townId,
    townName: pin.townName || `Town #${pin.townId}`,
    townX,
    townY,
    lng,
    lat,
    type: VALID_TYPES.includes(pin.type) ? pin.type : 'PRIMARY_TARGET',
    priority: VALID_PRIORITIES.includes(pin.priority) ? pin.priority : 'NORMAL',
    notes: String(pin.notes || '').slice(0, 500),
    author: pin.author || 'Commander',
    createdAt: pin.createdAt || Date.now(),
    targetReturnTime: pin.targetReturnTime || null
  };

  const existingIndex = pins.findIndex(p => p.id === newPin.id || (p.townId === newPin.townId && p.type === newPin.type));
  if (existingIndex >= 0) {
    pins[existingIndex] = {
      ...pins[existingIndex],
      ...newPin,
      id: pins[existingIndex].id,
      createdAt: pins[existingIndex].createdAt
    };
  } else {
    pins.push(newPin);
  }

  try {
    storage.setItem(`grepo_tactical_pins_${worldId}`, JSON.stringify(pins));
  } catch (err) {
    console.error("Storage write failure for tactical pins:", err);
  }

  return pins;
}

/**
 * Removes a tactical operation pin by ID.
 * 
 * @param {string} worldId - World identifier
 * @param {string} pinId - Pin identifier to remove
 * @param {Object} storage - Storage adapter (defaults to localStorage)
 * @returns {boolean} True if removed successfully
 */
export function removeTacticalPin(worldId, pinId, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!worldId || !storage || !pinId) return false;
  const pins = getTacticalPins(worldId, storage);
  const filtered = pins.filter(p => p.id !== pinId);
  if (filtered.length === pins.length) return false;

  try {
    storage.setItem(`grepo_tactical_pins_${worldId}`, JSON.stringify(filtered));
    return true;
  } catch (err) {
    console.error("Error removing tactical pin from storage:", err);
    return false;
  }
}

/**
 * Generates direct one-click export URL to the Recall Sniper tool (/snipe).
 * 
 * @param {Object} pin - Tactical pin
 * @param {string} baseUrl - Base path (default '/snipe')
 * @returns {string} Fully qualified sniper link with query parameters
 */
export function exportPinToSniper(pin, baseUrl = '/snipe') {
  if (!pin) return baseUrl;
  const params = new URLSearchParams();
  params.set('targetTownId', String(pin.townId));
  params.set('targetName', pin.townName || `Town #${pin.townId}`);
  params.set('operationType', pin.type || 'PRIMARY_TARGET');
  params.set('priority', pin.priority || 'NORMAL');
  if (pin.originTownId) params.set('originTownId', String(pin.originTownId));
  if (pin.targetReturnTime) params.set('targetReturnTime', String(pin.targetReturnTime));

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Generates prepopulated Route Planner payload for seamless 1-click routing.
 * 
 * @param {Object} pin - Tactical pin
 * @returns {Object} Target town specification for Route Planner
 */
export function exportPinToPlanner(pin) {
  if (!pin) return null;
  return {
    id: pin.townId,
    targetTownId: pin.townId,
    name: pin.townName || `Town #${pin.townId}`,
    targetName: pin.townName || `Town #${pin.townId}`,
    islandX: pin.townX ?? pin.x,
    islandY: pin.townY ?? pin.y,
    townX: pin.townX ?? pin.x,
    townY: pin.townY ?? pin.y,
    priority: pin.priority,
    type: pin.type
  };
}

export const TacticalPinboardEngine = {
  getTacticalPins,
  saveTacticalPin,
  removeTacticalPin,
  exportPinToSniper,
  exportPinToPlanner,
  PIN_TYPES,
  PIN_PRIORITIES
};

export default TacticalPinboardEngine;
