/**
 * src/lib/map/TacticalScenePipeline.js
 * In-process computational pipeline that ingests raw Grepolis world data and user filters
 * to compile an immutable, GPU-ready SceneBundle.
 * 
 * Features a three-tier internal cache:
 * - Tier 1: Base Topology (features partitioning, contours, rock polygons)
 * - Tier 2: Political Topology (Voronoi spheres, maritime basins, island sovereignty)
 * - Tier 3: Dynamic Overlays (radar targets, tactical pins, animated naval transits, highlights)
 */

import { computeAllianceVoronoi, computeContestedFrontlines } from './voronoi.js';
import { computeAllianceDominions } from './dominions.js';
import { classifyIslands, buildCoalitionLookup } from './islandControl.js';
import { computeMaritimeBoundaries } from './maritimeBoundaries.js';
import { filterIntelOverlays } from './intelRadar.js';
import { calculateArcTrajectory } from './trajectories.js';
import { PIN_TYPES, PIN_PRIORITIES } from './tacticalPins.js';
import islandDefinitions from './island_definitions.json';
import islandOutlines from './island_outlines.json';
import { 
  worldToLng, 
  worldToLat, 
  lngToWorldX, 
  latToWorldY, 
  pixelToLng, 
  pixelToLat 
} from './coordProjection.js';

const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_OBJECT = Object.freeze({});

const EMPTY_FEATURE_COLLECTION = Object.freeze({
  type: 'FeatureCollection',
  features: []
});

const TOWN_DIR_OFFSETS = {
  nw: { x: 9, y: 14 },
  ne: { x: 17, y: 11 },
  sw: { x: 10, y: 13 },
  se: { x: 15, y: 13 }
};

/**
 * Projects town data into geographic longitude and latitude.
 * 
 * @param {Object} town - Town data object
 * @returns {[number, number]} [lng, lat]
 */
export function getTownMapCoordinates(town) {
  if (!town) return [0, 0];
  if (town.lng !== undefined && town.lat !== undefined) {
    return [Number(town.lng), Number(town.lat)];
  }
  if (town.coordinates && Array.isArray(town.coordinates)) {
    return [Number(town.coordinates[0]), Number(town.coordinates[1])];
  }

  const ix = Number(town.islandX ?? town.x ?? 500);
  const iy = Number(town.islandY ?? town.y ?? 500);
  const islandType = Number(town.islandType || 1);
  const slot = Number(town.islandSlot ?? town.slot ?? 0);
  
  const islandDef = islandDefinitions[islandType] || null;
  const definedSlots = islandDef?.town_offsets || [];
  const slotDef = definedSlots[slot];

  const islandPixelX = ix * 128;
  const islandPixelY = iy * 128 + ((ix & 1) ? 64 : 0);

  if (slotDef) {
    const dir = town.dir || slotDef.dir || 'nw';
    const dirOffset = TOWN_DIR_OFFSETS[dir] || { x: 9, y: 14 };
    const townPixelX = islandPixelX + slotDef.x + dirOffset.x;
    const townPixelY = islandPixelY + slotDef.y + dirOffset.y;
    return [(townPixelX / 128000) * 360 - 180, -((townPixelY / 128000) * 180 - 90)];
  }

  const tileWidth = islandDef?.width || 7;
  const tileHeight = islandDef?.height || 4;
  const islandCenterPixelX = islandPixelX + (tileWidth * 128) / 2;
  const islandCenterPixelY = islandPixelY + (tileHeight * 128) / 2;
  const centerLng = (islandCenterPixelX / 128000) * 360 - 180;
  const centerLat = -((islandCenterPixelY / 128000) * 180 - 90);
  const angle = (slot / 20) * Math.PI * 2;
  return [centerLng + Math.cos(angle) * 0.003, centerLat + Math.sin(angle) * 0.003];
}

/**
 * Projects geographic coordinates into game world grid and ocean sector code.
 * 
 * @param {number} lng - Longitude (-180 to 180)
 * @param {number} lat - Latitude (-90 to 90)
 * @returns {{ gridX: number, gridY: number, oceanCode: string }}
 */
