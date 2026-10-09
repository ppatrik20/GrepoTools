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
  }
};
