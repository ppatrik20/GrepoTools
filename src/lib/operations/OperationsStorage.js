/**
 * OperationsStorage: Dual Storage Adapter Seam
 * Bridges operation queues and recall groups across LocalStorage and Prisma API,
 * ensuring automatic Date revival, world-scoped keys, and error recovery.
 */

function getSafeLocalStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  // Safe mock for headless / SSR execution
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };
}

export const LocalOperationsAdapter = {
  /**
   * Retrieves world operation queue from localStorage, reviving Date objects.
   * @param {string} worldId 
   * @returns {Array<object>}
   */
  getQueue(worldId) {
    const storage = getSafeLocalStorage();
    try {
      const saved = (worldId ? storage.getItem(`grepo-operations-queue_${worldId}`) : null) || 
                    storage.getItem('grepo-operations-queue');
      if (!saved) return [];

      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];

      return parsed.map(op => ({
        ...op,
        windowStart: op.windowStart ? new Date(op.windowStart) : undefined,
        windowEnd: op.windowEnd ? new Date(op.windowEnd) : undefined,
        targetDate: op.targetDate ? new Date(op.targetDate) : undefined,
        idealLaunchDate: op.idealLaunchDate ? new Date(op.idealLaunchDate) : undefined
      }));
    } catch (err) {
      console.warn("Failed to parse local operations queue:", err);
      return [];
    }
  },

  /**
   * Saves operation queue to localStorage under world-scoped key.
   * @param {string} worldId 
   * @param {Array<object>} queue 
   */
  setQueue(worldId, queue) {
    if (!worldId) return;
    const storage = getSafeLocalStorage();
    try {
      storage.setItem(`grepo-operations-queue_${worldId}`, JSON.stringify(queue || []));
    } catch (err) {
      console.error("Failed to save local operations queue:", err);
    }
  },

  /**
   * Retrieves recall groups from localStorage, reviving movement & plan Dates.
   * @param {string} worldId 
   * @returns {Array<object>}
   */
  getRecallGroups(worldId) {
    const storage = getSafeLocalStorage();
    try {
      const saved = (worldId ? storage.getItem(`grepo-recall-groups_${worldId}`) : null) || 
                    storage.getItem('grepo-recall-groups');
      if (!saved) return [];

      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];

      return parsed.map(group => ({
        ...group,
        movements: Array.isArray(group.movements) ? group.movements.map(m => ({
          ...m,
          arrivalTime: m.arrivalTime ? new Date(m.arrivalTime) : undefined
        })) : [],
        plans: Array.isArray(group.plans) ? group.plans.map(p => ({
          ...p,
          targetReturnTime: p.targetReturnTime ? new Date(p.targetReturnTime) : undefined,
          sendTime: p.sendTime ? new Date(p.sendTime) : undefined,
          recallTime: p.recallTime ? new Date(p.recallTime) : undefined
        })) : []
      }));
    } catch (err) {
      console.warn("Failed to parse local recall groups:", err);
      return [];
    }
  },

  /**
   * Saves recall groups to localStorage under world-scoped key.
   * @param {string} worldId 
   * @param {Array<object>} groups 
   */
  setRecallGroups(worldId, groups) {
    if (!worldId) return;
    const storage = getSafeLocalStorage();
    try {
      storage.setItem(`grepo-recall-groups_${worldId}`, JSON.stringify(groups || []));
    } catch (err) {
      console.error("Failed to save local recall groups:", err);
    }
  }
};

export const RemoteOperationsAdapter = {
  /**
   * Fetches operations from /api/snipe/operations, reviving Date timestamps.
   * @param {object} params
   * @param {string} [params.worldId='hu119']
   * @param {string|number} [params.targetTownId]
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<Array<object>>}
   */
  async fetchOperations({ worldId = 'hu119', targetTownId, fetchImpl = fetch } = {}) {
    let url = `/api/snipe/operations?world=${encodeURIComponent(worldId)}`;
    if (targetTownId) {
      url += `&targetTownId=${encodeURIComponent(targetTownId)}`;
    }

    const res = await fetchImpl(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch operations: HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map(op => ({
      ...op,
      targetReturnTime: op.targetReturnTime ? new Date(op.targetReturnTime) : null,
      sendTime: op.sendTime ? new Date(op.sendTime) : null,
      recallTime: op.recallTime ? new Date(op.recallTime) : null,
      createdAt: op.createdAt ? new Date(op.createdAt) : null
    }));
  },

  /**
   * Saves a snipe/recall operation to the remote team database.
   * @param {object} operationData 
   * @param {object} [options]
   * @param {Function} [options.fetchImpl=fetch]
   * @returns {Promise<object>} Created operation
   */
  async saveOperation(operationData, { fetchImpl = fetch } = {}) {
    const res = await fetchImpl('/api/snipe/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operationData)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    return {
      ...data,
      targetReturnTime: data.targetReturnTime ? new Date(data.targetReturnTime) : null,
      sendTime: data.sendTime ? new Date(data.sendTime) : null,
      recallTime: data.recallTime ? new Date(data.recallTime) : null
    };
  },

  /**
   * Deletes an operation by ID.
   * @param {string} id 
   * @param {object} [options]
   * @param {Function} [options.fetchImpl=fetch]
   * @returns {Promise<boolean>}
   */
  async deleteOperation(id, { fetchImpl = fetch } = {}) {
    const res = await fetchImpl(`/api/snipe/operations?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return true;
  }
};