export function projectCursorSector(lng, lat) {
  const gridX = lngToWorldX(lng);
  const gridY = latToWorldY(lat);
  const ox = Math.floor(gridX / 100);
  const oy = Math.floor(gridY / 100);
  return {
    gridX,
    gridY,
    oceanCode: `O${ox}${oy}`
  };
}

/**
 * Generates the static 10x10 ocean sector grid and label points.
 * 
 * @returns {Object} GeoJSON FeatureCollection
 */
export function generateOceanGrid() {
  const features = [];
  
  for (let i = 0; i <= 10; i++) {
    const coord = i * 100;
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [worldToLng(coord), worldToLat(0)], 
          [worldToLng(coord), worldToLat(1000)]
        ]
      }
    });
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [worldToLng(0), worldToLat(coord)],
          [worldToLng(1000), worldToLat(coord)]
        ]
      }
    });
  }

  for (let ox = 0; ox < 10; ox++) {
    for (let oy = 0; oy < 10; oy++) {
      const offsets = [10, 30, 50, 70, 90];
      offsets.forEach(dx => {
        offsets.forEach(dy => {
          features.push({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [
                worldToLng(ox * 100 + dx),
                worldToLat(oy * 100 + dy)
              ]
            },
            properties: { label: `O${ox}${oy}` }
          });
        });
      });
    }
  }

  return { type: "FeatureCollection", features };
}

/**
 * The Tactical Scene Pipeline Engine.
 */
export class TacticalScenePipeline {
  constructor() {
    this._staticOceanGrid = generateOceanGrid();

    // Tier 1 cache: Base Topology
    this._tier1Key = null;
    this._tier1Data = null;

    // Tier 2 cache: Political Topology
    this._tier2Key = null;
    this._tier2Data = null;
  }

