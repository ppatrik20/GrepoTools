"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import MapGL, { Source, Layer, Popup } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { 
  Menu, X, MapPin, Trophy, Users, Loader2, Navigation, Compass,
  Ghost, Layers, Sparkles, Radio, Target, Pin, Swords, Shield
} from 'lucide-react';
import IslandModal from "@/components/IslandModal";
import DeepDiveModal from "@/components/DeepDiveModal";
import UnifiedSearchPanel, { normalizeTownData } from "@/components/map/UnifiedSearchPanel";
import CommandDrawer from "@/components/map/CommandDrawer";
import RoutePlannerTool from "@/components/map/RoutePlannerTool";
import PoliticalHeatmapLegend from "@/components/map/PoliticalHeatmapLegend";
import { DEFAULT_RADAR_FILTERS } from "@/components/map/IntelRadarControls";
import AnimatedTroopLayer from "@/components/map/AnimatedTroopLayer";
import TacticalPinModal from "@/components/map/TacticalPinModal";
import MinimapRadar from "@/components/map/MinimapRadar";
import AllianceCoalitionModal from "@/components/map/AllianceCoalitionModal";

import { computeAllianceVoronoi, computeContestedFrontlines } from "@/lib/map/voronoi";
import { computeAllianceDominions } from "@/lib/map/dominions";
import { classifyIslands, buildCoalitionLookup, ISLAND_STATUS } from "@/lib/map/islandControl";
import { computeMaritimeBoundaries } from "@/lib/map/maritimeBoundaries";
import { filterIntelOverlays } from "@/lib/map/intelRadar";
import { calculateArcTrajectory } from "@/lib/map/trajectories";
import { getTacticalPins, saveTacticalPin, removeTacticalPin, PIN_TYPES, PIN_PRIORITIES } from "@/lib/map/tacticalPins";
import { registerMapAssets, ALL_ISLAND_TYPES } from "@/lib/map/assetLoader";
import islandDefinitions from "@/lib/map/island_definitions.json";
import islandOutlines from "@/lib/map/island_outlines.json";
import { useApp } from "@/context/AppContext";
import { worldToLng, worldToLat, lngToWorldX, latToWorldY, worldToLngLat, pixelToLng, pixelToLat } from "@/lib/map/coordProjection";

const MAP_STYLE = {
  version: 8,
  sources: {},
  glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#0b101e" }
    }
  ]
};

