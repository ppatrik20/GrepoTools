# GrepoTools Tactical Operations Center: Architecture & Future Implementation Blueprint

## 1. Executive Summary & Strategic Vision

The objective of this project is to transform **GrepoTools** from a public analytics and scoreboard platform into a high-performance, private **Tactical Operations Center (GT-TOC)** for competitive Grepolis alliances. 

By integrating with the open-source **GrepoData City Indexer API** (leveraging our live database of **>5,000+ reports on `hu119`**), the platform bridges the gap between static game data (points, player ownership, island topology) and real-time military intelligence (enemy garrison unit counts, wall levels, building structures, god worship, and report history).

```
                               ┌────────────────────────────────────────────────────────┐
                               │               In-Game Grepolis Client                  │
                               │  (Alliance players view battle & spy reports in-game)  │
                               └──────────────────────────┬─────────────────────────────┘
                                                          │ Tampermonkey Userscript
                                                          ▼ [Index +] Action
                               ┌────────────────────────────────────────────────────────┐
                               │           GrepoData Public Cloud & Indexer             │
                               │         (Stores team intel, reports, units)            │
                               └──────────────────────────┬─────────────────────────────┘
                                                          │ REST API / JWT Token
                                                          ▼ (api.grepodata.com)
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                            GrepoTools Operations Center                                          │
│                                                                                                                  │
│  ┌────────────────────────┐       ┌────────────────────────┐       ┌──────────────────────────────────────────┐  │
│  │   Strict Team Auth     │ ────> │  Materialized Intel DB │ ────> │ Interactive Tactical Map & Op Room       │  │
│  │ (RBAC / Single-Use Inv)│       │ (Live Town State + Log)│       │ - Map Overlays (Wall 0, Garrison Type)   │  │
│  └────────────────────────┘       └────────────────────────┘       │ - Deep Town Drawer with Live Units       │  │
│                                                                    │ - Coordinated Strike & CS Snipe Center   │  │
│                                                                    └──────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Core Constraints & Decisions:
1. **Closed Beta Mode**: The system is designed for private alliance use. All GrepoData ingestion will use the owner's master API credentials stored securely on the server.
2. **Zero-Trust Security Model**: Prevent enemy espionage. No unauthenticated users can access intelligence or operational tools.
3. **High-Performance Architecture**: Materialized "Town Live State" projection to serve instant intelligence queries without calculating joins across thousands of historical records on every map click.
4. **Targeted In-Game Identity Provisioning**: Administrative generation of single-use invite links bound to specific in-game Grepolis usernames.

---

## 2. Authentication, Team Management & Anti-Espionage (RBAC)

### 2.1 Identity Hierarchy & Role Matrix

```
                      ┌──────────────────────────────────────────┐
                      │           Global System Admin            │
                      │             (Platform Owner)             │
                      └────────────────────┬─────────────────────┘
                                           │ Creates & Configures
                                           ▼
                      ┌──────────────────────────────────────────┐
                      │         World Team (e.g. hu119)          │
                      │   [Master GrepoData Credentials/Token]   │
                      └────────────────────┬─────────────────────┘
                                           │
             ┌─────────────────────────────┼─────────────────────────────┐
             │                             │                             │
             ▼                             ▼                             ▼
┌──────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────────┐
│       Team Leader        │  │       War Officer        │  │      Alliance Member     │
│       (Admin Role)       │  │    (Strategist Role)     │  │     (Operator Role)      │
├──────────────────────────┤  ├──────────────────────────┤  ├──────────────────────────┤
│ • Generate Invite Links  │  │ • Create Strike Ops      │  │ • View Tactical Map      │
│ • Revoke Leaked Accounts │  │ • Assign CS Snipes       │  │ • View Town Intel State  │
│ • Trigger Intel Sync     │  │ • Export Target Matrices │  │ • Schedule Recall Snipes │
│ • Manage Audit Logs      │  │ • Access All Intel Logs  │  │ • Submit Battle Reports  │
└──────────────────────────┘  └──────────────────────────┘  └──────────────────────────┘
```

---

### 2.2 In-Game Targeted Invite Flow

To guarantee that only verified alliance members gain access, the registration flow does not allow open signups. Every account must be invited and explicitly tied to their in-game Grepolis identity:

```
[Team Admin Panel]
  │
  ├─ 1. Admin enters In-Game Grepolis Username (e.g. "Leonidas")
  ├─ 2. Admin selects Assigned Role (e.g. "MEMBER" or "WAR_OFFICER")
  ├─ 3. System creates cryptographic single-use token: `inv_8f92a1...`
  └─ 4. Admin copies unique URL: `https://grepotools.com/join?token=inv_8f92a1...`
        │
        ▼ (Shared via Discord DM or In-Game Message)
