# ADR 0005: Consolidate Audit Logging and Player Identity Verification Seams

## Status
Accepted

## Context
Grepolis Tactical Command secures operational data and tactical intelligence by requiring team operatives to verify ownership of their in-game player accounts. This verification establishes cryptographic authority and triggers security audit events.

Previously, identity verification and audit logging suffered from several architectural deficiencies:
1. **Duplicated town rename verification logic**: The algorithm verifying whether an in-game town name contains an operative's `verificationCode` was implemented twice: once inside `WorldSyncPipeline.scanTownRenames` during background world ingestion, and once in `POST /api/auth/verify-town` during user on-demand checks.
2. **Dispersed audit actions**: Security events were logged using raw, unvalidated string literals (`AUTH_LOGIN_SUCCESS`, `TOWN_VERIFIED`, etc.) across multiple route handlers without a centralized action catalog, leading to potential typographical discrepancies and untyped query filters.
3. **Ad-hoc client network requests**: The Admin Audit Logs page (`src/app/admin/audit-logs/page.js`) and Town Verification page (`src/app/verify/page.js`) directly constructed query string parameters and executed raw `fetch` calls, mingling HTTP transport details and error handling with React UI rendering.

## Decision
1. **Establish the `TownVerificationEngine` seam**:
   - Provide pure token matching via `TownVerificationEngine.isTownVerificationMatch(townName, verificationCode)`.
   - Provide a unified coordination method `TownVerificationEngine.executeTownVerificationCheck({ worldId, userId, prismaClient, method, actorContext })` shared by both background world ingestion and on-demand user verification.
2. **Standardize audit event actions in `src/lib/auth/audit.js`**:
   - Define an immutable `AUDIT_ACTIONS` catalog covering authentication, verification, team operations, and world configuration events.
3. **Establish `AuditLogAdapter` as the client seam for security logs**:
   - Encapsulate pagination, multi-field filtering (`action`, `actorUsername`, `status`, `targetResource`), and error normalization behind `AuditLogAdapter.fetchAuditLogs`.
4. **Establish `IdentityVerificationAdapter` as the client seam for player verification**:
   - Encapsulate town verification triggers and master player identity queries behind `IdentityVerificationAdapter.verifyTownOwnership` and `IdentityVerificationAdapter.fetchMasterPlayer`.

## Consequences

### Positive
- **High Locality & Single Point of Truth**: Town rename verification criteria and audit metadata schemas are defined once in `TownVerificationEngine`, eliminating drift between automatic world syncs and user-initiated checks.
- **Deterministic Testability**: Town name substring token matching is 100% pure and unit-tested in isolation without requiring database transactions or network requests.
- **Clean Seams for UI Views**: Both `AuditLogsPage` and `VerifyTownPage` delegate network requests, query serialization, and error parsing to dedicated adapter modules.
- **Self-Documenting Audit Domain**: `AUDIT_ACTIONS` acts as the definitive catalog of all auditable events in the application.

### Negative / Trade-offs
- Additional adapter files are introduced, requiring callers to import adapters rather than issuing inline `fetch` calls.
