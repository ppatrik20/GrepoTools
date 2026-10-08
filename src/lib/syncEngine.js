import { prisma } from './prisma.js';
import { WorldSyncPipeline, fetchAndDecompress } from './world/WorldSyncPipeline.js';

export { prisma, fetchAndDecompress };

/**
 * Synchronize a single game world through the WorldSyncPipeline.
 * 
 * @param {string} worldIdInput
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function syncWorld(worldIdInput, options = {}) {
  return WorldSyncPipeline.executeSync(worldIdInput, options);
}

/**
 * Synchronize all active worlds sequentially through the WorldSyncPipeline.
 * 
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function syncAllActiveWorlds(options = {}) {
  return WorldSyncPipeline.syncAllActiveWorlds(options);
}
