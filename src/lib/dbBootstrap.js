import { prisma as defaultPrisma } from './prisma.js';

let bootstrapPromise = null;

export const SYNC_SCHEMA_STATEMENTS = [
  `ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "lastSyncStatus" TEXT`,
  `ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "lastSyncError" TEXT`,
  `ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "lastSyncDurationMs" INTEGER`,
  `CREATE TABLE IF NOT EXISTS "SyncLog" (
      "id" TEXT NOT NULL,
      "worldId" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "trigger" TEXT NOT NULL DEFAULT 'CRON',
      "durationMs" INTEGER NOT NULL DEFAULT 0,
      "errorMessage" TEXT,
      "stats" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "SyncLog" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;`,
  `CREATE INDEX IF NOT EXISTS "SyncLog_worldId_createdAt_idx" ON "SyncLog"("worldId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "SyncLog_status_createdAt_idx" ON "SyncLog"("status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "SyncLog_createdAt_idx" ON "SyncLog"("createdAt")`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SyncLog_worldId_fkey') THEN
      ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$;`,
  `CREATE TABLE IF NOT EXISTS "Coalition" (
      "id" TEXT NOT NULL,
      "worldId" TEXT NOT NULL DEFAULT 'hu119',
      "name" TEXT NOT NULL,
      "color" TEXT NOT NULL DEFAULT '#10b981',
      "allianceIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
      "alliances" TEXT[] DEFAULT ARRAY[]::TEXT[],
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Coalition_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Coalition_worldId_name_key" ON "Coalition"("worldId", "name")`,
  `CREATE INDEX IF NOT EXISTS "Coalition_worldId_idx" ON "Coalition"("worldId")`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Coalition_worldId_fkey') THEN
      ALTER TABLE "Coalition" ADD CONSTRAINT "Coalition_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$;`,
  `CREATE INDEX IF NOT EXISTS "Conquest_worldId_newPlayerId_idx" ON "Conquest"("worldId", "newPlayerId")`,
  `CREATE INDEX IF NOT EXISTS "Conquest_worldId_oldPlayerId_idx" ON "Conquest"("worldId", "oldPlayerId")`,
  `CREATE INDEX IF NOT EXISTS "Conquest_worldId_newAllianceId_idx" ON "Conquest"("worldId", "newAllianceId")`,
  `CREATE INDEX IF NOT EXISTS "Conquest_worldId_oldAllianceId_idx" ON "Conquest"("worldId", "oldAllianceId")`,

  // World endgame columns
  `ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "endgameType" TEXT NOT NULL DEFAULT 'NONE'`,
  `ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "endgamePhase" TEXT NOT NULL DEFAULT 'PRE_ERA'`,
  `ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "endgameSpeed" TEXT NOT NULL DEFAULT 'NORMAL'`,
  `ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "worldStartedAt" TIMESTAMP(3)`,
  `ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "eraStartedAt" TIMESTAMP(3)`,
  `ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "lastStandStartedAt" TIMESTAMP(3)`,
  `ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "lastStandAllianceId" INTEGER`,
  `ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "dominationTargetPct" DOUBLE PRECISION NOT NULL DEFAULT 40.0`,

  // TeamMember endgame status columns
  `ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "vacationModeActive" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "vacationUpdatedAt" TIMESTAMP(3)`,
  `ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "allianceJoinedAt" TIMESTAMP(3)`,

  // TeamWonderProject table
  `CREATE TABLE IF NOT EXISTS "TeamWonderProject" (
      "id" TEXT NOT NULL,
      "teamId" TEXT NOT NULL,
      "worldId" TEXT NOT NULL,
      "islandId" INTEGER NOT NULL,
      "wonderType" TEXT NOT NULL,
      "allianceId" INTEGER,
      "currentStage" INTEGER NOT NULL DEFAULT 0,
      "isUnderExpansion" BOOLEAN NOT NULL DEFAULT false,
      "expansionEndsAt" TIMESTAMP(3),
      "stageWoodCollected" INTEGER NOT NULL DEFAULT 0,
      "stageStoneCollected" INTEGER NOT NULL DEFAULT 0,
      "stageSilverCollected" INTEGER NOT NULL DEFAULT 0,
      "favorAccelerationsCount" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TeamWonderProject_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "TeamWonderProject_teamId_islandId_key" ON "TeamWonderProject"("teamId", "islandId")`,
  `CREATE INDEX IF NOT EXISTS "TeamWonderProject_worldId_wonderType_idx" ON "TeamWonderProject"("worldId", "wonderType")`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamWonderProject_teamId_fkey') THEN
      ALTER TABLE "TeamWonderProject" ADD CONSTRAINT "TeamWonderProject_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamWonderProject_worldId_fkey') THEN
      ALTER TABLE "TeamWonderProject" ADD CONSTRAINT "TeamWonderProject_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$;`,

  // TeamWonderContribution table
  `CREATE TABLE IF NOT EXISTS "TeamWonderContribution" (
      "id" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "memberId" TEXT NOT NULL,
      "resourceWood" INTEGER NOT NULL DEFAULT 0,
      "resourceStone" INTEGER NOT NULL DEFAULT 0,
      "resourceSilver" INTEGER NOT NULL DEFAULT 0,
      "favorCastsCount" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'COMPLETED',
      "etaArrival" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TeamWonderContribution_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "TeamWonderContribution_projectId_idx" ON "TeamWonderContribution"("projectId")`,
  `CREATE INDEX IF NOT EXISTS "TeamWonderContribution_memberId_idx" ON "TeamWonderContribution"("memberId")`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamWonderContribution_projectId_fkey') THEN
      ALTER TABLE "TeamWonderContribution" ADD CONSTRAINT "TeamWonderContribution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "TeamWonderProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamWonderContribution_memberId_fkey') THEN
      ALTER TABLE "TeamWonderContribution" ADD CONSTRAINT "TeamWonderContribution_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$;`,

  // DominationValidIsland table
  `CREATE TABLE IF NOT EXISTS "DominationValidIsland" (
      "id" TEXT NOT NULL,
      "worldId" TEXT NOT NULL,
      "islandKey" TEXT NOT NULL,
      "isValid" BOOLEAN NOT NULL DEFAULT true,
      "isManuallySet" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DominationValidIsland_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DominationValidIsland_worldId_islandKey_key" ON "DominationValidIsland"("worldId", "islandKey")`,
  `CREATE INDEX IF NOT EXISTS "DominationValidIsland_worldId_isValid_idx" ON "DominationValidIsland"("worldId", "isValid")`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DominationValidIsland_worldId_fkey') THEN
      ALTER TABLE "DominationValidIsland" ADD CONSTRAINT "DominationValidIsland_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$;`,

  // OlympusTempleState table
  `CREATE TABLE IF NOT EXISTS "OlympusTempleState" (
      "id" TEXT NOT NULL,
      "worldId" TEXT NOT NULL,
      "islandKey" TEXT NOT NULL,
      "templeTownId" INTEGER,
      "templeCategory" TEXT NOT NULL,
      "god" TEXT,
      "buffCode" TEXT,
      "buffName" TEXT,
      "ownerAllianceId" INTEGER,
      "shieldEndsAt" TIMESTAMP(3),
      "nextJumpAt" TIMESTAMP(3),
      "garrisonJson" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OlympusTempleState_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "OlympusTempleState_worldId_islandKey_key" ON "OlympusTempleState"("worldId", "islandKey")`,
  `CREATE INDEX IF NOT EXISTS "OlympusTempleState_worldId_templeCategory_idx" ON "OlympusTempleState"("worldId", "templeCategory")`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OlympusTempleState_worldId_fkey') THEN
      ALTER TABLE "OlympusTempleState" ADD CONSTRAINT "OlympusTempleState_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
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
