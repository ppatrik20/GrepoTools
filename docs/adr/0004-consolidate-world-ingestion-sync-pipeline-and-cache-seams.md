# ADR 0004: Consolidate World Ingestion, Sync Pipeline, and Cache Seams

## Status
Accepted

## Context
Grepolis world data synchronization forms the foundation of all tactical features in the application: town coordinate plotting, Voronoi maritime borders, alliance rankings, player scoreboard trajectories, and live operative verification.

Previously, world synchronization suffered from several architectural deficiencies:
1. **Procedural script bloat in `src/lib/syncEngine.js`**: A single 702-line procedural script performed remote HTTP header queries, gzip decompression, CSV tokenization for 11 distinct Grepolis game files, in-memory historical delta computation, hand-assembled SQL batch string concatenation, automatic operative town rename verification, and Scoreboard/GeoJSON cache compression.
2. **Untestable implementation machinery**: Because parsing and delta calculation were intermingled with remote network I/O and transactional raw SQL queries, neither the data parsing logic nor delta computation could be tested in isolation with deterministic inputs.
3. **Duplicated and diverging cache compilation**: Scoreboard and GeoJSON cache compilation was duplicated between `syncEngine.js` and `/api/world/sync-cache/route.js`, leading to discrepancies where one module updated `syncMetadata` and the other only updated `world.scoreboardCache`.
4. **Ad-hoc client network calls in `src/app/world/page.js`**: The Admin World Center directly invoked loose `fetch` calls across five disparate endpoints without a unified adapter to normalize error handling, request parameters, or response payloads.

## Decision
1. **Extract pure data ingestion engines**:
   - `GrepolisDataParser`: Pure functions that transform raw line arrays from InnoGames `.txt.gz` feeds into sanitized player, alliance, town, island, conquest, and kill records with zero side effects.
   - `WorldDeltaEngine`: Pure diffing function `computeWorldDeltas({ currentEntities, incomingEntities })` that produces typed collections of records to create, update, delete, and record into chronological history tables.
2. **Establish the `WorldCacheCompiler` seam**:
   - Encapsulate Scoreboard and GeoJSON data generation, gzip compression, and dual table persistence (`World` and `SyncMetadata`) behind a single deep interface.
3. **Decompose the sync lifecycle into `WorldSyncPipeline`**:
   - Coordinate the six explicit stages (Freshness Gate, Remote Ingestion, Delta Calculation, Atomic Batch Persistence, Operative Verification Scan, and Cache Compilation) behind `WorldSyncPipeline.executeSync(worldId, options)`.
   - Preserve backwards-compatible exports `syncWorld` and `syncAllActiveWorlds` as thin facades over `WorldSyncPipeline`.
4. **Establish `WorldOperationsAdapter` as the client seam**:
   - Provide a clean interface (`fetchWorldOverview`, `triggerWorldSync`, `rebuildWorldCaches`, `cleanWorldIslands`, `saveWorld`, `deleteWorld`) for administrative and operational user interfaces.

## Consequences

### Positive
- **High Depth and Leverage**: Callers of `WorldSyncPipeline` provide a world identifier and options; the module handles remote validation, parsing, delta diffing, database batching, and cache generation internally.
- **Deterministic Testability**: Data parsing and historical delta calculations can be unit-tested with 100% determinism and synthetic fixtures without requiring a PostgreSQL database or internet access.
- **Cache Locality**: Cache compilation and persistence logic lives in one place, preventing drift between background cron synchronizations and on-demand manual triggers.
- **Clean Seam for Client Consumers**: UI pages interact with `WorldOperationsAdapter` rather than assembling ad-hoc HTTP requests.

### Negative / Trade-offs
- Intermediate in-memory representations are structured between parsing and persistence stages, requiring explicit type contracts across modules.

---

## Addendum (2026-10): Standalone Node Portability, Robust Logging & Failure Notification Seams

