import { prisma as defaultPrisma } from './prisma.js';

let bootstrapPromise = null;

export const SYNC_SCHEMA_STATEMENTS = [
  `ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "lastSyncStatus" TEXT`,
  `ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "lastSyncError" TEXT`,
  `ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "lastSyncDurationMs" INTEGER`,
  `CREATE TABLE IF NOT EXISTS "SyncLog" (
      "id" SERIAL PRIMARY KEY,
      "worldId" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "trigger" TEXT NOT NULL DEFAULT 'CRON',
      "durationMs" INTEGER NOT NULL,
      "errorMessage" TEXT,
      "stats" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "SyncLog_worldId_createdAt_idx" ON "SyncLog"("worldId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "SyncLog_status_createdAt_idx" ON "SyncLog"("status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "SyncLog_createdAt_idx" ON "SyncLog"("createdAt")`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SyncLog_worldId_fkey') THEN
      ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$;`
];

/**
 * Ensures that necessary database schema modifications exist in PostgreSQL.
 * Safe, idempotent, non-destructive, and cached across the process lifetime.
 * 
 * @param {object} [prismaClient=defaultPrisma]
 * @returns {Promise<void>}
 */
export async function ensureDatabaseSchema(prismaClient = defaultPrisma) {
  if (typeof prismaClient?.$executeRawUnsafe !== 'function') return;
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    for (const sql of SYNC_SCHEMA_STATEMENTS) {
      try {
        await prismaClient.$executeRawUnsafe(sql);
      } catch (err) {
        console.warn('[dbBootstrap] Schema synchronization notice:', err.message);
      }
    }
  })();

  return bootstrapPromise;
}

/**
 * Resets the bootstrap cache (useful for test isolation).
 */
export function resetDatabaseSchemaCache() {
  bootstrapPromise = null;
}
