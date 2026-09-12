import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request, { params }) {
  try {
    const { token } = await params;

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { valid: false, error: 'Invite token is required' },
        { status: 400 }
      );
    }

    const invite = await prisma.invite.findUnique({
      where: { token },
      include: {
        team: true,
        world: true
      }
    });

    if (!invite) {
      return NextResponse.json(
        { valid: false, error: 'Invalid invite link or token does not exist' },
        { status: 404 }
      );
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json(
        { valid: false, error: 'This invitation has expired' },
        { status: 410 }
      );
    }

    if (invite.usedCount >= invite.maxUses) {
      return NextResponse.json(
        { valid: false, error: 'This invitation has already been redeemed' },
        { status: 410 }
      );
    }

    return NextResponse.json({
      valid: true,
      teamId: invite.teamId,
      teamName: invite.team?.name || 'Unknown Team',
      worldId: invite.worldId,
      worldName: invite.world?.name || invite.worldId,
      targetPlayerName: invite.targetPlayerName,
      role: invite.role,
      expiresAt: invite.expiresAt
    });
  } catch (err) {
    console.error('Error looking up invite token:', err);
    return NextResponse.json(
      { valid: false, error: 'Internal server error validating invite' },
      { status: 500 }
    );
  }
}
