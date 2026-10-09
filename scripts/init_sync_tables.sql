-- ============================================================================
-- GrepoTools: Direct PostgreSQL DDL Migration for World Sync Observability
-- Run via: docker compose exec -i db psql -U grepo_user -d grepotools < scripts/init_sync_tables.sql
-- ============================================================================

-- 1. Ensure new World sync tracking columns
ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "lastSyncStatus" TEXT;
ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "lastSyncError" TEXT;
ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "lastSyncDurationMs" INTEGER;

-- 2. Create SyncLog table
CREATE TABLE IF NOT EXISTS "SyncLog" (
    "id" SERIAL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'CRON',
    "durationMs" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "stats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Indexes
CREATE INDEX IF NOT EXISTS "SyncLog_worldId_createdAt_idx" ON "SyncLog"("worldId", "createdAt");
CREATE INDEX IF NOT EXISTS "SyncLog_status_createdAt_idx" ON "SyncLog"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "SyncLog_createdAt_idx" ON "SyncLog"("createdAt");

-- 4. Foreign Key Constraint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SyncLog_worldId_fkey') THEN
    ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
