/**
 * src/lib/map/minimapMath.js
 * Minimap Radar Mathematical Projections & Synchronization Engine
 * Milestone 5 (F14, F15)
 */

/**
 * Converts world grid coordinates (0 to 1000) to MapLibre LngLat coordinates.
 * 
 * @param {number} x - World X (0 to 1000)
 * @param {number} y - World Y (0 to 1000)
 * @returns {[number, number]} [longitude, latitude]
 */
export function worldToLngLat(x, y) {
  const safeX = Number.isFinite(Number(x)) ? Number(x) : 500;
  const safeY = Number.isFinite(Number(y)) ? Number(y) : 500;

  const rawLng = (safeX / 1000) * 360 - 180;
  const rawLat = -((safeY / 1000) * 180 - 90);
  const lng = Object.is(rawLng, -0) ? 0 : rawLng;
  const lat = Object.is(rawLat, -0) ? 0 : rawLat;
  return [+lng.toFixed(6), +lat.toFixed(6)];
}

/**
 * Converts MapLibre LngLat coordinates to world grid coordinates (0 to 1000).
 * 
 * @param {number} lng - Longitude (-180 to 180)
 * @param {number} lat - Latitude (-90 to 90)
 * @returns {{ x: number, y: number }} Clamped world coordinates
 */
export function lngLatToWorld(lng, lat) {
  const safeLng = Number.isFinite(Number(lng)) ? Number(lng) : 0;
  const safeLat = Number.isFinite(Number(lat)) ? Number(lat) : 0;

  const x = Math.round(((safeLng + 180) / 360) * 1000);
  const y = Math.round(((90 - safeLat) / 180) * 1000);
  return { 
    x: Math.max(0, Math.min(1000, x)), 
    y: Math.max(0, Math.min(1000, y)) 
  };
}

/**
 * Projects world grid coordinates onto pixel coordinates of a minimap canvas.
 * 
 * @param {number} worldX - World X (0 to 1000)
 * @param {number} worldY - World Y (0 to 1000)
 * @param {number} minimapWidth - Canvas pixel width
 * @param {number} minimapHeight - Canvas pixel height
 * @returns {{ mx: number, my: number }}
 */
export function projectWorldToMinimap(worldX, worldY, minimapWidth = 220, minimapHeight = 220) {
  const safeX = Math.max(0, Math.min(1000, Number(worldX) || 0));
  const safeY = Math.max(0, Math.min(1000, Number(worldY) || 0));
  return {
    mx: (safeX / 1000) * minimapWidth,
    my: (safeY / 1000) * minimapHeight
  };
}

/**
 * Converts a click/drag event on the minimap canvas to world grid and LngLat coordinates.
 * 
 * @param {number} clickX - Mouse X on canvas
 * @param {number} clickY - Mouse Y on canvas
 * @param {number} minimapWidth - Canvas width
 * @param {number} minimapHeight - Canvas height
 * @returns {{ worldX: number, worldY: number, lng: number, lat: number }}
 */
export function projectMinimapClickToWorld(clickX, clickY, minimapWidth = 220, minimapHeight = 220) {
  const clampedX = Math.max(0, Math.min(minimapWidth, Number(clickX) || 0));
  const clampedY = Math.max(0, Math.min(minimapHeight, Number(clickY) || 0));

  const worldX = (clampedX / minimapWidth) * 1000;
  const worldY = (clampedY / minimapHeight) * 1000;
  const [lng, lat] = worldToLngLat(worldX, worldY);

  return {
    worldX: +worldX.toFixed(2),
    worldY: +worldY.toFixed(2),
    lng,
    lat
  };
}

/**
 * Computes the active viewport bounding box rectangle based on current map camera viewState.
 * 
 * @param {Object} viewState - { longitude, latitude, zoom }
 * @returns {Object} Frustum bounding box in LngLat and World coordinates
 */
export function calculateViewportFrustum(viewState = { longitude: 0, latitude: 0, zoom: 6 }) {
  const longitude = Number(viewState?.longitude ?? 0);
  const latitude = Number(viewState?.latitude ?? 0);
  const zoom = Math.max(1, Number(viewState?.zoom ?? 6));

  const spanDeg = Math.max(0.5, 360 / Math.pow(2, zoom));
  const minLng = Math.max(-180, longitude - spanDeg / 2);
  const maxLng = Math.min(180, longitude + spanDeg / 2);
  const minLat = Math.max(-90, latitude - (spanDeg / 2) * 0.5);
  const maxLat = Math.min(90, latitude + (spanDeg / 2) * 0.5);

  const pMin = lngLatToWorld(minLng, maxLat);
  const pMax = lngLatToWorld(maxLng, minLat);

  return {
    minLng: +minLng.toFixed(6),
    maxLng: +maxLng.toFixed(6),
    minLat: +minLat.toFixed(6),
    maxLat: +maxLat.toFixed(6),
    minX: pMin.x,
    maxX: pMax.x,
    minY: pMin.y,
    maxY: pMax.y,
    width: Math.abs(pMax.x - pMin.x),
    height: Math.abs(pMax.y - pMin.y)
  };
}

export const MinimapRadarEngine = {
  worldToLngLat,
  lngLatToWorld,
  projectWorldToMinimap,
  projectMinimapClickToWorld,
  calculateViewportFrustum
};

export default MinimapRadarEngine;
