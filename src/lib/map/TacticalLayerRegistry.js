/**
 * src/lib/map/TacticalLayerRegistry.js
 * Declarative catalog defining MapLibre layer stacking order, zoom thresholds,
 * SDF icons, and WebGL paint specifications for Grepolis tactical mapping.
 */

export const INTERACTIVE_LAYER_IDS = [
  "town-sprites",
  "town-highlight-aura",
  "town-flags",
  "islands-points",
  "island-terrain-fill",
  "rock-terrain-fill",
  "empty-slots-sprites",
  "ghost-radar-markers",
  "siege-radar-markers",
  "inactive-farm-markers",
  "tactical-pin-markers",
  "island-halos-ring",
  "enemy-beachheads-point"
];

/**
 * Builds the declarative, ordered array of MapLibre layer descriptors.
 * 
 * @param {Object} options
 * @param {string} [options.viewMode='geographic'] - Current view mode ('geographic' | 'political')
 * @param {number} [options.politicalOpacity=0.35] - Opacity slider for political Voronoi spheres
 * @param {boolean} [options.showContestedFrontlines=true] - Toggle for high-tension frontline glowing corridors
 * @param {boolean} [options.showFrontlines=true] - Toggle for island combat perimeter indicators
 * @param {boolean} [options.showEmptySlots=true] - Toggle for colonizable empty slot markers
 * @param {Object} [options.radarFilters={}] - Active Intel Radar filter flags
 * @returns {Array<Object>} Array of MapLibre layer specifications
 */
