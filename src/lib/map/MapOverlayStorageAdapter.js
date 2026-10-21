/**
 * src/lib/map/MapOverlayStorageAdapter.js
 * Unified storage & API adapter for Map overlays:
 * - Alliance Coalitions & derived custom color maps
 * - Tactical Operation Pins & Sniper/Planner exports
 */

import {
  getTacticalPins,
  saveTacticalPin,
  removeTacticalPin,
  deleteTacticalPin,
  exportPinToSniper,
  exportPinToPlanner,
  PIN_TYPES,
  PIN_PRIORITIES
} from './tacticalPins.js';

function getDefaultStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function getDefaultFetch() {
  return typeof fetch !== 'undefined' ? fetch : null;
}

/**
 * Derives a map of alliance/coalition names -> hex colors from coalition definitions.
 *
 * @param {Array<Object>} coalitions
 * @param {Object} [baseColors={}]
 * @param {boolean} [overwrite=false]
 * @returns {Object}
 */
export function deriveCoalitionColors(coalitions = [], baseColors = {}, overwrite = false) {
  const next = { ...baseColors };
  if (!Array.isArray(coalitions)) return next;

  coalitions.forEach(c => {
    if (!c?.color) return;
    (c.alliances || []).forEach(m => {
      const name = typeof m === 'string' ? m : m?.name;
      if (name && (overwrite || !next[name])) {
        next[name] = c.color;
      }
    });
    if (c.name && (overwrite || !next[c.name])) {
      next[c.name] = c.color;
    }
  });

  return next;
}

/**
 * Loads coalitions for a world from `/api/world/coalitions` with fallback
 * to `localStorage.getItem('grepotools_coalitions_' + worldId)`.
 *
 * @param {string} worldId
 * @param {Object} [options]
 * @param {Function} [options.fetchImpl]
 * @param {Storage} [options.storage]
 * @param {Object} [options.baseColors]
 * @returns {Promise<{ coalitions: Array<Object>, customColors: Object }>}
 */
export async function loadCoalitionsAndColors(
  worldId,
  {
    fetchImpl = getDefaultFetch(),
    storage = getDefaultStorage(),
    baseColors = {}
  } = {}
) {
  if (!worldId) {
    return { coalitions: [], customColors: { ...baseColors } };
  }

  const storageKey = `grepotools_coalitions_${worldId}`;

  if (fetchImpl) {
    try {
      const res = await fetchImpl(`/api/world/coalitions?world=${encodeURIComponent(worldId)}&worldId=${encodeURIComponent(worldId)}`);
      if (res && res.ok) {
        const result = await res.json();
        if (result && Array.isArray(result.coalitions)) {
          const coalitions = result.coalitions;
          const customColors = deriveCoalitionColors(coalitions, baseColors, false);
          return { coalitions, customColors };
        }
      }
    } catch {
      // Fall back to local storage below
    }
  }

  if (storage) {
    try {
      const cached = storage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          const customColors = deriveCoalitionColors(parsed, baseColors, false);
          return { coalitions: parsed, customColors };
        }
      }
    } catch {
      // Ignore corrupt cache
    }
  }

  return { coalitions: [], customColors: { ...baseColors } };
}

/**
 * Persists coalitions to `localStorage` and `POST /api/world/coalitions`,
 * returning derived `customColors` (with non-enumerable `coalitions` and `customColors`
 * properties attached for flexible destructuring).
 *
 * @param {string} worldId
 * @param {Array<Object>} coalitions
 * @param {Object} [options]
 * @param {Function} [options.fetchImpl]
 * @param {Storage} [options.storage]
 * @param {Object} [options.baseColors]
 * @returns {Promise<Object>}
 */
export async function saveCoalitionsAndColors(
  worldId,
  coalitions = [],
  {
    fetchImpl = getDefaultFetch(),
    storage = getDefaultStorage(),
    baseColors = {}
  } = {}
) {
  const safeCoalitions = Array.isArray(coalitions) ? coalitions : [];
  const customColors = deriveCoalitionColors(safeCoalitions, baseColors, true);

  if (worldId && storage) {
    try {
      storage.setItem(`grepotools_coalitions_${worldId}`, JSON.stringify(safeCoalitions));
    } catch (e) {
      console.error('Failed to persist coalitions to localStorage:', e);
    }
  }

  let savedCoalitions = safeCoalitions;
  if (worldId && fetchImpl) {
    const res = await fetchImpl('/api/world/coalitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId, coalitions: safeCoalitions })
    });
    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }
    const result = await res.json();
    if (result?.success && Array.isArray(result.coalitions)) {
      savedCoalitions = result.coalitions;
    }
  }

  Object.defineProperties(customColors, {
    coalitions: { value: savedCoalitions, enumerable: false, configurable: true },
    customColors: { value: customColors, enumerable: false, configurable: true }
  });

  return customColors;
}

export {
  getTacticalPins,
  saveTacticalPin,
  removeTacticalPin,
  deleteTacticalPin,
  exportPinToSniper,
  exportPinToPlanner,
  PIN_TYPES,
  PIN_PRIORITIES
};

export const MapOverlayStorageAdapter = {
  loadCoalitionsAndColors,
  saveCoalitionsAndColors,
  deriveCoalitionColors,
  getTacticalPins,
  saveTacticalPin,
  removeTacticalPin,
  deleteTacticalPin,
  exportPinToSniper,
  exportPinToPlanner,
  PIN_TYPES,
  PIN_PRIORITIES
};

export default MapOverlayStorageAdapter;
