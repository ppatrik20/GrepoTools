import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/rbac';

export async function PUT(request, props) {
  try {
    const params = await props?.params;
    const id = params?.id;

    if (!id) {
      return NextResponse.json({ error: 'Missing operation ID' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: 'Missing status' }, { status: 400 });
    }

    const op = await prisma.snipeOperation.findUnique({
      where: { id }
    });

    if (!op) {
      return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
    }

    // Require authentication and membership on the operation's world
    const auth = await requireAuth(request, { worldId: op.worldId });
    if (!auth.authorized) {
      return auth.response;
    }

    const isGlobalAdmin = auth.user.globalRole === 'GLOBAL_ADMIN';
    const isTeamAdmin = auth.member?.role === 'TEAM_ADMIN';
    const isCreator = op.userId && op.userId === auth.user.sub;

    if (!isGlobalAdmin && !isTeamAdmin && !isCreator) {
      return NextResponse.json(
        { error: 'Forbidden: You can only update snipe operations created by yourself' },
        { status: 403 }
      );
    }

    const updatedOp = await prisma.snipeOperation.update({
      where: { id },
      data: { status }
    });

    return NextResponse.json(updatedOp);
  } catch (error) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
    }
    console.error(`PUT /api/snipe/operations error:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request, props) {
  try {
    const params = await props?.params;
    const id = params?.id;

    if (!id) {
      return NextResponse.json({ error: 'Missing operation ID' }, { status: 400 });
    }

    const op = await prisma.snipeOperation.findUnique({
      where: { id }
    });

    if (!op) {
      return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
    }

    // Require authentication and membership on the operation's world
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

    return NextResponse.json({ success: true, message: "Operation deleted successfully", id });
  } catch (error) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
    }
    console.error(`DELETE /api/snipe/operations error:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