function generateOceanGrid() {
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

const TOWN_DIR_OFFSETS = {
  nw: { x: 9, y: 14 },
  ne: { x: 17, y: 11 },
  sw: { x: 10, y: 13 },
  se: { x: 15, y: 13 }
};

function getTownMapCoordinates(town) {
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

export default function WorldMap() {
  const { activeWorldId, activeWorld } = useApp();
  const [data, setData] = useState(null);
  const [topAlliances, setTopAlliances] = useState([]);
  const [topPlayers, setTopPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [mapProcessing, setMapProcessing] = useState(true);
  const [hoverInfo, setHoverInfo] = useState(null);
  const hoverInfoRef = useRef(null);
  const cursorGridRef = useRef(null);
  const [worldStats, setWorldStats] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [customColors, setCustomColors] = useState({});
  const [highlightedPlayers, setHighlightedPlayers] = useState({});
  const [highlightedAlliances, setHighlightedAlliances] = useState({});
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [expandedModalEntity, setExpandedModalEntity] = useState(null);
  
  // Interactive tools
  const [showGhostsOnly, setShowGhostsOnly] = useState(false);
  const [showEmptySlots, setShowEmptySlots] = useState(true);
  const [isRouteToolActive, setIsRouteToolActive] = useState(false);
  const [routeOrigin, setRouteOrigin] = useState(null);
  const [routeTarget, setRouteTarget] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);

  // View mode & political overlay controls (Milestone 1)
  const [viewMode, setViewMode] = useState('geographic');
  const [politicalOpacity, setPoliticalOpacity] = useState(0.35);
  const [showContestedFrontlines, setShowContestedFrontlines] = useState(true);
  const [showFrontlines, setShowFrontlines] = useState(true);
  const [highlightedAllianceVoronoi, setHighlightedAllianceVoronoi] = useState(null);

  // Tactical Intel Radar Controls (Milestone 2)
  const [radarFilters, setRadarFilters] = useState(DEFAULT_RADAR_FILTERS);

  // Animated Troop Movements (Milestone 3)
  const [activeTransits, setActiveTransits] = useState([]);

  // Tactical Pinboard System (Milestone 4)
  const [tacticalPins, setTacticalPins] = useState([]);
  const [selectedPinTown, setSelectedPinTown] = useState(null);

  // Alliance Coalitions & Families
  const [coalitions, setCoalitions] = useState([]);
  const [allWorldAlliances, setAllWorldAlliances] = useState([]);
  const [isCoalitionModalOpen, setIsCoalitionModalOpen] = useState(false);

  // Viewport tracking for Minimap Radar (Milestone 5)
  const [currentViewState, setCurrentViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 2
  });

  const mapRef = useRef();
  const rafRef = useRef(null);
  const oceanGrid = useMemo(() => generateOceanGrid(), []);

  // Cleanup rAF on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Load world data
  useEffect(() => {
    async function loadData() {
      if (!activeWorldId) return;
      setLoading(true);
      setLoadError(null);
      try {
        const [metaRes, geoRes] = await Promise.all([
          fetch(`/api/world/meta?world=${activeWorldId}`),
          fetch(`/api/world/geojson?world=${activeWorldId}`)
        ]);
        
        if (!metaRes.ok || !geoRes.ok) {
          throw new Error(`Server error: meta=${metaRes.status}, geojson=${geoRes.status}`);
        }

        const meta = await metaRes.json();
        const geojson = await geoRes.json();

        setTopAlliances(meta.topAlliances || []);
        setTopPlayers(meta.topPlayers || []);
        setWorldStats(meta.stats);
        if (meta.lastSync) setLastSync(new Date(meta.lastSync));

        setData(geojson);
        setLoading(false);
      } catch (error) {
        console.error("Map load error:", error);
        setLoadError(error.message || 'Failed to load world data');
        setLoading(false);
      }
    }

    loadData();
  }, [activeWorldId]);

  // Load tactical pins for current world
  useEffect(() => {
    if (activeWorldId) {
      setTacticalPins(getTacticalPins(activeWorldId));
    }
  }, [activeWorldId]);

  // Load alliance coalitions for current world and auto-seed member colors
  useEffect(() => {
    if (!activeWorldId) return;
    fetch(`/api/world/coalitions?world=${activeWorldId}`)
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.coalitions)) {
          setCoalitions(result.coalitions);
          // Auto-seed coalition colors to all member alliances
          setCustomColors(prev => {
            const next = { ...prev };
            result.coalitions.forEach(c => {
              if (!c?.color) return;
              (c.alliances || []).forEach(m => {
                const name = typeof m === 'string' ? m : m?.name;
                if (name && !next[name]) next[name] = c.color;
              });
              if (!next[c.name]) next[c.name] = c.color;
            });
            return next;
          });
        }
      })
      .catch(() => {
        try {
          const cached = localStorage.getItem(`grepotools_coalitions_${activeWorldId}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            setCoalitions(parsed);
            setCustomColors(prev => {
              const next = { ...prev };
              parsed.forEach(c => {
                if (!c?.color) return;
                (c.alliances || []).forEach(m => {
                  const name = typeof m === 'string' ? m : m?.name;
                  if (name && !next[name]) next[name] = c.color;
                });
                if (!next[c.name]) next[c.name] = c.color;
              });
              return next;
            });
          }
        } catch (e) {}
      });

    // Fetch all alliances in current world for searching in modal
    fetch(`/api/world/alliances?world=${activeWorldId}`)
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.alliances)) {
          setAllWorldAlliances(result.alliances);
        }
      })
      .catch(e => console.error("Failed to load all alliances:", e));
  }, [activeWorldId]);

  const handleSaveCoalitions = async (newCoalitions) => {
    setCoalitions(newCoalitions);
    // Auto-propagate coalition colors to all member alliances
    setCustomColors(prev => {
      const next = { ...prev };
      newCoalitions.forEach(c => {
        if (!c?.color) return;
        (c.alliances || []).forEach(m => {
          const name = typeof m === 'string' ? m : m?.name;
          if (name) next[name] = c.color;
        });
        next[c.name] = c.color;
      });
      return next;
    });
    try {
      localStorage.setItem(`grepotools_coalitions_${activeWorldId}`, JSON.stringify(newCoalitions));
      const res = await fetch('/api/world/coalitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldId: activeWorldId, coalitions: newCoalitions })
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.coalitions)) {
        setCoalitions(data.coalitions);
      }
    } catch (e) {
      console.error("Failed to save coalitions:", e);
      throw e;
    }
  };

  // Pre-partition features once by renderType to avoid repeated O(N) scans across 100k+ features
  const partitionedFeatures = useMemo(() => {
    if (!data || !Array.isArray(data.features)) {
      return { towns: [], islands: [], rocks: [], emptySlots: [] };
    }
    const towns = [];
    const islands = [];
    const rocks = [];
    const emptySlots = [];
    for (const f of data.features) {
      const rt = f.properties?.renderType;
      if (rt === 'town') towns.push(f);
      else if (rt === 'island') islands.push(f);
      else if (rt === 'rock') rocks.push(f);
      else if (rt === 'empty-slot') emptySlots.push(f);
    }
    return { towns, islands, rocks, emptySlots };
  }, [data]);

  // Raw towns list (for Voronoi, Intel Radar, and Pins)
  const rawTowns = partitionedFeatures.towns;

  // Coalition lookup for fast mapping across map layers
  const coalitionLookup = useMemo(() => {
    return buildCoalitionLookup(coalitions);
  }, [coalitions]);

  // Active effective color resolver (customColors -> coalition color -> fallback)
  const getEffectiveAllianceColor = useCallback((allianceName, allianceId, fallbackColor = '#94a3b8') => {
    if (!allianceName || allianceName === 'None' || allianceName === 'Ghost Town') return fallbackColor;
    if (customColors[allianceName]) return customColors[allianceName];

    const normName = allianceName.trim().toLowerCase();
    const coalition = coalitionLookup.get(normName) || (allianceId != null ? coalitionLookup.get(String(allianceId)) : null);
    if (coalition) {
      if (customColors[coalition.name]) return customColors[coalition.name];
      if (coalition.color) return coalition.color;
    }

    return fallbackColor;
  }, [customColors, coalitionLookup]);

  // Island Sovereignty, Cleanliness & Frontline Classification
  const islandClassification = useMemo(() => {
    if (!rawTowns.length) return null;
    return classifyIslands(partitionedFeatures.islands, rawTowns, {
      coalitions,
      customColors,
      minCleanTowns: 1
    });
  }, [partitionedFeatures.islands, rawTowns, coalitions, customColors]);

  // Islands feature collection
  const islandsData = useMemo(() => {
    if (!partitionedFeatures.islands.length) return null;
    let features = partitionedFeatures.islands;
    const summaryMap = new Map((islandClassification?.islandSummaryList || []).map(s => [s.islandKey, s]));
    
    features = features.map(f => {
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

    features.sort((a, b) => {
      const aEmpty = a.properties.islandColor === "#1e293b";
      const bEmpty = b.properties.islandColor === "#1e293b";
      if (aEmpty && !bEmpty) return -1;
      if (!aEmpty && bEmpty) return 1;
      return 0;
    });
    return { type: 'FeatureCollection', features };
  }, [partitionedFeatures.islands, customColors, coalitionLookup, islandClassification, getEffectiveAllianceColor]);

  // Island Vector Polygon FeatureCollections (generated from Point features + outline data)
  const islandPolygonsData = useMemo(() => {
    if (!partitionedFeatures.islands.length) return null;
    let features = partitionedFeatures.islands;
    const summaryMap = new Map((islandClassification?.islandSummaryList || []).map(s => [s.islandKey, s]));

    // Apply custom alliance colors and coalition colors & tactical frontline metrics
    features = features.map(f => {
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

    const polygonFeatures = features
      .map(island => {
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
        polygon.push(polygon[0]); // Close the ring

        return {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [polygon] },
          properties: { ...island.properties, renderType: 'island' }
        };
      })
      .filter(Boolean);

    if (polygonFeatures.length === 0) return null;
    return { type: 'FeatureCollection', features: polygonFeatures };
  }, [partitionedFeatures.islands, customColors, coalitionLookup, islandClassification, getEffectiveAllianceColor]);

  // Island inner contour LineStrings for terrain detail at high zoom
  const islandContoursData = useMemo(() => {
    if (!partitionedFeatures.islands.length) return null;

    const contourFeatures = [];
    for (const island of partitionedFeatures.islands) {
      const type = island.properties.islandType;
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
        coords.push(coords[0]); // Close the ring

        contourFeatures.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { islandId: island.properties.id }
        });
      }
    }

    if (contourFeatures.length === 0) return null;
    return { type: 'FeatureCollection', features: contourFeatures };
  }, [partitionedFeatures.islands]);

  // Rock island vector polygons (small irregular shapes)
  const rockPolygonsData = useMemo(() => {
    if (!partitionedFeatures.rocks.length) return null;

    const features = partitionedFeatures.rocks
      .map(rock => {
        const type = rock.properties.islandType || 999;
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
      })
      .filter(Boolean);

    if (features.length === 0) return null;
    return { type: 'FeatureCollection', features };
  }, [partitionedFeatures.rocks]);

  const rocksData = useMemo(() => {
    if (!partitionedFeatures.rocks.length) return null;
    return { 
      type: 'FeatureCollection', 
      features: partitionedFeatures.rocks 
    };
  }, [partitionedFeatures.rocks]);

  const emptySlotsData = useMemo(() => {
    if (!partitionedFeatures.emptySlots.length || !showEmptySlots) return null;
    return { 
      type: 'FeatureCollection', 
      features: partitionedFeatures.emptySlots 
    };
  }, [partitionedFeatures.emptySlots, showEmptySlots]);

  const townsData = useMemo(() => {
    if (!partitionedFeatures.towns.length) return null;
    let towns = partitionedFeatures.towns;
    
    if (showGhostsOnly) {
      towns = towns.filter(t => t.properties.isGhost || !t.properties.player || t.properties.player === 'Ghost Town');
    }

    const hasHighlights = Object.keys(highlightedPlayers).length > 0 || Object.keys(highlightedAlliances).length > 0;

    // Apply coalition colors, customColors, and highlights across ALL towns
    towns = towns.map(t => {
      const pName = t.properties.player;
      const aName = t.properties.alliance;
      const aId = t.properties.allianceId;
      const isGhost = t.properties.isGhost || !pName || pName === 'Ghost Town';

      let effectiveTownColor = t.properties.townColor;
      if (!isGhost && aName && aName !== 'None') {
        effectiveTownColor = getEffectiveAllianceColor(aName, aId, t.properties.townColor);
      }

      let hColor = null;
      if (hasHighlights) {
        if (highlightedPlayers[pName]) hColor = highlightedPlayers[pName];
        else if (highlightedAlliances[aName]) hColor = highlightedAlliances[aName];
      }

      if (hColor || effectiveTownColor !== t.properties.townColor) {
        return {
          ...t,
          properties: {
            ...t.properties,
            townColor: effectiveTownColor,
            ...(hColor ? { highlightColor: hColor } : {})
          }
        };
      }
      return t;
    });

    if (hasHighlights) {
      towns.sort((a, b) => {
        if (a.properties.highlightColor && !b.properties.highlightColor) return 1;
        if (!a.properties.highlightColor && b.properties.highlightColor) return -1;
        return 0;
      });
    }

    return { type: 'FeatureCollection', features: towns };
  }, [partitionedFeatures.towns, showGhostsOnly, highlightedPlayers, highlightedAlliances, getEffectiveAllianceColor]);

  // Voronoi Political Territory GeoJSON (Milestone 1)
  const voronoiData = useMemo(() => {
    if (!rawTowns.length || !topAlliances.length) return null;
    return computeAllianceVoronoi(rawTowns, topAlliances, {
      customColors,
      coalitions,
      maxRadius: 25.0,
      minTownCount: 2
    });
  }, [rawTowns, topAlliances, customColors, coalitions]);

  // Contested Frontlines GeoJSON (Milestone 1)
  const frontlinesData = useMemo(() => {
    if (!rawTowns.length || !voronoiData) return null;
    return computeContestedFrontlines(rawTowns, voronoiData, { coalitions });
  }, [rawTowns, voronoiData, coalitions]);

  // Continuous Maritime Ocean Territorial Basins, Frontlines, and Island Halos
  const maritimeTerritoryData = useMemo(() => {
    if (!islandClassification || !islandClassification.islandSummaryList.length) {
      return {
        oceanBasinsGeoJSON: { type: 'FeatureCollection', features: [] },
        frontlinesGeoJSON: { type: 'FeatureCollection', features: [] },
        islandHalosGeoJSON: { type: 'FeatureCollection', features: [] },
        macroLabelsGeoJSON: { type: 'FeatureCollection', features: [] }
      };
    }
    return computeMaritimeBoundaries(islandClassification.islandSummaryList, {
      clusterMaxGapDeg: 4.5,
      bufferDeg: 1.10
    });
  }, [islandClassification]);

  // Connected Alliance Territorial Dominions (Fallback / Macro)
  const dominionsData = useMemo(() => {
    if (!rawTowns.length || !topAlliances.length) {
      return {
        polygons: { type: 'FeatureCollection', features: [] },
        labels: { type: 'FeatureCollection', features: [] }
      };
    }
    return computeAllianceDominions(rawTowns, topAlliances, customColors, { coalitions });
  }, [rawTowns, topAlliances, customColors, coalitions]);

  // Alliance Territory Stats for Legend Breakdown (Milestone 1)
  const allianceTerritoryStats = useMemo(() => {
    if (!rawTowns.length || !topAlliances.length) return [];
    const totalEligible = rawTowns.filter(t => {
      const p = t.properties || t;
      const a = p.alliance;
      return a && a !== 'None' && a !== 'Ghost Town';
    }).length || 1;

    return (topAlliances || []).map(a => {
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
  }, [rawTowns, topAlliances, getEffectiveAllianceColor]);

  // Intel Radar Overlay GeoJSON Collections (Milestone 2)
  const radarData = useMemo(() => {
    if (!rawTowns.length) {
      return {
        ghosts: { type: "FeatureCollection", features: [] },
        sieges: { type: "FeatureCollection", features: [] },
        inactiveFarms: { type: "FeatureCollection", features: [] }
      };
    }
    return filterIntelOverlays(rawTowns, topPlayers, [], radarFilters);
  }, [rawTowns, topPlayers, radarFilters]);

  // Tactical Pins GeoJSON Feature Collection (Milestone 4)
  const tacticalPinsGeoJSON = useMemo(() => {
    if (!tacticalPins.length) return { type: "FeatureCollection", features: [] };
    const features = tacticalPins.map(pin => {
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
    return { type: "FeatureCollection", features };
  }, [tacticalPins]);

  // Arcing Naval Route Line & Transit Generation (Milestone 3)
  const routeLineData = useMemo(() => {
    if (!routeOrigin || !routeTarget) return null;
    const [oLng, oLat] = getTownMapCoordinates(routeOrigin);
    const [tLng, tLat] = getTownMapCoordinates(routeTarget);

    const curvePoints = calculateArcTrajectory(
      { lng: oLng, lat: oLat },
      { lng: tLng, lat: tLat },
      0.20,
      40
    );

    if (!curvePoints.length) return null;

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: curvePoints }
        }
      ]
    };
  }, [routeOrigin, routeTarget]);

  // Auto-generate animated transit when route is active (Milestone 3)
  useEffect(() => {
    if (routeOrigin && routeTarget && routeLineData) {
      const curve = routeLineData.features[0].geometry.coordinates;
      const durationSeconds = 30; // 30-second continuous loop simulation
      const newTransit = {
        id: `route_transit_${routeOrigin.id}_${routeTarget.id}`,
        originTownId: routeOrigin.id,
        targetTownId: routeTarget.id,
        originName: routeOrigin.name,
        targetName: routeTarget.name,
        curveCoordinates: curve,
        unitType: "bireme",
        startTime: Date.now(),
        landingTime: Date.now() + durationSeconds * 1000,
        durationSeconds
      };
      setActiveTransits([newTransit]);
    } else {
      setActiveTransits([]);
    }
  }, [routeOrigin, routeTarget, routeLineData]);

  // Search Selection Handler
  const handleSelectSearchResult = (type, item) => {
    if (!mapRef.current) return;
    
    let targetLng = 0, targetLat = 0;

    if (type === 'island') {
      targetLng = worldToLng(item.x);
      targetLat = worldToLat(item.y);
      setSelectedEntity({ type: 'island', data: item });
    } else if (type === 'town') {
      const norm = normalizeTownData(item);
      const [tLng, tLat] = getTownMapCoordinates(norm);
      targetLng = tLng;
      targetLat = tLat;
      setSelectedEntity({ type: 'town', data: norm });
      
      if (isRouteToolActive) {
        if (!routeOrigin) setRouteOrigin(norm);
        else setRouteTarget(norm);
      }
    } else if (type === 'player') {
      setSelectedEntity({ type: 'player', data: item });
      setHighlightedPlayers({ [item.name]: '#f59e0b' });
      // Fly to centroid of player's towns
      if (rawTowns.length > 0) {
        const playerTowns = rawTowns.filter(t => (t.properties?.player === item.name));
        if (playerTowns.length > 0) {
          const coords = playerTowns.map(t => t.geometry?.coordinates || [0, 0]);
          targetLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
          targetLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
        }
      }
    } else if (type === 'alliance') {
      setSelectedEntity({ type: 'alliance', data: item });
      setHighlightedAlliances({ [item.name]: '#8b5cf6' });
      // Fly to centroid of alliance's towns
      if (rawTowns.length > 0) {
        const allianceTowns = rawTowns.filter(t => (t.properties?.alliance === item.name));
        if (allianceTowns.length > 0) {
          const coords = allianceTowns.map(t => t.geometry?.coordinates || [0, 0]);
          targetLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
          targetLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
        }
      }
    }

    mapRef.current.flyTo({
      center: [targetLng, targetLat],
      zoom: 9.2,
      duration: 1200,
      essential: true
    });
  };

  const handleMapLoad = useCallback((e) => {
    const map = e.target;
    registerMapAssets(map, () => {
      setAssetsReady(true);
    });
  }, []);

  return (
    <div style={{ position: 'fixed', top: '64px', left: 0, right: 0, bottom: 0, backgroundColor: '#0b101e', zIndex: 10 }}>
      {/* Top Floating Unified Search & Action Bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center justify-center">
        <UnifiedSearchPanel
          worldId={activeWorldId}
          onSelectResult={handleSelectSearchResult}
          viewMode={viewMode}
          onToggleViewMode={setViewMode}
          onToggleGhosts={() => setShowGhostsOnly(prev => !prev)}
          showGhostsOnly={showGhostsOnly}
          onToggleRouteTool={() => setIsRouteToolActive(prev => !prev)}
          isRouteToolActive={isRouteToolActive}
          onToggleEmptySlots={() => setShowEmptySlots(prev => !prev)}
          showEmptySlots={showEmptySlots}
          onToggleFrontlines={() => setShowFrontlines(prev => !prev)}
          showFrontlines={showFrontlines}
          frontlineCount={islandClassification?.frontlineIslandsGeoJSON?.features?.length || 0}
          radarFilters={radarFilters}
          onRadarChange={setRadarFilters}
          radarCounts={{
            ghosts: radarData.ghosts.features.length,
            sieges: radarData.sieges.features.length,
            inactiveFarms: radarData.inactiveFarms.features.length,
            total: radarData.ghosts.features.length + radarData.sieges.features.length + radarData.inactiveFarms.features.length
          }}
        />
      </div>

      <div style={{ width: '100%', height: '100%', position: 'relative', zIndex: 0 }}>
        {loading && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11, 16, 30, 0.9)', backdropFilter: 'blur(4px)' }}>
            <div className="flex flex-col items-center gap-4">
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'white', letterSpacing: '2px', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
                Downloading World Data...
              </div>
            </div>
          </div>
        )}

        {loadError && !loading && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11, 16, 30, 0.9)', backdropFilter: 'blur(4px)' }}>
            <div className="flex flex-col items-center gap-4 text-center px-8">
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>
                ⚠️ Failed to Load Map
              </div>
              <div style={{ color: '#94a3b8', maxWidth: '400px' }}>
                {loadError}
              </div>
              <button
                onClick={() => {
                  setLoadError(null);
                  setLoading(true);
                  fetch(`/api/world/geojson?world=${activeWorldId}`)
                    .then(r => r.json())
                    .then(geojson => { setData(geojson); setLoading(false); })
                    .catch(err => { setLoadError(err.message); setLoading(false); });
                }}
                className="px-6 py-2 rounded-lg font-bold text-white transition-colors"
                style={{ backgroundColor: '#3b82f6' }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <MapGL
          ref={mapRef}
          mapLibre={maplibregl}
          style={{ width: "100%", height: "100%", position: "absolute", left: 0, top: 0 }}
          initialViewState={{ longitude: 0, latitude: 0, zoom: 2 }}
          minZoom={2.0}
          maxZoom={10.0}
          maxBounds={[
            [worldToLng(250), worldToLat(750)],
            [worldToLng(750), worldToLat(250)]
          ]}
          mapStyle={MAP_STYLE}
          onLoad={handleMapLoad}
          onMove={(e) => {
            setCurrentViewState({
              longitude: e.viewState.longitude,
              latitude: e.viewState.latitude,
              zoom: e.viewState.zoom
            });
          }}
          interactiveLayerIds={[
            "town-points", "town-sprites", "town-flags", 
            "islands-points", "island-terrain-fill", "rock-terrain-fill", 
            "empty-slots-points", "empty-slots-sprites",
            "ghost-radar-markers", "siege-radar-markers", "inactive-farm-markers",
            "tactical-pin-markers", "island-halos-ring", "enemy-beachheads-point"
          ]}
          onMouseEnter={() => {
            if (mapRef.current) mapRef.current.getCanvas().style.cursor = "pointer";
          }}
          onMouseLeave={() => {
            if (mapRef.current) mapRef.current.getCanvas().style.cursor = "";
            hoverInfoRef.current = null;
            setHoverInfo(null);
          }}
          onMouseMove={(e) => {
            const lng = e.lngLat.lng;
            const lat = e.lngLat.lat;
            const features = e.features;
            const pointX = e.point.x;
            const pointY = e.point.y;
            const lngLat = e.lngLat;

            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
              const gridX = lngToWorldX(lng);
              const gridY = latToWorldY(lat);
              cursorGridRef.current = { x: gridX, y: gridY };

              const prevFeatureId = hoverInfoRef.current?.feature?.properties?.id;
              if (features && features.length > 0) {
                const newFeatureId = features[0].properties?.id;
                const newHover = { feature: features[0], x: pointX, y: pointY, lngLat: lngLat };
                hoverInfoRef.current = newHover;
                // Only trigger re-render when hovered feature changes
                if (newFeatureId !== prevFeatureId) setHoverInfo(newHover);
              } else if (hoverInfoRef.current) {
                hoverInfoRef.current = null;
                setHoverInfo(null);
              }

              // Update cursor grid DOM directly to avoid re-render
              const gridEl = document.getElementById('cursor-grid-display');
              if (gridEl) {
                gridEl.textContent = `(${gridX}, ${gridY})`;
                const oceanEl = document.getElementById('cursor-ocean-display');
                if (oceanEl) oceanEl.textContent = `O${Math.floor(gridX / 100)}${Math.floor(gridY / 100)}`;
              }
            });
          }}
          onClick={(e) => {
            if (e.features && e.features.length > 0) {
              const feature = e.features[0];
              const p = feature.properties;
              
              if (p.renderType === 'island' || p.renderType === 'rock') {
                setSelectedEntity({
                  type: 'island',
                  data: {
                    id: p.id,
                    x: p.x,
                    y: p.y,
                    type: p.islandType || p.type,
                    availableTowns: p.availableTowns,
                    colonizedCount: p.colonizedCount,
                    resourcePlus: p.resourcePlus,
                    resourceMinus: p.resourceMinus
                  }
                });
              } else if (p.renderType === 'town' || p.townId || p.indicatorType === 'ghost_skull') {
                const norm = normalizeTownData(p);
                if (feature.geometry?.coordinates) {
                  norm.lng = feature.geometry.coordinates[0];
                  norm.lat = feature.geometry.coordinates[1];
                  norm.coordinates = feature.geometry.coordinates;
                }
                if (p.islandType) norm.islandType = p.islandType;
                if (p.dir) norm.dir = p.dir;
                if (p.islandSlot !== undefined) norm.islandSlot = p.islandSlot;
                
                // If route planner tool is open, handle assigning origin vs target
                if (isRouteToolActive) {
                  if (!routeOrigin) {
                    setRouteOrigin(norm);
                  } else if (!routeTarget || routeOrigin.id === norm.id) {
                    if (routeOrigin.id !== norm.id) setRouteTarget(norm);
                  } else {
                    setRouteTarget(norm);
                  }
                }
                
                setSelectedEntity({ type: 'town', data: norm });
              } else if (p.pinId) {
                const matchedTown = rawTowns.find(t => (t.id === p.townId || t.properties?.id === p.townId));
                if (matchedTown) {
                  setSelectedPinTown(normalizeTownData(matchedTown));
                }
              }
            }
          }}
          onIdle={() => {
            if (!loading) setMapProcessing(false);
          }}
        >
          {/* Ocean Grid Layer */}
          <Source id="ocean-grid-source" type="geojson" data={oceanGrid}>
            <Layer 
              id="ocean-lines" 
              type="line" 
              paint={{
                "line-color": "#1e293b",
                "line-width": 1,
                "line-dasharray": [2, 2]
              }} 
            />
            <Layer 
              id="ocean-labels" 
              type="symbol" 
              layout={{
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
              }}
              paint={{
                "text-color": "#334155",
                "text-opacity": [
                  "interpolate", ["linear"], ["zoom"],
                  2.0, 0.45,
                  5.0, 0.65,
                  8.0, 0.85
                ]
              }}
            />
          </Source>

          {/* Arcing Naval Route Line Layer (Milestone 3) */}
          {routeLineData && (
            <Source id="route-line-source" type="geojson" data={routeLineData}>
              <Layer
                id="route-line-glow"
                type="line"
                paint={{
                  "line-color": "#38bdf8",
                  "line-width": 6,
                  "line-opacity": 0.5,
                  "line-blur": 3
                }}
              />
              <Layer
                id="route-line"
                type="line"
                paint={{
                  "line-color": "#38bdf8",
                  "line-width": 2.5,
                  "line-dasharray": [3, 2]
                }}
              />
            </Source>
          )}

          {/* Political Voronoi Alliance Spheres Layer (Milestone 1) */}
          {voronoiData && (
            <Source id="voronoi-source" type="geojson" data={voronoiData}>
              <Layer
                id="voronoi-spheres-fill"
                type="fill"
                layout={{
                  visibility: viewMode === 'political' ? 'visible' : 'none'
                }}
                paint={{
                  "fill-color": ["coalesce", ["get", "color"], "#3b82f6"],
                  "fill-opacity": [
                    "interpolate", ["linear"], ["zoom"],
                    2.0, politicalOpacity,
                    5.0, politicalOpacity * 0.85,
                    8.0, politicalOpacity * 0.6,
                    10.0, politicalOpacity * 0.35
                  ],
                  "fill-antialias": true
                }}
              />
              <Layer
                id="voronoi-spheres-border"
                type="line"
                layout={{
                  visibility: viewMode === 'political' ? 'visible' : 'none',
                  "line-join": "round",
                  "line-cap": "round"
                }}
                paint={{
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
                }}
              />
            </Source>
          )}

          {/* Contested Frontlines Layer (Milestone 1) */}
          {frontlinesData && (
            <Source id="frontlines-source" type="geojson" data={frontlinesData}>
              <Layer
                id="contested-frontline-glow"
                type="line"
                layout={{
                  visibility: (viewMode === 'political' && showContestedFrontlines) ? 'visible' : 'none',
                  "line-join": "round",
                  "line-cap": "round"
                }}
                paint={{
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
                }}
              />
              <Layer
                id="contested-frontline-lines"
                type="line"
                layout={{
                  visibility: (viewMode === 'political' && showContestedFrontlines) ? 'visible' : 'none',
                  "line-join": "round",
                  "line-cap": "round"
                }}
                paint={{
                  "line-color": "#ffffff",
                  "line-width": [
                    "interpolate", ["linear"], ["zoom"],
                    2.0, 1.2,
                    5.0, 2.0,
                    8.0, 2.8
                  ],
                  "line-opacity": 0.95,
                  "line-dasharray": [2, 1]
                }}
              />
            </Source>
          )}

          {/* INTEL RADAR OVERLAYS (Milestone 2) */}
          {/* 1. Ghost Hunter Radar */}
          {radarFilters.ghostHunter && radarData.ghosts.features.length > 0 && (
            <Source id="ghost-radar-source" type="geojson" data={radarData.ghosts}>
              <Layer
                id="ghost-radar-glow"
                type="circle"
                paint={{
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
                }}
              />
              <Layer
                id="ghost-radar-markers"
                type="circle"
                paint={{
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
                }}
              />
              <Layer
                id="ghost-radar-labels"
                type="symbol"
                minzoom={6.0}
                layout={{
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
                }}
                paint={{
                  "text-color": "#67e8f9",
                  "text-halo-color": "#083344",
                  "text-halo-width": 2
                }}
              />
            </Source>
          )}

          {/* 2. Active Siege Radar */}
          {radarFilters.activeSiege && radarData.sieges.features.length > 0 && (
            <Source id="siege-radar-source" type="geojson" data={radarData.sieges}>
              <Layer
                id="siege-radar-halo"
                type="circle"
                paint={{
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
                }}
              />
              <Layer
                id="siege-radar-markers"
                type="circle"
                paint={{
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
                }}
              />
              <Layer
                id="siege-radar-labels"
                type="symbol"
                minzoom={5.5}
                layout={{
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
                }}
                paint={{
                  "text-color": "#fda4af",
                  "text-halo-color": "#4c0519",
                  "text-halo-width": 2
                }}
              />
            </Source>
          )}

          {/* 3. Inactive Farm Finder */}
          {radarFilters.inactiveFarms && radarData.inactiveFarms.features.length > 0 && (
            <Source id="inactive-farm-source" type="geojson" data={radarData.inactiveFarms}>
              <Layer
                id="inactive-farm-glow"
                type="circle"
                paint={{
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
                }}
              />
              <Layer
                id="inactive-farm-markers"
                type="circle"
                paint={{
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
                }}
              />
              <Layer
                id="inactive-farm-labels"
                type="symbol"
                minzoom={6.0}
                layout={{
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
                }}
                paint={{
                  "text-color": "#fde68a",
                  "text-halo-color": "#451a03",
                  "text-halo-width": 2
                }}
              />
            </Source>
          )}

          {/* TACTICAL ALLIANCE PINS LAYER (Milestone 4) */}
          {tacticalPinsGeoJSON.features.length > 0 && (
            <Source id="tactical-pins-source" type="geojson" data={tacticalPinsGeoJSON}>
              <Layer
                id="tactical-pins-glow"
                type="circle"
                paint={{
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
                }}
              />
              <Layer
                id="tactical-pin-markers"
                type="circle"
                paint={{
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
                }}
              />
              <Layer
                id="tactical-pin-labels"
                type="symbol"
                minzoom={5.0}
                layout={{
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
                }}
                paint={{
                  "text-color": "#ffffff",
                  "text-halo-color": "#0b101e",
                  "text-halo-width": 2.5
                }}
              />
            </Source>
          )}

          {/* Islands Layer */}
          {islandsData && (
            <Source id="islands-source" type="geojson" data={islandsData}>
              {/* Macro Zoom Island Dots (Zoom 2 to 5.2) */}
              <Layer 
                id="islands-points"
                type="circle"
                minzoom={2}
                maxzoom={5.2}
                paint={{
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
                }}
              />
            </Source>
          )}

          {/* Island Vector Terrain Polygons (Zoom >= 4.8) */}
          {islandPolygonsData && (
            <Source id="island-polygons-source" type="geojson" data={islandPolygonsData}>
              {/* Dark terrain fill - slightly lighter than ocean for contrast */}
              <Layer
                id="island-terrain-fill"
                type="fill"
                minzoom={4.8}
                paint={{
                  "fill-color": "#0f1729",
                  "fill-opacity": [
                    "interpolate", ["linear"], ["zoom"],
                    4.8, 0,
                    5.3, 0.9
                  ]
                }}
              />

              {/* Alliance sovereignty tint overlay */}
              <Layer
                id="island-sovereignty-tint"
                type="fill"
                minzoom={4.8}
                paint={{
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
                }}
              />

              {/* Contested Island Battleground Hazard Glow (Zoom >= 4.8) */}
              <Layer
                id="island-contested-glow"
                type="line"
                minzoom={4.8}
                filter={["==", ["get", "status"], "CONTESTED"]}
                paint={{
                  "line-color": "#f59e0b",
                  "line-width": [
                    "interpolate", ["linear"], ["zoom"],
                    4.8, 3.0,
                    7.0, 6.0,
                    10.0, 9.0
                  ],
                  "line-opacity": 0.85,
                  "line-blur": 2.5
                }}
              />
              <Layer
                id="island-contested-border"
                type="line"
                minzoom={4.8}
                filter={["==", ["get", "status"], "CONTESTED"]}
                paint={{
                  "line-color": "#ef4444",
                  "line-width": [
                    "interpolate", ["linear"], ["zoom"],
                    4.8, 1.2,
                    7.0, 2.2,
                    10.0, 3.2
                  ],
                  "line-opacity": 0.95,
                  "line-dasharray": [3, 1.5]
                }}
              />

              {/* Frontline Island Combat Perimeter (Zoom >= 4.8) */}
              <Layer
                id="island-frontline-glow"
                type="line"
                minzoom={4.8}
                filter={["all", ["==", ["get", "isFrontline"], true], ["!=", ["get", "status"], "CONTESTED"]]}
                paint={{
                  "line-color": "#f43f5e",
                  "line-width": [
                    "interpolate", ["linear"], ["zoom"],
                    4.8, 2.5,
                    7.0, 5.0,
                    10.0, 8.0
                  ],
                  "line-opacity": 0.65,
                  "line-blur": 2.0
                }}
              />
              <Layer
                id="island-frontline-border"
                type="line"
                minzoom={4.8}
                filter={["all", ["==", ["get", "isFrontline"], true], ["!=", ["get", "status"], "CONTESTED"]]}
                paint={{
                  "line-color": "#f43f5e",
                  "line-width": [
                    "interpolate", ["linear"], ["zoom"],
                    4.8, 0.8,
                    7.0, 1.6,
                    10.0, 2.4
                  ],
                  "line-opacity": 0.9,
                  "line-dasharray": [4, 2]
                }}
              />

              {/* Outer glow effect - wider blurred line for standard islands */}
              <Layer
                id="island-outline-glow"
                type="line"
                minzoom={4.8}
                filter={["all", ["!=", ["get", "status"], "CONTESTED"], ["!=", ["get", "isFrontline"], true]]}
                paint={{
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
                }}
              />

              {/* Crisp main outline */}
              <Layer
                id="island-outline"
                type="line"
                minzoom={4.8}
                paint={{
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
                }}
              />
            </Source>
          )}

          {/* Island Inner Contour Lines (Zoom >= 6.0) */}
          {islandContoursData && (
            <Source id="island-contours-source" type="geojson" data={islandContoursData}>
              <Layer
                id="island-contour-lines"
                type="line"
                minzoom={6.0}
                paint={{
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
                }}
              />
            </Source>
          )}

          {/* Rock Island Vector Polygons (Zoom >= 6.0) */}
          {rockPolygonsData && (
            <Source id="rock-polygons-source" type="geojson" data={rockPolygonsData}>
              <Layer
                id="rock-terrain-fill"
                type="fill"
                minzoom={6.0}
                paint={{
                  "fill-color": "#111827",
                  "fill-opacity": [
                    "interpolate", ["linear"], ["zoom"],
                    6.0, 0,
                    7.0, 0.7
                  ]
                }}
              />
              <Layer
                id="rock-outline"
                type="line"
                minzoom={6.0}
                paint={{
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
                }}
              />
            </Source>
          )}

          {/* Tactical Frontline & Contested Island Badges (Zoom 5.0 to 8.5) */}
          {showFrontlines && islandClassification?.frontlineIslandsGeoJSON?.features?.length > 0 && (
            <Source id="frontline-islands-source" type="geojson" data={islandClassification.frontlineIslandsGeoJSON}>
              <Layer
                id="frontline-islands-badge"
                type="symbol"
                minzoom={5.0}
                maxzoom={8.5}
                layout={{
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
                }}
                paint={{
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
                }}
              />
            </Source>
          )}

          {/* Empty Colonization Slots Layer */}
          {showEmptySlots && emptySlotsData && (
            <Source id="empty-slots-source" type="geojson" data={emptySlotsData}>
              <Layer
                id="empty-slots-sprites"
                type="symbol"
                minzoom={7.2}
                layout={{
                  "icon-image": "empty_slot",
                  "icon-size": [
                    "interpolate", ["exponential", 2], ["zoom"],
                    7.2, 0.08,
                    8.5, 0.16,
                    9.5, 0.32,
                    10.5, 0.64,
                    11.5, 1.28
                  ],
                  "icon-allow-overlap": true,
                  "icon-ignore-placement": true,
                  "icon-anchor": "center"
                }}
                paint={{
                  "icon-opacity": [
                    "interpolate", ["linear"], ["zoom"],
                    7.2, 0.6,
                    8.5, 0.9
                  ]
                }}
              />
            </Source>
          )}

          {/* Continuous Alliance Maritime Ocean Territory Basins (Zoom 2.0 to 6.2) */}
          {maritimeTerritoryData.oceanBasinsGeoJSON.features.length > 0 && (
            <Source id="maritime-ocean-source" type="geojson" data={maritimeTerritoryData.oceanBasinsGeoJSON}>
              <Layer
                id="maritime-ocean-glow"
                type="line"
                minzoom={2.0}
                maxzoom={6.2}
                paint={{
                  "line-color": ["get", "color"],
                  "line-width": 6,
                  "line-opacity": 0.35,
                  "line-blur": 4
                }}
              />
              <Layer
                id="maritime-ocean-fill"
                type="fill"
                minzoom={2.0}
                maxzoom={6.2}
                paint={{
                  "fill-color": ["get", "color"],
                  "fill-opacity": [
                    "interpolate", ["linear"], ["zoom"],
                    2.0, 0.26,
                    4.0, 0.20,
                    5.5, 0.12,
                    6.2, 0.04
                  ]
                }}
              />
              <Layer
                id="maritime-ocean-border"
                type="line"
                minzoom={2.0}
                maxzoom={6.2}
                paint={{
                  "line-color": ["get", "color"],
                  "line-width": 2,
                  "line-opacity": [
                    "interpolate", ["linear"], ["zoom"],
                    2.0, 0.85,
                    5.0, 0.70,
                    6.2, 0.20
                  ]
                }}
              />
            </Source>
          )}

          {/* Inter-Alliance Maritime Frontline Demarcation Barriers */}
          {showFrontlines && maritimeTerritoryData.frontlinesGeoJSON.features.length > 0 && (
            <Source id="maritime-frontlines-source" type="geojson" data={maritimeTerritoryData.frontlinesGeoJSON}>
              <Layer
                id="maritime-frontline-glow"
                type="line"
                minzoom={2.0}
                maxzoom={6.8}
                paint={{
                  "line-color": "#f43f5e",
                  "line-width": 4,
                  "line-opacity": 0.45,
                  "line-blur": 2.5
                }}
              />
              <Layer
                id="maritime-frontline-line"
                type="line"
                minzoom={2.0}
                maxzoom={6.8}
                paint={{
                  "line-color": "#fda4af",
                  "line-width": 2,
                  "line-opacity": 0.9,
                  "line-dasharray": [4, 2]
                }}
              />
            </Source>
          )}

          {/* Island Sovereignty & Cleanliness Halos (Clean vs Infiltrated vs Contested) */}
          {maritimeTerritoryData.islandHalosGeoJSON.features.length > 0 && (
            <Source id="island-halos-source" type="geojson" data={maritimeTerritoryData.islandHalosGeoJSON}>
              <Layer
                id="island-halos-glow"
                type="circle"
                minzoom={2.2}
                maxzoom={5.2}
                paint={{
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
                }}
              />
              <Layer
                id="island-halos-ring"
                type="circle"
                minzoom={2.2}
                maxzoom={5.2}
                paint={{
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
                }}
              />
            </Source>
          )}

          {/* High-Priority Enemy Beachheads (1-2 Enemy Towns breaching Clean Islands) */}
          {islandClassification?.enemyBeachheadsGeoJSON?.features?.length > 0 && (
            <Source id="enemy-beachheads-source" type="geojson" data={islandClassification.enemyBeachheadsGeoJSON}>
              <Layer
                id="enemy-beachheads-halo"
                type="circle"
                minzoom={3.0}
                paint={{
                  "circle-radius": [
                    "interpolate", ["linear"], ["zoom"],
                    3.0, 6,
                    5.5, 12,
                    8.0, 20
                  ],
                  "circle-color": "#ef4444",
                  "circle-opacity": 0.5,
                  "circle-blur": 1.5
                }}
              />
              <Layer
                id="enemy-beachheads-point"
                type="circle"
                minzoom={3.0}
                paint={{
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
                }}
              />
              <Layer
                id="enemy-beachheads-label"
                type="symbol"
                minzoom={5.0}
                layout={{
                  "text-field": "⚠️ BREACH",
                  "text-font": ["Noto Sans Regular"],
                  "text-size": 9,
                  "text-offset": [0, -1.8],
                  "text-anchor": "bottom",
                  "text-optional": true
                }}
                paint={{
                  "text-color": "#fca5a5",
                  "text-halo-color": "#450a0a",
                  "text-halo-width": 2
                }}
              />
            </Source>
          )}

          {/* Macro Alliance Maritime Basin Labels (Zoom 2.2 to 5.5) */}
          {maritimeTerritoryData.macroLabelsGeoJSON.features.length > 0 && (
            <Source id="maritime-labels-source" type="geojson" data={maritimeTerritoryData.macroLabelsGeoJSON}>
              <Layer
                id="maritime-labels"
                type="symbol"
                minzoom={2.2}
                maxzoom={5.5}
                layout={{
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
                }}
                paint={{
                  "text-color": "#ffffff",
                  "text-halo-color": "#0b101e",
                  "text-halo-width": 2.5
                }}
              />
            </Source>
          )}

          {/* Towns Layer */}
          {townsData && (
            <Source id="towns-source" type="geojson" data={townsData}>
              {/* Unclustered Points sized by Town Stage (Zoom 5.5 to 6.8) */}
              <Layer 
                id="town-points"
                type="circle"
                minzoom={5.5}
                maxzoom={6.8}
                paint={{
                  "circle-color": [
                    "case",
                    ["has", "highlightColor"], ["get", "highlightColor"],
                    ["get", "townColor"]
                  ],
                  "circle-radius": [
                    "interpolate", ["linear"], ["zoom"],
                    3.5, ["case", ["has", "highlightColor"], 4, ["+", 1.5, ["*", ["coalesce", ["get", "stage"], 1], 0.4]]],
                    5.5, ["case", ["has", "highlightColor"], 7, ["+", 2.5, ["*", ["coalesce", ["get", "stage"], 1], 0.8]]],
                    6.8, ["case", ["has", "highlightColor"], 12, ["+", 4, ["*", ["coalesce", ["get", "stage"], 1], 1.2]]]
                  ],
                  "circle-opacity": 0.9,
                  "circle-stroke-width": ["case", ["has", "highlightColor"], 2, 1],
                  "circle-stroke-color": ["case", ["has", "highlightColor"], "#ffffff", "#0b101e"]
                }}
              />

              {/* High-Resolution 3D Town Sprites (Zoom >= 6.5) */}
              <Layer
                id="town-sprites"
                type="symbol"
                minzoom={6.5}
                layout={{
                  "icon-image": [
                    "match", ["get", "stage"],
                    5, "town_5",
                    4, "town_4",
                    3, "town_3",
                    2, "town_2",
                    1, "town_1",
                    "town_1"
                  ],
                  "icon-size": [
                    "interpolate", ["exponential", 2], ["zoom"],
                    6.5, 0.085,
                    7.5, 0.17,
                    8.5, 0.34,
                    9.5, 0.68,
                    10.0, 0.96
                  ],
                  "icon-allow-overlap": true,
                  "icon-ignore-placement": true,
                  "icon-anchor": "bottom"
                }}
              />

              {/* Dynamic Alliance Flag Badge (Zoom >= 6.8) */}
              <Layer
                id="town-flags"
                type="circle"
                minzoom={6.8}
                paint={{
                  "circle-color": [
                    "case",
                    ["has", "highlightColor"], ["get", "highlightColor"],
                    ["get", "townColor"]
                  ],
                  "circle-radius": [
                    "interpolate", ["linear"], ["zoom"],
                    6.8, 3.5,
                    8.5, 5.5,
                    10.0, 8
                  ],
                  "circle-stroke-width": 1.5,
                  "circle-stroke-color": "#ffffff",
                  "circle-translate": [0, -14]
                }}
              />

              {/* Town Name Labels (Zoom >= 8.5) */}
              <Layer
                id="town-labels"
                type="symbol"
                minzoom={8.5}
                layout={{
                  "text-field": ["get", "name"],
                  "text-font": ["Noto Sans Regular"],
                  "text-size": 11,
                  "text-offset": [0, -3.2],
                  "text-anchor": "bottom",
                  "text-optional": true
                }}
                paint={{
                  "text-color": "#ffffff",
                  "text-halo-color": "#0b101e",
                  "text-halo-width": 2.5
                }}
              />
            </Source>
          )}

          {/* Animated Troop Movement & Trajectory Tracker Layer (Milestone 3) */}
          <AnimatedTroopLayer transits={activeTransits} />

          {/* Hover Tooltip */}
          {hoverInfo && (
            <Popup
              longitude={hoverInfo.lngLat.lng}
              latitude={hoverInfo.lngLat.lat}
              closeButton={false}
              closeOnClick={false}
              anchor="bottom"
              offset={14}
            >
              <div className="glass-panel" style={{ padding: '1rem', minWidth: '220px', borderRadius: '8px' }}>
                {(hoverInfo.feature.properties.renderType === 'town' || hoverInfo.feature.properties.townId) && (
                  <>
                    <div className="flex items-center justify-between gap-2" style={{ marginBottom: '0.35rem' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '1.05rem', color: '#f8fafc' }}>{hoverInfo.feature.properties.name || hoverInfo.feature.properties.townName}</div>
                      <span style={{ 
                        fontSize: '0.68rem', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        backgroundColor: 'rgba(59, 130, 246, 0.2)', 
                        color: '#60a5fa', 
                        fontWeight: 'bold',
                        border: '1px solid rgba(59, 130, 246, 0.4)'
                      }}>
                        {['', 'Stage 1 • Hamlet', 'Stage 2 • Village', 'Stage 3 • Town', 'Stage 4 • City', 'Stage 5 • Metropolis'][hoverInfo.feature.properties.stage || 1]}
                      </span>
                    </div>
                    {hoverInfo.feature.properties.player && (
                      <div className="text-secondary" style={{ fontSize: '0.85rem' }}>Player: <span style={{ color: 'white', fontWeight: '500' }}>{hoverInfo.feature.properties.player}</span></div>
                    )}
                    {hoverInfo.feature.properties.alliance && (
                      <div className="text-secondary" style={{ fontSize: '0.85rem' }}>Alliance: <span style={{ color: hoverInfo.feature.properties.townColor || 'white', fontWeight: '500' }}>{hoverInfo.feature.properties.alliance}</span></div>
                    )}
                    
                    <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.8rem' }}>
                      <span style={{ color: '#10b981', fontFamily: 'monospace', fontWeight: 'bold' }}>
                        {Number(hoverInfo.feature.properties.points || 0).toLocaleString()} pts
                      </span>
                      <span style={{ color: '#94a3b8' }}>
                        Slot #{hoverInfo.feature.properties.islandSlot ?? '0'} ({String(hoverInfo.feature.properties.dir || 'NW').toUpperCase()})
                      </span>
                    </div>

                    {/* Radar Context Information */}
                    {hoverInfo.feature.properties.indicatorType === 'ghost_skull' && (
                      <div className="mt-2 pt-2 border-t border-cyan-500/30 text-[11px] bg-cyan-950/30 p-1.5 rounded-lg border border-cyan-500/20">
                        <div className="flex justify-between text-cyan-300 font-bold">
                          <span>👻 Ghost Town</span>
                          <span className="font-mono">~{hoverInfo.feature.properties.estimatedVacancyDays}d vacant</span>
                        </div>
                      </div>
                    )}

                    {hoverInfo.feature.properties.isContested && (
                      <div className="mt-2 pt-2 border-t border-rose-500/30 text-[11px] bg-rose-950/30 p-1.5 rounded-lg border border-rose-500/20">
                        <div className="flex justify-between text-rose-300 font-bold">
                          <span>⚔️ Active Siege Hotspot</span>
                          <span className="font-mono">{hoverInfo.feature.properties.recentConquestCount} conquests</span>
                        </div>
                      </div>
                    )}

                    {hoverInfo.feature.properties.farmRating && (
                      <div className="mt-2 pt-2 border-t border-amber-500/30 text-[11px] bg-amber-950/30 p-1.5 rounded-lg border border-amber-500/20">
                        <div className="flex justify-between text-amber-300 font-bold">
                          <span>💤 Inactive Farm [{hoverInfo.feature.properties.farmRating}]</span>
                          <span className="font-mono">{hoverInfo.feature.properties.momentumDelta} pts</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {hoverInfo.feature.properties.isBeachhead && (
                  <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs">
                    <div className="text-rose-300 font-bold flex items-center gap-1">
                      ⚠️ ENEMY BEACHHEAD BREACH
                    </div>
                    <div className="text-slate-300 text-[11px] mt-1 font-medium">
                      Town: <span className="text-white font-bold">{hoverInfo.feature.properties.name}</span>
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      Player: <span className="text-slate-200">{hoverInfo.feature.properties.player}</span>
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      Enemy Alliance: <span className="text-rose-400 font-bold">{hoverInfo.feature.properties.enemyAlliance}</span>
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      Island Controlled By: <span className="text-emerald-400 font-bold">{hoverInfo.feature.properties.hostAlliance}</span>
                    </div>
                  </div>
                )}
                {(hoverInfo.feature.properties.renderType === 'island' || hoverInfo.feature.properties.renderType === 'rock' || hoverInfo.feature.properties.islandKey) && (
                  <>
                    <div style={{ fontWeight: 'bold', fontSize: '1.05rem', marginBottom: '0.25rem', color: '#f8fafc' }}>
                      {hoverInfo.feature.properties.renderType === 'island' ? 'Island' : 'Rock'} ({hoverInfo.feature.properties.x}, {hoverInfo.feature.properties.y})
                    </div>
                    {hoverInfo.feature.properties.status && (
                      <div className="mb-2 flex flex-col gap-1">
                        {hoverInfo.feature.properties.status === 'CLEAN' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 w-fit">
                            🟢 100% CLEAN SAFE HAVEN
                          </span>
                        )}
                        {hoverInfo.feature.properties.status === 'INFILTRATED' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 w-fit">
                            ⚠️ INFILTRATED ({hoverInfo.feature.properties.enemyCount} ENEMY BREACH)
                          </span>
                        )}
                        {hoverInfo.feature.properties.status === 'CONTESTED' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 w-fit">
                            ⚔️ CONTESTED BATTLEGROUND ({hoverInfo.feature.properties.dominantCount} vs {hoverInfo.feature.properties.enemyCount})
                          </span>
                        )}
                        {hoverInfo.feature.properties.isFrontline && hoverInfo.feature.properties.status !== 'CONTESTED' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 w-fit">
                            ⚔️ FRONTLINE ({hoverInfo.feature.properties.threatLevel} THREAT) vs {hoverInfo.feature.properties.frontlineRival || 'Hostile Forces'}
                          </span>
                        )}
                      </div>
                    )}
                    {hoverInfo.feature.properties.dominantAlliance && hoverInfo.feature.properties.dominantAlliance !== "None" && (
                      <div className="text-secondary" style={{ fontSize: '0.85rem' }}>
                        Dominant: <span style={{color: hoverInfo.feature.properties.islandColor || hoverInfo.feature.properties.haloColor || '#38bdf8', fontWeight: 'bold'}}>{hoverInfo.feature.properties.dominantAlliance}</span>
                      </div>
                    )}
                    {hoverInfo.feature.properties.renderType === 'island' && (
                      <div className="text-secondary" style={{ fontSize: '0.85rem' }}>Buff: <span style={{ color: 'white' }}>+{hoverInfo.feature.properties.resourcePlus} / -{hoverInfo.feature.properties.resourceMinus}</span></div>
                    )}
                    {hoverInfo.feature.properties.colonizedCount !== undefined && (
                      <div className="text-secondary" style={{ fontSize: '0.85rem' }}>Towns: <span style={{ color: 'white' }}>{hoverInfo.feature.properties.colonizedCount} / {hoverInfo.feature.properties.availableTowns}</span></div>
                    )}
                    {hoverInfo.feature.properties.dominantCount !== undefined && (
                      <div className="text-secondary" style={{ fontSize: '0.85rem' }}>Control: <span style={{ color: 'white' }}>{hoverInfo.feature.properties.dominantCount} / {hoverInfo.feature.properties.totalSlots || 20} slots</span></div>
                    )}
                  </>
                )}
                {hoverInfo.feature.properties.renderType === 'empty-slot' && (
                  <>
                    <div style={{ fontWeight: 'bold', color: '#10b981', fontSize: '1.05rem' }}>Empty Slot</div>
                    <div className="text-secondary" style={{ fontSize: '0.8rem' }}>
                      Island ({hoverInfo.feature.properties.islandX}, {hoverInfo.feature.properties.islandY}) • Slot #{hoverInfo.feature.properties.slot}
                    </div>
                    <div style={{ color: '#38bdf8', fontSize: '0.75rem', marginTop: '0.25rem' }}>Ready for colonization</div>
                  </>
                )}
              </div>
            </Popup>
          )}
        </MapGL>
      </div>

      {/* Floating Route Planner Tool (Milestone 3) */}
      {isRouteToolActive && (
        <RoutePlannerTool
          origin={routeOrigin}
          target={routeTarget}
          onSwap={() => {
            const temp = routeOrigin;
            setRouteOrigin(routeTarget);
            setRouteTarget(temp);
          }}
          onClear={() => {
            setRouteOrigin(null);
            setRouteTarget(null);
          }}
          onClose={() => setIsRouteToolActive(false)}
          worldSpeed={activeWorld?.speed || 3}
          unitSpeed={activeWorld?.unitSpeed || 1}
        />
      )}

      {/* Floating Political Heatmap Legend (Milestone 1) */}
      {viewMode === 'political' && (
        <div className="absolute top-20 right-4 z-30 pointer-events-auto">
          <PoliticalHeatmapLegend
            territories={allianceTerritoryStats}
            customColors={customColors}
            onColorChange={(allyName, color) => setCustomColors(prev => ({ ...prev, [allyName]: color }))}
            opacity={politicalOpacity}
            onOpacityChange={setPoliticalOpacity}
            showContestedFrontlines={showContestedFrontlines}
            onToggleContestedFrontlines={() => setShowContestedFrontlines(prev => !prev)}
            highlightedAlliance={highlightedAllianceVoronoi}
            onHighlightAlliance={(allyName) => {
              setHighlightedAllianceVoronoi(allyName);
              if (allyName) {
                const color = customColors[allyName] || topAlliances.find(a => a.name === allyName)?.color || '#8b5cf6';
                setHighlightedAlliances({ [allyName]: color });
              } else {
                setHighlightedAlliances({});
              }
            }}
            onAllianceClick={(ally) => setSelectedEntity({ type: 'alliance', data: ally })}
            contestedFrontlineCount={frontlinesData?.features?.filter(f => f.properties?.isContestedIsland || f.properties?.tension > 0)?.length || 0}
          />
        </div>
      )}

      {/* Floating Interactive Minimap Radar Widget (Milestone 5) */}
      <div className="absolute bottom-4 left-4 z-30 pointer-events-auto">
        <MinimapRadar
          towns={rawTowns}
          alliances={topAlliances}
          viewState={currentViewState}
          onNavigate={({ lng, lat }) => {
            if (mapRef.current) {
              mapRef.current.flyTo({
                center: [lng, lat],
                zoom: 7.5,
                duration: 800,
                essential: true
              });
            }
          }}
        />
      </div>

      {/* Sliding Intelligence Command Drawer */}
      {selectedEntity && (
        <CommandDrawer
          entity={selectedEntity}
          onClose={() => setSelectedEntity(null)}
          onExpandToModal={(ent) => setExpandedModalEntity(ent)}
          worldId={activeWorldId}
          onSelectEntity={(ent) => setSelectedEntity(ent)}
          onSetRouteOrigin={(town) => {
            setRouteOrigin(town);
            setIsRouteToolActive(true);
          }}
          onSetRouteTarget={(town) => {
            setRouteTarget(town);
            setIsRouteToolActive(true);
          }}
          onOpenPinModal={(town) => setSelectedPinTown(town)}
          customColors={customColors}
        />
      )}

      {/* Tactical Operation Pin Modal (Milestone 4) */}
      {selectedPinTown && (
        <TacticalPinModal
          isOpen={Boolean(selectedPinTown)}
          onClose={() => setSelectedPinTown(null)}
          town={selectedPinTown}
          existingPin={tacticalPins.find(p => p.townId === selectedPinTown.id)}
          worldId={activeWorldId}
          onPinSaved={(newPin, allPins) => setTacticalPins(allPins)}
          onPinDeleted={(delId) => setTacticalPins(prev => prev.filter(p => p.id !== delId))}
          onExportToPlanner={(planTarget) => {
            setRouteTarget(planTarget);
            setIsRouteToolActive(true);
          }}
        />
      )}

      {/* Alliance Coalition & Family Modal */}
      {isCoalitionModalOpen && (
        <AllianceCoalitionModal
          isOpen={isCoalitionModalOpen}
          onClose={() => setIsCoalitionModalOpen(false)}
          coalitions={coalitions}
          onSaveCoalitions={handleSaveCoalitions}
          alliances={allWorldAlliances.length > 0 ? allWorldAlliances : topAlliances}
          worldId={activeWorldId}
        />
      )}

      {/* Full Modal Expand Fallback */}
      {expandedModalEntity && expandedModalEntity.type === 'island' && (
        <IslandModal 
          islandData={expandedModalEntity.data} 
          onClose={() => setExpandedModalEntity(null)} 
          customColors={customColors}
          worldId={activeWorldId}
          onTownClick={(town) => setSelectedEntity({ type: 'town', data: normalizeTownData(town) })}
          onPlayerClick={(player) => setSelectedEntity({ type: 'player', data: player })}
          onAllianceClick={(alliance) => setSelectedEntity({ type: 'alliance', data: alliance })}
        />
      )}

      {expandedModalEntity && expandedModalEntity.type !== 'island' && (
        <DeepDiveModal 
          entity={expandedModalEntity} 
          onClose={() => setExpandedModalEntity(null)} 
          worldId={activeWorldId}
        />
      )}

      {/* LEFT SIDEBAR (Top Alliances & Overview - Collapsible) */}
      <div 
        className={`glass-panel flex flex-col gap-3 transition-all duration-300 ${
          isSidebarCollapsed ? 'w-12 p-2' : 'w-72 p-4'
        }`}
        style={{ 
          position: 'absolute', 
          top: '1rem', 
          left: '1rem', 
          zIndex: 40, 
          maxHeight: 'calc(100% - 2rem)', 
          overflowY: 'auto', 
          scrollbarWidth: 'none',
          backgroundColor: 'rgba(11, 16, 30, 0.92)'
        }}
      >
        <div className="flex items-center justify-between">
          {!isSidebarCollapsed && (
            <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }} className="gradient-text">
              World Overview
            </h1>
          )}
          <button
            onClick={() => setIsSidebarCollapsed(prev => !prev)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-auto"
            title={isSidebarCollapsed ? "Expand Overview" : "Collapse Overview"}
          >
            <Layers size={16} />
          </button>
        </div>

        {!isSidebarCollapsed && (
          <>
            {/* Alliance Families & Coalitions Panel */}
            {coalitions.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-1 pb-2.5 border-b border-slate-800/80">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield size={13} /> Coalitions ({coalitions.length})
                  </h2>
                  <button
                    onClick={() => setIsCoalitionModalOpen(true)}
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors cursor-pointer"
                    title="Manage alliance families and sister branches"
                  >
                    Manage
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  {coalitions.map((c) => {
                    const memberNames = Array.isArray(c.alliances) 
                      ? c.alliances.map(m => (typeof m === 'string' ? m : m?.name)).filter(Boolean)
                      : [];
                    const isAllHighlighted = memberNames.length > 0 && memberNames.every(m => highlightedAlliances[m]);

                    return (
                      <div key={c.id || c.name} className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg hover:bg-slate-800/60 transition-colors">
                        <div className="flex gap-2 items-center flex-1 min-w-0">
                          <button
                            onClick={() => {
                              setHighlightedAlliances(prev => {
                                const copy = { ...prev };
                                if (isAllHighlighted) {
                                  memberNames.forEach(m => delete copy[m]);
                                } else {
                                  memberNames.forEach(m => { copy[m] = c.color; });
                                }
                                return copy;
                              });
                            }}
                            className="cursor-pointer shrink-0"
                            title={isAllHighlighted ? "Clear coalition highlight" : "Highlight coalition member towns on map"}
                          >
                            <div 
                              style={{ 
                                width: '11px', 
                                height: '11px', 
                                borderRadius: '50%', 
                                backgroundColor: c.color,
                                boxShadow: isAllHighlighted ? `0 0 8px ${c.color}` : 'none'
                              }}
                              className={`transition-all ${isAllHighlighted ? 'ring-2 ring-white scale-110' : ''}`}
                            />
                          </button>
                          <div 
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => setIsCoalitionModalOpen(true)}
                          >
                            <div className="font-bold text-white truncate text-xs hover:text-emerald-300 transition-colors">
                              {c.name}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {memberNames.length} {memberNames.length === 1 ? 'ally' : 'allies'}: {memberNames.join(', ')}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top 10 Alliances Legend & Coalition Families */}
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-primary uppercase tracking-wider">Top 10 Alliances</h2>
                {coalitions.length === 0 && (
                  <button
                    onClick={() => setIsCoalitionModalOpen(true)}
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors cursor-pointer"
                    title="Group main and sister/academy alliances into families"
                  >
                    + Coalition
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {topAlliances.length > 0 ? topAlliances.slice(0, 10).map((a) => {
                  const activeColor = getEffectiveAllianceColor(a.name, a.id, a.color);
                  const normName = a.name.trim().toLowerCase();
                  const coalition = coalitionLookup.get(normName) || (a.id != null ? coalitionLookup.get(String(a.id)) : null);

                  return (
                    <div key={a.name} className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg hover:bg-slate-800/60 transition-colors">
                      <div className="flex gap-2 items-center flex-1 min-w-0">
                        <button 
                          onClick={() => setHighlightedAlliances(prev => {
                            const copy = { ...prev };
                            if (copy[a.name]) delete copy[a.name];
                            else copy[a.name] = activeColor;
                            return copy;
                          })}
                          className="cursor-pointer shrink-0"
                          aria-label={`Toggle highlight for ${a.name}`}
                        >
                          <div 
                            style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: activeColor }}
                            title="Toggle Map Highlight"
                          />
                        </button>
                        <div 
                          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} 
                          onClick={() => setSelectedEntity({ type: 'alliance', data: a })}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="font-bold text-white truncate text-xs hover:underline">{a.name}</div>
                            {coalition && (
                              <span 
                                className="px-1 py-0.2 rounded text-[9px] font-bold shrink-0 truncate max-w-[75px]"
                                style={{ 
                                  backgroundColor: `${coalition.color || activeColor}25`, 
                                  borderColor: `${coalition.color || activeColor}60`, 
                                  color: coalition.color || activeColor,
                                  borderWidth: '1px'
                                }}
                                title={`Member of ${coalition.name} Coalition`}
                              >
                                {coalition.name}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{a.points.toLocaleString()} pts</div>
                        </div>
                      </div>
                      <input 
                        type="color" 
                        value={activeColor.startsWith('#') ? activeColor : '#8b5cf6'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomColors(prev => ({...prev, [a.name]: val}));
                        }}
                        style={{ width: '18px', height: '18px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                        title="Customize color"
                      />
                    </div>
                  );
                }) : (
                  <div className="text-xs text-secondary">Loading alliances...</div>
                )}
              </div>
            </div>

            {/* World Stats */}
            {worldStats && (
              <div className="mt-2 pt-3 border-t border-slate-800 text-xs text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Players:</span>
                  <span className="text-white font-mono">{worldStats.players}</span>
                </div>
                <div className="flex justify-between">
                  <span>Active Towns:</span>
                  <span className="text-white font-mono">{worldStats.towns}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pop. Islands:</span>
                  <span className="text-white font-mono">{worldStats.populatedIslands} / {worldStats.islands}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* BOTTOM RIGHT: Coordinates & Sync Indicator */}
      <div className="absolute bottom-4 right-4 z-40 flex items-center gap-2">
        <div className="glass-panel px-3 py-1.5 rounded-xl border border-slate-700/80 bg-slate-900/90 text-xs font-mono text-slate-300 shadow-xl">
            <span id="cursor-grid-display" className="text-primary font-bold"></span>
            <span id="cursor-ocean-display" className="text-slate-500 ml-2"></span>
          </div>
        {lastSync && (
          <div className="glass-panel px-2.5 py-1.5 rounded-xl border border-slate-700/80 bg-slate-900/90 text-[10px] text-slate-400 shadow-xl hidden sm:block">
            Synced {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}
