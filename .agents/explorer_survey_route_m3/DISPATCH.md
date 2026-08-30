## 2026-08-30T18:46:11Z

Mission:
Investigate the current codebase regarding Requirement R3:
1. Troop Route & Distance Tool: What components/utilities exist for travel time calculation?
2. Units and Speeds: Are naval fleet units (Biremes, Light Ships, Colony Ships, etc.) and flying mythical units (Pegasus, Harpy, Manticore, Griffin) defined with their base speeds? Where are active world speed factors stored/applied?
3. Same-island vs Inter-island calculations:
   - How is same-island transit calculated (slot separation distance, realistic 2-30 mins range)?
   - How is inter-island nautical voyage calculated (Grepolis Euclidean formula: Distance * 50 / (Unit Speed * World Speed))?
4. Map visualization: How is the arcing dashed trajectory line rendered on MapLibre between origin and target cities? What GeoJSON sources/layers are used?
5. Recall Sniper Tool (/snipe): How does the one-click action link origin and target cities into the /snipe tool? What URL params or state sharing are used?

Deliverables:
- Write nalysis.md and handoff.md in your working directory d:\Dev\Web\Grepolis\.agents\explorer_survey_route_m3.
- Update progress.md with timestamps and status.
- Send a completion message to parent with summary and file paths.