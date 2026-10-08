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

import { getTacticalPins } from "@/lib/map/tacticalPins";
import { registerMapAssets } from "@/lib/map/assetLoader";
import { useApp } from "@/context/AppContext";
import { worldToLng, worldToLat } from "@/lib/map/coordProjection";
import { 
  TacticalScenePipeline, 
  projectCursorSector, 
  getTownMapCoordinates 
} from "@/lib/map/TacticalScenePipeline";
import { 
  getTacticalLayers, 
  INTERACTIVE_LAYER_IDS 
} from "@/lib/map/TacticalLayerRegistry";

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
  const pipelineRef = useRef(new TacticalScenePipeline());

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
      const result = await res.json();
      if (result.success && Array.isArray(result.coalitions)) {
        setCoalitions(result.coalitions);
      }
    } catch (e) {
      console.error("Failed to save coalitions:", e);
      throw e;
    }
  };

  // Compile immutable SceneBundle via deep TacticalScenePipeline
  const scene = useMemo(() => {
    return pipelineRef.current.compileScene({
      geojsonData: data,
      topAlliances,
      topPlayers,
      coalitions,
      customColors,
      highlightedPlayers,
      highlightedAlliances,
      showGhostsOnly,
      showEmptySlots,
      radarFilters,
      tacticalPins,
      routeOrigin,
      routeTarget
    });
  }, [
    data,
    topAlliances,
    topPlayers,
    coalitions,
    customColors,
    highlightedPlayers,
    highlightedAlliances,
    showGhostsOnly,
    showEmptySlots,
    radarFilters,
    tacticalPins,
    routeOrigin,
    routeTarget
  ]);

  // Pure parametric MapLibre layer specification array
  const layers = useMemo(() => {
    return getTacticalLayers({
      viewMode,
      politicalOpacity,
      showContestedFrontlines,
      showFrontlines,
      showEmptySlots,
      radarFilters
    });
  }, [
    viewMode,
    politicalOpacity,
    showContestedFrontlines,
    showFrontlines,
    showEmptySlots,
    radarFilters
  ]);

  // Search Selection Handler
  const handleSelectSearchResult = (type, item) => {
    if (!mapRef.current) return;
    
    let targetLng = 0, targetLat = 0;
    const rawTowns = scene.tacticalStats.rawTowns;

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
          frontlineCount={scene.tacticalStats.frontlineCount}
          radarFilters={radarFilters}
          onRadarChange={setRadarFilters}
          radarCounts={scene.tacticalStats.radarCounts}
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
          interactiveLayerIds={INTERACTIVE_LAYER_IDS}
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
              const { gridX, gridY, oceanCode } = projectCursorSector(lng, lat);
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
                if (oceanEl) oceanEl.textContent = oceanCode;
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
                const matchedTown = scene.tacticalStats.rawTowns.find(t => (t.id === p.townId || t.properties?.id === p.townId));
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
          {/* Consolidated GeoJSON Sources */}
          {Object.entries(scene.sources).map(([sourceId, sourceData]) => (
            <Source key={sourceId} id={sourceId} type="geojson" data={sourceData} />
          ))}

          {/* Declarative WebGL Tactical Layers */}
          {layers.map(layer => (
            <Layer key={layer.id} {...layer} />
          ))}

          {/* Animated Troop Movement & Trajectory Tracker Layer (Milestone 3) */}
          <AnimatedTroopLayer transits={scene.activeTransits} />

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
            territories={scene.tacticalStats.allianceTerritoryStats}
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
            contestedFrontlineCount={scene.tacticalStats.contestedFrontlineCount}
          />
        </div>
      )}

      {/* Floating Interactive Minimap Radar Widget (Milestone 5) */}
      <div className="absolute bottom-4 left-4 z-30 pointer-events-auto">
        <MinimapRadar
          towns={scene.tacticalStats.rawTowns}
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
                  const activeColor = scene.tacticalStats.getEffectiveAllianceColor(a.name, a.id, a.color);
                  const normName = a.name.trim().toLowerCase();
                  const coalitionLookup = scene.tacticalStats.coalitionLookup;
                  const coalition = coalitionLookup?.get(normName) || (a.id != null ? coalitionLookup?.get(String(a.id)) : null);

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
