import { describe, test, expect, beforeEach } from 'vitest';
import { 
  TacticalScenePipeline, 
  compileScene, 
  projectCursorSector, 
  getTownMapCoordinates, 
  generateOceanGrid 
} from '@/lib/map/TacticalScenePipeline.js';
import { 
  getTacticalLayers, 
  INTERACTIVE_LAYER_IDS 
} from '@/lib/map/TacticalLayerRegistry.js';

describe('TacticalLayerRegistry Interface', () => {
  test('returns 49 declarative layers in stable stacking order', () => {
    const layers = getTacticalLayers();
    expect(layers).toBeInstanceOf(Array);
    expect(layers.length).toBe(49);
    expect(layers[0].id).toBe('ocean-lines');
    expect(layers[layers.length - 1].id).toBe('town-labels');
  });

  test('binds viewMode and politicalOpacity to Voronoi layers', () => {
    const geoLayers = getTacticalLayers({ viewMode: 'geographic', politicalOpacity: 0.5 });
    const voronoiFillGeo = geoLayers.find(l => l.id === 'voronoi-spheres-fill');
    expect(voronoiFillGeo.layout.visibility).toBe('none');

    const polLayers = getTacticalLayers({ viewMode: 'political', politicalOpacity: 0.75 });
    const voronoiFillPol = polLayers.find(l => l.id === 'voronoi-spheres-fill');
    expect(voronoiFillPol.layout.visibility).toBe('visible');
    expect(voronoiFillPol.paint['fill-opacity'][4]).toBe(0.75);
  });

  test('toggles intel radar layer visibility based on filter flags', () => {
    const defaultLayers = getTacticalLayers({ radarFilters: { ghostHunter: false, activeSiege: false } });
    const ghostMarker = defaultLayers.find(l => l.id === 'ghost-radar-markers');
    const siegeMarker = defaultLayers.find(l => l.id === 'siege-radar-markers');
    expect(ghostMarker.layout.visibility).toBe('none');
    expect(siegeMarker.layout.visibility).toBe('none');

    const activeLayers = getTacticalLayers({ radarFilters: { ghostHunter: true, activeSiege: true } });
    const ghostActive = activeLayers.find(l => l.id === 'ghost-radar-markers');
    const siegeActive = activeLayers.find(l => l.id === 'siege-radar-markers');
    expect(ghostActive.layout.visibility).toBe('visible');
    expect(siegeActive.layout.visibility).toBe('visible');
  });

  test('exports interactive layer IDs correctly', () => {
    expect(INTERACTIVE_LAYER_IDS).toContain('town-sprites');
    expect(INTERACTIVE_LAYER_IDS).toContain('ghost-radar-markers');
    expect(INTERACTIVE_LAYER_IDS).toContain('tactical-pin-markers');
    expect(INTERACTIVE_LAYER_IDS).toContain('island-terrain-fill');
  });
});