  /**
   * Compiles world data and user options into an immutable SceneBundle.
   * 
   * @param {Object} input
   * @param {Object} input.geojsonData - Raw world GeoJSON FeatureCollection
   * @param {Array<Object>} [input.topAlliances=[]] - Top alliance metadata
   * @param {Array<Object>} [input.topPlayers=[]] - Top player metadata
   * @param {Array<Object>} [input.coalitions=[]] - Registered alliance coalitions
   * @param {Object} [input.customColors={}] - Map of user-assigned custom colors
   * @param {Object} [input.highlightedPlayers={}] - Map of active player highlights
   * @param {Object} [input.highlightedAlliances={}] - Map of active alliance highlights
   * @param {boolean} [input.showGhostsOnly=false] - Filter to display only ghost towns
   * @param {boolean} [input.showEmptySlots=true] - Toggle to render empty colonizable slots
   * @param {Object} [input.radarFilters={}] - Intel Radar filter parameters
   * @param {Array<Object>} [input.tacticalPins=[]] - Active tactical pin list
   * @param {Object} [input.routeOrigin=null] - Transit origin town
   * @param {Object} [input.routeTarget=null] - Transit target town
   * @param {Array<Object>} [input.conquests=[]] - Recent conquests list for active siege detection
   * @returns {{ sources: Object, activeTransits: Array, tacticalStats: Object }}
   */
  compileScene(input = {}) {
    const {
      geojsonData = null,
      topAlliances = EMPTY_ARRAY,
      topPlayers = EMPTY_ARRAY,
      coalitions = EMPTY_ARRAY,
      customColors = EMPTY_OBJECT,
      highlightedPlayers = EMPTY_OBJECT,
      highlightedAlliances = EMPTY_OBJECT,
      showGhostsOnly = false,
      showEmptySlots = true,
      radarFilters = EMPTY_OBJECT,
      tacticalPins = EMPTY_ARRAY,
      routeOrigin = null,
      routeTarget = null,
      conquests = EMPTY_ARRAY
    } = input;

    // =========================================================================
    // TIER 1: BASE TOPOLOGY (partitioning, terrain contours, small rocks)
    // =========================================================================
    const rawFeatures = geojsonData?.features || [];
    const tier1Key = geojsonData;

    if (this._tier1Key !== tier1Key || !this._tier1Data) {
      this._tier1Data = this._compileTier1(rawFeatures);
      this._tier1Key = tier1Key;
      // Invalidate Tier 2 when Tier 1 changes
      this._tier2Key = null;
      this._tier2Data = null;
    }

    const {
      partitionedFeatures,
      islandContoursData,
      rockPolygonsData,
      rocksData
    } = this._tier1Data;

    const rawTowns = partitionedFeatures.towns;

    // =========================================================================
    // TIER 2: POLITICAL TOPOLOGY (sovereignty, voronoi, maritime, dominions)
    // =========================================================================
    const tier2Key = {
      tier1Key,
      coalitions,
      customColors,
      topAlliances
    };

    if (!this._isTier2Valid(tier2Key) || !this._tier2Data) {
      this._tier2Data = this._compileTier2(
        partitionedFeatures,
        rawTowns,
        topAlliances,
        coalitions,
        customColors
      );
      this._tier2Key = tier2Key;
    }

    const {
      coalitionLookup,
      getEffectiveAllianceColor,
      islandClassification,
      islandsData,
      islandPolygonsData,
      voronoiData,
      frontlinesData,
      maritimeTerritoryData,
      allianceTerritoryStats
    } = this._tier2Data;

    // =========================================================================
    // TIER 3: DYNAMIC OVERLAYS (radar, pins, route transits, town highlights)
    // =========================================================================

    // 1. Towns Feature Collection (ghost filter + color & highlight resolution)
    let towns = rawTowns;
    if (showGhostsOnly) {
      towns = towns.filter(t => t.properties?.isGhost || !t.properties?.player || t.properties?.player === 'Ghost Town');
    }

    const hasHighlights = Object.keys(highlightedPlayers).length > 0 || Object.keys(highlightedAlliances).length > 0;
    let mappedTowns = towns.map(t => {
      const p = t.properties || {};
      const pName = p.player;
      const aName = p.alliance;
      const aId = p.allianceId;
      const isGhost = p.isGhost || !pName || pName === 'Ghost Town';

      let effectiveTownColor = p.townColor;
      if (!isGhost && aName && aName !== 'None') {
        effectiveTownColor = getEffectiveAllianceColor(aName, aId, p.townColor);
      }

      let hColor = null;
      if (hasHighlights) {
        if (highlightedPlayers[pName]) hColor = highlightedPlayers[pName];
        else if (highlightedAlliances[aName]) hColor = highlightedAlliances[aName];
      }

      if (hColor || effectiveTownColor !== p.townColor) {
        return {
          ...t,
          properties: {
            ...p,
            townColor: effectiveTownColor,
            ...(hColor ? { highlightColor: hColor } : {})
          }
        };
      }
      return t;
    });

    if (hasHighlights) {
      mappedTowns.sort((a, b) => {
        const aH = Boolean(a.properties?.highlightColor);
        const bH = Boolean(b.properties?.highlightColor);
        if (aH && !bH) return 1;
        if (!aH && bH) return -1;
        return 0;
      });
    }

    const townsData = mappedTowns.length > 0 
      ? { type: 'FeatureCollection', features: mappedTowns }
      : EMPTY_FEATURE_COLLECTION;

    // 2. Empty slots
    const emptySlotsData = (showEmptySlots && partitionedFeatures.emptySlots.length > 0)
      ? { type: 'FeatureCollection', features: partitionedFeatures.emptySlots }
      : EMPTY_FEATURE_COLLECTION;

    // 3. Intel Radar Data
    const radarData = rawTowns.length > 0
      ? filterIntelOverlays(rawTowns, topPlayers, conquests, radarFilters)
      : {
          ghosts: EMPTY_FEATURE_COLLECTION,
          sieges: EMPTY_FEATURE_COLLECTION,
          inactiveFarms: EMPTY_FEATURE_COLLECTION
        };

    // 4. Tactical Pins GeoJSON
    const pinFeatures = (tacticalPins || []).map(pin => {
      const pinTypeMeta = PIN_TYPES[pin.type] || PIN_TYPES.PRIMARY_TARGET;
      const priorityMeta = PIN_PRIORITIES[pin.priority] || PIN_PRIORITIES.NORMAL;
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [Number(pin.lng), Number(pin.lat)]
        },
        properties: {
          pinId: pin.id,
          townId: pin.townId,
          townName: pin.townName,
          type: pin.type,
          priority: pin.priority,
          notes: pin.notes,
          author: pin.author,
          pinColor: pinTypeMeta.color,
          pinIcon: pinTypeMeta.icon,
          priorityRank: priorityMeta.rank
        }
      };
    });
    const tacticalPinsGeoJSON = pinFeatures.length > 0
      ? { type: "FeatureCollection", features: pinFeatures }
      : EMPTY_FEATURE_COLLECTION;

    // 5. Arcing Naval Route Line & Simulated Transit
    let routeLineData = EMPTY_FEATURE_COLLECTION;
    let activeTransits = [];

    if (routeOrigin && routeTarget) {
      const [oLng, oLat] = getTownMapCoordinates(routeOrigin);
      const [tLng, tLat] = getTownMapCoordinates(routeTarget);

      const curvePoints = calculateArcTrajectory(
        { lng: oLng, lat: oLat },
        { lng: tLng, lat: tLat },
        0.20,
        40
      );

      if (curvePoints.length > 0) {
        routeLineData = {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "LineString", coordinates: curvePoints }
            }
          ]
        };

        const durationSeconds = 30;
        const now = Date.now();
        activeTransits = [
          {
            id: `route_transit_${routeOrigin.id}_${routeTarget.id}`,
            originTownId: routeOrigin.id,
            targetTownId: routeTarget.id,
            originName: routeOrigin.name,
            targetName: routeTarget.name,
            curveCoordinates: curvePoints,
            unitType: "bireme",
            startTime: now,
            landingTime: now + durationSeconds * 1000,
            durationSeconds
          }
        ];
      }
    }

    // Consolidated ready-to-render source dictionary
    const sources = {
      'ocean-grid-source': this._staticOceanGrid,
      'route-line-source': routeLineData,
      'voronoi-source': voronoiData || EMPTY_FEATURE_COLLECTION,
      'frontlines-source': frontlinesData || EMPTY_FEATURE_COLLECTION,
      'ghost-radar-source': radarData.ghosts || EMPTY_FEATURE_COLLECTION,
      'siege-radar-source': radarData.sieges || EMPTY_FEATURE_COLLECTION,
      'inactive-farm-source': radarData.inactiveFarms || EMPTY_FEATURE_COLLECTION,
      'tactical-pins-source': tacticalPinsGeoJSON,
      'islands-source': islandsData || EMPTY_FEATURE_COLLECTION,
      'island-polygons-source': islandPolygonsData || EMPTY_FEATURE_COLLECTION,
      'island-contours-source': islandContoursData || EMPTY_FEATURE_COLLECTION,
      'rock-polygons-source': rockPolygonsData || EMPTY_FEATURE_COLLECTION,
      'frontline-islands-source': islandClassification?.frontlineIslandsGeoJSON || EMPTY_FEATURE_COLLECTION,
      'empty-slots-source': emptySlotsData,
      'maritime-ocean-source': maritimeTerritoryData?.oceanBasinsGeoJSON || EMPTY_FEATURE_COLLECTION,
      'maritime-frontlines-source': maritimeTerritoryData?.frontlinesGeoJSON || EMPTY_FEATURE_COLLECTION,
      'island-halos-source': maritimeTerritoryData?.islandHalosGeoJSON || EMPTY_FEATURE_COLLECTION,
      'enemy-beachheads-source': islandClassification?.enemyBeachheadsGeoJSON || EMPTY_FEATURE_COLLECTION,
      'maritime-labels-source': maritimeTerritoryData?.macroLabelsGeoJSON || EMPTY_FEATURE_COLLECTION,
      'towns-source': townsData
    };

    const tacticalStats = {
      allianceTerritoryStats,
      radarCounts: {
        ghosts: radarData.ghosts?.features?.length || 0,
        sieges: radarData.sieges?.features?.length || 0,
        inactiveFarms: radarData.inactiveFarms?.features?.length || 0,
        total: (radarData.ghosts?.features?.length || 0) +
               (radarData.sieges?.features?.length || 0) +
               (radarData.inactiveFarms?.features?.length || 0)
      },
      frontlineCount: islandClassification?.frontlineIslandsGeoJSON?.features?.length || 0,
      contestedFrontlineCount: frontlinesData?.features?.filter(f => f.properties?.isContestedIsland || f.properties?.tension > 0)?.length || 0,
      rawTowns,
      partitionedFeatures,
      islandClassification,
      coalitionLookup,
      getEffectiveAllianceColor
    };

    return {
      sources,
      activeTransits,
      tacticalStats
    };
  }

  // ---------------------------------------------------------------------------
  // Internal Tier 1 Compilation
  // ---------------------------------------------------------------------------
  _compileTier1(rawFeatures) {
    const towns = [];
    const islands = [];
    const rocks = [];
    const emptySlots = [];

    for (const f of rawFeatures) {
      const rt = f.properties?.renderType;
      if (rt === 'town') towns.push(f);
      else if (rt === 'island') islands.push(f);
      else if (rt === 'rock') rocks.push(f);
      else if (rt === 'empty-slot') emptySlots.push(f);
    }

    const partitionedFeatures = { towns, islands, rocks, emptySlots };

    // Island inner contour LineStrings
    const contourFeatures = [];
    for (const island of islands) {
      const type = island.properties?.islandType;
      const outline = islandOutlines[type];
      if (!outline || !outline.contours || outline.contours.length === 0) continue;

      const ix = island.properties.x;
      const iy = island.properties.y;
      const tileW = outline.width || island.properties.width || 7;
      const tileH = outline.height || island.properties.height || 4;

      const islandPixelX = ix * 128;
      const islandPixelY = iy * 128 + ((ix & 1) ? 64 : 0);

      for (const contour of outline.contours) {
        if (contour.length < 3) continue;

        const coords = contour.map(([nx, ny]) => [
          pixelToLng(islandPixelX + nx * tileW * 128),
          pixelToLat(islandPixelY + ny * tileH * 128)
        ]);
        coords.push(coords[0]); // Close ring

        contourFeatures.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { islandId: island.properties.id }
        });
      }
    }

    const islandContoursData = contourFeatures.length > 0 
      ? { type: 'FeatureCollection', features: contourFeatures }
      : EMPTY_FEATURE_COLLECTION;

    // Rock polygons
    const rockPolygonFeatures = rocks.map(rock => {
      const type = rock.properties?.islandType || 999;
      const rockOutline = islandOutlines[type] || islandOutlines['999'];
      if (!rockOutline || !rockOutline.exterior) return null;

      const ix = rock.properties.x;
      const iy = rock.properties.y;
      const tileW = rockOutline.width || 1;
      const tileH = rockOutline.height || 1;

      const islandPixelX = ix * 128;
      const islandPixelY = iy * 128 + ((ix & 1) ? 64 : 0);

      const polygon = rockOutline.exterior.map(([nx, ny]) => [
        pixelToLng(islandPixelX + nx * tileW * 128),
        pixelToLat(islandPixelY + ny * tileH * 128)
      ]);
      polygon.push(polygon[0]);

      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [polygon] },
        properties: { ...rock.properties, renderType: 'rock' }
      };
    }).filter(Boolean);

    const rockPolygonsData = rockPolygonFeatures.length > 0
      ? { type: 'FeatureCollection', features: rockPolygonFeatures }
      : EMPTY_FEATURE_COLLECTION;

    const rocksData = rocks.length > 0
      ? { type: 'FeatureCollection', features: rocks }
      : EMPTY_FEATURE_COLLECTION;

    return {
      partitionedFeatures,
      islandContoursData,
      rockPolygonsData,
      rocksData
    };
  }

  // ---------------------------------------------------------------------------
  // Internal Tier 2 Compilation
  // ---------------------------------------------------------------------------
  _compileTier2(partitionedFeatures, rawTowns, topAlliances, coalitions, customColors) {
    const coalitionLookup = buildCoalitionLookup(coalitions);

    const getEffectiveAllianceColor = (allianceName, allianceId, fallbackColor = '#94a3b8') => {
      if (!allianceName || allianceName === 'None' || allianceName === 'Ghost Town') return fallbackColor;
      if (customColors[allianceName]) return customColors[allianceName];

      const normName = allianceName.trim().toLowerCase();
      const coalition = coalitionLookup.get(normName) || (allianceId != null ? coalitionLookup.get(String(allianceId)) : null);
      if (coalition) {
        if (customColors[coalition.name]) return customColors[coalition.name];
        if (coalition.color) return coalition.color;
      }

      return fallbackColor;
    };

    // Island Classification
    let islandClassification = null;
    if (rawTowns.length > 0 && partitionedFeatures.islands.length > 0) {
      islandClassification = classifyIslands(partitionedFeatures.islands, rawTowns, {
        coalitions,
        customColors,
        minCleanTowns: 1
      });
    }

    // Islands Points Feature Collection
    let islandsData = EMPTY_FEATURE_COLLECTION;
    let islandPolygonsData = EMPTY_FEATURE_COLLECTION;

    if (partitionedFeatures.islands.length > 0) {
      const summaryMap = new Map((islandClassification?.islandSummaryList || []).map(s => [s.islandKey, s]));

      let taggedIslands = partitionedFeatures.islands.map(f => {
        const ix = f.properties.x;
        const iy = f.properties.y;
        const key = `${ix}_${iy}`;
        const sum = summaryMap.get(key);

        const ally = sum?.dominantAlliance || f.properties.dominantAlliance;
        let dominantAlliance = ally;
        let islandColor = f.properties.islandColor;

        if (ally && ally !== "None") {
          const normName = ally.trim().toLowerCase();
          const coalition = coalitionLookup.get(normName);
          if (coalition) {
            dominantAlliance = coalition.name;
          }
          islandColor = sum?.dominantColor || getEffectiveAllianceColor(dominantAlliance, null, coalition?.color || f.properties.islandColor);
        }

        return {
          ...f,
          properties: {
            ...f.properties,
            islandKey: key,
            islandColor,
            dominantAlliance,
            status: sum?.status || 'NEUTRAL',
            isFrontline: Boolean(sum?.isFrontline),
            threatLevel: sum?.threatLevel || 'NONE',
            frontlineRival: sum?.frontlineRival || null,
            isSafeCore: Boolean(sum?.isSafeCore),
            dominantCount: sum?.dominantCount || 0,
            enemyCount: sum?.enemyCount || 0
          }
        };
      });

      taggedIslands.sort((a, b) => {
        const aEmpty = a.properties.islandColor === "#1e293b";
        const bEmpty = b.properties.islandColor === "#1e293b";
        if (aEmpty && !bEmpty) return -1;
        if (!aEmpty && bEmpty) return 1;
        return 0;
      });

      islandsData = { type: 'FeatureCollection', features: taggedIslands };

      // Island Vector Polygons
      const polygonFeatures = taggedIslands.map(island => {
        const type = island.properties.islandType;
        const outline = islandOutlines[type];
        if (!outline || !outline.exterior || outline.exterior.length < 3) return null;

        const ix = island.properties.x;
        const iy = island.properties.y;
        const tileW = outline.width || island.properties.width || 7;
        const tileH = outline.height || island.properties.height || 4;

        const islandPixelX = ix * 128;
        const islandPixelY = iy * 128 + ((ix & 1) ? 64 : 0);

        const polygon = outline.exterior.map(([nx, ny]) => [
          pixelToLng(islandPixelX + nx * tileW * 128),
          pixelToLat(islandPixelY + ny * tileH * 128)
        ]);
        polygon.push(polygon[0]);

        return {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [polygon] },
          properties: { ...island.properties, renderType: 'island' }
        };
      }).filter(Boolean);

      if (polygonFeatures.length > 0) {
        islandPolygonsData = { type: 'FeatureCollection', features: polygonFeatures };
      }
    }

    // Voronoi Political Territory
    let voronoiData = EMPTY_FEATURE_COLLECTION;
    if (rawTowns.length > 0 && topAlliances.length > 0) {
      voronoiData = computeAllianceVoronoi(rawTowns, topAlliances, {
        customColors,
        coalitions,
        maxRadius: 25.0,
        minTownCount: 2
      }) || EMPTY_FEATURE_COLLECTION;
    }

    // Contested Frontlines
    let frontlinesData = EMPTY_FEATURE_COLLECTION;
    if (rawTowns.length > 0 && voronoiData.features?.length > 0) {
      frontlinesData = computeContestedFrontlines(rawTowns, voronoiData, { coalitions }) || EMPTY_FEATURE_COLLECTION;
    }

    // Maritime boundaries
    let maritimeTerritoryData = {
      oceanBasinsGeoJSON: EMPTY_FEATURE_COLLECTION,
      frontlinesGeoJSON: EMPTY_FEATURE_COLLECTION,
      islandHalosGeoJSON: EMPTY_FEATURE_COLLECTION,
      macroLabelsGeoJSON: EMPTY_FEATURE_COLLECTION
    };
    if (islandClassification?.islandSummaryList?.length > 0) {
      maritimeTerritoryData = computeMaritimeBoundaries(islandClassification.islandSummaryList, {
        clusterMaxGapDeg: 4.5,
        bufferDeg: 1.10
      });
    }

    // Dominions
    let dominionsData = {
      polygons: EMPTY_FEATURE_COLLECTION,
      labels: EMPTY_FEATURE_COLLECTION
    };
    if (rawTowns.length > 0 && topAlliances.length > 0) {
      dominionsData = computeAllianceDominions(rawTowns, topAlliances, customColors, { coalitions });
    }

    // Alliance Territory Stats
    let allianceTerritoryStats = [];
    if (rawTowns.length > 0 && topAlliances.length > 0) {
      const totalEligible = rawTowns.filter(t => {
        const p = t.properties || t;
        const a = p.alliance;
        return a && a !== 'None' && a !== 'Ghost Town';
      }).length || 1;

      allianceTerritoryStats = (topAlliances || []).map(a => {
        const aTowns = rawTowns.filter(t => {
          const p = t.properties || t;
          return p.alliance === a.name || p.allianceId === a.id;
        }).length;

        return {
          allianceId: a.id,
          allianceName: a.name,
          color: getEffectiveAllianceColor(a.name, a.id, a.color || '#8b5cf6'),
          townCount: aTowns,
          dominantShare: aTowns / totalEligible,
          points: a.points
        };
      }).sort((a, b) => b.townCount - a.townCount);
    }

    return {
      coalitionLookup,
      getEffectiveAllianceColor,
      islandClassification,
      islandsData,
      islandPolygonsData,
      voronoiData,
      frontlinesData,
      maritimeTerritoryData,
      dominionsData,
      allianceTerritoryStats
    };
  }

  _isTier2Valid(key) {
    if (!this._tier2Key) return false;
    const sameTier1 = this._tier2Key.tier1Key === key.tier1Key;
    const sameCoalitions = this._tier2Key.coalitions === key.coalitions ||
      (Array.isArray(this._tier2Key.coalitions) && Array.isArray(key.coalitions) &&
       this._tier2Key.coalitions.length === 0 && key.coalitions.length === 0);
    const sameCustomColors = this._tier2Key.customColors === key.customColors ||
      (this._tier2Key.customColors && key.customColors &&
       Object.keys(this._tier2Key.customColors).length === 0 && Object.keys(key.customColors).length === 0);
    const sameAlliances = this._tier2Key.topAlliances === key.topAlliances ||
      (Array.isArray(this._tier2Key.topAlliances) && Array.isArray(key.topAlliances) &&
       this._tier2Key.topAlliances.length === 0 && key.topAlliances.length === 0);

    return sameTier1 && sameCoalitions && sameCustomColors && sameAlliances;
  }
}

// Export default singleton instance & convenience helper
const defaultPipeline = new TacticalScenePipeline();

export function compileScene(input) {
  return defaultPipeline.compileScene(input);
}
