/**
 * src/lib/map/trajectories.js
 * Trajectory & Animated Transit Engine
 * Milestone 3 (F7, F8, F9, F10)
 */

/**
 * Calculates smooth quadratic Bézier flight curve coordinates between two map points.
 * 
 * @param {Object} origin - Origin coordinates ({ lng, lat } or { x, y } / { islandX, islandY })
 * @param {Object} target - Target coordinates ({ lng, lat } or { x, y } / { islandX, islandY })
 * @param {number} camber - Curvature factor (default 0.20)
 * @param {number} steps - Interpolation resolution steps (default 40)
 * @returns {Array<[number, number]>} Array of [lng, lat] coordinate pairs
 */
export function calculateArcTrajectory(origin, target, camber = 0.20, steps = 40) {
  if (!origin || !target) return [];

  const oLng = origin.lng ?? ((Number(origin.islandX ?? origin.x ?? 500) / 1000) * 360 - 180);
  const oLat = origin.lat ?? (-((Number(origin.islandY ?? origin.y ?? 500) / 1000) * 180 - 90));
  const tLng = target.lng ?? ((Number(target.islandX ?? target.x ?? 500) / 1000) * 360 - 180);
  const tLat = target.lat ?? (-((Number(target.islandY ?? target.y ?? 500) / 1000) * 180 - 90));

  const dLng = tLng - oLng;
  const dLat = tLat - oLat;
  const chordLen = Math.hypot(dLng, dLat);

  if (chordLen === 0) return [[oLng, oLat]];

  const midLng = (oLng + tLng) / 2;
  const arcHeight = Math.max(chordLen * camber, Math.abs(dLng) * 0.12, 0.0008);
  const midLat = (oLat + tLat) / 2 + arcHeight;

  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const curLng = (1 - t) * (1 - t) * oLng + 2 * (1 - t) * t * midLng + t * t * tLng;
    const curLat = (1 - t) * (1 - t) * oLat + 2 * (1 - t) * t * midLat + t * t * tLat;
    points.push([+curLng.toFixed(6), +curLat.toFixed(6)]);
  }

  return points;
}

/**
 * Computes current animation position, tangent orientation, and remaining ETA countdown along a transit curve.
 * 
 * @param {Object} transit - Active transit record
 * @param {number} currentTimeMs - Current Unix epoch timestamp in ms
 * @returns {{ currentLngLat: [number, number], rotationDegrees: number, remainingSeconds: number, isCompleted: boolean }}
 */
export function getTransitProgress(transit, currentTimeMs = Date.now()) {
  if (!transit) {
    return { currentLngLat: [0, 0], rotationDegrees: 0, remainingSeconds: 0, isCompleted: true };
  }

  const { startTime, landingTime, curveCoordinates = [] } = transit;
  const totalDurationMs = landingTime - startTime;

  if (totalDurationMs <= 0 || currentTimeMs >= landingTime) {
    const lastCoord = curveCoordinates[curveCoordinates.length - 1] || [0, 0];
    return {
      currentLngLat: lastCoord,
      rotationDegrees: 0,
      remainingSeconds: 0,
      isCompleted: true
    };
  }

  const progress = Math.max(0, Math.min(1, (currentTimeMs - startTime) / totalDurationMs));
  const remainingSeconds = Math.max(0, Math.ceil((landingTime - currentTimeMs) / 1000));

  if (curveCoordinates.length === 0) {
    return { currentLngLat: [0, 0], rotationDegrees: 0, remainingSeconds, isCompleted: false };
  }

  const totalSegments = curveCoordinates.length - 1;
  const exactIndex = progress * totalSegments;
  const lowerIndex = Math.floor(exactIndex);
  const upperIndex = Math.min(totalSegments, Math.ceil(exactIndex));
  const segmentT = exactIndex - lowerIndex;

  const p0 = curveCoordinates[lowerIndex];
  const p1 = curveCoordinates[upperIndex] || p0;

  const currentLng = p0[0] + (p1[0] - p0[0]) * segmentT;
  const currentLat = p0[1] + (p1[1] - p0[1]) * segmentT;

  const dLng = p1[0] - p0[0];
  const dLat = p1[1] - p0[1];
  let angleDeg = (Math.atan2(dLat, dLng) * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360;

  return {
    currentLngLat: [+currentLng.toFixed(6), +currentLat.toFixed(6)],
    rotationDegrees: +angleDeg.toFixed(2),
    remainingSeconds,
    isCompleted: progress >= 1.0
  };
}

/**
 * Calculates multi-origin launch schedules synchronized to land simultaneously on a single target town.
 * 
 * @param {Array<Object>} originTowns - Array of origin towns
 * @param {Object} targetTown - Target town
 * @param {number} landingTimeMs - Target landing epoch timestamp in ms
 * @param {number} unitBaseSpeed - Base speed of slowest unit (e.g. 3 for CS, 15 for Bireme, 35 for Pegasus)
 * @param {number} worldSpeed - World speed multiplier
 * @param {number} unitSpeed - Unit speed modifier
 * @returns {Array<Object>} Array of synchronized launch specifications
 */
export function calculateSnipingSynchronization(
  originTowns = [], 
  targetTown = {}, 
  landingTimeMs = Date.now(), 
  unitBaseSpeed = 3, 
  worldSpeed = 3, 
  unitSpeed = 1
) {
  if (!Array.isArray(originTowns) || !targetTown) return [];

  const targetX = Number(targetTown.islandX ?? targetTown.x ?? 500);
  const targetY = Number(targetTown.islandY ?? targetTown.y ?? 500);

  return originTowns.map(origin => {
    const origX = Number(origin.islandX ?? origin.x ?? 500);
    const origY = Number(origin.islandY ?? origin.y ?? 500);
    const dist = Math.hypot(targetX - origX, targetY - origY);

    const effectiveSpeed = unitBaseSpeed * worldSpeed * unitSpeed;
    const durationMinutes = effectiveSpeed > 0 ? (dist * 50) / effectiveSpeed : 0;
    const durationSeconds = Math.round(durationMinutes * 60);

    const launchTimeMs = landingTimeMs - (durationSeconds * 1000);
    const isFeasible = launchTimeMs >= Date.now();

    const hrs = Math.floor(durationSeconds / 3600).toString().padStart(2, '0');
    const mins = Math.floor((durationSeconds % 3600) / 60).toString().padStart(2, '0');
    const secs = (durationSeconds % 60).toString().padStart(2, '0');

    return {
      originTownId: origin.id,
      originName: origin.name || `Town #${origin.id}`,
      originCoords: { x: origX, y: origY },
      targetTownId: targetTown.id,
      targetName: targetTown.name || `Town #${targetTown.id}`,
      targetCoords: { x: targetX, y: targetY },
      distance: +dist.toFixed(2),
      durationSeconds,
      travelFormatted: `${hrs}:${mins}:${secs}`,
      launchTimeMs,
      landingTimeMs,
      isFeasible
    };
  });
}

export const TrajectoryTransitEngine = {
  calculateArcTrajectory,
  getTransitProgress,
  calculateSnipingSynchronization
};

export default TrajectoryTransitEngine;
