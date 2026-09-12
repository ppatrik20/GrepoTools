#!/usr/bin/env node

/**
 * Standalone World Sync CLI Script for VPS Cronjobs
 * 
 * Usage:
 *   node scripts/sync.js               # Syncs all active worlds
 *   node scripts/sync.js --all          # Syncs all active worlds
 *   node scripts/sync.js --world=en143 # Syncs only world en143
 *   node scripts/sync.js --force       # Bypasses 20-min throttle check
 */

async function main() {
  const { syncWorld, syncAllActiveWorlds, prisma } = await import('../src/lib/syncEngine.js');

  const args = process.argv.slice(2);
  const force = args.includes('--force');
  let targetWorld = null;
  const worldArgEq = args.find(a => a.startsWith('--world='));
  if (worldArgEq) {
    targetWorld = worldArgEq.split('=')[1].trim().toLowerCase();
  } else {
    const worldIdx = args.indexOf('--world');
    if (worldIdx !== -1 && args[worldIdx + 1] && !args[worldIdx + 1].startsWith('--')) {
      targetWorld = args[worldIdx + 1].trim().toLowerCase();
    }
  }

  if (targetWorld !== null && (!targetWorld || !/^[a-z0-9]+$/.test(targetWorld))) {
    console.error(`[CLI Sync Error] Invalid world ID: "${targetWorld}". Must match /^[a-z0-9]+$/`);
    process.exit(1);
  }

  console.log('---------------------------------------------------------');
  console.log(`[GrepoTools CLI Sync] ${new Date().toISOString()}`);
  console.log('---------------------------------------------------------');

  try {
    if (targetWorld) {
      console.log(`🎯 Syncing specified world: ${targetWorld} (force: ${force})`);
      const res = await syncWorld(targetWorld, { force, skipCacheBuild: false });
      await prisma.$disconnect();
      if (!res.success) {
        console.error(`[CLI Sync] Failed to sync ${targetWorld}:`, res.error);
        process.exit(1);
      }
      console.log(`[CLI Sync] Successfully synced world ${targetWorld}`);
      process.exit(0);
    }

    // Sync all active worlds
    const res = await syncAllActiveWorlds({ force, skipCacheBuild: false });
    await prisma.$disconnect();

    if (!res.success) {
      console.error(`[CLI Sync] Failed to sync all worlds:`, res.error);
      process.exit(1);
    }

    const failedCount = (res.results || []).filter(r => !r.success).length;
    console.log('---------------------------------------------------------');
    console.log(`[GrepoTools CLI Sync] All jobs complete. (${res.totalWorlds - failedCount}/${res.totalWorlds} succeeded)`);
    console.log('---------------------------------------------------------');

    process.exit(failedCount > 0 ? 1 : 0);
  } catch (err) {
    console.error('[CLI Sync Fatal]', err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error('[CLI Sync Fatal]', e);
  process.exit(1);
});
