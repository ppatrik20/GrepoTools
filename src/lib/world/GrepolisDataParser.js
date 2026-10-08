/**
 * GrepolisDataParser: Pure Data Feed Parser
 * Sanitizes and parses raw Grepolis server CSV dumps into typed domain collections.
 * 100% pure functions with zero I/O or network dependencies.
 */

/**
 * Parses raw kill file rows into a lookup Map of entityId -> killPoints
 * File format: [rank, entityId, killPoints]
 * 
 * @param {Array<Array<string>>} rows 
 * @returns {Map<number, number>}
 */
export function parseKillPoints(rows = []) {
  const killMap = new Map();
  for (const row of rows) {
    if (!row || row.length < 3) continue;
    const id = parseInt(row[1], 10);
    const kills = parseInt(row[2], 10);
    if (!isNaN(id) && !isNaN(kills)) {
      killMap.set(id, kills);
    }
  }
  return killMap;
}

/**
 * Parses raw alliances feed
 * File format: [id, name, points, towns, members, rank]
 * 
 * @param {Array<Array<string>>} rows 
 * @param {object} killMaps { aAttMap, aDefMap, aAllMap }
 * @param {string} worldId
 * @returns {Array<object>} Sanitized alliances list
 */
export function parseAlliances(rows = [], { aAttMap, aDefMap, aAllMap }, worldId) {
  const alliances = [];
  const seenIds = new Set();

  for (const row of rows) {
    if (!row || row.length < 6) continue;
    const [idStr, name, pointsStr, townsStr, membersStr, rankStr] = row;
    const id = parseInt(idStr, 10);
    if (isNaN(id) || seenIds.has(id)) continue;
    seenIds.add(id);

    alliances.push({
      id,
      worldId,
      name: name || '',
      points: parseInt(pointsStr, 10) || 0,
      towns: parseInt(townsStr, 10) || 0,
      members: parseInt(membersStr, 10) || 0,
      rank: parseInt(rankStr, 10) || 0,
      abp: aAttMap?.get(id) || 0,
      dbp: aDefMap?.get(id) || 0,
      allBp: aAllMap?.get(id) || 0
    });
  }

  return alliances;
}

/**
 * Parses raw players feed with alliance foreign key validation
 * File format: [id, name, allianceId, points, rank, towns]
 * 
 * @param {Array<Array<string>>} rows 
 * @param {object} killMaps { pAttMap, pDefMap, pAllMap }
 * @param {Set<number>} validAllianceIds 
 * @param {string} worldId
 * @returns {Array<object>} Sanitized players list
 */
export function parsePlayers(rows = [], { pAttMap, pDefMap, pAllMap }, validAllianceIds, worldId) {
  const players = [];
  const seenIds = new Set();

  for (const row of rows) {
    if (!row || row.length < 6) continue;
    const [idStr, name, allianceIdStr, pointsStr, rankStr, townsStr] = row;
    const id = parseInt(idStr, 10);
    if (isNaN(id) || seenIds.has(id)) continue;
    seenIds.add(id);

    let allianceId = allianceIdStr ? parseInt(allianceIdStr, 10) : null;
    if (allianceId && !validAllianceIds.has(allianceId)) {
      allianceId = null;
    }

    players.push({
      id,
      worldId,
      name: name || '',
      allianceId,
      points: parseInt(pointsStr, 10) || 0,
      rank: parseInt(rankStr, 10) || 0,
      towns: parseInt(townsStr, 10) || 0,
      abp: pAttMap?.get(id) || 0,
      dbp: pDefMap?.get(id) || 0,
      allBp: pAllMap?.get(id) || 0
    });
  }

  return players;
}

/**
 * Parses raw towns feed with player foreign key validation
 * File format: [id, playerId, name, x, y, slot, points]
 * 
 * @param {Array<Array<string>>} rows 
 * @param {Set<number>} validPlayerIds 
 * @param {string} worldId
 * @returns {Array<object>} Sanitized towns list
 */
