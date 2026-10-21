import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  TEAM_MEMBERSHIP_INCLUDE,
  buildTeamMembershipPayload
} from '@/lib/auth/rbac';

export async function GET(request) {
  const auth = await requireAuth(request, { allowUnverified: true });
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      include: {
        teamMemberships: {
          include: TEAM_MEMBERSHIP_INCLUDE
        }
      }
    });

    if (!dbUser) {
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

    const teams = buildTeamMembershipPayload(dbUser.teamMemberships || []);

    return NextResponse.json({
      user: {
        id: dbUser.id,
        username: dbUser.username,
        globalRole: dbUser.globalRole,
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
