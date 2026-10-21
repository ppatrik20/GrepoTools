import { describe, it, expect, vi } from 'vitest';
import {
  FARM_CAPACITY_BY_LEVEL,
  BUILDING_POPULATION_TABLE,
  SPECIALIZATION_PRESETS,
  DEFAULT_GREPOLIS_UNITS,
  getFarmMaxPopulation,
  getBuildingPopulation,
  computeTotalBuildingPopulation,
  simulateDemolitionReclaim,
  classifyTroopCategory,
  resolveCanonicalUnitKey,
  applyPresetToUnits,
  compileCityPlan,
  TownPlannerAdapter,
} from '@/lib/planner/CityPlannerEngine';

describe('CityPlannerEngine Domain Module', () => {
  describe('Farm Capacity Table & Modifiers', () => {
    it('returns exact Grepolis farm capacities for levels 1..45 (lvl 40 = 3200, lvl 45 = 3560)', () => {
      expect(FARM_CAPACITY_BY_LEVEL[1]).toBe(14);
      expect(FARM_CAPACITY_BY_LEVEL[40]).toBe(3200);
      expect(FARM_CAPACITY_BY_LEVEL[45]).toBe(3560);
      expect(Object.keys(FARM_CAPACITY_BY_LEVEL)).toHaveLength(45);
    });

    it('applies Plow (+200) and Thermal Baths (+10%) accurately', () => {
      expect(
        getFarmMaxPopulation({
          farmLevel: 40,
          plowResearched: false,
          hasThermalBaths: false,
        })
      ).toBe(3200);

      expect(
        getFarmMaxPopulation({
          farmLevel: 40,
          plowResearched: true,
          hasThermalBaths: false,
        })
      ).toBe(3400);

      expect(
        getFarmMaxPopulation({
          farmLevel: 40,
          plowResearched: false,
          hasThermalBaths: true,
        })
      ).toBe(3520);

      expect(
        getFarmMaxPopulation({
          farmLevel: 40,
          plowResearched: true,
          hasThermalBaths: true,
        })
      ).toBe(3720);

      expect(
        getFarmMaxPopulation({
          farmLevel: 45,
          plowResearched: true,
          hasThermalBaths: true,
        })
      ).toBe(4116);
    });
  });

  describe('Building Population & Demolition Reclaim Simulator', () => {
    it('calculates cumulative building population and supports both key styles', () => {
      expect(Object.keys(BUILDING_POPULATION_TABLE)).toContain('main');
      expect(Object.keys(BUILDING_POPULATION_TABLE)).toContain('wall');

      const wallPop25 = getBuildingPopulation('wall', 25);
      expect(wallPop25).toBeGreaterThan(0);
      expect(getBuildingPopulation('wallLevel', 25)).toBe(wallPop25);
      expect(getBuildingPopulation('wall', 0)).toBe(0);

      const totalShortKeys = computeTotalBuildingPopulation({
        main: 20,
        wall: 15,
      });
      const totalLevelKeys = computeTotalBuildingPopulation({
        mainLevel: 20,
        wallLevel: 15,
      });
      expect(totalShortKeys).toBe(totalLevelKeys);
      expect(totalShortKeys).toBe(
        getBuildingPopulation('main', 20) + getBuildingPopulation('wall', 15)
      );
    });

    it('calculates demolition reclaim and uses / 10 for Light Ships and / 8 for Biremes', () => {
      const currentBuildings = {
        main: 25,
        wall: 25,
        barracks: 20,
        temple: 15,
      };
      const targetBuildings = {
        main: 15,
        wall: 0,
        barracks: 0,
        temple: 1,
      };

      const reclaim = simulateDemolitionReclaim({
        currentBuildings,
        targetBuildings,
      });

      const expectedSaved =
        getBuildingPopulation('main', 25) -
        getBuildingPopulation('main', 15) +
        getBuildingPopulation('wall', 25) +
        getBuildingPopulation('barracks', 20) +
        (getBuildingPopulation('temple', 15) - getBuildingPopulation('temple', 1));

      expect(reclaim.populationSaved).toBe(expectedSaved);
      expect(reclaim.lightShipsEquivalent).toBe(Math.floor(expectedSaved / 10));
      expect(reclaim.biremesEquivalent).toBe(Math.floor(expectedSaved / 8));
      expect(reclaim.slingersEquivalent).toBe(expectedSaved);
    });
  });

  describe('Troop Classification & Specialization Presets', () => {
    it('defines all 6 canonical specialization presets', () => {
      expect(Object.keys(SPECIALIZATION_PRESETS)).toEqual(
        expect.arrayContaining([
          'LS_NUKE',
          'BIR_WALL',
          'LAND_OFF',
          'LAND_DEF',
          'MANTI_NUKE',
          'GRIFF_NUKE',
        ])
      );
    });

    it('classifies units into NAVAL, LAND, and MYTHIC deterministically for English and Hungarian catalogs', () => {
      expect(classifyTroopCategory({ id: 'attack_ship', name: 'Jelzőhajó', is_naval: true })).toBe('NAVAL');
      expect(classifyTroopCategory({ id: 'bireme', name: 'Biréma', is_naval: true })).toBe('NAVAL');
      expect(classifyTroopCategory({ id: 'slinger', name: 'Parittyás', is_naval: false })).toBe('LAND');
      expect(classifyTroopCategory({ id: 'manticore', name: 'Mantikór', flying: true })).toBe('MYTHIC');
      expect(classifyTroopCategory({ id: 'griffin', name: 'Griff', flying: true })).toBe('MYTHIC');
      expect(classifyTroopCategory({ id: 'cerberus', name: 'Kerberosz', is_naval: false })).toBe('MYTHIC');
    });

    it('applies presets deterministically even when database unit names are localized', () => {
      const hungarianCatalog = [
        { id: 'u_101', name: 'Jelzőhajó', population: 10 },
        { id: 'u_102', name: 'Biréma', population: 8 },
        { id: 'u_103', name: 'Parittyás', population: 1 },
        { id: 'u_104', name: 'Hoplita', population: 1 },
        { id: 'u_105', name: 'Gyors szállítóhajó', population: 5 },
        { id: 'u_106', name: 'Mantikór', population: 45 },
        { id: 'u_107', name: 'Griff', population: 35 },
      ];

      expect(resolveCanonicalUnitKey(hungarianCatalog[0])).toBe('light_ship');
      expect(resolveCanonicalUnitKey(hungarianCatalog[4])).toBe('fast_transport');

      const lsCounts = applyPresetToUnits('LS_NUKE', hungarianCatalog);
      expect(lsCounts).toEqual({ u_101: 300 });

      const landOffCounts = applyPresetToUnits('LAND_OFF', hungarianCatalog);
      expect(landOffCounts).toEqual({
        u_103: 1120,
        u_104: 800,
        u_105: 120,
        u_101: 30,
      });

      const griffCounts = applyPresetToUnits('GRIFF_NUKE', hungarianCatalog);
      expect(griffCounts).toEqual({ u_107: 80 });
    });
  });

  describe('compileCityPlan', () => {
    it('compiles farm capacity, building demolition savings, combat stats, and transport sufficiency', () => {
      const town = {
        id: 1,
        farmLevel: 45,
        plowResearched: true,
        hasThermalBaths: true,
        bunksResearched: true,
        mainLevel: 25,
        wallLevel: 20,
        barracksLevel: 20,
        docksLevel: 20,
        academyLevel: 30,
      };

      const buildingTargets = {
        main: 15,
        wall: 0,
        barracks: 20,
        docks: 10,
        academy: 30,
      };

      const plan = compileCityPlan({
        town,
        buildingTargets,
        troopCounts: {
          slinger: 1000,
          hoplite: 600,
          fast_transport: 80, // 80 * 16 = 1280 capacity (< 1600 land pop -> 320 deficit)
        },
        units: DEFAULT_GREPOLIS_UNITS,
      });

      expect(plan.maxPopulation).toBe(4116);
      expect(plan.buildingPopulation).toBeGreaterThan(plan.effectiveBuildingPopulation);
      expect(plan.demolitionSavedPopulation).toBe(
        plan.buildingPopulation - plan.effectiveBuildingPopulation
      );
      expect(plan.armyPopulation).toBe(1000 * 1 + 600 * 1 + 80 * 5);
      expect(plan.freePopulation).toBe(
        plan.maxPopulation - plan.effectiveBuildingPopulation - plan.armyPopulation
      );

      expect(plan.combatStats.totalAttack).toBe(1000 * 23 + 600 * 16 + 80 * 20);
      expect(plan.transportSummary).toEqual({
        landTroopPopulation: 1600,
        transportCapacity: 1280,
        transportDeficit: 320,
        fastTransportsNeeded: 20, // 320 / 16
        slowTransportsNeeded: 13, // ceil(320 / 26)
        isSufficient: false,
      });
    });

    it('treats flying mythic units as requiring 0 transport ships', () => {
      const plan = compileCityPlan({
        town: { farmLevel: 45, plowResearched: true, hasThermalBaths: true },
        troopCounts: { manticore: 60 },
        units: DEFAULT_GREPOLIS_UNITS,
      });

      expect(plan.armyPopulation).toBe(60 * 45);
      expect(plan.transportSummary.landTroopPopulation).toBe(0);
      expect(plan.transportSummary.transportDeficit).toBe(0);
      expect(plan.transportSummary.isSufficient).toBe(true);
    });
  });

  describe('TownPlannerAdapter Persistence Seam', () => {
    it('always includes normalized worldId in PUT /api/towns via saveTownConfiguration', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 42, worldId: 'en150', specialization: 'LS_NUKE' }),
      });

      const result = await TownPlannerAdapter.saveTownConfiguration({
        worldId: 'EN150',
        townId: 42,
        specialization: 'LS_NUKE',
        plowResearched: true,
        hasThermalBaths: true,
        bunksResearched: true,
        buildings: { main: 15, farm: 45, wall: 0 },
        fetchImpl: mockFetch,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/towns');
      expect(options.method).toBe('PUT');

      const parsedBody = JSON.parse(options.body);
      expect(parsedBody.worldId).toBe('en150');
      expect(parsedBody.townId).toBe(42);
      expect(parsedBody.specialization).toBe('LS_NUKE');
      expect(parsedBody.buildingLevels).toEqual({
        mainLevel: 15,
        farmLevel: 45,
        wallLevel: 0,
      });
      expect(result.worldId).toBe('en150');
    });

    it('fetches town roster and troop catalog via injected fetchImpl', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 10, name: 'Sparta', points: 10000 }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            units: [
              { id: 'bireme', population: 8 },
              { id: 'slinger', population: 1 },
            ],
          }),
        });

      const towns = await TownPlannerAdapter.fetchTownRoster({
        worldId: 'hu124',
        playerId: 777,
        fetchImpl: mockFetch,
      });
      expect(towns).toHaveLength(1);
      expect(mockFetch.mock.calls[0][0]).toBe('/api/towns?world=hu124&playerId=777');

      const catalog = await TownPlannerAdapter.fetchTroopCatalog({
        fetchImpl: mockFetch,
      });
      expect(catalog.map((u) => u.id)).toEqual(['slinger', 'bireme']);
    });
  });
});
