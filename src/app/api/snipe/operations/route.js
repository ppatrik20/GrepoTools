import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetTownId = searchParams.get('targetTownId');
    const worldId = (searchParams.get('world') || 'hu119').toLowerCase();
    
    let whereClause = { worldId };
    if (targetTownId) {
      whereClause.targetTownId = parseInt(targetTownId, 10);
    }

    const operations = await prisma.snipeOperation.findMany({
      where: whereClause,
      include: {
        targetTown: { select: { name: true, islandX: true, islandY: true } },
        originTown: { select: { name: true, islandX: true, islandY: true } },
        user: { select: { id: true, username: true } }
      },
      orderBy: { sendTime: 'asc' }
    });

    return NextResponse.json(operations);
  } catch (error) {
    console.error("GET /api/snipe/operations error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { label, type, worldType, worldId = 'hu119', targetTownId, originTownId, targetReturnTime, landingTime, sendTime, recallTime, notes } = body;

    const effectiveTargetReturnTime = targetReturnTime || landingTime;
    const effectiveOriginTownId = originTownId || targetTownId;

    if (!label || !targetTownId || !effectiveOriginTownId || !effectiveTargetReturnTime || !sendTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const targetTownIdNum = parseInt(targetTownId, 10);
    const originTownIdNum = parseInt(effectiveOriginTownId, 10);
    if (isNaN(targetTownIdNum) || isNaN(originTownIdNum)) {
      return NextResponse.json({ error: 'Invalid town ID format' }, { status: 400 });
    }

    const returnDate = new Date(effectiveTargetReturnTime);
    const sendDate = new Date(sendTime);
    const recallDate = recallTime ? new Date(recallTime) : null;

    if (isNaN(returnDate.getTime()) || isNaN(sendDate.getTime()) || (recallDate && isNaN(recallDate.getTime()))) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    const normalizedWorldId = String(worldId).toLowerCase().trim();

    // Authenticate user on this world
    const auth = await requireAuth(request, { worldId: normalizedWorldId });
    if (!auth.authorized) {
      return auth.response;
    }

    const newOp = await prisma.snipeOperation.create({
      data: {
        worldId: normalizedWorldId,
        userId: auth.user.sub,
        label,
        type: type || "recall",
        worldType: worldType || "siege",
        targetTownId: targetTownIdNum,
        originTownId: originTownIdNum,
        targetReturnTime: returnDate,
        sendTime: sendDate,
        recallTime: recallDate,
        notes: notes || null,
        status: "PENDING"
      }
    });

    return NextResponse.json(newOp);
  } catch (error) {
    if (error?.code === 'P2003') {
      return NextResponse.json({ error: 'Referenced town or world does not exist in database' }, { status: 400 });
    }
    console.error("POST /api/snipe/operations error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing operation ID' }, { status: 400 });
    }

    const op = await prisma.snipeOperation.findUnique({
      where: { id }
    });

    if (!op) {
      return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
    }

    const auth = await requireAuth(request, { worldId: op.worldId });
    if (!auth.authorized) {
      return auth.response;
    }

    const isGlobalAdmin = auth.user.globalRole === 'GLOBAL_ADMIN';
    const isTeamAdmin = auth.member?.role === 'TEAM_ADMIN';
    const isCreator = op.userId && op.userId === auth.user.sub;

    if (!isGlobalAdmin && !isTeamAdmin && !isCreator) {
      return NextResponse.json(
        { error: 'Forbidden: You can only delete snipe operations created by yourself' },
        { status: 403 }
      );
    }

    await prisma.snipeOperation.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
    }
    console.error("DELETE /api/snipe/operations error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
