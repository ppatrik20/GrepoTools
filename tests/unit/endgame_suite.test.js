import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateWonderLevelRequirements,
  calculateWonderConstructionTime,
  calculateWonderFavorMaxCap,
  calculateWonderFortressAudit,
  WONDER_TYPES
} from '../../src/lib/endgame/wonderEngine.js';
import {
  calculateDominationProgress,
  calculateDominationHalfGapDecay,
  calculateLastStandDurationHours,
  isDominationValidIsland
} from '../../src/lib/endgame/dominationEngine.js';
import {
  calculateCurseAttritionCurve,
  calculatePortalRouteTiming,
  TEMPLE_GOD_BONUSES
} from '../../src/lib/endgame/olympusEngine.js';
import { planPortalOperation } from '../../src/lib/operations/OperationPlanner.js';
import { TeamOperationsAdapter } from '../../src/lib/team/TeamOperationsAdapter.js';

describe('Grepolis Endgame Tactical Engine & War Room Suite', () => {

  describe('1. World Wonders Engine & Invariants', () => {
    it('computes exponential resource progression for all 7 canonical wonders up to stage 10', () => {
      for (const [key, def] of Object.entries(WONDER_TYPES)) {
        const stage1 = calculateWonderLevelRequirements(key, 1);
        const stage10 = calculateWonderLevelRequirements(key, 10);
        expect(stage1.totalResources).toBeGreaterThan(0);
        expect(stage10.totalResources).toBeGreaterThan(stage1.totalResources * 10);
      }
    });

    it('enforces the 50% maximum daily favor time-reduction cap', () => {
      const normalSpeed = calculateWonderFavorMaxCap(1.0);
      expect(normalSpeed.maxTimeReductionPercent).toBe(50);
      expect(normalSpeed.dailyFavorAccrualCap).toBe(1200);

      const speed4 = calculateWonderFavorMaxCap(4.0);
      expect(speed4.dailyFavorAccrualCap).toBe(4800);
    });

    it('audits island fortress and flags vacation mode or hostile cities', () => {
      const islandTowns = [
        { id: 101, name: 'Sparta A', playerId: 1, points: 10000, allianceId: 50 },
        { id: 102, name: 'Sparta B', playerId: 2, points: 9500, allianceId: 50 },
        { id: 103, name: 'Enemy Outpost', playerId: 3, points: 4000, allianceId: 99 }
      ];

      const playersMap = new Map([
        [1, { id: 1, name: 'Leonidas', allianceId: 50 }],
        [2, { id: 2, name: 'Gorgo', allianceId: 50 }],
        [3, { id: 3, name: 'Xerxes', allianceId: 99 }]
      ]);

      const membersMap = new Map([
        [1, { playerId: 1, vacationModeActive: false, allianceJoinedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000) }],
        [2, { playerId: 2, vacationModeActive: true, allianceJoinedAt: new Date() }] // vacation + join lock
      ]);

      const audit = calculateWonderFortressAudit({
        islandTowns,
        wonderAllianceId: 50,
        playersMap,
        membersMap
      });

      expect(audit.is100PercentAllianceHeld).toBe(false);
      expect(audit.foreignTownsCount).toBe(1);
      expect(audit.vacationModeTownsCount).toBe(1);
      expect(audit.joinLockTownsCount).toBe(1);
      expect(audit.vulnerabilityScore).toBeGreaterThan(50);
    });
  });

  describe('2. Domination Engine & Decay Logic', () => {
    it('correctly filters valid large islands vs rocks and temple islands', () => {
      expect(isDominationValidIsland(1)).toBe(true); // Large island (1..10)
      expect(isDominationValidIsland(38)).toBe(true); // Large island (37..46)
      expect(isDominationValidIsland(20)).toBe(false); // Small rock (11..36)
      expect(isDominationValidIsland(47)).toBe(false); // Small rock (47..60)
      expect(isDominationValidIsland(61)).toBe(false); // Temple island (61..77)
      expect(isDominationValidIsland(77)).toBe(false); // Olympus temple
    });

    it('calculates domination progress and remaining towns needed', () => {
      const progress = calculateDominationProgress({
        validTownsCount: 1000,
        allianceTownsCount: 380,
        targetPercentage: 40.0
      });

      expect(progress.currentPercentage).toBe(38.0);
      expect(progress.isThresholdReached).toBe(false);
      expect(progress.townsNeededForTarget).toBe(20);
    });

    it('computes 14-day half-gap decay for unclaimed domination eras', () => {
      const initialTarget = 40.0;
      const leadingPercentage = 30.0;
      const decayedTarget = calculateDominationHalfGapDecay({
        currentTargetPct: initialTarget,
        topAlliancePct: leadingPercentage
      });

      // Half the gap: (40 - 30) / 2 = 5% reduction -> 35%
      expect(decayedTarget).toBe(35.0);
    });

    it('scales Last Stand duration based on world speed', () => {
      expect(calculateLastStandDurationHours('SLOW')).toBe(336); // 14 days
      expect(calculateLastStandDurationHours('NORMAL')).toBe(252); // 10.5 days
      expect(calculateLastStandDurationHours('FAST')).toBe(168); // 7 days
    });
  });

  describe('3. Olympus Engine & Portal Tactical Routes', () => {
    it('calculates 5% compounding daily curse attrition', () => {
      const curve = calculateCurseAttritionCurve({
        initialTroops: 50000,
        days: 14
      });

      expect(curve).toHaveLength(15); // Day 0 through 14
      expect(curve[0].troopsRemaining).toBe(50000);
      expect(curve[14].troopsRemaining).toBe(24384);
      expect(curve[14].troopsLostTotal).toBe(25616);
    });

    it('evaluates two-leg portal route timing and surfaces mandatory one-way return warning', () => {
      const timing = calculatePortalRouteTiming({
        originToPortalSeconds: 1800,
        portalTeleportSeconds: 0,
        directOriginToOlympusSeconds: 7200,
        hasAresLargeTemple: false
      });

      expect(timing.isPortalFaster).toBe(true);
      expect(timing.outboundViaPortalSeconds).toBe(1800);
      expect(timing.returnDirectSeconds).toBe(7200);
      expect(timing.timeSavedSeconds).toBe(5400);
    });

    it('integrates portal routes through planPortalOperation with anti-timing windows', () => {
      const targetArrival = new Date(Date.now() + 86400000);
      const plan = planPortalOperation({
        originTown: { x: 500, y: 500, name: 'Athens', id: 1 },
        targetTown: { x: 600, y: 600, name: 'Olympus', id: 99 },
        portalTemple: { x: 590, y: 590, name: 'Portal Alpha', id: 50 },
        unitType: 'bireme',
        worldSpeed: 1,
        unitSpeed: 1,
        targetLandingTime: targetArrival
      });

      expect(plan.portalAvailable).toBe(true);
      expect(plan.portalLaunchWindow).toBeDefined();
      expect(plan.portalLaunchWindow.oneWayReturnNotice).toContain('One-Way Portal Warning');
      expect(plan.portalLaunchWindow.windowStart).toBeDefined();
      expect(plan.portalLaunchWindow.windowEnd).toBeDefined();
    });
  });

  describe('4. Team Operations Adapter Endgame Seam', () => {
    it('sends correct actions for wonder, domination, and temple state updates', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url, init) => {
        if (init?.method === 'POST') {
          const body = JSON.parse(init.body);
          return {
            ok: true,
            json: async () => ({ success: true, action: body.action, data: body })
          };
        }
        return {
          ok: true,
          json: async () => ({
            worldId: 'hu119',
            endgameType: 'WORLD_WONDERS',
            endgamePhase: 'ACTIVE_ERA'
          })
        };
      });

      // 1. Load state
      const state = await TeamOperationsAdapter.loadEndgameState({ teamId: 'team_x', fetchImpl: mockFetch });
      expect(state.endgameType).toBe('WORLD_WONDERS');

      // 2. Upsert wonder
      const proj = await TeamOperationsAdapter.updateWonderProject({
        teamId: 'team_x',
        projectData: { islandId: 202, wonderType: 'PYRAMID', currentStage: 4 },
        fetchImpl: mockFetch
      });
      expect(proj.action).toBe('UPSERT_WONDER_PROJECT');

      // 3. Add contribution
      const contrib = await TeamOperationsAdapter.recordWonderContribution({
        teamId: 'team_x',
        contributionData: { projectId: 'p_1', memberId: 'm_1', resourceWood: 25000 },
        fetchImpl: mockFetch
      });
      expect(contrib.action).toBe('ADD_WONDER_CONTRIBUTION');

      // 4. Update member status
      const memStatus = await TeamOperationsAdapter.updateMemberEndgameStatus({
        teamId: 'team_x',
        memberData: { memberId: 'm_1', vacationModeActive: false },
        fetchImpl: mockFetch
      });
      expect(memStatus.action).toBe('UPDATE_MEMBER_STATUS');

      // 5. Toggle domination island
      const domIsland = await TeamOperationsAdapter.toggleDominationIsland({
        teamId: 'team_x',
        islandData: { islandKey: '512_512', isValid: true },
        fetchImpl: mockFetch
      });
      expect(domIsland.action).toBe('TOGGLE_DOMINATION_ISLAND');

      // 6. Update temple
      const temple = await TeamOperationsAdapter.updateTempleState({
        teamId: 'team_x',
        templeData: { islandKey: '512_512', templeCategory: 'SMALL', god: 'zeus' },
        fetchImpl: mockFetch
      });
      expect(temple.action).toBe('UPSERT_TEMPLE_STATE');
    });
  });

});
