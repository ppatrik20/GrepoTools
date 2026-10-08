# Grepolis Tactical Command

Tactical mapping, intel surveillance, troop transit coordination, and alliance operations for Grepolis game worlds.

## Domain Language

**Political Territory**:
Dynamic GPU-accelerated polygon demarcating an alliance's territorial sphere of influence across ocean sectors.
_Avoid_: Alliance zone, heat area, territory blob

**Maritime Basin**:
Continuous ocean territorial partition assigned to the dominant maritime alliance holding surrounding island hubs.
_Avoid_: Ocean territory, sea sector, water zone

**Contested Frontline**:
A high-tension demarcation between rival alliances across border islands or adjacent territorial spheres.
_Avoid_: Border line, battle boundary, conflict edge

**Intel Radar**:
Automated target surveillance filters detecting ghost cities, active sieges, and inactive player towns based on point momentum decay.
_Avoid_: Scanner, target finder, farm searcher

**Tactical Pin**:
A strategic operation marker dropped on a town or coordinate with priority tiers, mission orders, and sniper export links.
_Avoid_: Map marker, waypoint, flag, bookmark

**Launch Window**:
The temporal bracket around the ideal departure time offset by Grepolis anti-timing randomization (±10s).
_Avoid_: Send buffer, timing margin, random range

**Midpoint Recall**:
The tactical withdrawal technique where troops are launched outward toward an arbitrary target and recalled at exactly half elapsed transit time to land back at home city at target landing time (subject to the 10-minute maximum cancel limit).
_Avoid_: Half-time cancel, return trick, fake attack cancel

**Conquest Gap**:
The critical chronological interval between offensive clear waves and arrival of the Colony Ship or support waves, dictated by world conquest rules (Revolt vs. Siege).
_Avoid_: Timing hole, attack window, CS gap

## Architecture Seams

**Tactical Scene Pipeline**:
The in-process compiler that ingests raw world feature collections and filter options to assemble an immutable Scene Bundle.
_Avoid_: Map service, map helper, layer manager

**Scene Bundle**:
The consolidated, ready-to-render data package containing pre-partitioned GeoJSON sources, active transit paths, and summary metrics.
_Avoid_: Map state, scene object, layer state

**Tactical Layer Registry**:
The declarative catalog defining MapLibre layer stacking order, zoom thresholds, SDF icons, and WebGL paint specifications.
_Avoid_: Style manager, layer definitions, layer helper

**Operation Planner**:
The in-process domain module compiling target landing schedules, anti-timing launch windows, and conquest gap alignments into immutable operation plans.
_Avoid_: Snipe service, timer helper, attack manager

**Operations Storage**:
The adapter seam bridging operational queues and recall groups to local browser storage or remote team databases with automatic date revival.
_Avoid_: Local storage wrapper, snipe persistence, db client
