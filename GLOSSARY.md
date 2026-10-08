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
