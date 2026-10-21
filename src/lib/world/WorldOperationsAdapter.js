/**
 * WorldOperationsAdapter: Unified Client Seam for World Operations
 * Encapsulates administrative world management, synchronization triggers, cache rebuilding,
 * and island cleanup behind a standardized interface.
 */

export const WorldOperationsAdapter = {
  /**
   * Fetches the world list and active world status in parallel.
   * 
   * @param {string} [activeWorldId='hu119']
   * @param {object} [options]
   * @param {Function} [options.fetchImpl=fetch]
   * @returns {Promise<object>} { worlds, activeWorldStatus }
   */
  async fetchWorldOverview(activeWorldId = 'hu119', { fetchImpl = fetch } = {}) {
    const [worldsRes, statusRes] = await Promise.all([
      fetchImpl('/api/worlds'),
      fetchImpl(`/api/world/status?world=${encodeURIComponent(activeWorldId)}`)
    ]);

    const worldsData = await worldsRes.json();
    const statusData = await statusRes.json();

    if (!worldsRes.ok || !worldsData.success) {
      throw new Error(worldsData.error || 'Failed to load world directory');
    }

    return {
      worlds: Array.isArray(worldsData.worlds) ? worldsData.worlds : [],
      activeWorldStatus: statusData
    };
  },

  /**
   * Triggers world data synchronization for a specific world or all worlds.
   * 
   * @param {object} params
   * @param {string} [params.worldId='hu119']
   * @param {boolean} [params.force=true]
   * @param {boolean} [params.syncAll=false]
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<object>} Sync execution result
   */
  async triggerWorldSync({
    worldId = 'hu119',
    force = true,
    syncAll = false,
    fetchImpl = fetch
  } = {}) {
    const params = new URLSearchParams();
    if (syncAll) {
      params.set('all', 'true');
    } else {
      params.set('world', worldId.toLowerCase().trim());
    }
    if (force) {
      params.set('force', 'true');
    }

    const res = await fetchImpl(`/api/world/sync?${params.toString()}`);
    const data = await res.json();

    if (!res.ok || data.success === false) {
      throw new Error(data.error || `Sync failed for world ${worldId}`);
    }

    return data;
  },

  /**
   * Rebuilds compressed MapLibre GeoJSON and Scoreboard caches.
   * 
   * @param {string} worldId
   * @param {object} [options]
   * @param {Function} [options.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async rebuildWorldCaches(worldId, { fetchImpl = fetch } = {}) {
    const res = await fetchImpl(`/api/world/sync-cache?world=${encodeURIComponent(worldId)}`, {
      method: 'POST'
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || `Failed to rebuild caches for world ${worldId}`);
    }

    return data;
  },

  /**
   * Cleans unoccupied islands or a targeted island from database storage.
   * 
   * @param {object} params
   * @param {string} params.worldId
   * @param {number|string} [params.islandId]
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async cleanWorldIslands({ worldId, islandId, fetchImpl = fetch } = {}) {
    const params = new URLSearchParams({ worldId });
    if (islandId !== undefined && islandId !== null) {
      params.set('islandId', String(islandId));
    }

    const res = await fetchImpl(`/api/world/clean?${params.toString()}`, {
      method: 'DELETE'
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to clean island data');
    }

    return data;
  },

  /**
   * Creates or updates a game world configuration in the registry.
   * 
   * @param {object} worldData { id, name, server, speed, unitSpeed, worldType, isActive, isEditing }
   * @param {object} [options]
   * @param {Function} [options.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async saveWorld(worldData, { fetchImpl = fetch } = {}) {
    const isEditing = Boolean(worldData.isEditing);
    const method = isEditing ? 'PUT' : 'POST';

    const res = await fetchImpl('/api/worlds', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(worldData)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Failed to ${isEditing ? 'update' : 'create'} world`);
    }

    return data;
  },

  /**
   * Deletes a world and cascades all associated data.
   * 
   * @param {string} worldId
   * @param {object} [options]
   * @param {Function} [options.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async deleteWorld(worldId, { fetchImpl = fetch } = {}) {
    const res = await fetchImpl(`/api/worlds?id=${encodeURIComponent(worldId)}`, {
      method: 'DELETE'
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || `Failed to delete world ${worldId}`);
    }

    return data;
  },

  /**
   * Verifies the administrator password.
   * 
   * @param {string} password
   * @param {object} [options]
   * @param {Function} [options.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async verifyAdminPassword(password, { fetchImpl = fetch } = {}) {
    const res = await fetchImpl('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Invalid passcode');
    }
    return data;
  },

  /**
   * Fetches recent synchronization logs and diagnostics.
   * 
   * @param {object} [options]
   * @param {string} [options.worldId]
   * @param {string} [options.status]
   * @param {number} [options.limit=50]
   * @param {Function} [options.fetchImpl=fetch]
   * @returns {Promise<object[]>} Array of sync log records
   */
  async fetchSyncLogs({ worldId, status, limit = 50, fetchImpl = fetch } = {}) {
    const params = new URLSearchParams();
    if (worldId) params.set('world', worldId.toLowerCase().trim());
    if (status) params.set('status', status.toUpperCase().trim());
    if (limit) params.set('limit', String(limit));

    const res = await fetchImpl(`/api/world/sync-logs?${params.toString()}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch sync logs');
    }
    return data.logs || [];
  },

  /**
   * Fetches intelligence details for a town, player, alliance, or island and normalizes
   * common display fields while preserving raw response fields.
   *
   * @param {object} [params]
   * @param {string} [params.worldId='hu119']
   * @param {'town'|'player'|'alliance'|'island'} params.type
   * @param {string|number} [params.id]
   * @param {string|number} [params.x]
   * @param {string|number} [params.y]
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async fetchEntityIntel({
    worldId = 'hu119',
    type,
    id,
    x,
    y,
    fetchImpl = fetch
  } = {}) {
    const normalizedWorld = String(worldId || 'hu119').toLowerCase().trim();
    const normalizedType = String(type || '').toLowerCase().trim();

    if (!['town', 'player', 'alliance', 'island'].includes(normalizedType)) {
      throw new Error(`Unsupported entity type: ${type}`);
    }

    let url;
    if (normalizedType === 'island') {
      const params = new URLSearchParams({ world: normalizedWorld });
      if (x !== undefined && x !== null && y !== undefined && y !== null) {
        params.set('x', String(x));
        params.set('y', String(y));
      }
      if (id !== undefined && id !== null && id !== '') {
        params.set('id', String(id));
      }
      url = `/api/world/island?${params.toString()}`;
    } else {
      if (id === undefined || id === null || id === '') {
        throw new Error(`Entity id is required for ${normalizedType} intelligence`);
      }
      url = `/api/world/${normalizedType}/${encodeURIComponent(id)}?world=${encodeURIComponent(normalizedWorld)}`;
    }

    const res = await fetchImpl(url);
    const raw = await res.json();

    if (!res.ok || raw?.error || raw?.success === false) {
      throw new Error(raw?.error || `Failed to fetch ${normalizedType} intelligence`);
    }

    const entityData =
      normalizedType === 'town'
        ? raw.town || raw
        : normalizedType === 'player'
        ? raw.player || raw
        : normalizedType === 'alliance'
        ? raw.alliance || raw
        : raw.island || raw;

    const towns = Array.isArray(raw.towns)
      ? raw.towns
      : Array.isArray(entityData?.towns)
      ? entityData.towns
      : [];

    const members = Array.isArray(raw.members)
      ? raw.members
      : Array.isArray(entityData?.members)
      ? entityData.members
      : [];

    const conquests = Array.isArray(raw.conquests)
      ? raw.conquests
      : Array.isArray(entityData?.conquests)
      ? entityData.conquests
      : [];

    const history = Array.isArray(raw.history)
      ? raw.history
      : Array.isArray(entityData?.history)
      ? entityData.history
      : [];

    let displayName = entityData?.name || '';
    if (!displayName) {
      if (normalizedType === 'island') {
        const coordX = x ?? entityData?.x;
        const coordY = y ?? entityData?.y;
        displayName =
          coordX !== undefined && coordY !== undefined
            ? `Island (${coordX}, ${coordY})`
            : `Island #${id ?? entityData?.id ?? ''}`;
      } else {
        const capType = normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1);
        displayName = `${capType} #${entityData?.id ?? id}`;
      }
    }

    let allianceName = null;
    if (normalizedType === 'alliance') {
      allianceName = entityData?.name || null;
    } else if (normalizedType === 'player') {
      allianceName =
        (typeof entityData?.alliance === 'string'
          ? entityData.alliance
          : entityData?.alliance?.name) || null;
    } else if (normalizedType === 'town') {
      allianceName =
        (typeof entityData?.alliance === 'string'
          ? entityData.alliance
          : entityData?.alliance?.name) ||
        (typeof entityData?.player === 'object' ? entityData?.player?.alliance?.name : null) ||
        null;
    }

    const points =
      normalizedType === 'island'
        ? towns.reduce((sum, t) => sum + Number(t?.points || 0), 0)
        : Number(entityData?.points ?? raw?.points ?? 0);

    return {
      ...raw,
      entityType: normalizedType,
      entityData,
      displayName,
      allianceName,
      points,
      conquests,
      towns,
      members,
      history
    };
  },

  /**
   * Fetches the world scoreboard rankings, momentum charts, and recent conquests.
   *
   * @param {string} [worldId='hu119']
   * @param {object} [options]
   * @param {Function} [options.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async fetchScoreboardData(worldId = 'hu119', { fetchImpl = fetch } = {}) {
    const normalizedWorld = String(worldId || 'hu119').toLowerCase().trim();
    const res = await fetchImpl(`/api/world/scoreboard?world=${encodeURIComponent(normalizedWorld)}`);
    const data = await res.json();

    if (!res.ok || data?.error || data?.success === false) {
      throw new Error(data?.error || `Failed to fetch scoreboard for world ${normalizedWorld}`);
    }

    return data;
  },

  /**
   * Fetches momentum and trend data for players or alliances.
   *
   * @param {object} [params]
   * @param {string} [params.worldId='hu119']
   * @param {number} [params.windowHours=24]
   * @param {Array<string|number>} [params.playerIds=[]]
   * @param {Array<string|number>} [params.allianceIds=[]]
   * @param {Array<string|number>} [params.ids=[]]
   * @param {string} [params.search='']
   * @param {string} [params.type='']
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async fetchMomentumData({
    worldId = 'hu119',
    windowHours = 24,
    playerIds = [],
    allianceIds = [],
    ids = [],
    search = '',
    type = '',
    fetchImpl = fetch
  } = {}) {
    const normalizedWorld = String(worldId || 'hu119').toLowerCase().trim();
    const params = new URLSearchParams({ world: normalizedWorld });

    if (windowHours !== undefined && windowHours !== null) {
      params.set('windowHours', String(windowHours));
    }

    let resolvedType = type ? String(type).toLowerCase().trim() : '';
    if (!resolvedType) {
      if (Array.isArray(allianceIds) && allianceIds.length > 0 && (!playerIds || playerIds.length === 0)) {
        resolvedType = 'alliance';
      } else if (Array.isArray(playerIds) && playerIds.length > 0 && (!allianceIds || allianceIds.length === 0)) {
        resolvedType = 'player';
      }
    }
    if (resolvedType) {
      params.set('type', resolvedType);
    }

    if (Array.isArray(playerIds) && playerIds.length > 0) {
      params.set('playerIds', playerIds.join(','));
    }
    if (Array.isArray(allianceIds) && allianceIds.length > 0) {
      params.set('allianceIds', allianceIds.join(','));
    }

    const combinedIds =
      Array.isArray(ids) && ids.length > 0
        ? ids
        : resolvedType === 'alliance' && Array.isArray(allianceIds) && allianceIds.length > 0
        ? allianceIds
        : Array.isArray(playerIds) && playerIds.length > 0
        ? playerIds
        : Array.isArray(allianceIds) && allianceIds.length > 0
        ? allianceIds
        : [];

    if (combinedIds.length > 0) {
      params.set('ids', combinedIds.join(','));
    }

    if (search && String(search).trim()) {
      params.set('q', String(search).trim());
    }

    const res = await fetchImpl(`/api/world/momentum?${params.toString()}`);
    const data = await res.json();

    if (!res.ok || data?.error || data?.success === false) {
      throw new Error(data?.error || `Failed to fetch momentum data for world ${normalizedWorld}`);
    }

    return {
      ...data,
      results: Array.isArray(data?.results) ? data.results : []
    };
  },

  /**
   * Searches world entities (players, alliances, towns) by query string.
   *
   * @param {object} [params]
   * @param {string} [params.worldId='hu119']
   * @param {string} [params.query='']
   * @param {string} [params.type='']
   * @param {AbortSignal} [params.signal]
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async searchWorldEntities({
    worldId = 'hu119',
    query = '',
    type = '',
    signal,
    fetchImpl = fetch
  } = {}) {
    const normalizedWorld = String(worldId || 'hu119').toLowerCase().trim();
    const params = new URLSearchParams({
      world: normalizedWorld,
      q: String(query || '').trim()
    });
    if (type) {
      params.set('type', String(type).toLowerCase().trim());
    }

    const options = signal ? { signal } : undefined;
    const res = await fetchImpl(`/api/world/search?${params.toString()}`, options);
    const data = await res.json();

    if (!res.ok || data?.error || data?.success === false) {
      throw new Error(data?.error || 'Failed to search world entities');
    }

    return {
      ...data,
      players: Array.isArray(data?.players) ? data.players : [],
      alliances: Array.isArray(data?.alliances) ? data.alliances : [],
      towns: Array.isArray(data?.towns) ? data.towns : []
    };
  },

  /**
   * Fetches hourly point/BP delta history for a player or alliance.
   *
   * @param {object} [params]
   * @param {string} [params.worldId='hu119']
   * @param {'player'|'alliance'} [params.type='player']
   * @param {string|number} params.id
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async fetchHourlyHistory({
    worldId = 'hu119',
    type = 'player',
    id,
    fetchImpl = fetch
  } = {}) {
    if (id === undefined || id === null || id === '') {
      throw new Error('Entity id is required for hourly history');
    }
    const normalizedWorld = String(worldId || 'hu119').toLowerCase().trim();
    const normalizedType = String(type || 'player').toLowerCase().trim();
    const params = new URLSearchParams({
      world: normalizedWorld,
      type: normalizedType,
      id: String(id)
    });

    const res = await fetchImpl(`/api/world/history/hourly?${params.toString()}`);
    const data = await res.json();

    if (!res.ok || data?.error || data?.success === false) {
      throw new Error(data?.error || 'Failed to fetch hourly history');
    }

    return {
      ...data,
      history: Array.isArray(data?.history) ? data.history : []
    };
  },

  /**
   * Loads pinned players and alliances for a given world from storage.
   *
   * @param {string} [worldId='hu119']
   * @param {object} [options]
   * @param {Storage|null} [options.storage]
   * @returns {{ pinnedPlayers: Array, pinnedAlliances: Array }}
   */
  loadPinnedEntities(
    worldId = 'hu119',
    { storage = typeof window !== 'undefined' ? window.localStorage : null } = {}
  ) {
    const normalizedWorld = String(worldId || 'hu119').toLowerCase().trim();
    if (!storage) {
      return { pinnedPlayers: [], pinnedAlliances: [] };
    }

    let pinnedPlayers = [];
    let pinnedAlliances = [];
    try {
      const rawPlayers =
        storage.getItem(`grepoPinnedPlayers_${normalizedWorld}`) ??
        storage.getItem('grepoPinnedPlayers');
      const rawAlliances =
        storage.getItem(`grepoPinnedAlliances_${normalizedWorld}`) ??
        storage.getItem('grepoPinnedAlliances');

      if (rawPlayers) {
        const parsed = JSON.parse(rawPlayers);
        if (Array.isArray(parsed)) pinnedPlayers = parsed;
      }
      if (rawAlliances) {
        const parsed = JSON.parse(rawAlliances);
        if (Array.isArray(parsed)) pinnedAlliances = parsed;
      }
    } catch {
      // Ignore storage read/parse errors and return safe defaults
    }

    return { pinnedPlayers, pinnedAlliances };
  },

  /**
   * Saves pinned players and alliances for a given world to storage.
   *
   * @param {string} [worldId='hu119']
   * @param {object} [entities]
   * @param {Array} [entities.pinnedPlayers=[]]
   * @param {Array} [entities.pinnedAlliances=[]]
   * @param {object} [options]
   * @param {Storage|null} [options.storage]
   * @returns {{ pinnedPlayers: Array, pinnedAlliances: Array }}
   */
  savePinnedEntities(
    worldId = 'hu119',
    { pinnedPlayers = [], pinnedAlliances = [] } = {},
    { storage = typeof window !== 'undefined' ? window.localStorage : null } = {}
  ) {
    const normalizedWorld = String(worldId || 'hu119').toLowerCase().trim();
    const safePlayers = Array.isArray(pinnedPlayers) ? pinnedPlayers : [];
    const safeAlliances = Array.isArray(pinnedAlliances) ? pinnedAlliances : [];

    if (storage) {
      try {
        storage.setItem(`grepoPinnedPlayers_${normalizedWorld}`, JSON.stringify(safePlayers));
        storage.setItem(`grepoPinnedAlliances_${normalizedWorld}`, JSON.stringify(safeAlliances));
      } catch {
        // Ignore quota / storage errors
      }
    }

    return { pinnedPlayers: safePlayers, pinnedAlliances: safeAlliances };
  },

  /**
   * Fetches the town roster and configurations for a world/player.
   *
   * @param {object} [params]
   * @param {string} [params.worldId='hu119']
   * @param {string|number} [params.playerId]
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async fetchTownRoster({ worldId = 'hu119', playerId, fetchImpl = fetch } = {}) {
    const normalizedWorld = String(worldId || 'hu119').toLowerCase().trim();
    const params = new URLSearchParams({ world: normalizedWorld, worldId: normalizedWorld });
    if (playerId !== undefined && playerId !== null && playerId !== '') {
      params.set('playerId', String(playerId));
    }

    const res = await fetchImpl(`/api/towns?${params.toString()}`);
    const data = await res.json();

    if (!res.ok || data?.error || data?.success === false) {
      throw new Error(data?.error || 'Failed to fetch town roster');
    }

    return data;
  },

  /**
   * Saves a town's building/research/specialization configuration (always scoped with worldId).
   *
   * @param {object} [params]
   * @param {string} [params.worldId='hu119']
   * @param {string|number} params.townId
   * @param {string} [params.specialization]
   * @param {object} [params.buildings]
   * @param {boolean} [params.plowResearched]
   * @param {boolean} [params.hasThermalBaths]
   * @param {boolean} [params.bunksResearched]
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async saveTownConfiguration({
    worldId = 'hu119',
    townId,
    specialization,
    buildings,
    plowResearched,
    hasThermalBaths,
    bunksResearched,
    fetchImpl = fetch
  } = {}) {
    if (townId === undefined || townId === null || townId === '') {
      throw new Error('townId is required to save town configuration');
    }

    const normalizedWorld = String(worldId || 'hu119').toLowerCase().trim();
    const payload = {
      worldId: normalizedWorld,
      townId,
      ...(specialization !== undefined ? { specialization } : {}),
      ...(buildings !== undefined ? { buildings } : {}),
      ...(plowResearched !== undefined ? { plowResearched } : {}),
      ...(hasThermalBaths !== undefined ? { hasThermalBaths } : {}),
      ...(bunksResearched !== undefined ? { bunksResearched } : {})
    };

    const res = await fetchImpl('/api/towns', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok || data?.error || data?.success === false) {
      throw new Error(data?.error || 'Failed to save town configuration');
    }

    return data;
  },

  /**
   * Fetches the static Grepolis troop and ship catalog.
   *
   * @param {object} [options]
   * @param {Function} [options.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async fetchTroopCatalog({ fetchImpl = fetch } = {}) {
    const res = await fetchImpl('/api/units');
    const data = await res.json();

    if (!res.ok || data?.error || data?.success === false) {
      throw new Error(data?.error || 'Failed to fetch troop catalog');
    }

    return data;
  }
};