export function getTacticalLayers(options = {}) {
  const {
    viewMode = 'geographic',
    politicalOpacity = 0.35,
    showContestedFrontlines = true,
    showFrontlines = true,
    showEmptySlots = true,
    radarFilters = {}
  } = options;

  const isPolitical = viewMode === 'political';
  const showContested = isPolitical && showContestedFrontlines;
  const showGhosts = Boolean(radarFilters?.ghostHunter);
  const showSieges = Boolean(radarFilters?.activeSiege);
  const showFarms = Boolean(radarFilters?.inactiveFarms);

  return [
    // 1. Ocean Grid lines
    {
      id: "ocean-lines",
      type: "line",
      source: "ocean-grid-source",
      paint: {
        "line-color": "#1e293b",
        "line-width": 1,
        "line-dasharray": [2, 2]
      }
    },
    // 2. Ocean sector coordinate labels (O44, O45, etc.)
    {
      id: "ocean-labels",
      type: "symbol",
      source: "ocean-grid-source",
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Noto Sans Regular"],
        "text-size": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 11,
          4.0, 14,
          6.0, 18,
          8.0, 22
        ],
        "text-anchor": "center"
      },
      paint: {
        "text-color": "#334155",
        "text-opacity": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 0.45,
          5.0, 0.65,
          8.0, 0.85
        ]
      }
    },
    // 3. Arcing Naval Route Line Glow (Milestone 3)
    {
      id: "route-line-glow",
      type: "line",
      source: "route-line-source",
      paint: {
        "line-color": "#38bdf8",
        "line-width": 6,
        "line-opacity": 0.5,
        "line-blur": 3
      }
    },
    // 4. Arcing Naval Route Line Main (Milestone 3)
    {
      id: "route-line",
      type: "line",
      source: "route-line-source",
      paint: {
        "line-color": "#38bdf8",
        "line-width": 2.5,
        "line-dasharray": [3, 2]
      }
    },
    // 5. Political Voronoi Alliance Spheres Fill (Milestone 1)
    {
      id: "voronoi-spheres-fill",
      type: "fill",
      source: "voronoi-source",
      layout: {
        visibility: isPolitical ? 'visible' : 'none'
      },
      paint: {
        "fill-color": ["coalesce", ["get", "color"], "#3b82f6"],
        "fill-opacity": [
          "interpolate", ["linear"], ["zoom"],
          2.0, politicalOpacity,
          5.0, politicalOpacity * 0.85,
          8.0, politicalOpacity * 0.6,
          10.0, politicalOpacity * 0.35
        ],
        "fill-antialias": true
      }
    },
    // 6. Political Voronoi Alliance Spheres Border (Milestone 1)
    {
      id: "voronoi-spheres-border",
      type: "line",
      source: "voronoi-source",
      layout: {
        visibility: isPolitical ? 'visible' : 'none',
        "line-join": "round",
        "line-cap": "round"
      },
      paint: {
        "line-color": ["coalesce", ["get", "color"], "#3b82f6"],
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 1.0,
          5.0, 1.8,
          8.0, 2.5
        ],
        "line-opacity": [
          "interpolate", ["linear"], ["zoom"],
          2.0, Math.min(politicalOpacity + 0.35, 1.0),
          5.0, Math.min(politicalOpacity + 0.45, 1.0),
          8.0, Math.min(politicalOpacity + 0.25, 0.8)
        ],
        "line-blur": 1
      }
    },
    // 7. Contested Frontlines Glow Corridor (Milestone 1)
    {
      id: "contested-frontline-glow",
      type: "line",
      source: "frontlines-source",
      layout: {
        visibility: showContested ? 'visible' : 'none',
        "line-join": "round",
        "line-cap": "round"
      },
      paint: {
        "line-color": [
          "interpolate", ["linear"], ["coalesce", ["get", "tension"], 0.5],
          0.0, "#eab308",
          0.5, "#f97316",
          1.0, "#ef4444"
        ],
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 3.5,
          5.0, 6.5,
          8.0, 10.0
        ],
        "line-opacity": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 0.80,
          5.0, 0.70,
          8.0, 0.55
        ],
        "line-blur": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 2.0,
          5.0, 4.0,
          8.0, 6.0
        ]
      }
    },
    // 8. Contested Frontlines Center Line (Milestone 1)
    {
      id: "contested-frontline-lines",
      type: "line",
      source: "frontlines-source",
      layout: {
        visibility: showContested ? 'visible' : 'none',
        "line-join": "round",
        "line-cap": "round"
      },
      paint: {
        "line-color": "#ffffff",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 1.2,
          5.0, 2.0,
          8.0, 2.8
        ],
        "line-opacity": 0.95,
        "line-dasharray": [2, 1]
      }
    },
    // 9. Ghost Hunter Radar Glow (Milestone 2)
    {
      id: "ghost-radar-glow",
      type: "circle",
      source: "ghost-radar-source",
      layout: {
        visibility: showGhosts ? 'visible' : 'none'
      },
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 6,
          5.0, 12,
          8.0, 20,
          10.0, 30
        ],
        "circle-color": "#06b6d4",
        "circle-opacity": 0.45,
        "circle-blur": 1.2
      }
    },
    // 10. Ghost Hunter Radar Center Markers (Milestone 2)
    {
      id: "ghost-radar-markers",
      type: "circle",
      source: "ghost-radar-source",
      layout: {
        visibility: showGhosts ? 'visible' : 'none'
      },
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 3.0,
          5.0, 6.0,
          8.0, 9.0,
          10.0, 13
        ],
        "circle-color": "#22d3ee",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#083344",
        "circle-opacity": 0.95
      }
    },
    // 11. Ghost Hunter Radar Labels (Milestone 2)
    {
      id: "ghost-radar-labels",
      type: "symbol",
      source: "ghost-radar-source",
      minzoom: 6.0,
      layout: {
        visibility: showGhosts ? 'visible' : 'none',
        "text-field": [
          "concat",
          "👻 ",
          ["to-string", ["get", "estimatedVacancyDays"]],
          "d (",
          ["to-string", ["get", "points"]],
          "p)"
        ],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-offset": [0, 1.8],
        "text-anchor": "top",
        "text-optional": true
      },
      paint: {
        "text-color": "#67e8f9",
        "text-halo-color": "#083344",
        "text-halo-width": 2
      }
    },
    // 12. Active Siege Radar Halo (Milestone 2)
    {
      id: "siege-radar-halo",
      type: "circle",
      source: "siege-radar-source",
      layout: {
        visibility: showSieges ? 'visible' : 'none'
      },
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 8,
          5.0, 16,
          8.0, 26,
          10.0, 38
        ],
        "circle-color": "#f43f5e",
        "circle-opacity": 0.5,
        "circle-blur": 1.4
      }
    },
    // 13. Active Siege Radar Markers (Milestone 2)
    {
      id: "siege-radar-markers",
      type: "circle",
      source: "siege-radar-source",
      layout: {
        visibility: showSieges ? 'visible' : 'none'
      },
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 4.0,
          5.0, 7.0,
          8.0, 11.0,
          10.0, 15
        ],
        "circle-color": "#e11d48",
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 1.0
      }
    },
    // 14. Active Siege Radar Labels (Milestone 2)
    {
      id: "siege-radar-labels",
      type: "symbol",
      source: "siege-radar-source",
      minzoom: 5.5,
      layout: {
        visibility: showSieges ? 'visible' : 'none',
        "text-field": [
          "concat",
          "⚔️ SIEGE (",
          ["to-string", ["get", "recentConquestCount"]],
          ")"
        ],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-offset": [0, 1.8],
        "text-anchor": "top",
        "text-optional": true
      },
      paint: {
        "text-color": "#fda4af",
        "text-halo-color": "#4c0519",
        "text-halo-width": 2
      }
    },
    // 15. Inactive Farm Finder Glow (Milestone 2)
    {
      id: "inactive-farm-glow",
      type: "circle",
      source: "inactive-farm-source",
      layout: {
        visibility: showFarms ? 'visible' : 'none'
      },
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 5,
          5.0, 11,
          8.0, 19,
          10.0, 26
        ],
        "circle-color": "#f59e0b",
        "circle-opacity": 0.45,
        "circle-blur": 1.2
      }
    },
    // 16. Inactive Farm Finder Markers (Milestone 2)
    {
      id: "inactive-farm-markers",
      type: "circle",
      source: "inactive-farm-source",
      layout: {
        visibility: showFarms ? 'visible' : 'none'
      },
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 3.0,
          5.0, 5.5,
          8.0, 8.5,
          10.0, 12
        ],
        "circle-color": "#fbbf24",
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#78350f",
        "circle-opacity": 0.95
      }
    },
    // 17. Inactive Farm Finder Labels (Milestone 2)
    {
      id: "inactive-farm-labels",
      type: "symbol",
      source: "inactive-farm-source",
      minzoom: 6.0,
      layout: {
        visibility: showFarms ? 'visible' : 'none',
        "text-field": [
          "concat",
          "💤 [",
          ["get", "farmRating"],
          "] ",
          ["to-string", ["get", "points"]],
          "p"
        ],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-offset": [0, 1.8],
        "text-anchor": "top",
        "text-optional": true
      },
      paint: {
        "text-color": "#fde68a",
        "text-halo-color": "#451a03",
        "text-halo-width": 2
      }
    },
    // 18. Tactical Alliance Pins Glow (Milestone 4)
    {
      id: "tactical-pins-glow",
      type: "circle",
      source: "tactical-pins-source",
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 7,
          5.0, 14,
          8.0, 24,
          10.0, 34
        ],
        "circle-color": ["coalesce", ["get", "pinColor"], "#ef4444"],
        "circle-opacity": 0.5,
        "circle-blur": 1.2
      }
    },
    // 19. Tactical Alliance Pins Markers (Milestone 4)
    {
      id: "tactical-pin-markers",
      type: "circle",
      source: "tactical-pins-source",
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 4,
          5.0, 7.5,
          8.0, 11,
          10.0, 16
        ],
        "circle-color": ["coalesce", ["get", "pinColor"], "#ef4444"],
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 1.0
      }
    },
    // 20. Tactical Alliance Pins Labels (Milestone 4)
    {
      id: "tactical-pin-labels",
      type: "symbol",
      source: "tactical-pins-source",
      minzoom: 5.0,
      layout: {
        "text-field": [
          "concat",
          ["get", "pinIcon"],
          " ",
          ["get", "townName"],
          " [",
          ["get", "priority"],
          "]"
        ],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-offset": [0, -2.2],
        "text-anchor": "bottom",
        "text-optional": true
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#0b101e",
        "text-halo-width": 2.5
      }
    },
    // 21. Macro Zoom Island Points (Zoom 2 to 5.2)
    {
      id: "islands-points",
      type: "circle",
      source: "islands-source",
      minzoom: 2,
      maxzoom: 5.2,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2, 2.5,
          4, 5.5,
          5.2, 8
        ],
        "circle-color": ["get", "islandColor"],
        "circle-opacity": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 0.45,
          4.8, 0.45,
          5.2, 0.0
        ],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#0f172a"
      }
    },
    // 22. Island Terrain Vector Fill (Zoom >= 4.8)
    {
      id: "island-terrain-fill",
      type: "fill",
      source: "island-polygons-source",
      minzoom: 4.8,
      paint: {
        "fill-color": "#0f1729",
        "fill-opacity": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 0,
          5.3, 0.9
        ]
      }
    },
    // 23. Island Sovereignty Tint Overlay
    {
      id: "island-sovereignty-tint",
      type: "fill",
      source: "island-polygons-source",
      minzoom: 4.8,
      paint: {
        "fill-color": ["get", "islandColor"],
        "fill-opacity": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 0,
          5.3, [
            "case",
            ["!=", ["get", "islandColor"], "#1e293b"],
            0.12,
            0
          ],
          8.0, [
            "case",
            ["!=", ["get", "islandColor"], "#1e293b"],
            0.08,
            0
          ]
        ]
      }
    },
    // 24. Contested Island Battleground Hazard Glow (Zoom >= 4.8)
    {
      id: "island-contested-glow",
      type: "line",
      source: "island-polygons-source",
      minzoom: 4.8,
      filter: ["==", ["get", "status"], "CONTESTED"],
      paint: {
        "line-color": "#f59e0b",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 3.0,
          7.0, 6.0,
          10.0, 9.0
        ],
        "line-opacity": 0.85,
        "line-blur": 2.5
      }
    },
    // 25. Contested Island Battleground Border (Zoom >= 4.8)
    {
      id: "island-contested-border",
      type: "line",
      source: "island-polygons-source",
      minzoom: 4.8,
      filter: ["==", ["get", "status"], "CONTESTED"],
      paint: {
        "line-color": "#ef4444",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 1.2,
          7.0, 2.2,
          10.0, 3.2
        ],
        "line-opacity": 0.95,
        "line-dasharray": [3, 1.5]
      }
    },
    // 26. Frontline Island Combat Perimeter Glow (Zoom >= 4.8)
    {
      id: "island-frontline-glow",
      type: "line",
      source: "island-polygons-source",
      minzoom: 4.8,
      filter: ["all", ["==", ["get", "isFrontline"], true], ["!=", ["get", "status"], "CONTESTED"]],
      paint: {
        "line-color": "#f43f5e",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 2.5,
          7.0, 5.0,
          10.0, 8.0
        ],
        "line-opacity": 0.65,
        "line-blur": 2.0
      }
    },
    // 27. Frontline Island Combat Perimeter Border (Zoom >= 4.8)
    {
      id: "island-frontline-border",
      type: "line",
      source: "island-polygons-source",
      minzoom: 4.8,
      filter: ["all", ["==", ["get", "isFrontline"], true], ["!=", ["get", "status"], "CONTESTED"]],
      paint: {
        "line-color": "#f43f5e",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 0.8,
          7.0, 1.6,
          10.0, 2.4
        ],
        "line-opacity": 0.9,
        "line-dasharray": [4, 2]
      }
    },
    // 28. Island Standard Outline Outer Glow Effect
    {
      id: "island-outline-glow",
      type: "line",
      source: "island-polygons-source",
      minzoom: 4.8,
      filter: ["all", ["!=", ["get", "status"], "CONTESTED"], ["!=", ["get", "isFrontline"], true]],
      paint: {
        "line-color": "#38bdf8",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 2.0,
          7.0, 5.0,
          10.0, 8.0
        ],
        "line-opacity": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 0,
          5.3, 0.12,
          7.0, 0.18
        ],
        "line-blur": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 2.0,
          7.0, 4.0,
          10.0, 6.0
        ]
      }
    },
    // 29. Crisp Island Main Outline
    {
      id: "island-outline",
      type: "line",
      source: "island-polygons-source",
      minzoom: 4.8,
      paint: {
        "line-color": [
          "interpolate", ["linear"], ["zoom"],
          4.8, [
            "case",
            ["==", ["get", "status"], "CONTESTED"], "#ef4444",
            ["==", ["get", "isFrontline"], true], "#f43f5e",
            ["==", ["get", "isSafeCore"], true], "#10b981",
            "#64748b"
          ],
          6.0, [
            "case",
            ["==", ["get", "status"], "CONTESTED"], "#ef4444",
            ["==", ["get", "isFrontline"], true], "#f43f5e",
            ["==", ["get", "isSafeCore"], true], "#10b981",
            "#38bdf8"
          ]
        ],
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 0.4,
          6.0, 0.8,
          8.0, 1.5,
          10.0, 2.0
        ],
        "line-opacity": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 0,
          5.3, 0.75,
          7.0, 0.85
        ]
      }
    },
    // 30. Island Inner Contour Lines (Zoom >= 6.0)
    {
      id: "island-contour-lines",
      type: "line",
      source: "island-contours-source",
      minzoom: 6.0,
      paint: {
        "line-color": "#1e3a5f",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          6.0, 0.3,
          8.0, 0.6,
          10.0, 1.0
        ],
        "line-opacity": [
          "interpolate", ["linear"], ["zoom"],
          6.0, 0,
          7.0, 0.35,
          9.0, 0.5
        ],
        "line-dasharray": [4, 4]
      }
    },
    // 31. Rock Island Vector Terrain Fill (Zoom >= 6.0)
    {
      id: "rock-terrain-fill",
      type: "fill",
      source: "rock-polygons-source",
      minzoom: 6.0,
      paint: {
        "fill-color": "#111827",
        "fill-opacity": [
          "interpolate", ["linear"], ["zoom"],
          6.0, 0,
          7.0, 0.7
        ]
      }
    },
    // 32. Rock Island Outline (Zoom >= 6.0)
    {
      id: "rock-outline",
      type: "line",
      source: "rock-polygons-source",
      minzoom: 6.0,
      paint: {
        "line-color": "#475569",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          6.0, 0.3,
          8.0, 0.8,
          10.0, 1.2
        ],
        "line-opacity": [
          "interpolate", ["linear"], ["zoom"],
          6.0, 0,
          7.0, 0.5,
          9.0, 0.65
        ]
      }
    },
    // 33. Tactical Frontline & Contested Island Badges (Zoom 5.0 to 8.5)
    {
      id: "frontline-islands-badge",
      type: "symbol",
      source: "frontline-islands-source",
      minzoom: 5.0,
      maxzoom: 8.5,
      layout: {
        visibility: showFrontlines ? 'visible' : 'none',
        "text-field": ["get", "combatLabel"],
        "text-font": ["Noto Sans Regular"],
        "text-size": [
          "interpolate", ["linear"], ["zoom"],
          5.0, 9,
          6.5, 11,
          8.5, 12
        ],
        "text-offset": [0, -2.4],
        "text-anchor": "bottom",
        "text-optional": true,
        "text-allow-overlap": false
      },
      paint: {
        "text-color": [
          "case",
          ["==", ["get", "status"], "CONTESTED"], "#fef08a",
          "#fecdd3"
        ],
        "text-halo-color": [
          "case",
          ["==", ["get", "status"], "CONTESTED"], "#78350f",
          "#4c0519"
        ],
        "text-halo-width": 2.5
      }
    },
    // 34. Empty Colonization Slots Layer (Zoom >= 6.8)
    {
      id: "empty-slots-sprites",
      type: "symbol",
      source: "empty-slots-source",
      minzoom: 6.8,
      layout: {
        visibility: showEmptySlots ? 'visible' : 'none',
        "icon-image": "empty_slot",
        "icon-size": [
          "interpolate", ["linear"], ["zoom"],
          6.8, 0.08,
          8.0, 0.14,
          9.5, 0.24,
          10.5, 0.38
        ],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-anchor": "center"
      },
      paint: {
        "icon-color": "#64748b",
        "icon-halo-color": "#0b101e",
        "icon-halo-width": 1.5,
        "icon-halo-blur": 0.5,
        "icon-opacity": [
          "interpolate", ["linear"], ["zoom"],
          6.8, 0.65,
          8.5, 0.95
        ]
      }
    },
    // 35. Continuous Alliance Maritime Ocean Basin Glow (Zoom 2.0 to 6.2)
    {
      id: "maritime-ocean-glow",
      type: "line",
      source: "maritime-ocean-source",
      minzoom: 2.0,
      maxzoom: 6.2,
      paint: {
        "line-color": ["get", "color"],
        "line-width": 6,
        "line-opacity": 0.35,
        "line-blur": 4
      }
    },
    // 36. Continuous Alliance Maritime Ocean Basin Fill (Zoom 2.0 to 6.2)
    {
      id: "maritime-ocean-fill",
      type: "fill",
      source: "maritime-ocean-source",
      minzoom: 2.0,
      maxzoom: 6.2,
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 0.26,
          4.0, 0.20,
          5.5, 0.12,
          6.2, 0.04
        ]
      }
    },
    // 37. Continuous Alliance Maritime Ocean Basin Border (Zoom 2.0 to 6.2)
    {
      id: "maritime-ocean-border",
      type: "line",
      source: "maritime-ocean-source",
      minzoom: 2.0,
      maxzoom: 6.2,
      paint: {
        "line-color": ["get", "color"],
        "line-width": 2,
        "line-opacity": [
          "interpolate", ["linear"], ["zoom"],
          2.0, 0.85,
          5.0, 0.70,
          6.2, 0.20
        ]
      }
    },
    // 38. Inter-Alliance Maritime Frontline Barrier Glow (Zoom 2.0 to 6.8)
    {
      id: "maritime-frontline-glow",
      type: "line",
      source: "maritime-frontlines-source",
      minzoom: 2.0,
      maxzoom: 6.8,
      layout: {
        visibility: showFrontlines ? 'visible' : 'none'
      },
      paint: {
        "line-color": "#f43f5e",
        "line-width": 4,
        "line-opacity": 0.45,
        "line-blur": 2.5
      }
    },
    // 39. Inter-Alliance Maritime Frontline Barrier Line (Zoom 2.0 to 6.8)
    {
      id: "maritime-frontline-line",
      type: "line",
      source: "maritime-frontlines-source",
      minzoom: 2.0,
      maxzoom: 6.8,
      layout: {
        visibility: showFrontlines ? 'visible' : 'none'
      },
      paint: {
        "line-color": "#fda4af",
        "line-width": 2,
        "line-opacity": 0.9,
        "line-dasharray": [4, 2]
      }
    },
    // 40. Island Sovereignty & Cleanliness Halos Glow (Zoom 2.2 to 5.2)
    {
      id: "island-halos-glow",
      type: "circle",
      source: "island-halos-source",
      minzoom: 2.2,
      maxzoom: 5.2,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2.2, 3,
          4.0, 7,
          5.2, 11
        ],
        "circle-color": ["get", "haloColor"],
        "circle-opacity": [
          "interpolate", ["linear"], ["zoom"],
          2.2, 0.40,
          4.8, 0.40,
          5.2, 0.0
        ],
        "circle-blur": 1.2
      }
    },
    // 41. Island Sovereignty & Cleanliness Halos Ring (Zoom 2.2 to 5.2)
    {
      id: "island-halos-ring",
      type: "circle",
      source: "island-halos-source",
      minzoom: 2.2,
      maxzoom: 5.2,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2.2, 2.5,
          4.0, 5.5,
          5.2, 8.5
        ],
        "circle-color": ["get", "haloColor"],
        "circle-stroke-width": [
          "case",
          ["==", ["get", "status"], "CONTESTED"], 3.0,
          ["==", ["get", "status"], "INFILTRATED"], 2.6,
          ["==", ["get", "isFrontline"], true], 2.4,
          ["==", ["get", "status"], "CLEAN"], 1.8,
          1.0
        ],
        "circle-stroke-color": ["get", "strokeColor"],
        "circle-opacity": [
          "interpolate", ["linear"], ["zoom"],
          2.2, 0.85,
          4.8, 0.85,
          5.2, 0.0
        ]
      }
    },
    // 42. High-Priority Enemy Beachheads Halo (Zoom >= 3.0)
    {
      id: "enemy-beachheads-halo",
      type: "circle",
      source: "enemy-beachheads-source",
      minzoom: 3.0,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          3.0, 6,
          5.5, 12,
          8.0, 20
        ],
        "circle-color": "#ef4444",
        "circle-opacity": 0.5,
        "circle-blur": 1.5
      }
    },
    // 43. High-Priority Enemy Beachheads Point (Zoom >= 3.0)
    {
      id: "enemy-beachheads-point",
      type: "circle",
      source: "enemy-beachheads-source",
      minzoom: 3.0,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          3.0, 3.5,
          5.5, 6.5,
          8.0, 11
        ],
        "circle-color": "#dc2626",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 1.0
      }
    },
    // 44. High-Priority Enemy Beachheads Label (Zoom >= 5.0)
    {
      id: "enemy-beachheads-label",
      type: "symbol",
      source: "enemy-beachheads-source",
      minzoom: 5.0,
      layout: {
        "text-field": "⚠️ BREACH",
        "text-font": ["Noto Sans Regular"],
        "text-size": 9,
        "text-offset": [0, -1.8],
        "text-anchor": "bottom",
        "text-optional": true
      },
      paint: {
        "text-color": "#fca5a5",
        "text-halo-color": "#450a0a",
        "text-halo-width": 2
      }
    },
    // 45. Macro Alliance Maritime Basin Labels (Zoom 2.2 to 5.5)
    {
      id: "maritime-labels",
      type: "symbol",
      source: "maritime-labels-source",
      minzoom: 2.2,
      maxzoom: 5.5,
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Noto Sans Regular"],
        "text-size": [
          "interpolate", ["linear"], ["zoom"],
          2.2, 9,
          3.8, 11,
          5.5, 13
        ],
        "text-max-width": 12,
        "text-anchor": "center",
        "text-allow-overlap": false
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#0b101e",
        "text-halo-width": 2.5
      }
    },
    // 46. Town Highlight Aura (Zoom >= 4.8)
    {
      id: "town-highlight-aura",
      type: "symbol",
      source: "towns-source",
      minzoom: 4.8,
      filter: ["has", "highlightColor"],
      layout: {
        "icon-image": [
          "case",
          ["==", ["get", "isGhost"], true], "town_ghost",
          ["match", ["get", "stage"],
            5, "town_5",
            4, "town_4",
            3, "town_3",
            2, "town_2",
            1, "town_1",
            "town_1"
          ]
        ],
        "icon-size": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 0.08,
          5.5, 0.12,
          6.5, 0.18,
          7.5, 0.28,
          8.5, 0.42,
          10.0, 0.68
        ],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-anchor": "bottom"
      },
      paint: {
        "icon-color": ["get", "highlightColor"],
        "icon-halo-color": "#ffffff",
        "icon-halo-width": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 2.0,
          7.0, 3.5,
          10.0, 5.0
        ],
        "icon-halo-blur": 2.0,
        "icon-opacity": 0.85
      }
    },
    // 47. Dynamic Outlined SVG Town Sprites (Zoom >= 4.8)
    {
      id: "town-sprites",
      type: "symbol",
      source: "towns-source",
      minzoom: 4.8,
      layout: {
        "icon-image": [
          "case",
          ["==", ["get", "isGhost"], true], "town_ghost",
          ["match", ["get", "stage"],
            5, "town_5",
            4, "town_4",
            3, "town_3",
            2, "town_2",
            1, "town_1",
            "town_1"
          ]
        ],
        "icon-size": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 0.06,
          5.5, 0.09,
          6.5, 0.14,
          7.5, 0.22,
          8.5, 0.34,
          10.0, 0.55
        ],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-anchor": "bottom"
      },
      paint: {
        "icon-color": [
          "case",
          ["==", ["get", "isGhost"], true], "#94a3b8",
          ["has", "highlightColor"], ["get", "highlightColor"],
          ["get", "townColor"]
        ],
        "icon-halo-color": [
          "case",
          ["has", "highlightColor"], "#ffffff",
          ["==", ["get", "isGhost"], true], "#0f172a",
          "#0b101e"
        ],
        "icon-halo-width": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 1.0,
          6.5, 1.4,
          8.5, 2.0,
          10.0, 2.6
        ],
        "icon-halo-blur": 0.5,
        "icon-opacity": [
          "interpolate", ["linear"], ["zoom"],
          4.8, 0.85,
          5.5, 0.95,
          6.5, 1.0
        ]
      }
    },
    // 48. Dynamic Alliance Flag Badge (Zoom >= 7.2)
    {
      id: "town-flags",
      type: "circle",
      source: "towns-source",
      minzoom: 7.2,
      paint: {
        "circle-color": [
          "case",
          ["has", "highlightColor"], ["get", "highlightColor"],
          ["get", "townColor"]
        ],
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          7.2, 3.5,
          8.5, 5.0,
          10.0, 7.5
        ],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffff",
        "circle-translate": [0, -16]
      }
    },
    // 49. Town Name Labels (Zoom >= 8.5)
    {
      id: "town-labels",
      type: "symbol",
      source: "towns-source",
      minzoom: 8.5,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-offset": [0, -3.2],
        "text-anchor": "bottom",
        "text-optional": true
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#0b101e",
        "text-halo-width": 2.5
      }
    }
  ];
}