### Context
Following the initial modularization, automated hourly synchronization via Docker/CLI (`docker exec grepotools-app node scripts/sync.js`) exposed three critical runtime failure modes:
1. **ESM Import Path Incompatibility in Standalone Node**: In Next.js Turbopack runtime, path aliases (`@/lib/...`) and extensionless imports are resolved automatically, but standalone Node.js ESM (`node scripts/sync.js`) threw `ERR_MODULE_NOT_FOUND`. Additionally, importing Next.js server-only packages (`next/cache`'s `unstable_cache`) in shared libraries crashed standalone processes.
2. **Feed Tokenization URIError**: Remote InnoGames data feeds contain player and town names with literal percent symbols (e.g. `100% DEF`) and URL-encoded commas (`%2C`). Pre-splitting whole-line `decodeURIComponent` caused unhandled `URIError: URI malformed` and column misalignment.
3. **Silent Failure & Lack of Observability**: When sync failed, only `console.error` was outputted. `World.lastSync` remained frozen at its last successful timestamp with no indication in the database or UI whether sync was failing or if the cron daemon was running, leading to the "synced 800+ minutes ago" blind spot.

### Decision
1. **Universal Node ESM Portability**:
   - All modules shared between Next.js and standalone scripts (`WorldSyncPipeline.js`, `WorldCacheCompiler.js`, `TownVerificationEngine.js`, `geojson.js`, `scoreboard.js`) must use relative imports with explicit `.js` extensions.
   - JSON assets in shared modules are loaded universally using `createRequire(import.meta.url)` to satisfy Node 22+ ESM requirements.
   - Scripts load local environment files automatically via `process.loadEnvFile?.()`.
2. **Defensive CSV Parsing**:
   - `fetchAndDecompress` splits raw feed lines by `,` first and decodes each cell individually via `safeDecodeField`, falling back to the raw string if `decodeURIComponent` encounters malformed escape sequences.
3. **Persistent Sync Logging & Observability Seams**:
   - Introduced `SyncLog` model in Prisma schema (`worldId`, `status`, `trigger`, `durationMs`, `errorMessage`, `stats`, `createdAt`) with compound indexes.
   - Updated `World` model with `lastSyncStatus` (`SUCCESS` | `FAILURE`), `lastSyncError`, and `lastSyncDurationMs`.
   - Pipeline persists failure status and audit logs atomically in `catch` blocks before exiting.
   - Exposed `/api/world/sync-logs` and updated `/api/worlds` and `/api/world/status`.
4. **Multi-Channel Alerting & UI Diagnostics**:
   - **External Webhooks**: Added `WorldSyncPipeline.notifySyncFailure` supporting Discord, Slack, and generic webhooks via `SYNC_ALERT_WEBHOOK_URL`.
   - **UI Alerts**: Added high-visibility dismissible warning banner in `Navigation.js` with instant "Retry Sync" action when active world status is `FAILURE`.
   - **Admin World Diagnostics**: Added a diagnostic modal in `src/app/world/page.js` to inspect execution history, duration, and error traces.
5. **Database Schema Self-Healing & Frontend Error Resilience**:
   - **Zero-CLI Schema Bootstrapper**: Added `ensureDatabaseSchema` in `src/lib/dbBootstrap.js` executing idempotent DDL statements (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`, `CREATE TABLE IF NOT EXISTS ...`) via `prisma.$executeRawUnsafe`. Runs during container startup (`docker-entrypoint.sh` via `scripts/ensure-schema.js`), in `WorldSyncPipeline.executeSync`, and lazily memoized across API routes.
   - **Direct SQL Migration**: Provided `scripts/init_sync_tables.sql` for manual PostgreSQL container execution.
   - **Crash-Proof Client State**: Hardened `src/app/stats/page.js` against malformed or error API responses, preventing React runtime errors on undefined entity dictionaries and rendering resilient error cards.