[Alliance Player]
  │
  ├─ 1. Player opens invite link
  ├─ 2. System validates token (ensures not expired, not previously used)
  ├─ 3. App displays welcome screen: "Welcome, Leonidas [HU119]"
  ├─ 4. Player sets their personal password (stored with Argon2/Bcrypt hash)
  ├─ 5. System provisions user account, invalidates invite token, creates secure session
  └─ 6. Player enters Protected Operations Center with world pre-selected
```

---

### 2.3 User Authentication & Credential Storage

- **Password Storage**: Passwords hashed using `bcrypt` or `argon2id` with high work factor.
- **Session Management**: Secure, HTTP-only, SameSite strict cookie storing a cryptographically signed JWT or server-side session token.
- **Future GrepoData Identity Attribution**:
  - The system will map the internal `User.id` and `inGameName` to the contributor field in incoming GrepoData reports.
  - This allows team leadership to view intelligence contribution leaderboards ("Who indexed the most enemy reports this week?").

---

## 3. Subsite Architecture: Public vs Protected Operations Center

To ensure clean separation of concerns and bulletproof security, the application layout is partitioned into two distinct zones:

```
                          ┌───────────────────────────┐
                          │   Incoming Web Request    │
                          └─────────────┬─────────────┘
                                        │
                         Next.js Edge Middleware Check
                                        │
               ┌────────────────────────┴────────────────────────┐
               ▼                                                 ▼
      [Public / Public Mode]                          [Protected Team Space]
   Routes: `/`, `/stats`, `/login`                  Routes: `/ops/*` or `/team/*`
   - Read-only world statistics                     - Tactical Map (Wall & Unit Overlays)
   - Public scoreboards & conquers                  - Live Town Intel Drawer
   - Closed Beta: Redirects to login                - Recall Sniping Operation Center
                                                    - Target Opportunity Matrix
                                                    - Team Administration & Invites
