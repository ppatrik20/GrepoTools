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
