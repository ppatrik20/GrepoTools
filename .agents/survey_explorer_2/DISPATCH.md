## 2026-09-02T16:56:48Z

<USER_REQUEST>
You are Survey Explorer 2 (Data Models, APIs & Existing Tools).
Your working directory is `d:\Dev\Web\Grepolis\.agents\survey_explorer_2`.
You MUST read `d:\Dev\Web\Grepolis\.agents\ORIGINAL_REQUEST.md`.

Investigate the existing codebase at `d:\Dev\Web\Grepolis`:
1. Examine `prisma/schema.prisma` or data models: What entities exist for World, Town, Player, Alliance, Island, Movement/Attack, Conquest/Siege?
2. How are town coordinates represented (X, Y in 0-999 or 0-1000 range, ocean numbers calculated via `Math.floor(x/100) + Math.floor(y/100)*10` or similar)?
3. How are ghost towns, inactive players, alliance colors, and activity/points momentum tracked or calculated?
4. How are the Route Planner and Recall Sniper (`/snipe`) implemented? Where are their files located? How do they compute travel times, unit speeds, and trajectories?
5. How is user state/custom data currently persisted (Local storage, IndexedDB, Prisma DB / API endpoints)?
6. What APIs or server actions exist for fetching world data, towns, players, alliances, and route calculations?

Write your full structured report to `d:\Dev\Web\Grepolis\.agents\survey_explorer_2\analysis.md` and deliver `handoff.md`.
Notify with send_message when done.
</USER_REQUEST>
