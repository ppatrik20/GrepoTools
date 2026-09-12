import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

import { requireAuth } from '@/lib/auth/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const playerIdStr = searchParams.get('playerId');
    const worldId = (searchParams.get('world') || 'hu119').toLowerCase();

    if (!playerIdStr) {
      return NextResponse.json({ error: 'Missing playerId parameter' }, { status: 400 });
    }

    const playerId = parseInt(playerIdStr, 10);
    if (isNaN(playerId)) {
      return NextResponse.json({ error: 'Invalid playerId' }, { status: 400 });
    }

    const towns = await prisma.town.findMany({
      where: { worldId, playerId },
      orderBy: { points: 'desc' }
    });

    return NextResponse.json(towns);
  } catch (error) {
    console.error("GET /api/towns error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { townId, worldId = 'hu119', specialization, bunksResearched, plowResearched, cartographyResearched, mathResearched, hasThermalBaths, hasTower, hasLighthouse, buildingLevels } = body;

    if (!townId) {
      return NextResponse.json({ error: 'Missing townId' }, { status: 400 });
    }

    const id = parseInt(townId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid townId' }, { status: 400 });
    }

    const normalizedWorldId = worldId.toLowerCase();

    // Check town existence
    const town = await prisma.town.findUnique({
      where: {
        id_worldId: {
          id,
          worldId: normalizedWorldId
        }
      }
    });

    if (!town) {
      return NextResponse.json({ error: 'Town not found' }, { status: 404 });
    }

    // Require authorization: must be Global Admin, Team Admin, or owner of the town
    const auth = await requireAuth(request, { worldId: normalizedWorldId });
    if (!auth.authorized) {
      return auth.response;
    }

    const isGlobalAdmin = auth.user.globalRole === 'GLOBAL_ADMIN';
    const isTeamAdmin = auth.member?.role === 'TEAM_ADMIN';
    const isOwner = auth.member?.playerId === town.playerId;

    if (!isGlobalAdmin && !isTeamAdmin && !isOwner) {
      return NextResponse.json(
        { error: 'Forbidden: You can only customize towns belonging to your verified account' },
        { status: 403 }
      );
    }

    const updateData = {};
    if (specialization !== undefined) updateData.specialization = specialization;
    if (bunksResearched !== undefined) updateData.bunksResearched = bunksResearched;
    if (plowResearched !== undefined) updateData.plowResearched = plowResearched;
    if (cartographyResearched !== undefined) updateData.cartographyResearched = cartographyResearched;
    if (mathResearched !== undefined) updateData.mathResearched = mathResearched;
    if (hasThermalBaths !== undefined) updateData.hasThermalBaths = hasThermalBaths;
    if (hasTower !== undefined) updateData.hasTower = hasTower;
    if (hasLighthouse !== undefined) updateData.hasLighthouse = hasLighthouse;

    if (buildingLevels) {
      if (buildingLevels.mainLevel !== undefined) updateData.mainLevel = buildingLevels.mainLevel;
      if (buildingLevels.farmLevel !== undefined) updateData.farmLevel = buildingLevels.farmLevel;
      if (buildingLevels.barracksLevel !== undefined) updateData.barracksLevel = buildingLevels.barracksLevel;
      if (buildingLevels.docksLevel !== undefined) updateData.docksLevel = buildingLevels.docksLevel;
      if (buildingLevels.wallLevel !== undefined) updateData.wallLevel = buildingLevels.wallLevel;
      if (buildingLevels.templeLevel !== undefined) updateData.templeLevel = buildingLevels.templeLevel;
      if (buildingLevels.lumberLevel !== undefined) updateData.lumberLevel = buildingLevels.lumberLevel;
      if (buildingLevels.stonerLevel !== undefined) updateData.stonerLevel = buildingLevels.stonerLevel;
      if (buildingLevels.ironerLevel !== undefined) updateData.ironerLevel = buildingLevels.ironerLevel;
      if (buildingLevels.marketLevel !== undefined) updateData.marketLevel = buildingLevels.marketLevel;
      if (buildingLevels.academyLevel !== undefined) updateData.academyLevel = buildingLevels.academyLevel;
    }

    const updatedTown = await prisma.town.update({
      where: { 
        id_worldId: {
          id,
          worldId: worldId.toLowerCase()
        }
      },
      data: updateData
    });

    return NextResponse.json(updatedTown);
  } catch (error) {
    console.error("PUT /api/towns error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
