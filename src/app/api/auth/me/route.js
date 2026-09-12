import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/rbac';

export async function GET(request) {
  const auth = await requireAuth(request, { allowUnverified: true });
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      include: {
        teamMemberships: {
          include: {
            team: true,
            world: {
              select: { id: true, name: true, server: true }
            }
          }
        }
      }
    });

    if (!user) {
      if (auth.user.globalRole === 'GLOBAL_ADMIN') {
        return NextResponse.json({
          user: {
            id: auth.user.sub,
            username: auth.user.username,
            globalRole: 'GLOBAL_ADMIN',
            teams: []
          }
        });
      }
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const teams = (user.teamMemberships || []).map(m => ({
      membershipId: m.id,
      teamId: m.teamId,
      teamName: m.team?.name || 'Unknown Team',
      worldId: m.worldId,
      worldName: m.world?.name || m.worldId,
      role: m.role,
      playerId: m.playerId,
      playerName: m.playerName,
      verificationCode: m.verificationCode,
      status: m.verificationStatus,
      verifiedAt: m.verifiedAt
    }));

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        globalRole: user.globalRole,
        teams
      }
    });
  } catch (err) {
    console.error('Error fetching /api/auth/me:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
