import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTeamAccess, hasPermission, ENDGAME_PERMISSIONS } from '@/lib/auth/rbac';
import {
  calculateWonderLevelRequirements,
  calculateWonderConstructionTime,
  calculateWonderFavorMaxCap,
  calculateWonderFortressAudit,
  WONDER_TYPES
} from '@/lib/endgame/wonderEngine';
import {
  calculateDominationProgress,
  calculateLastStandDurationHours,
  isDominationValidIsland,
  rankExpansionTargets
} from '@/lib/endgame/dominationEngine';
import {
  calculateCurseAttritionCurve,
  TEMPLE_GOD_BONUSES
} from '@/lib/endgame/olympusEngine';

export async function GET(request, { params }) {
  try {
    const { id: teamId } = await params;

    const access = await requireTeamAccess(request, teamId, {
      allowUnverified: true
    });

    if (!access.authorized) {
      return access.response;
    }

    const { team } = access;

    const world = await prisma.world.findUnique({
      where: { id: team.worldId }
    });

    if (!world) {
      return NextResponse.json({ error: 'World not found' }, { status: 404 });
    }

    // Determine team alliance IDs from verified/current members
    const playerIds = (team.members || []).map(m => m.playerId).filter(Boolean);
    const teamPlayers = await prisma.player.findMany({
      where: {
        worldId: team.worldId,
        id: { in: playerIds }
      },
      select: { id: true, name: true, allianceId: true }
    });

    const teamAllianceIds = Array.from(new Set(teamPlayers.map(p => p.allianceId).filter(Boolean)));

    const baseResponse = {
      worldId: world.id,
      endgameType: world.endgameType || 'NONE',
      endgamePhase: world.endgamePhase || 'PRE_ERA',
      endgameSpeed: world.endgameSpeed || 'NORMAL',
      worldSpeed: world.speed || 1.0,
      worldStartedAt: world.worldStartedAt,
      eraStartedAt: world.eraStartedAt,
      lastStandStartedAt: world.lastStandStartedAt,
      lastStandAllianceId: world.lastStandAllianceId,
      dominationTargetPct: world.dominationTargetPct || 40.0,
      teamAllianceIds
    };

    // 1. World Wonders Payload
    if (world.endgameType === 'WORLD_WONDERS') {
      const projects = await prisma.teamWonderProject.findMany({
        where: { teamId },
        include: {
          contributions: {
            take: 25,
            orderBy: { createdAt: 'desc' },
            include: {
              member: {
                select: { id: true, playerName: true, role: true }
              }
            }
          }
        }
      });

      // Enrich projects with engine requirements & fortress audits
      const enrichedProjects = await Promise.all(projects.map(async (p) => {
        const nextStage = Math.min(10, p.currentStage + 1);
        const reqs = calculateWonderLevelRequirements(p.wonderType, nextStage);
        const baseTimeSec = calculateWonderConstructionTime(nextStage, world.speed || 1.0);
        const favorCap = calculateWonderFavorMaxCap(world.speed || 1.0);

        // Fortification audit: check towns on wonder island
        let audit = null;
        if (p.islandId) {
          const islandTowns = await prisma.town.findMany({
            where: {
              worldId: team.worldId,
              islandId: p.islandId
            },
            select: { id: true, name: true, points: true, playerId: true }
          });

          const townPlayerIds = islandTowns.map(t => t.playerId).filter(Boolean);
          const islandPlayers = await prisma.player.findMany({
            where: { worldId: team.worldId, id: { in: townPlayerIds } },
            select: { id: true, name: true, points: true, allianceId: true }
          });

          const islandPlayerMap = new Map(islandPlayers.map(pl => [pl.id, pl]));
          const townsWithAlliance = islandTowns.map(t => ({
            ...t,
            allianceId: islandPlayerMap.get(t.playerId)?.allianceId || null
          }));

          const memberMap = new Map((team.members || []).map(m => [m.playerId, m]));

          audit = calculateWonderFortressAudit({
            islandTowns: townsWithAlliance,
            wonderAllianceId: p.allianceId || teamAllianceIds[0] || null,
            playersMap: islandPlayerMap,
            membersMap: memberMap
          });
        }

        return {
          ...p,
          nextStage,
          requirements: reqs,
          baseTimeSec,
          dailyFavorAccrualCap: favorCap.dailyFavorAccrualCap,
          fortressAudit: audit
        };
      }));

      return NextResponse.json({
        ...baseResponse,
        wonders: {
          availableTypes: Object.keys(WONDER_TYPES),
          projects: enrichedProjects
        }
      });
    }

    // 2. Domination Payload
    if (world.endgameType === 'DOMINATION') {
      // Find valid islands in DB or compute them
      const dbValidIslands = await prisma.dominationValidIsland.findMany({
        where: { worldId: team.worldId }
      });

      // Total valid towns & alliance control
      const totalTownsCount = await prisma.town.count({
        where: { worldId: team.worldId }
      });

      const teamTownsCount = await prisma.town.count({
        where: {
          worldId: team.worldId,
          player: {
            allianceId: { in: teamAllianceIds.length > 0 ? teamAllianceIds : [-999] }
          }
        }
      });

      const dominationProgress = calculateDominationProgress({
        validTownsCount: totalTownsCount || 1,
        allianceTownsCount: teamTownsCount,
        targetPercentage: world.dominationTargetPct || 40.0
      });

      let lastStandDurationHours = null;
      if (world.endgameSpeed) {
        try {
          lastStandDurationHours = calculateLastStandDurationHours(world.endgameSpeed);
        } catch {
          lastStandDurationHours = 336; // 14 days fallback
        }
      }

      return NextResponse.json({
        ...baseResponse,
        domination: {
          totalTownsCount,
          teamTownsCount,
          progress: dominationProgress,
          lastStandDurationHours,
          validIslandsCount: dbValidIslands.filter(i => i.isValid).length
        }
      });
    }

    // 3. Olympus Payload
    if (world.endgameType === 'OLYMPUS') {
      const temples = await prisma.olympusTempleState.findMany({
        where: { worldId: team.worldId },
        orderBy: [{ templeCategory: 'asc' }, { updatedAt: 'desc' }]
      });

      const curseCurve = calculateCurseAttritionCurve({
        initialTroops: 10000,
        days: 14
      });

      return NextResponse.json({
        ...baseResponse,
        olympus: {
          temples,
          curseAttritionCurve: curseCurve,
          godBonuses: TEMPLE_GOD_BONUSES
        }
      });
    }

    // Default / Pre-Era / NONE
    return NextResponse.json({
      ...baseResponse,
      message: 'Endgame is not active on this world or is in pre-era phase.'
    });

  } catch (error) {
    console.error('Error fetching team endgame status:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve endgame status: ' + error.message },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  try {
    const { id: teamId } = await params;

    const access = await requireTeamAccess(request, teamId, {
      allowUnverified: false
    });

    if (!access.authorized) {
      return access.response;
    }

    const { team, isTeamAdmin, user } = access;

    // Check authority: must be Team Admin or possess ENDGAME_STRATEGIST or WONDER_QUARTERMASTER
    const canManageEndgame = isTeamAdmin ||
      hasPermission(access, teamId, ENDGAME_PERMISSIONS.ENDGAME_STRATEGIST) ||
      hasPermission(access, teamId, ENDGAME_PERMISSIONS.WONDER_QUARTERMASTER) ||
      hasPermission(access, teamId, 'OPERATIONS_COORDINATE');

    if (!canManageEndgame) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient tactical authority to modify endgame projects' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action } = body;

    // 1. Create or update Wonder Project
    if (action === 'UPSERT_WONDER_PROJECT') {
      const {
        islandId,
        wonderType,
        currentStage = 0,
        isUnderExpansion = false,
        expansionEndsAt = null,
        stageWoodCollected = 0,
        stageStoneCollected = 0,
        stageSilverCollected = 0,
        favorAccelerationsCount = 0,
        notes = null
      } = body;

      if (!islandId || !wonderType) {
        return NextResponse.json(
          { error: 'islandId and wonderType are required' },
          { status: 400 }
        );
      }

      const project = await prisma.teamWonderProject.upsert({
        where: {
          teamId_islandId: {
            teamId,
            islandId: Number(islandId)
          }
        },
        create: {
          teamId,
          worldId: team.worldId,
          islandId: Number(islandId),
          wonderType,
          currentStage: Number(currentStage),
          isUnderExpansion: Boolean(isUnderExpansion),
          expansionEndsAt: expansionEndsAt ? new Date(expansionEndsAt) : null,
          stageWoodCollected: Number(stageWoodCollected),
          stageStoneCollected: Number(stageStoneCollected),
          stageSilverCollected: Number(stageSilverCollected),
          favorAccelerationsCount: Number(favorAccelerationsCount),
          notes
        },
        update: {
          wonderType,
          currentStage: Number(currentStage),
          isUnderExpansion: Boolean(isUnderExpansion),
          expansionEndsAt: expansionEndsAt ? new Date(expansionEndsAt) : null,
          stageWoodCollected: Number(stageWoodCollected),
          stageStoneCollected: Number(stageStoneCollected),
          stageSilverCollected: Number(stageSilverCollected),
          favorAccelerationsCount: Number(favorAccelerationsCount),
          notes
        }
      });

      return NextResponse.json({ success: true, project });
    }

    // 2. Add Wonder Contribution
    if (action === 'ADD_WONDER_CONTRIBUTION') {
      const {
        projectId,
        memberId,
        resourceWood = 0,
        resourceStone = 0,
        resourceSilver = 0,
        favorCastsCount = 0,
        status = 'COMPLETED',
        etaArrival = null
      } = body;

      if (!projectId || !memberId) {
        return NextResponse.json(
          { error: 'projectId and memberId are required' },
          { status: 400 }
        );
      }

      const contribution = await prisma.teamWonderContribution.create({
        data: {
          projectId,
          memberId,
          resourceWood: Number(resourceWood),
          resourceStone: Number(resourceStone),
          resourceSilver: Number(resourceSilver),
          favorCastsCount: Number(favorCastsCount),
          status,
          etaArrival: etaArrival ? new Date(etaArrival) : null
        }
      });

      // Update project totals
      await prisma.teamWonderProject.update({
        where: { id: projectId },
        data: {
          stageWoodCollected: { increment: Number(resourceWood) },
          stageStoneCollected: { increment: Number(resourceStone) },
          stageSilverCollected: { increment: Number(resourceSilver) },
          favorAccelerationsCount: { increment: Number(favorCastsCount) }
        }
      });

      return NextResponse.json({ success: true, contribution });
    }

    // 3. Update Member Endgame Status (vacation mode, join date)
    if (action === 'UPDATE_MEMBER_STATUS') {
      const { memberId, vacationModeActive, allianceJoinedAt } = body;
      if (!memberId) {
        return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
      }

      const updateData = {};
      if (typeof vacationModeActive === 'boolean') {
        updateData.vacationModeActive = vacationModeActive;
        updateData.vacationUpdatedAt = new Date();
      }
      if (allianceJoinedAt) {
        updateData.allianceJoinedAt = new Date(allianceJoinedAt);
      }

      const updatedMember = await prisma.teamMember.update({
        where: { id: memberId },
        data: updateData
      });

      return NextResponse.json({ success: true, member: updatedMember });
    }

    // 4. Domination Island Toggle
    if (action === 'TOGGLE_DOMINATION_ISLAND') {
      const { islandKey, isValid } = body;
      if (!islandKey) {
        return NextResponse.json({ error: 'islandKey is required' }, { status: 400 });
      }

      const island = await prisma.dominationValidIsland.upsert({
        where: {
          worldId_islandKey: {
            worldId: team.worldId,
            islandKey
          }
        },
        create: {
          worldId: team.worldId,
          islandKey,
          isValid: Boolean(isValid),
          isManuallySet: true
        },
        update: {
          isValid: Boolean(isValid),
          isManuallySet: true
        }
      });

      return NextResponse.json({ success: true, island });
    }

    // 5. Update Olympus Temple State
    if (action === 'UPSERT_TEMPLE_STATE') {
      const {
        islandKey,
        templeTownId,
        templeCategory,
        god,
        buffCode,
        buffName,
        ownerAllianceId,
        shieldEndsAt,
        nextJumpAt
      } = body;

      if (!islandKey || !templeCategory) {
        return NextResponse.json({ error: 'islandKey and templeCategory are required' }, { status: 400 });
      }

      const temple = await prisma.olympusTempleState.upsert({
        where: {
          worldId_islandKey: {
            worldId: team.worldId,
            islandKey
          }
        },
        create: {
          worldId: team.worldId,
          islandKey,
          templeTownId: templeTownId ? Number(templeTownId) : null,
          templeCategory,
          god,
          buffCode,
          buffName,
          ownerAllianceId: ownerAllianceId ? Number(ownerAllianceId) : null,
          shieldEndsAt: shieldEndsAt ? new Date(shieldEndsAt) : null,
          nextJumpAt: nextJumpAt ? new Date(nextJumpAt) : null
        },
        update: {
          templeTownId: templeTownId ? Number(templeTownId) : null,
          templeCategory,
          god,
          buffCode,
          buffName,
          ownerAllianceId: ownerAllianceId ? Number(ownerAllianceId) : null,
          shieldEndsAt: shieldEndsAt ? new Date(shieldEndsAt) : null,
          nextJumpAt: nextJumpAt ? new Date(nextJumpAt) : null
        }
      });

      return NextResponse.json({ success: true, temple });
    }

    return NextResponse.json({ error: 'Unknown action: ' + action }, { status: 400 });

  } catch (error) {
    console.error('Error modifying endgame status:', error);
    return NextResponse.json(
      { error: 'Failed to update endgame status: ' + error.message },
      { status: 500 }
    );
  }
}
