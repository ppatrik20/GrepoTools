# Consolidate Team Administration and Authority Seams

## Context
The Team Management page (`src/app/team/page.js`) had expanded into an 80KB, 1,716-line monolith. It coordinated 4 disparate operational sub-domains (Member Roster, Custom Capability Roles, Cryptographic Invites, and Tactical Roadmap) while directly inlining 8 separate HTTP mutation handlers with ad-hoc fetch and error mechanics. Client authority and permission calculations (Global Admin vs. Team Admin vs. Capability Grants `MEMBERS_MANAGE`, `INVITES_MANAGE`, `ROLES_MANAGE`) were coupled to React `useMemo` hooks. Furthermore, four large modal dialogs (Member Edit, Member Kick, Custom Role Editor, Role Deletion) were inlined into the page template, resulting in high cognitive load and zero headless testability of client-side team operations.

## Decision
We introduce a deep client-side `TeamOperationsAdapter` module that encapsulates team data bundling, member updates, role CRUD operations, and invitation lifecycles behind a unified interface with consistent error normalization. We extract pure authority resolution into `src/lib/team/teamAuthority.js` (`resolveTeamAuthority`). We deconstruct the presentation layer into focused sub-view tabs (`TeamMembersTab`, `TeamInvitesTab`, `TeamRolesTab`) and standalone modal components (`MemberEditModal`, `MemberKickModal`, `CustomRoleModal`, `RoleDeleteModal`), leaving `src/app/team/page.js` as a thin, readable presentation coordinator.

## Considered Options
- *Custom React Hooks (`useTeamData`, `useTeamMutations`)*: Rejected because coupling team operations and authority logic directly to the React lifecycle prevents headless execution and Vitest verification without mounting synthetic React component trees.
- *Inlined Sub-renders in `src/app/team/page.js`*: Rejected because keeping all 1,700 lines of JSX in a single file fails the locality principle and leaves navigation unmanageable.
- *Direct Database Access in Server Component*: Rejected because team management is an interactive client-side SPA with real-time modal dialogs, clipboard actions, and role assignment grids that require client interactivity and fine-grained state updates.
