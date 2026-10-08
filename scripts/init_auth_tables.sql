-- ============================================================================
-- GrepoTools: Direct PostgreSQL DDL Migration for Authentication & Team RBAC
-- Run via: docker compose exec -i db psql -U grepo_user -d grepotools < scripts/init_auth_tables.sql
-- ============================================================================

-- 1. User Table
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "globalRole" TEXT NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE INDEX IF NOT EXISTS "User_username_idx" ON "User"("username");

-- 2. Team Table
CREATE TABLE IF NOT EXISTS "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Team_worldId_idx" ON "Team"("worldId");
CREATE UNIQUE INDEX IF NOT EXISTS "Team_worldId_name_key" ON "Team"("worldId", "name");

-- 3. TeamMember Table
CREATE TABLE IF NOT EXISTS "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'TEAM_MEMBER',
    "playerId" INTEGER NOT NULL,
    "playerName" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TeamMember_worldId_verificationStatus_idx" ON "TeamMember"("worldId", "verificationStatus");
CREATE INDEX IF NOT EXISTS "TeamMember_teamId_role_idx" ON "TeamMember"("teamId", "role");
CREATE UNIQUE INDEX IF NOT EXISTS "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "TeamMember_worldId_playerId_key" ON "TeamMember"("worldId", "playerId");

-- 4. TeamCustomRole Table
CREATE TABLE IF NOT EXISTS "TeamCustomRole" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#3B82F6',
    "icon" TEXT DEFAULT 'shield',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamCustomRole_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TeamCustomRole_teamId_idx" ON "TeamCustomRole"("teamId");
CREATE UNIQUE INDEX IF NOT EXISTS "TeamCustomRole_teamId_name_key" ON "TeamCustomRole"("teamId", "name");

-- 5. TeamMemberRoleAssignment Table
CREATE TABLE IF NOT EXISTS "TeamMemberRoleAssignment" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "customRoleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMemberRoleAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TeamMemberRoleAssignment_memberId_idx" ON "TeamMemberRoleAssignment"("memberId");
CREATE INDEX IF NOT EXISTS "TeamMemberRoleAssignment_customRoleId_idx" ON "TeamMemberRoleAssignment"("customRoleId");
CREATE UNIQUE INDEX IF NOT EXISTS "TeamMemberRoleAssignment_memberId_customRoleId_key" ON "TeamMemberRoleAssignment"("memberId", "customRoleId");

-- 6. Invite Table
CREATE TABLE IF NOT EXISTS "Invite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'TEAM_MEMBER',
    "targetPlayerName" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "customRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Invite_token_key" ON "Invite"("token");
CREATE INDEX IF NOT EXISTS "Invite_token_idx" ON "Invite"("token");
CREATE INDEX IF NOT EXISTS "Invite_teamId_idx" ON "Invite"("teamId");
CREATE INDEX IF NOT EXISTS "Invite_worldId_idx" ON "Invite"("worldId");

-- 7. RefreshToken Table
CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
CREATE INDEX IF NOT EXISTS "RefreshToken_tokenHash_idx" ON "RefreshToken"("tokenHash");

-- 8. AuditLog Table
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actorUsername" TEXT,
    "action" TEXT NOT NULL,
    "targetResource" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- 9. Update SnipeOperation (add userId if missing)
ALTER TABLE "SnipeOperation" ADD COLUMN IF NOT EXISTS "userId" TEXT;
CREATE INDEX IF NOT EXISTS "SnipeOperation_userId_idx" ON "SnipeOperation"("userId");

-- 10. Foreign Key Constraints
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Team_worldId_fkey') THEN
    ALTER TABLE "Team" ADD CONSTRAINT "Team_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamMember_teamId_fkey') THEN
    ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamMember_userId_fkey') THEN
    ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamMember_worldId_fkey') THEN
    ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamCustomRole_teamId_fkey') THEN
    ALTER TABLE "TeamCustomRole" ADD CONSTRAINT "TeamCustomRole_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamMemberRoleAssignment_memberId_fkey') THEN
    ALTER TABLE "TeamMemberRoleAssignment" ADD CONSTRAINT "TeamMemberRoleAssignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamMemberRoleAssignment_customRoleId_fkey') THEN
    ALTER TABLE "TeamMemberRoleAssignment" ADD CONSTRAINT "TeamMemberRoleAssignment_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "TeamCustomRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invite_teamId_fkey') THEN
    ALTER TABLE "Invite" ADD CONSTRAINT "Invite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invite_worldId_fkey') THEN
    ALTER TABLE "Invite" ADD CONSTRAINT "Invite_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invite_createdById_fkey') THEN
    ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RefreshToken_userId_fkey') THEN
    ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_userId_fkey') THEN
    ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SnipeOperation_userId_fkey') THEN
    ALTER TABLE "SnipeOperation" ADD CONSTRAINT "SnipeOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
