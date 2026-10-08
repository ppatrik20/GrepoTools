/**
 * WorldDeltaEngine: Pure Historical Delta & Mutation Engine
 * Diffing engine that computes database inserts, updates, deletions, and chronological
 * history deltas between live database snapshots and incoming Grepolis data feeds.
 * 100% pure functions with zero database or network I/O.
 */

/**
 * Computes alliance state deltas and historical point/kill changes.
 * 
 * @param {Array<object>} incomingAlliances Parsed from Grepolis feed
 * @param {Array<object>} currentAlliances From database
 * @param {string} worldId
 * @returns {object} { toCreate, toUpdate, toDelete, historyDeltas }
 */
export function computeAllianceDeltas(incomingAlliances = [], currentAlliances = [], worldId) {
  const toCreate = [];
  const toUpdate = [];
  const historyDeltas = [];

  const currentMap = new Map(currentAlliances.map(a => [a.id, a]));
  const seenIds = new Set();

  for (const item of incomingAlliances) {
    seenIds.add(item.id);
    const existing = currentMap.get(item.id);

    if (!existing) {
      toCreate.push(item);
    } else {
      let changed = false;
      const pointsDiff = existing.points !== item.points;
      const abpDiff = existing.abp !== item.abp;
      const dbpDiff = existing.dbp !== item.dbp;

      if (pointsDiff || abpDiff || dbpDiff) {
        historyDeltas.push({
          worldId,
          allianceId: item.id,
          oldPoints: existing.points,
          newPoints: item.points,
          abpDelta: item.abp - (existing.abp || 0),
          dbpDelta: item.dbp - (existing.dbp || 0),
          allBpDelta: item.allBp - (existing.allBp || 0)
        });
        changed = true;
      }

      if (
        existing.name !== item.name ||
        existing.towns !== item.towns ||
        existing.members !== item.members ||
        existing.rank !== item.rank ||
        existing.allBp !== item.allBp
      ) {
        changed = true;
      }

      if (changed) {
        toUpdate.push(item);
      }
    }
  }

  const toDelete = currentAlliances.filter(a => !seenIds.has(a.id)).map(a => a.id);

  return { toCreate, toUpdate, toDelete, historyDeltas };
}

/**
 * Computes player state deltas and historical point/kill changes.
 * 
 * @param {Array<object>} incomingPlayers Parsed from Grepolis feed
 * @param {Array<object>} currentPlayers From database
 * @param {string} worldId
 * @returns {object} { toCreate, toUpdate, toDelete, historyDeltas }
 */
export function computePlayerDeltas(incomingPlayers = [], currentPlayers = [], worldId) {
  const toCreate = [];
  const toUpdate = [];
  const historyDeltas = [];

  const currentMap = new Map(currentPlayers.map(p => [p.id, p]));
  const seenIds = new Set();

  for (const item of incomingPlayers) {
    seenIds.add(item.id);
    const existing = currentMap.get(item.id);

    if (!existing) {
      toCreate.push(item);
    } else {
      let changed = false;
      const pointsDiff = existing.points !== item.points;
      const abpDiff = existing.abp !== item.abp;
      const dbpDiff = existing.dbp !== item.dbp;

      if (pointsDiff || abpDiff || dbpDiff) {
        historyDeltas.push({
          worldId,
          playerId: item.id,
          oldPoints: existing.points,
          newPoints: item.points,
          abpDelta: item.abp - (existing.abp || 0),
          dbpDelta: item.dbp - (existing.dbp || 0),
          allBpDelta: item.allBp - (existing.allBp || 0)
        });
        changed = true;
      }

      if (
        existing.name !== item.name ||
        existing.allianceId !== item.allianceId ||
        existing.rank !== item.rank ||
        existing.towns !== item.towns ||
        existing.allBp !== item.allBp
      ) {
        changed = true;
      }

      if (changed) {
        toUpdate.push(item);
      }
    }
  }

  const toDelete = currentPlayers.filter(p => !seenIds.has(p.id)).map(p => p.id);

  return { toCreate, toUpdate, toDelete, historyDeltas };
}

/**
 * Computes town state deltas and historical point changes.
 * 
 * @param {Array<object>} incomingTowns Parsed from Grepolis feed
 * @param {Array<object>} currentTowns From database
 * @param {string} worldId
 * @returns {object} { toCreate, toUpdate, toDelete, historyDeltas }
 */
export function computeTownDeltas(incomingTowns = [], currentTowns = [], worldId) {
  const toCreate = [];
  const toUpdate = [];
  const historyDeltas = [];

  const currentMap = new Map(currentTowns.map(t => [t.id, t]));
  const seenIds = new Set();

  for (const item of incomingTowns) {
    seenIds.add(item.id);
    const existing = currentMap.get(item.id);

    if (!existing) {
      toCreate.push(item);
    } else {
      let changed = false;
      if (existing.points !== item.points) {
        historyDeltas.push({
          worldId,
          townId: item.id,
          oldPoints: existing.points,
          newPoints: item.points
        });
        changed = true;
      }

      if (
        existing.playerId !== item.playerId ||
        existing.name !== item.name ||
        existing.islandX !== item.islandX ||
        existing.islandY !== item.islandY ||
        existing.islandSlot !== item.islandSlot
      ) {
        changed = true;
      }

      if (changed) {
        toUpdate.push(item);
      }
    }
  }

  const toDelete = currentTowns.filter(t => !seenIds.has(t.id)).map(t => t.id);

  return { toCreate, toUpdate, toDelete, historyDeltas };
}

/**
 * Computes island state deltas (inserts, availableTown updates, removals).
 * 
 * @param {Array<object>} incomingIslands Parsed from Grepolis feed
 * @param {Array<object>} currentIslands From database
 * @param {string} worldId
 * @returns {object} { toCreate, toUpdate, toDelete }
 */
export function computeIslandDeltas(incomingIslands = [], currentIslands = [], worldId) {
  const toCreate = [];
  const toUpdate = [];

  const currentMap = new Map(currentIslands.map(i => [i.id, i]));
  const seenIds = new Set();

  for (const item of incomingIslands) {
    seenIds.add(item.id);
    const existing = currentMap.get(item.id);

    if (!existing) {
      toCreate.push(item);
    } else if (existing.availableTowns !== item.availableTowns) {
      toUpdate.push(item);
    }
  }

  const toDelete = currentIslands.filter(i => !seenIds.has(i.id)).map(i => i.id);

  return { toCreate, toUpdate, toDelete };
}
