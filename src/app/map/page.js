"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Map, { Source, Layer, Popup } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { 
  Menu, X, Search, Map as MapIcon, Globe, MapPin, 
  Trophy, Users, Loader2, Navigation, Target, Activity, Swords 
} from 'lucide-react';
import IslandModal from "@/components/IslandModal";
import DeepDiveModal from "@/components/DeepDiveModal";
import { useApp } from "@/context/AppContext";

// Direct binary fetch, no geographic calculations needed on client!

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
          [(coord / 1000) * 360 - 180, -((0 / 1000) * 180 - 90)], 
          [(coord / 1000) * 360 - 180, -((1000 / 1000) * 180 - 90)]
        ]
      }
    });
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [(0 / 1000) * 360 - 180, -((coord / 1000) * 180 - 90)],
          [(1000 / 1000) * 360 - 180, -((coord / 1000) * 180 - 90)]
        ]
      }
    });
  }

  // Place Ocean labels uniformly across the ocean grid
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
                ((ox * 100 + dx) / 1000) * 360 - 180,
                -(((oy * 100 + dy) / 1000) * 180 - 90)
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

export default function WorldMap() {
  const { activeWorldId, activeWorld } = useApp();
  const [data, setData] = useState(null);
  const [topAlliances, setTopAlliances] = useState([]);
  const [topPlayers, setTopPlayers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [mapProcessing, setMapProcessing] = useState(true);
  const [hoverInfo, setHoverInfo] = useState(null);
  const [worldStats, setWorldStats] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [cursorGrid, setCursorGrid] = useState(null);
  const [jumpX, setJumpX] = useState("");
  const [jumpY, setJumpY] = useState("");
  const [customColors, setCustomColors] = useState({});
  const [selectedIsland, setSelectedIsland] = useState(null);
  const [highlightedPlayers, setHighlightedPlayers] = useState({});
  const [highlightedAlliances, setHighlightedAlliances] = useState({});
  const [manualHighlightInput, setManualHighlightInput] = useState("");
  const [selectedEntity, setSelectedEntity] = useState(null);
  const mapRef = useRef();
  const rafRef = useRef(null);
  const oceanGrid = useMemo(() => generateOceanGrid(), []);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    async function loadData() {
      if (!activeWorldId) return;
      setLoading(true);
      try {
        const [metaRes, geoRes] = await Promise.all([
          fetch(`/api/world/meta?world=${activeWorldId}&_t=${Date.now()}`),
          fetch(`/api/world/geojson?world=${activeWorldId}&_t=${Date.now()}`)
        ]);
        
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
        setLoading(false);
      }
    }

    loadData();
  }, [activeWorldId]);

  const islandsData = useMemo(() => {
    if (!data || !data.features) return null;
    let features = data.features.filter(f => f.properties.renderType === 'island');
    
    // Apply custom colors if present
    if (Object.keys(customColors).length > 0) {
      features = features.map(f => {
        const ally = f.properties.dominantAlliance;
        if (ally && ally !== "None" && customColors[ally]) {
          return {
            ...f,
            properties: { ...f.properties, islandColor: customColors[ally] }
          };
        }
        return f;
      });
    }

    // Sort so empty dark islands render FIRST, colored inhabited islands render ON TOP
    features.sort((a, b) => {
      const aEmpty = a.properties.islandColor === "#1e293b";
      const bEmpty = b.properties.islandColor === "#1e293b";
      if (aEmpty && !bEmpty) return -1;
      if (!aEmpty && bEmpty) return 1;
      return 0;
    });
    return { type: 'FeatureCollection', features };
  }, [data, customColors]);

  const rocksData = useMemo(() => {
    if (!data || !data.features) return null;
    return { 
      type: 'FeatureCollection', 
      features: data.features.filter(f => f.properties.renderType === 'rock') 
    };
  }, [data]);

  const emptySlotsData = useMemo(() => {
    if (!data || !data.features) return null;
    return { 
      type: 'FeatureCollection', 
      features: data.features.filter(f => f.properties.renderType === 'empty-slot') 
    };
  }, [data]);

  const townsData = useMemo(() => {
    if (!data || !data.features) return null;
    let towns = data.features.filter(f => f.properties.renderType === 'town');
    
    // Apply highlights
    if (Object.keys(highlightedPlayers).length > 0 || Object.keys(highlightedAlliances).length > 0) {
      towns = towns.map(t => {
        const pName = t.properties.player;
        const aName = t.properties.alliance;
        let hColor = null;
        if (highlightedPlayers[pName]) hColor = highlightedPlayers[pName];
        else if (highlightedAlliances[aName]) hColor = highlightedAlliances[aName];
        else if (customColors[aName]) {
          // If the alliance color was overridden manually, use the override!
          return { ...t, properties: { ...t.properties, townColor: customColors[aName] } };
        }

        if (hColor) {
          return { ...t, properties: { ...t.properties, highlightColor: hColor } };
        }
        return t;
      });
    }

    if (debouncedSearch.trim()) {
      const lowerQuery = debouncedSearch.toLowerCase();
      towns = towns.filter(f => 
        (f.properties.player && f.properties.player.toLowerCase().includes(lowerQuery)) ||
        (f.properties.alliance && f.properties.alliance.toLowerCase().includes(lowerQuery)) ||
        (f.properties.name && f.properties.name.toLowerCase().includes(lowerQuery))
      );
    }
    
    // Sort so highlighted towns render on top
    towns.sort((a, b) => {
      if (a.properties.highlightColor && !b.properties.highlightColor) return 1;
      if (!a.properties.highlightColor && b.properties.highlightColor) return -1;
      return 0;
    });

    return { type: 'FeatureCollection', features: towns };
  }, [data, debouncedSearch, highlightedPlayers, highlightedAlliances]);

  const searchStats = useMemo(() => {
    if (!townsData || !debouncedSearch.trim()) return null;
    const towns = townsData.features;
    let totalPoints = 0;
    towns.forEach(t => totalPoints += t.properties.points);
    return {
      count: towns.length,
      points: totalPoints
    };
  }, [townsData, debouncedSearch]);

  // World Stats comes directly from Meta now


  const handleJump = (e) => {
    e.preventDefault();
    if (!jumpX || !jumpY) return;
    const x = parseInt(jumpX);
    const y = parseInt(jumpY);
    if (isNaN(x) || isNaN(y)) return;
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [((x / 1000) * 360 - 180), -((y / 1000) * 180 - 90)],
        zoom: 6,
        duration: 1000
      });
    }
  };

  const handleFitBounds = () => {
    if (!townsData || townsData.features.length === 0 || !mapRef.current) return;
    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    townsData.features.forEach(f => {
      const [lng, lat] = f.geometry.coordinates;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });
    minLng -= 0.5; maxLng += 0.5;
    minLat -= 0.5; maxLat += 0.5;
    mapRef.current.fitBounds(
      [[minLng, minLat], [maxLng, maxLat]], 
      { padding: 50, duration: 1000 }
    );
  };

  return (
    <div style={{ position: 'fixed', top: '64px', left: 0, right: 0, bottom: 0, backgroundColor: '#0b101e', zIndex: 10 }}>

      <div style={{ width: '100%', height: '100%', position: 'relative', zIndex: 0 }}>
        {loading && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11, 16, 30, 0.9)', backdropFilter: 'blur(4px)' }}>
            <div className="flex flex-col items-center gap-4">
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'white', letterSpacing: '2px', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
                {loading ? "Downloading World Data..." : "Rendering Battle Map..."}
              </div>
            </div>
          </div>
        )}

        <Map
          ref={mapRef}
          mapLibre={maplibregl}
          style={{ width: "100%", height: "100%", position: "absolute", left: 0, top: 0 }}
          initialViewState={{
            longitude: 0,
            latitude: 0,
            zoom: 2
          }}
          maxBounds={[
            [((250 / 1000) * 360 - 180), -((750 / 1000) * 180 - 90)], // South West
            [((750 / 1000) * 360 - 180), -((250 / 1000) * 180 - 90)]  // North East
          ]}
          mapStyle={MAP_STYLE}
          onLoad={(e) => {
            const map = e.target;
            const loadImg = (id, url) => {
              if (!map.hasImage(id)) {
                map.loadImage(url, (err, img) => {
                  if (!err && img && !map.hasImage(id)) {
                    map.addImage(id, img);
                  }
                });
              }
            };
            // Town Stages & Empty Slots
            loadImg('town_5', '/map/towns/town_5.png');
            loadImg('town_4', '/map/towns/town_4.png');
            loadImg('town_3', '/map/towns/town_3.png');
            loadImg('town_2', '/map/towns/town_2.png');
            loadImg('town_1', '/map/towns/town_1.png');
            loadImg('empty_slot', '/map/slots/empty_slot.png');

            // All 40 Island Types (1-16, 37-60)
            const islandTypes = [
              1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
              11, 12, 13, 14, 15, 16,
              37, 38, 39, 40, 41, 42, 43, 44, 45, 46,
              47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60
            ];
            islandTypes.forEach(t => {
              loadImg(`island_${t}`, `/map/islands/island_${t}.png`);
            });
          }}
          interactiveLayerIds={["town-points", "town-sprites", "islands-points", "island-sprites", "rocks-points", "empty-slots-points", "empty-slots-sprites"]}
          onMouseEnter={(e) => {
            mapRef.current.getCanvas().style.cursor = "pointer";
          }}
          onMouseLeave={() => {
            mapRef.current.getCanvas().style.cursor = "";
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
              const gridX = Math.round((lng + 180) / 360 * 1000);
              const gridY = Math.round((90 - lat) / 0.18);
              setCursorGrid({ x: gridX, y: gridY });

              if (features && features.length > 0) {
                setHoverInfo({
                  feature: features[0],
                  x: pointX,
                  y: pointY,
                  lngLat: lngLat
                });
              } else {
                setHoverInfo(null);
              }
            });
          }}
          onClick={(e) => {
            if (e.features && e.features.length > 0) {
              const feature = e.features[0];
              if (feature.properties.renderType === 'island' || feature.properties.renderType === 'rock') {
                setSelectedIsland({
                  id: feature.properties.id,
                  x: feature.properties.x,
                  y: feature.properties.y,
                  availableTowns: feature.properties.availableTowns,
                  colonizedCount: feature.properties.colonizedCount,
                  resourcePlus: feature.properties.resourcePlus,
                  resourceMinus: feature.properties.resourceMinus
                });
              } else if (feature.properties.renderType === 'town') {
                setSelectedEntity({
                  type: 'town',
                  data: {
                    id: feature.properties.id,
                    name: feature.properties.name,
                    player: feature.properties.player,
                    alliance: feature.properties.alliance,
                    points: feature.properties.points,
                    islandX: feature.properties.islandX || feature.properties.x,
                    islandY: feature.properties.islandY || feature.properties.y,
                    islandSlot: feature.properties.islandSlot
                  }
                });
              }
            }
          }}
          onIdle={() => {
            if (!loading) {
              setMapProcessing(false);
            }
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
                "text-size": 24,
                "text-anchor": "center"
              }}
              paint={{
                "text-color": "#334155"
              }}
            />
          </Source>

          {/* Islands Layer */}
          {islandsData && (
            <Source id="islands-source" type="geojson" data={islandsData}>
              {/* Macro Zoom Island Dots (Zoom 2 to 6.8) */}
              <Layer 
                id="islands-points"
                type="circle"
                minzoom={2}
                maxzoom={6.8}
                paint={{
                  "circle-radius": [
                    "interpolate", ["linear"], ["zoom"],
                    2, 3,
                    5, 8,
                    6.8, 14
                  ],
                  "circle-color": ["get", "islandColor"],
                  "circle-opacity": 0.45,
                  "circle-stroke-width": 1.5,
                  "circle-stroke-color": "#0f172a"
                }}
              />

              {/* Tactical Zoom Island Terrain Sprites (Zoom >= 6.2) */}
              <Layer 
                id="island-sprites"
                type="symbol"
                minzoom={6.2}
                layout={{
                  "icon-image": [
                    "match", ["get", "islandType"],
                    1, "island_1",
                    2, "island_2",
                    3, "island_3",
                    4, "island_4",
                    5, "island_5",
                    6, "island_6",
                    7, "island_7",
                    8, "island_8",
                    9, "island_9",
                    10, "island_10",
                    11, "island_11",
                    12, "island_12",
                    13, "island_13",
                    14, "island_14",
                    15, "island_15",
                    16, "island_16",
                    37, "island_37",
                    38, "island_38",
                    39, "island_39",
                    40, "island_40",
                    41, "island_41",
                    42, "island_42",
                    43, "island_43",
                    44, "island_44",
                    45, "island_45",
                    46, "island_46",
                    47, "island_47",
                    48, "island_48",
                    49, "island_49",
                    50, "island_50",
                    51, "island_51",
                    52, "island_52",
                    53, "island_53",
                    54, "island_54",
                    55, "island_55",
                    56, "island_56",
                    57, "island_57",
                    58, "island_58",
                    59, "island_59",
                    60, "island_60",
                    "island_1"
                  ],
                  "icon-size": [
                    "interpolate", ["linear"], ["zoom"],
                    6.2, 0.12,
                    7.5, 0.32,
                    9, 0.75,
                    11, 1.6,
                    13, 3.4
                  ],
                  "icon-allow-overlap": true,
                  "icon-ignore-placement": true,
                  "icon-anchor": "center"
                }}
              />
            </Source>
          )}

          {/* Rocks Layer */}
          {rocksData && (
            <Source id="rocks-source" type="geojson" data={rocksData}>
              <Layer 
                id="rocks-points"
                type="circle"
                minzoom={2}
                maxzoom={7.5}
                paint={{
                  "circle-radius": [
                    "interpolate", ["linear"], ["zoom"],
                    2, 1.5,
                    6, 6,
                    7.5, 10
                  ],
                  "circle-color": ["get", "islandColor"],
                  "circle-opacity": 0.4,
                  "circle-stroke-width": 1,
                  "circle-stroke-color": "#0f172a"
                }}
              />
            </Source>
          )}

          {/* Empty Slots Layer */}
          {emptySlotsData && (
            <Source id="empty-slots-source" type="geojson" data={emptySlotsData}>
              <Layer 
                id="empty-slots-points"
                type="circle"
                minzoom={5.5}
                maxzoom={8}
                paint={{
                  "circle-radius": 2.5,
                  "circle-color": "#ffffff",
                  "circle-opacity": 0.4,
                  "circle-stroke-width": 1,
                  "circle-stroke-color": "#94a3b8",
                  "circle-stroke-opacity": 0.6
                }}
              />
              <Layer
                id="empty-slots-sprites"
                type="symbol"
                minzoom={7.5}
                layout={{
                  "icon-image": "empty_slot",
                  "icon-size": [
                    "interpolate", ["linear"], ["zoom"],
                    7.5, 0.05,
                    9, 0.11,
                    11, 0.22,
                    14, 0.45
                  ],
                  "icon-allow-overlap": true,
                  "icon-ignore-placement": true,
                  "icon-anchor": "center"
                }}
              />
            </Source>
          )}

          {/* Towns Layer (Always visible, clustered at low zoom, stages & 3D sprites at high zoom) */}
          {townsData && (
            <Source id="towns-source" type="geojson" data={townsData} cluster={true} clusterMaxZoom={5} clusterRadius={45}>
              {/* Clustered Bubbles at Macro Zoom */}
              <Layer 
                id="clusters"
                type="circle"
                minzoom={2}
                maxzoom={6}
                filter={["has", "point_count"]}
                paint={{
                  "circle-color": [
                    "step",
                    ["get", "point_count"],
                    "#3b82f6",
                    30, "#8b5cf6",
                    100, "#ec4899"
                  ],
                  "circle-radius": [
                    "step",
                    ["get", "point_count"],
                    14,
                    30, 18,
                    100, 24
                  ],
                  "circle-opacity": 0.85
                }}
              />
              <Layer 
                id="cluster-count"
                type="symbol"
                minzoom={2}
                maxzoom={6}
                filter={["has", "point_count"]}
                layout={{
                  "text-field": "{point_count_abbreviated}",
                  "text-font": ["Noto Sans Regular"],
                  "text-size": 11
                }}
                paint={{
                  "text-color": "#ffffff"
                }}
              />

              {/* Unclustered Points sized by Town Stage (Zoom 4 to 8) */}
              <Layer 
                id="town-points"
                type="circle"
                minzoom={4}
                maxzoom={8}
                filter={["!", ["has", "point_count"]]}
                paint={{
                  "circle-color": [
                    "case",
                    ["has", "highlightColor"], ["get", "highlightColor"],
                    searchQuery ? "#ef4444" : ["get", "townColor"]
                  ],
                  "circle-radius": [
                    "interpolate", ["linear"], ["zoom"],
                    4, ["case", ["has", "highlightColor"], 4, ["+", 1.5, ["*", ["coalesce", ["get", "stage"], 1], 0.4]]],
                    6, ["case", ["has", "highlightColor"], 7, ["+", 2.5, ["*", ["coalesce", ["get", "stage"], 1], 0.8]]],
                    8, ["case", ["has", "highlightColor"], 14, ["+", 4, ["*", ["coalesce", ["get", "stage"], 1], 1.5]]]
                  ],
                  "circle-opacity": 0.9,
                  "circle-stroke-width": ["case", ["has", "highlightColor"], 2, 1],
                  "circle-stroke-color": ["case", ["has", "highlightColor"], "#ffffff", "#0b101e"]
                }}
              />

              {/* High-Resolution 3D Town Sprites (Zoom >= 7.5) */}
              <Layer
                id="town-sprites"
                type="symbol"
                minzoom={7.5}
                filter={["!", ["has", "point_count"]]}
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
                    "interpolate", ["linear"], ["zoom"],
                    7.5, 0.08,
                    9, 0.16,
                    11, 0.32,
                    14, 0.65
                  ],
                  "icon-allow-overlap": true,
                  "icon-ignore-placement": true,
                  "icon-anchor": "bottom"
                }}
              />

              {/* Town Name & Stage Labels (Zoom >= 9) */}
              <Layer
                id="town-labels"
                type="symbol"
                minzoom={9}
                filter={["!", ["has", "point_count"]]}
                layout={{
                  "text-field": ["get", "name"],
                  "text-font": ["Noto Sans Regular"],
                  "text-size": 11,
                  "text-offset": [0, 0.8],
                  "text-anchor": "top",
                  "text-optional": true
                }}
                paint={{
                  "text-color": "#ffffff",
                  "text-halo-color": "#0b101e",
                  "text-halo-width": 2
                }}
              />
            </Source>
          )}

          {/* Tooltip */}
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
                {hoverInfo.feature.properties.renderType === 'town' && (
                  <>
                    <div className="flex items-center justify-between gap-2" style={{ marginBottom: '0.35rem' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '1.05rem', color: '#f8fafc' }}>{hoverInfo.feature.properties.name}</div>
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
                    <div className="text-secondary" style={{ fontSize: '0.85rem' }}>Player: <span style={{ color: 'white', fontWeight: '500' }}>{hoverInfo.feature.properties.player}</span></div>
                    <div className="text-secondary" style={{ fontSize: '0.85rem' }}>Alliance: <span style={{ color: hoverInfo.feature.properties.townColor || 'white', fontWeight: '500' }}>{hoverInfo.feature.properties.alliance}</span></div>
                    
                    <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.8rem' }}>
                      <span style={{ color: '#10b981', fontFamily: 'monospace', fontWeight: 'bold' }}>
                        {Number(hoverInfo.feature.properties.points).toLocaleString()} pts
                      </span>
                      <span style={{ color: '#94a3b8' }}>
                        Slot #{hoverInfo.feature.properties.islandSlot ?? '0'} ({String(hoverInfo.feature.properties.dir || 'NW').toUpperCase()})
                      </span>
                    </div>
                  </>
                )}
                {(hoverInfo.feature.properties.renderType === 'island' || hoverInfo.feature.properties.renderType === 'rock') && (
                  <>
                    <div style={{ fontWeight: 'bold', fontSize: '1.05rem', marginBottom: '0.25rem', color: '#f8fafc' }}>
                      {hoverInfo.feature.properties.renderType === 'island' ? 'Island' : 'Rock'} ({hoverInfo.feature.properties.x}, {hoverInfo.feature.properties.y})
                    </div>
                    {hoverInfo.feature.properties.dominantAlliance !== "None" && (
                      <div className="text-secondary" style={{ fontSize: '0.85rem' }}>
                        Dominant: <span style={{color: hoverInfo.feature.properties.islandColor, fontWeight: 'bold'}}>{hoverInfo.feature.properties.dominantAlliance}</span>
                      </div>
                    )}
                    {hoverInfo.feature.properties.renderType === 'island' && (
                      <div className="text-secondary" style={{ fontSize: '0.85rem' }}>Buff: <span style={{ color: 'white' }}>+{hoverInfo.feature.properties.resourcePlus} / -{hoverInfo.feature.properties.resourceMinus}</span></div>
                    )}
                    <div className="text-secondary" style={{ fontSize: '0.85rem' }}>Towns: <span style={{ color: 'white' }}>{hoverInfo.feature.properties.colonizedCount} / {hoverInfo.feature.properties.availableTowns}</span></div>
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
        </Map>
      </div>

      {/* Detailed Island Modal */}
      {selectedIsland && (
        <IslandModal 
          islandData={selectedIsland} 
          onClose={() => setSelectedIsland(null)} 
          customColors={customColors}
          worldId={activeWorldId}
          onTownClick={(town) => setSelectedEntity({ type: 'town', data: town })}
          onPlayerClick={(player) => setSelectedEntity({ type: 'player', data: player })}
          onAllianceClick={(alliance) => setSelectedEntity({ type: 'alliance', data: alliance })}
        />
      )}

      {/* Deep Dive Modal */}
      {selectedEntity && (
        <DeepDiveModal 
          entity={selectedEntity} 
          onClose={() => setSelectedEntity(null)} 
          worldId={activeWorldId}
        />
      )}

      {/* LEFT SIDEBAR (General Info & Legend) */}
      <div className="glass-panel flex flex-col gap-4" style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 50, width: '320px', maxHeight: 'calc(100% - 2rem)', overflowY: 'auto', scrollbarWidth: 'none' }}>
        
        {/* Header */}
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }} className="gradient-text">
          World Map Viewer
        </h1>



        {/* Top 10 Alliances Legend */}
        <div className="flex flex-col" style={{ gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: 'var(--primary)' }}>Top 10 Alliances</h2>
          <div className="flex flex-col" style={{ gap: '0.25rem' }}>
            {topAlliances.length > 0 ? topAlliances.map((a) => {
              const activeColor = customColors[a.name] || a.color;
              return (
                <div key={a.name} className="flex items-center justify-between" style={{ fontSize: '0.875rem', padding: '0.25rem', borderRadius: '4px', transition: 'background 0.2s' }}>
                  <div className="flex gap-2 items-center flex-1">
                    <button 
                      onClick={() => setHighlightedAlliances(prev => {
                        const copy = { ...prev };
                        if (copy[a.name]) delete copy[a.name];
                        else copy[a.name] = activeColor;
                        return copy;
                      })}
                      className="cursor-pointer"
                      aria-label={`Toggle highlight for ${a.name}`}
                    >
                      <div 
                        style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: activeColor, flexShrink: 0 }}
                        title="Toggle Map Highlight"
                      />
                    </button>
                    <div 
                      style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} 
                      onClick={(e) => { e.stopPropagation(); setSelectedEntity({ type: 'alliance', data: a }); }}
                    >
                      <div className="font-bold text-white truncate text-sm hover:underline">{a.name}</div>
                      <div className="text-xs text-secondary truncate">{a.points.toLocaleString()} pts</div>
                    </div>
                  </div>
                  <input 
                    type="color" 
                    value={activeColor}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomColors(prev => ({...prev, [a.name]: val}));
                      if (highlightedAlliances[a.name]) {
                        setHighlightedAlliances(prev => ({...prev, [a.name]: val}));
                      }
                    }}
                    style={{ width: '20px', height: '20px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                  />
                </div>
              );
            }) : (
              <div className="text-secondary text-sm" style={{ animation: 'pulse 2s infinite' }}>Loading...</div>
            )}
          </div>
        </div>

        {/* World Stats */}
        <div className="flex flex-col" style={{ gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: 'var(--primary)' }}>World Overview</h2>
          {worldStats ? (
            <div className="flex flex-col" style={{ gap: '0.25rem', fontSize: '0.875rem', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex justify-between"><span className="text-secondary">Players:</span><span style={{ fontWeight: 'bold', color: 'white' }}>{worldStats.players.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-secondary">Active Towns:</span><span style={{ fontWeight: 'bold', color: 'white' }}>{worldStats.totalTowns.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-secondary">Pop. Islands:</span><span style={{ fontWeight: 'bold', color: 'white' }}>{worldStats.populatedIslands.toLocaleString()} <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>/ {worldStats.totalIslands.toLocaleString()}</span></span></div>
            </div>
          ) : (
            <div className="text-secondary text-sm" style={{ animation: 'pulse 2s infinite' }}>Loading...</div>
          )}
        </div>

      </div>

      {/* RIGHT SIDEBAR (Search & Navigation) */}
      <div className="glass-panel flex flex-col gap-4" style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 50, width: '320px', maxHeight: 'calc(100% - 2rem)', overflowY: 'auto', scrollbarWidth: 'none' }}>
        
        {/* Top 10 Players */}
        <div className="flex flex-col" style={{ gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: 'var(--primary)' }}>Top 10 Players</h2>
          <div className="flex flex-col" style={{ gap: '0.25rem' }}>
            {topPlayers.length > 0 ? topPlayers.map((p) => {
              const isHighlighted = highlightedPlayers[p.name];
              const highlightColor = isHighlighted || customColors[p.alliance] || '#3b82f6';
              return (
                <div key={p.name} className="flex items-center gap-2" style={{ fontSize: '0.875rem', padding: '0.5rem', borderRadius: '6px', background: isHighlighted ? `rgba(59, 130, 246, 0.1)` : 'rgba(255,255,255,0.03)', border: `1px solid ${isHighlighted ? highlightColor : 'transparent'}`, transition: 'all 0.2s' }}>
                  <button 
                    onClick={() => setHighlightedPlayers(prev => {
                      const copy = { ...prev };
                      if (copy[p.name]) delete copy[p.name];
                      else copy[p.name] = highlightColor;
                      return copy;
                    })}
                    className="cursor-pointer"
                    aria-label={`Toggle highlight for ${p.name}`}
                  >
                    <div 
                      style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: highlightColor, flexShrink: 0 }}
                      title="Toggle Map Highlight"
                    />
                  </button>
                  <div 
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); setSelectedEntity({ type: 'player', data: p }); }}
                  >
                    <div className="font-bold text-white truncate text-sm hover:underline">{p.name}</div>
                    <div className="text-xs text-secondary truncate">{p.points.toLocaleString()} pts</div>
                  </div>
                </div>
              );
            }) : (
              <div className="text-secondary text-sm" style={{ animation: 'pulse 2s infinite' }}>Loading...</div>
            )}
          </div>
        </div>

        {/* Manual Highlighting */}
        <div className="flex flex-col" style={{ gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: 'var(--primary)' }}>Custom Highlights</h2>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (manualHighlightInput.trim()) {
                setHighlightedPlayers(prev => ({
                  ...prev,
                  [manualHighlightInput.trim()]: '#ef4444' // default red for manual
                }));
                setManualHighlightInput("");
              }
            }}
            className="flex" style={{ gap: '0.5rem' }}
          >
            <input 
              type="text" 
              placeholder="Player Name..." 
              value={manualHighlightInput}
              onChange={e => setManualHighlightInput(e.target.value)}
              className="input-field"
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '0.25rem 0.5rem' }}>Add</button>
          </form>
          
          {/* Active Manual Highlights */}
          {Object.entries(highlightedPlayers).length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              {Object.entries(highlightedPlayers).map(([name, color]) => {
                const isTop10 = topPlayers.some(p => p.name === name);
                if (isTop10) return null;
                return (
                  <div key={name} className="flex items-center justify-between" style={{ fontSize: '0.875rem', padding: '0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}` }}>
                    <span style={{ color: 'white', fontWeight: 'bold' }}>{name}</span>
                    <div className="flex gap-2 items-center">
                      <input 
                        type="color" 
                        value={color}
                        onChange={(e) => setHighlightedPlayers(prev => ({...prev, [name]: e.target.value}))}
                        style={{ width: '20px', height: '20px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                      />
                      <button 
                        onClick={() => setHighlightedPlayers(prev => {
                          const next = {...prev};
                          delete next[name];
                          return next;
                        })}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                        title="Remove highlight"
                        aria-label="Remove highlight"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Search Input */}
        <div className="flex flex-col" style={{ gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: 'var(--primary)' }}>Search</h2>
          <input 
            type="text" 
            placeholder="Search Alliance, Player, or Town..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field"
          />
        </div>

        {/* Search Stats */}
        {searchQuery.trim() && searchStats && (
          <div className="flex flex-col" style={{ gap: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '0.75rem', borderRadius: '8px' }}>
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Matches:</span>
              <span style={{ fontWeight: 'bold' }}>{searchStats.count.toLocaleString()} towns</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Points:</span>
              <span style={{ fontWeight: 'bold', color: '#10b981' }}>{searchStats.points.toLocaleString()}</span>
            </div>
            <button onClick={handleFitBounds} className="btn" style={{ marginTop: '0.5rem', width: '100%', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid var(--primary)', padding: '0.25rem', fontSize: '0.875rem', fontWeight: 'bold' }}>
              Frame on Map
            </button>
          </div>
        )}

        {/* Jump & Tracker */}
        <div className="flex flex-col" style={{ gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: 'var(--primary)' }}>Navigation</h2>
          <div style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: '#cbd5e1', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '4px' }}>
            Cursor: {cursorGrid ? `${cursorGrid.x}, ${cursorGrid.y}` : "---, ---"}
          </div>
          <form onSubmit={handleJump} className="flex" style={{ gap: '0.5rem', marginTop: '0.25rem' }}>
            <input type="number" placeholder="X" value={jumpX} onChange={e=>setJumpX(e.target.value)} className="input-field" style={{ width: '60px', padding: '0.25rem 0.5rem' }} />
            <input type="number" placeholder="Y" value={jumpY} onChange={e=>setJumpY(e.target.value)} className="input-field" style={{ width: '60px', padding: '0.25rem 0.5rem' }} />
            <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.25rem', fontSize: '0.875rem' }}>Jump</button>
          </form>
        </div>

      </div>

    </div>
  );
}
