/**
 * Official Grepolis Unit Catalog and Speed Specifications
 * Headless domain module for naval and mythical unit metrics.
 */

export const NAVAL_UNITS = Object.freeze([
  { id: 'bireme', name: 'Bireme (Birema)', baseSpeed: 15, role: 'Defense', iconName: 'Shield', color: '#38bdf8' },
  { id: 'light_ship', name: 'Light Ship (Gyújtó)', baseSpeed: 13, role: 'Offense', iconName: 'Flame', color: '#f87171' },
  { id: 'fast_transporter', name: 'Fast Transport (Gyors)', baseSpeed: 15, role: 'Transport', iconName: 'Wind', color: '#34d399' },
  { id: 'slow_transporter', name: 'Slow Transport (Lassú)', baseSpeed: 8, role: 'Transport', iconName: 'Anchor', color: '#94a3b8' },
  { id: 'trireme', name: 'Trireme (Trirema)', baseSpeed: 9, role: 'Hybrid', iconName: 'Shield', color: '#a78bfa' },
  { id: 'colonize_ship', name: 'Colony Ship (Gyarmatosító)', baseSpeed: 3, role: 'Conquest', iconName: 'Compass', color: '#fbbf24' }
]);

export const MYTHICAL_FLYING_UNITS = Object.freeze([
  { id: 'pegasus', name: 'Pegasus', baseSpeed: 35, role: 'Flying', iconName: 'Sparkles', color: '#67e8f9' },
  { id: 'harpy', name: 'Harpy', baseSpeed: 25, role: 'Flying', iconName: 'Sparkles', color: '#f43f5e' },
  { id: 'manticore', name: 'Manticore', baseSpeed: 22, role: 'Flying', iconName: 'Sparkles', color: '#fb923c' },
  { id: 'griffin', name: 'Griffin', baseSpeed: 18, role: 'Flying', iconName: 'Sparkles', color: '#eab308' }
]);

export const ALL_UNITS = Object.freeze([
  ...NAVAL_UNITS,
  ...MYTHICAL_FLYING_UNITS
]);

export const COLONY_SHIP_SPEED = 3;
export const DEFAULT_UNIT_SPEED = 10;

/**
 * Finds unit definition by ID.
 * @param {string} id 
 * @returns {object|undefined}
 */
export function getUnit(id) {
  if (!id) return undefined;
  return ALL_UNITS.find(u => u.id === id);
}