describe('TacticalScenePipeline Interface & Cache Verification', () => {
  const sampleGeojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { id: 101, renderType: 'town', name: 'Sparta Core', player: 'Leonidas', alliance: 'Spartans', points: 9000, x: 500, y: 500 }
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0.01, 0.01] },
        properties: { id: 102, renderType: 'town', name: 'Athens Core', player: 'Pericles', alliance: 'Athenians', points: 8500, x: 505, y: 505 }
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { id: 1, renderType: 'island', x: 500, y: 500, islandType: 1, dominantAlliance: 'Spartans' }
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0.05, 0.05] },
        properties: { id: 99, renderType: 'rock', x: 510, y: 510, islandType: 999 }
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0.002, 0.002] },
        properties: { id: 'slot_1', renderType: 'empty-slot', islandX: 500, islandY: 500, slot: 2 }
      }
    ]
  };

  const sampleAlliances = [
    { id: 1, name: 'Spartans', color: '#ef4444', points: 50000 },
    { id: 2, name: 'Athenians', color: '#3b82f6', points: 40000 }
  ];

  test('projectCursorSector returns accurate world grid and ocean code', () => {
    // [0, 0] is center of map (gridX: 500, gridY: 500, ocean O55)
    const center = projectCursorSector(0, 0);
    expect(center.gridX).toBe(500);
    expect(center.gridY).toBe(500);
    expect(center.oceanCode).toBe('O55');

    // Northwest quadrant
    const nw = projectCursorSector(-36, 18);
    expect(nw.gridX).toBe(400);
    expect(nw.gridY).toBe(400);
    expect(nw.oceanCode).toBe('O44');
  });

  test('generateOceanGrid produces 10x10 sectors and lines', () => {
    const grid = generateOceanGrid();
    expect(grid.type).toBe('FeatureCollection');
    expect(grid.features.length).toBeGreaterThan(50);
  });

  test('compileScene outputs all required sources and metrics', () => {
    const pipeline = new TacticalScenePipeline();
    const scene = pipeline.compileScene({
      geojsonData: sampleGeojson,
      topAlliances: sampleAlliances
    });

    expect(scene.sources).toBeDefined();
    expect(scene.activeTransits).toBeInstanceOf(Array);
    expect(scene.tacticalStats).toBeDefined();

    // Check all 20 source keys exist and are valid FeatureCollections
    const expectedSources = [
      'ocean-grid-source', 'route-line-source', 'voronoi-source', 'frontlines-source',
      'ghost-radar-source', 'siege-radar-source', 'inactive-farm-source', 'tactical-pins-source',
      'islands-source', 'island-polygons-source', 'island-contours-source', 'rock-polygons-source',
      'frontline-islands-source', 'empty-slots-source', 'maritime-ocean-source',
      'maritime-frontlines-source', 'island-halos-source', 'enemy-beachheads-source',
      'maritime-labels-source', 'towns-source'
    ];

    expectedSources.forEach(sourceKey => {
      expect(scene.sources[sourceKey], `Source ${sourceKey} missing`).toBeDefined();
      expect(scene.sources[sourceKey].type).toBe('FeatureCollection');
    });

    expect(scene.tacticalStats.rawTowns.length).toBe(2);
    expect(scene.tacticalStats.partitionedFeatures.islands.length).toBe(1);
  });

  test('three-tier cache maintains reference stability across Tier 3 overlay updates', () => {
    const pipeline = new TacticalScenePipeline();

    // Run 1: initial compile
    const scene1 = pipeline.compileScene({
      geojsonData: sampleGeojson,
      topAlliances: sampleAlliances,
      radarFilters: { ghostHunter: false }
    });

    // Run 2: radar filter toggled (Tier 3 change only)
    const scene2 = pipeline.compileScene({
      geojsonData: sampleGeojson,
      topAlliances: sampleAlliances,
      radarFilters: { ghostHunter: true, minGhostPoints: 500 }
    });

    // Tier 1 Base Topology should be reference-identical
    expect(scene2.sources['island-contours-source']).toBe(scene1.sources['island-contours-source']);
    expect(scene2.sources['rock-polygons-source']).toBe(scene1.sources['rock-polygons-source']);

    // Tier 2 Political Topology should be reference-identical
    expect(scene2.sources['voronoi-source']).toBe(scene1.sources['voronoi-source']);
    expect(scene2.sources['island-polygons-source']).toBe(scene1.sources['island-polygons-source']);
    expect(scene2.tacticalStats.allianceTerritoryStats).toBe(scene1.tacticalStats.allianceTerritoryStats);
  });

  test('route transit generation creates animated trajectory', () => {
    const pipeline = new TacticalScenePipeline();
    const townA = { id: 101, name: 'Sparta Core', islandX: 500, islandY: 500 };
    const townB = { id: 102, name: 'Athens Core', islandX: 520, islandY: 520 };

    const scene = pipeline.compileScene({
      geojsonData: sampleGeojson,
      topAlliances: sampleAlliances,
      routeOrigin: townA,
      routeTarget: townB
    });

    expect(scene.sources['route-line-source'].features.length).toBe(1);
    expect(scene.activeTransits.length).toBe(1);
    expect(scene.activeTransits[0].originTownId).toBe(101);
    expect(scene.activeTransits[0].targetTownId).toBe(102);
  });
});
