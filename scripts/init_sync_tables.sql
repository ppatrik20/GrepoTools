-- ============================================================================
-- GrepoTools: Direct PostgreSQL DDL Migration for World Sync Observability
-- Run via: docker compose exec -i db psql -U grepo_user -d grepotools < scripts/init_sync_tables.sql
-- ============================================================================

-- 1. Ensure new World sync tracking columns
ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "lastSyncStatus" TEXT;
ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "lastSyncError" TEXT;
ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "lastSyncDurationMs" INTEGER;

-- 2. Create SyncLog table (with TEXT primary key matching Prisma @default(uuid()))
CREATE TABLE IF NOT EXISTS "SyncLog" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'CRON',
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "stats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- Idempotent migration for existing SERIAL "id" columns on SyncLog
ALTER TABLE "SyncLog" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;

-- 3. Create SyncLog Indexes
CREATE INDEX IF NOT EXISTS "SyncLog_worldId_createdAt_idx" ON "SyncLog"("worldId", "createdAt");
CREATE INDEX IF NOT EXISTS "SyncLog_status_createdAt_idx" ON "SyncLog"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "SyncLog_createdAt_idx" ON "SyncLog"("createdAt");

-- 4. SyncLog Foreign Key Constraint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SyncLog_worldId_fkey') THEN
    ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. Ensure Coalition table, indexes, and foreign key
CREATE TABLE IF NOT EXISTS "Coalition" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL DEFAULT 'hu119',
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#10b981',
    "allianceIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "alliances" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Coalition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Coalition_worldId_name_key" ON "Coalition"("worldId", "name");
CREATE INDEX IF NOT EXISTS "Coalition_worldId_idx" ON "Coalition"("worldId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Coalition_worldId_fkey') THEN
    ALTER TABLE "Coalition" ADD CONSTRAINT "Coalition_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 6. Ensure Conquest composite indexes for player and alliance lookups
CREATE INDEX IF NOT EXISTS "Conquest_worldId_newPlayerId_idx" ON "Conquest"("worldId", "newPlayerId");
CREATE INDEX IF NOT EXISTS "Conquest_worldId_oldPlayerId_idx" ON "Conquest"("worldId", "oldPlayerId");
CREATE INDEX IF NOT EXISTS "Conquest_worldId_newAllianceId_idx" ON "Conquest"("worldId", "newAllianceId");
CREATE INDEX IF NOT EXISTS "Conquest_worldId_oldAllianceId_idx" ON "Conquest"("worldId", "oldAllianceId");
