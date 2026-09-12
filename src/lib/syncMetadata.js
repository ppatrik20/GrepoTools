import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';

// Fetches the lastSync epoch time for a given world
const getSyncEpochDirect = async (worldId = 'hu119') => {
  try {
    const world = await prisma.world.findUnique({
      where: { id: worldId },
      select: { lastSync: true }
    });
    if (world && world.lastSync) {
      return Math.floor(world.lastSync.getTime() / 1000);
    }
    
    const meta = await prisma.syncMetadata.findFirst({
      where: { worldId },
      select: { lastSync: true }
    });
    return meta ? Math.floor(meta.lastSync.getTime() / 1000) : 0;
  } catch (e) {
    console.error("Error fetching sync epoch:", e);
    return 0;
  }
};

const cachedSyncEpoch = unstable_cache(
  getSyncEpochDirect,
  ['sync-meta-by-world'],
  { tags: ['sync-meta'] }
);

// Fetches the lastSync epoch time for a given world with fallback
export const getCachedSyncEpoch = async (worldId = 'hu119') => {
  try {
    return await cachedSyncEpoch(worldId);
  } catch {
    return await getSyncEpochDirect(worldId);
  }
};