export function parseTowns(rows = [], validPlayerIds, worldId) {
  const towns = [];
  const seenIds = new Set();

  for (const row of rows) {
    if (!row || row.length < 7) continue;
    const [idStr, playerIdStr, name, xStr, yStr, slotStr, pointsStr] = row;
    const id = parseInt(idStr, 10);
    if (isNaN(id) || seenIds.has(id)) continue;
    seenIds.add(id);

    let playerId = playerIdStr ? parseInt(playerIdStr, 10) : null;
    if (playerId && !validPlayerIds.has(playerId)) {
      playerId = null;
    }

    towns.push({
      id,
      worldId,
      playerId,
      name: name || '',
      islandX: parseInt(xStr, 10) || 0,
      islandY: parseInt(yStr, 10) || 0,
      islandSlot: parseInt(slotStr, 10) || 0,
      points: parseInt(pointsStr, 10) || 0
    });
  }

  return towns;
}

/**
 * Parses raw islands feed with spatial center distance bounds and populated coordinate filtering
 * File format: [id, x, y, type, towns, rPlus, rMinus]
 * 
 * @param {Array<Array<string>>} rows 
 * @param {Set<string>} populatedCoords Set of "x,y" coordinates containing active towns
 * @param {string} worldId
 * @param {number} [maxRadiusSq=62500] Distance squared from map center (500,500)
 * @returns {Array<object>} Sanitized islands list
 */
export function parseIslands(rows = [], populatedCoords = new Set(), worldId, maxRadiusSq = 250 * 250) {
  const islands = [];
  const seenIds = new Set();

  for (const row of rows) {
    if (!row || row.length < 7) continue;
    const [idStr, xStr, yStr, type, towns, rPlus, rMinus] = row;
    const id = parseInt(idStr, 10);
    if (isNaN(id) || seenIds.has(id)) continue;

    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);
    if (isNaN(x) || isNaN(y)) continue;

    // Filter islands beyond standard playable radius (250 coords from center 500,500)
    const distSq = Math.pow(x - 500, 2) + Math.pow(y - 500, 2);
    if (distSq > maxRadiusSq) continue;

    const availableTowns = parseInt(towns, 10) || 0;
    // Omit uninhabited rock islands with 0 available towns unless an existing town sits there
    if (availableTowns === 0 && !populatedCoords.has(`${x},${y}`)) continue;

    seenIds.add(id);
    islands.push({
      id,
      worldId,
      x,
      y,
      type: parseInt(type, 10) || 0,
      availableTowns,
      resourcePlus: rPlus || '',
      resourceMinus: rMinus || ''
    });
  }

  return islands;
}

/**
 * Parses raw conquests feed strictly newer than the specified epoch
 * File format: [townId, timestamp, newPlayerId, oldPlayerId, newAllianceId, oldAllianceId, points]
 * 
 * @param {Array<Array<string>>} rows 
 * @param {number} lastConquestEpoch Latest known timestamp in seconds
 * @param {string} worldId
 * @returns {Array<object>} Sanitized conquests list
 */
export function parseConquests(rows = [], lastConquestEpoch = 0, worldId) {
  const conquests = [];

  for (const row of rows) {
    if (!row || row.length < 7) continue;
    const [townIdStr, tsStr, newPStr, oldPStr, newAStr, oldAStr, pointsStr] = row;
    const timestampSec = parseInt(tsStr, 10);
    if (isNaN(timestampSec) || timestampSec <= lastConquestEpoch) continue;

    conquests.push({
      worldId,
      townId: parseInt(townIdStr, 10) || 0,
      townPoints: parseInt(pointsStr, 10) || 0,
      oldPlayerId: oldPStr && oldPStr !== '' ? parseInt(oldPStr, 10) : null,
      newPlayerId: newPStr && newPStr !== '' ? parseInt(newPStr, 10) : null,
      oldAllianceId: oldAStr && oldAStr !== '' ? parseInt(oldAStr, 10) : null,
      newAllianceId: newAStr && newAStr !== '' ? parseInt(newAStr, 10) : null,
      timestamp: new Date(timestampSec * 1000)
    });
  }

  return conquests;
}