```

### Route Protection Middleware Rules
1. Any request to `/ops/*`, `/api/intel/*`, `/api/snipe/*`, or `/api/team/*` requires a valid authenticated session.
2. The user's active `teamId` and `worldId` are embedded into the verified session context.
3. Every database query in the protected space is automatically filtered by `WHERE teamId = :sessionTeamId AND worldId = :sessionWorldId`, guaranteeing absolute data segregation.

---

## 4. Mass Intel Storage & High-Performance Data Architecture

### 4.1 The Mass Data Scaling Problem

On world `hu119`, we already have **>5,000 intelligence records**, and a competitive world will easily generate **20,000+ reports** over its lifecycle.
- An active frontline enemy town might have **50–200 individual reports** (recurrent spies, partial attacks, defense reports, wall adjustments).
- If the tactical map or town search attempted to query and join all 50+ raw records for thousands of towns simultaneously, queries would slow down dramatically, consuming huge CPU and memory.

---

### 4.2 The Solution: Two-Tier Data Architecture (Materialized Live State + History Log)

```
                                  ┌───────────────────────────┐
                                  │   Incoming Intel Report   │
                                  │   (GrepoData Sync or API) │
                                  └─────────────┬─────────────┘
                                                │
                                                ▼
                                  ┌───────────────────────────┐
                                  │  Atomic Ingestion Worker  │
                                  └──────┬─────────────┬──────┘
                                         │             │
                    1. Append Full Record│             │ 2. Compute & Update
                                         ▼             ▼
  ┌───────────────────────────────────────────┐   ┌───────────────────────────────────────────┐
  │         TIER 2: IntelRecord (Log)         │   │      TIER 1: TownIntelState (Live)        │
  ├───────────────────────────────────────────┤   ├───────────────────────────────────────────┤
  │ • Append-only historical stream           │   │ • Exactly 1 row per (Team, Town)          │
  │ • Stores raw report text & BBCodes        │   │ • Known Wall Level (e.g. 0 or 25)         │
  │ • Complete attacker/defender casualties   │   │ • Garrison breakdown: {slinger: 1400}     │
  │ • Exact timestamps & reporter username    │   │ • Computed Specialization: "LO_SLING"     │
  │ • Queried ONLY when expanding Deep Dive   │   │ • Freshness tag: FRESH / AGING / STALE    │
  │ • Compressed by background cleaner        │   │ • Served to Map & Drawer in < 5ms         │
  └───────────────────────────────────────────┘   └───────────────────────────────────────────┘
```

---

### 4.3 Materialized Town State Projection Logic

Whenever an intel report is processed for a town, the ingestion worker executes the following logic:

1. **Building Level Updates**:
   - If the report is a `SPY` report, update `wallLevel`, `senateLevel`, `farmLevel`, `barracksLevel`, `docksLevel`, `templeLevel`, `godWorshipped`.
   - If the report is an `ATTACK` report with catapult damage, update `wallLevel` to the resulting post-battle level.
2. **Garrison & Unit Composition Updates**:
   - Update `knownUnits` JSON object with current unit counts.
   - Calculate defensive/offensive population sums:
     $$\text{NavalDefPop} = \text{Biremes} \times 8 + \text{Triremes} \times 16$$
     $$\text{NavalOffPop} = \text{LightShips} \times 8$$
     $$\text{LandDefPop} = \text{Swordsmen} \times 1 + \text{Archers} \times 1 + \text{Hoplites} \times 1 + \text{Chariots} \times 4$$
     $$\text{LandOffPop} = \text{Slingers} \times 1 + \text{Horsemen} \times 3$$
3. **Specialization Classifier**:
   - Automatically assign tag:
     - `NO_LS`: Naval Offense ($\ge 70\%$ naval offensive pop)
     - `ND_BIR`: Naval Defense ($\ge 70\%$ naval defensive pop)
     - `LO_SLING`: Land Offense ($\ge 70\%$ land offensive pop)
     - `LD_DEF`: Land Defense Bunker ($\ge 70\%$ land defensive pop)
     - `MYTH_NUKE`: Manticores / Harpies / Gryffins ($\ge 10$ flying myth units)
     - `EMPTY`: Town has $< 50$ total pop in garrison
     - `MIXED`: Unspecialized or hybrid garrison
4. **Freshness Status**:
   - 🟢 `FRESH`: Report age $< 6 \text{ hours}$
   - 🟡 `RECENT`: Report age $< 24 \text{ hours}$
   - 🟠 `AGING`: Report age $< 72 \text{ hours}$
   - ⚪ `STALE`: Report age $\ge 72 \text{ hours}$

---

### 4.4 Intel Cleaner & Storage Compactor

To ensure the database remains lean over months of intense gameplay:
1. **Tier 1 (`TownIntelState`)** never grows in row count beyond the number of unique towns indexed.
2. **Tier 2 (`IntelRecord`)** compactor job runs weekly:
   - Reports older than 30 days have their verbose raw text cleared while retaining unit totals and timestamps.
   - Consecutive redundant spy reports with identical values are collapsed into a single summary range (`firstReportedAt` to `lastConfirmedAt`).

---

## 5. Tactical UI & Operational Center Modules

```
+----------------------------------------------------------------------------------------------------+
|                                  GREPOTOOLS TACTICAL OPERATIONS CENTER                             |
+----------------------------------------------------+-----------------------------------------------+
| SECTION A: TACTICAL WORLD MAP                      | SECTION B: TARGET & COMMAND DRAWER            |
|                                                    |                                               |
|  [Map Viewport]                                    |  Selected: Town #48291 "04 Sparta Prime"      |
|  - Red Ring: Enemy Town (Wall 0, Fresh Intel)      |  Player: EnemyCommander [ALLIANCE ALPHA]      |
|  - Blue Ring: Enemy Bunker (Wall 25, 600 Biremes)  |                                               |
|  - Purple Icon: Myth Bomb (35 Manticores)          |  GARRISON SUMMARY (Indexed 2h ago by Leonidas)|
|                                                    |  - Wall: Level 0 (LO Vulnerable)              |
|  [Overlay Toggles]                                 |  - Units: 1,840 Slingers | 45 Fast Transports  |
|  [x] Show Wall 0 Targets                           |  - Deity: Hera (Favor yield: ~38/hr)          |
|  [x] Show Enemy Specializations                    |                                               |
|  [x] Highlight Stale Intel (>24h)                  |  [ One-Click Strike ]   [ Plan CS Snipe ]     |
|                                                    |  [ Full Intel History (14 Reports) ]          |
+----------------------------------------------------+-----------------------------------------------+
| SECTION C: TARGET OPPORTUNITY MATRIX                                                               |
|                                                                                                    |
|  Filter: Ocean 54 | Wall <= 5 | Defense Pop < 500 | Points >= 7,000                                |
|  ------------------------------------------------------------------------------------------------- |
|  Town Name         | Owner          | Wall | Known Defense    | Intel Age | Actions                |
|  ------------------------------------------------------------------------------------------------- |
|  [Town] 01 Alpha   | EnemyLeader    | 0    | 120 Slingers     | 1.5h ago  | [Add to Op] [Snipe]    |
|  [Town] 04 Delta   | EnemyMember    | 2    | 0 Units (EMPTY)  | 3.2h ago  | [Add to Op] [Snipe]    |
|  [Town] 12 Omega   | TargetPlayer   | 0    | 2,100 Slingers   | 4.0h ago  | [Add to Op] [Snipe]    |
+----------------------------------------------------------------------------------------------------+
```

---

## 6. Complete Prisma Database Schema Blueprint

```prisma
// ==========================================
// Prisma Schema for GrepoTools Tactical Center
// ==========================================

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ------------------------------------------
// User & Authentication Models
// ------------------------------------------

enum UserRole {
  GLOBAL_ADMIN
  TEAM_LEADER
  WAR_OFFICER
  MEMBER
  READ_ONLY
}

enum FreshnessStatus {
  FRESH
  RECENT
  AGING
  STALE
}

enum IntelType {
  SPY
  ATTACK
  DEFENSE
  CONQUEST
  MANUAL
}

model User {
  id            String       @id @default(uuid())
  username      String       @unique
  passwordHash  String
  discordId     String?      @unique
  avatar        String?
  isGlobalAdmin Boolean      @default(false)
  createdAt     DateTime     @default(now())
  lastLoginAt   DateTime?

  memberships   TeamMember[]
  createdInvites TeamInvite[]
  auditLogs     AuditLog[]
}

model Team {
  id                 String       @id @default(uuid())
  name               String       // e.g. "HU119 Spartans"
  worldId            String       // e.g. "hu119"
  allianceId         Int?         // In-Game Alliance ID
  createdAt          DateTime     @default(now())

  // GrepoData Master Credentials (for this team)
  grepoDataEmail     String?
  grepoDataPassword  String?
  lastIntelSyncAt    DateTime?

  world              World        @relation(fields: [worldId], references: [id], onDelete: Cascade)
  members            TeamMember[]
  invites            TeamInvite[]
  townLiveStates     TownIntelState[]
  intelRecords       IntelRecord[]
  snipeOperations    SnipeOperation[]
  auditLogs          AuditLog[]

  @@index([worldId])
}

model TeamMember {
  id         String    @id @default(uuid())
  teamId     String
  userId     String
  role       UserRole  @default(MEMBER)
  inGameName String    // Verified In-Game Grepolis Username
  joinedAt   DateTime  @default(now())

  team       Team      @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([teamId, userId])
  @@index([teamId, inGameName])
}

model TeamInvite {
  id          String    @id @default(uuid())
  teamId      String
  code        String    @unique
  inGameName  String    // Specific in-game username this link is created for
  role        UserRole  @default(MEMBER)
  isUsed      Boolean   @default(false)
  usedByUserId String?
  usedAt      DateTime?
  expiresAt   DateTime
  createdById String
  createdAt   DateTime  @default(now())

  team        Team      @relation(fields: [teamId], references: [id], onDelete: Cascade)
  createdBy   User      @relation(fields: [createdById], references: [id], onDelete: Cascade)

  @@index([code, isUsed])
}

// ------------------------------------------
// Tier 1: Materialized Town Live State
// ------------------------------------------

model TownIntelState {
  id               String          @id @default(uuid())
  teamId           String
  worldId          String          @default("hu119")
  townId           Int

  // Building Levels Snapshot
  wallLevel        Int?
  senateLevel      Int?
  farmLevel        Int?
  barracksLevel    Int?
  docksLevel       Int?
  templeLevel      Int?
  academyLevel     Int?
  godWorshipped    String?

  // Current Known Garrison Snapshot
  units            Json            @default("{}") // e.g. {"slinger": 1500, "bireme": 200}
  totalGarrisonPop Int             @default(0)
  navalDefPop      Int             @default(0)
  navalOffPop      Int             @default(0)
  landDefPop       Int             @default(0)
  landOffPop       Int             @default(0)

  // Classification & Freshness
  detectedType     String          @default("UNKNOWN") // "NO_LS", "ND_BIR", "LO_SLING", "LD_DEF", "MYTH_NUKE", "EMPTY"
  freshness        FreshnessStatus @default(FRESH)
  latestReportAt   DateTime
  latestReportType IntelType       @default(SPY)
  totalReportCount Int             @default(1)
  lastUpdated      DateTime        @default(now())

  team             Team            @relation(fields: [teamId], references: [id], onDelete: Cascade)
  town             Town            @relation(fields: [townId, worldId], references: [id, worldId], onDelete: Cascade)

  @@unique([teamId, worldId, townId])
  @@index([teamId, worldId, detectedType])
  @@index([teamId, wallLevel])
  @@index([teamId, freshness])
}

// ------------------------------------------
// Tier 2: Historical Intel Record Log
// ------------------------------------------

model IntelRecord {
  id             String    @id @default(uuid())
  teamId         String
  worldId        String    @default("hu119")
  townId         Int
  reportType     IntelType @default(SPY)
  reportedAt     DateTime
  ingestedAt     DateTime  @default(now())

  // Spy / Building Data
  wallLevel      Int?
  buildingData   Json?     // Full building snapshot if spy report
  godWorshipped  String?

  // Garrison & Casualties
  garrisonUnits  Json      @default("{}")
  attackerLosses Json?
  defenderLosses Json?
  lootedResources Json?

  // Source Metadata
  reporterName   String?   // In-Game or GrepoData username
  sourceReportId String?
  rawText        String?   @db.Text
  isArchived     Boolean   @default(false)

  team           Team      @relation(fields: [teamId], references: [id], onDelete: Cascade)
  town           Town      @relation(fields: [townId, worldId], references: [id, worldId], onDelete: Cascade)

  @@index([teamId, townId, reportedAt])
  @@index([teamId, worldId, reportType])
}

// ------------------------------------------
// Operational Models & Audit Trail
// ------------------------------------------

model SnipeOperation {
  id                String    @id @default(uuid())
  teamId            String
  worldId           String    @default("hu119")
  label             String
  type              String    @default("recall") // "recall" or "direct"
  worldType         String    @default("siege")  // "siege" or "revolt"
  targetTownId      Int
  originTownId      Int
  targetReturnTime  DateTime
  sendTime          DateTime
  recallTime        DateTime?
  status            String    @default("PENDING") // PENDING, SENT, RECALLED, COMPLETED, CANCELLED
  assignedPlayer    String?
  notes             String?
  createdAt         DateTime  @default(now())

  team              Team      @relation(fields: [teamId], references: [id], onDelete: Cascade)
  targetTown        Town      @relation("TargetTown", fields: [targetTownId, worldId], references: [id, worldId], onDelete: Cascade)
  originTown        Town      @relation("OriginTown", fields: [originTownId, worldId], references: [id, worldId], onDelete: Cascade)
  world             World     @relation(fields: [worldId], references: [id], onDelete: Cascade)

  @@index([teamId, worldId, sendTime])
  @@index([status])
}

model AuditLog {
  id        String   @id @default(uuid())
  teamId    String
  userId    String
  action    String   // "VIEW_INTEL", "CREATE_INVITE", "EXPORT_MATRIX", "CREATE_SNIPE"
  details   Json?
  ipAddress String?
  timestamp DateTime @default(now())

  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([teamId, timestamp])
}

// ------------------------------------------
// Existing Core World Models (Reference)
// ------------------------------------------

model World {
  id              String    @id
  name            String
  server          String
  speed           Float     @default(1.0)
  unitSpeed       Float     @default(1.0)
  worldType       String    @default("siege")
  isActive        Boolean   @default(true)
  lastSync        DateTime?
  createdAt       DateTime  @default(now())

  players         Player[]
  alliances       Alliance[]
  towns           Town[]
  islands         Island[]
  conquests       Conquest[]
  teams           Team[]
  snipeOperations SnipeOperation[]

  @@index([isActive])
}

model Town {
  id                    Int
  worldId               String
  playerId              Int?
  name                  String
  islandX               Int
  islandY               Int
  islandSlot            Int
  points                Int
  specialization        String           @default("NONE")

  player                Player?          @relation(fields: [playerId, worldId], references: [id, worldId], onDelete: SetNull)
  world                 World            @relation(fields: [worldId], references: [id], onDelete: Cascade)
  liveIntelStates       TownIntelState[]
  intelRecords          IntelRecord[]
  snipeTargetOps        SnipeOperation[] @relation("TargetTown")
  snipeOriginOps        SnipeOperation[] @relation("OriginTown")

  @@id([id, worldId])
  @@index([worldId, islandX, islandY])
  @@index([worldId, playerId])
}

model Player {
  id         Int
  worldId    String
  name       String
  allianceId Int?
  points     Int
  rank       Int
  towns      Int
  abp        Int       @default(0)
  dbp        Int       @default(0)
  allBp      Int       @default(0)

  alliance   Alliance? @relation(fields: [allianceId, worldId], references: [id, worldId], onDelete: SetNull)
  world      World     @relation(fields: [worldId], references: [id], onDelete: Cascade)
  townsList  Town[]

  @@id([id, worldId])
  @@index([worldId, name])
}

model Alliance {
  id      Int
  worldId String
  name    String
  points  Int
  towns   Int
  members Int
  rank    Int
  abp     Int      @default(0)
  dbp     Int      @default(0)
  allBp   Int      @default(0)

  players Player[]
  world   World    @relation(fields: [worldId], references: [id], onDelete: Cascade)

  @@id([id, worldId])
  @@index([worldId, name])
}

model Island {
  id             Int
  worldId        String
  x              Int
  y              Int
  type           Int
  availableTowns Int
  resourcePlus   String
  resourceMinus  String

  world          World  @relation(fields: [worldId], references: [id], onDelete: Cascade)

  @@id([id, worldId])
  @@index([worldId, x, y])
}

model Conquest {
  id            Int      @id @default(autoincrement())
  worldId       String
  townId        Int
  townPoints    Int
  oldPlayerId   Int?
  newPlayerId   Int?
  oldAllianceId Int?
  newAllianceId Int?
  timestamp     DateTime

  world         World    @relation(fields: [worldId], references: [id], onDelete: Cascade)

  @@index([worldId, timestamp])
  @@index([townId])
}
```

---

## 7. Phased Implementation Roadmap

```
+------------------------------------------------------------------------------------+
| PHASE 1: SECURITY, AUTH & IN-GAME INVITE ENGINE                                    |
| • Create User & Team schema migrations.                                            |
| • Seed Global System Admin account.                                                |
| • Implement In-Game Username targeted single-use invite generator.                 |
| • Build user onboarding flow (invite redemption -> set password -> session).       |
+------------------------------------------------------------------------------------+
                                          │
                                          ▼
+------------------------------------------------------------------------------------+
| PHASE 2: GREPODATA INGESTION & MATERIALIZED TOWN LIVE STATE                        |
| • Implement `TownIntelState` (Tier 1) and `IntelRecord` (Tier 2) schemas.          |
| • Build GrepoData sync worker for `hu119` (batch fetching 5,000+ reports).         |
| • Implement projection updater (computes Wall, Garrison, Specialization, Freshness)|
| • Build high-speed API: `GET /api/ops/town-state?townId=...` (<5ms response).      |
+------------------------------------------------------------------------------------+
                                          │
                                          ▼
+------------------------------------------------------------------------------------+
| PHASE 3: PROTECTED OPERATIONS PORTAL & TACTICAL MAP OVERLAYS                       |
| • Create protected `/ops` route tree behind auth middleware.                       |
| • Add MapLibre tactical layers: Wall 0 targets, Specialization tags, Freshness ring|
| • Wire CommandDrawer to display live garrison units and building levels.           |
+------------------------------------------------------------------------------------+
                                          │
                                          ▼
+------------------------------------------------------------------------------------+
| PHASE 4: TARGET OPPORTUNITY MATRIX & DEEP DIVE ANALYTICS                           |
| • Build Opportunity Scanner (filter by Wall <= 5, Defense Pop < 500, Distance).    |
| • Connect DeepDiveModal to full `IntelRecord` history with Recharts timelines.     |
| • Integrate live enemy intel into CS Recall Sniping Scheduler.                     |
+------------------------------------------------------------------------------------+
                                          │
                                          ▼
+------------------------------------------------------------------------------------+
| PHASE 5: INTEL COMPACTOR & ATTRIBUTION METRICS                                     |
| • Implement background cleaner job to archive/compress historical reports.         |
| • Build team contributor leaderboard tracking reports indexed per player.          |
+------------------------------------------------------------------------------------+
```

---

## 8. Summary of Value

By implementing this blueprint:
1. **Security**: Only invited, verified alliance members can access the tool, protecting sensitive battle plans.
2. **Speed & Efficiency**: Serving the materialized `TownIntelState` ensures the map loads instantly, even with 20,000+ reports.
3. **Tactical Superiority**: Alliance commanders and snipers can identify Wall 0 targets, spot empty cities, and time attacks with full visibility of enemy defenses.
