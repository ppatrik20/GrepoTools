import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminBearerAuth } from '@/lib/auth';

export async function DELETE(request) {
  try {
    if (!verifyAdminBearerAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let worldId = searchParams.get('worldId') || searchParams.get('world');
    let islandId = searchParams.get('islandId') || searchParams.get('id');

    if (!worldId) {
      try {
        const body = await request.clone().json();
        if (body?.worldId) worldId = body.worldId;
        if (body?.islandId) islandId = body.islandId;
      } catch {}
    }

    if (!worldId || typeof worldId !== 'string' || !/^[a-z0-9]+$/i.test(worldId.trim())) {
      return NextResponse.json({ error: 'Valid worldId parameter matching /^[a-z0-9]+$/ is required' }, { status: 400 });
    }

    worldId = worldId.trim().toLowerCase();

    // If an individual islandId is targeted, delete using the composite key { id_worldId: { id, worldId } }
    if (islandId !== null && islandId !== undefined) {
      const numId = parseInt(islandId, 10);
      if (isNaN(numId)) {
        return NextResponse.json({ error: 'Invalid islandId' }, { status: 400 });
      }

      try {
        await prisma.island.delete({
          where: {
            id_worldId: {
              id: numId,
              worldId
            }
          }
        });

        return NextResponse.json({ success: true, deleted: 1, worldId, islandId: numId });
      } catch (err) {
        if (err?.code === 'P2025') {
          return NextResponse.json({ error: `Island ${numId} not found in world ${worldId}` }, { status: 404 });
        }
        throw err;
      }
    }

    // Otherwise clean inactive/empty islands strictly scoped to the specified world
    const towns = await prisma.town.findMany({
      where: { worldId },
      select: { islandX: true, islandY: true }
    });

    const populatedSet = new Set();
    for (const t of towns) {
      populatedSet.add(`${t.islandX},${t.islandY}`);
    }

    const allIslands = await prisma.island.findMany({
      where: { worldId },
      select: { id: true, x: true, y: true, availableTowns: true }
    });

    const toDelete = allIslands.filter(i => {
      const distSq = Math.pow(i.x - 500, 2) + Math.pow(i.y - 500, 2);
      const outside = distSq > 250 * 250;
      const hasTowns = populatedSet.has(`${i.x},${i.y}`);
      const emptyRock = i.availableTowns === 0 && !hasTowns;
      return outside || emptyRock;
    }).map(i => i.id);

    console.log(`Deleting ${toDelete.length} islands in world ${worldId}...`);

    for (let i = 0; i < toDelete.length; i += 10000) {
      const chunk = toDelete.slice(i, i + 10000);
      await prisma.island.deleteMany({
        where: {
          worldId,
          id: { in: chunk }
        }
      });
      console.log(`Deleted chunk ${i} in world ${worldId}`);
    }

    return NextResponse.json({ success: true, deleted: toDelete.length, worldId });
  } catch (error) {
    console.error("DELETE /api/world/clean error:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
