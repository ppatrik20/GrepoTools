import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/rbac';

export async function GET(request, { params }) {
  const auth = await requireAuth(request, { allowUnverified: true });
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id: teamId } = await params;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, username: true, globalRole: true, isActive: true }
            },
            customRoles: {
              include: {
                customRole: true
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const isGlobalAdmin = auth.user.globalRole === 'GLOBAL_ADMIN';
    const currentMember = team.members.find(m => m.userId === auth.user.sub);

    if (!isGlobalAdmin && !currentMember) {
      return NextResponse.json(
        { error: 'Forbidden: You are not a member of this team' },
        { status: 403 }
      );
    }

    const isTeamAdmin = isGlobalAdmin || currentMember?.role === 'TEAM_ADMIN';

    // Retrieve Grepolis in-game player statistics for all team members
    const playerIds = team.members.map(m => m.playerId).filter(Boolean);
    const players = await prisma.player.findMany({
      where: {
        worldId: team.worldId,
        id: { in: playerIds }
      },
      include: {
        alliance: {
          select: { id: true, name: true }
        }
      }
    });

    const playerMap = new Map(players.map(p => [p.id, p]));

    const enrichedMembers = team.members.map(m => {
      const pStats = playerMap.get(m.playerId);
      const isSelf = m.userId === auth.user.sub;

      const roles = (m.customRoles || [])
        .filter(r => r.customRole)
        .map(r => ({
          id: r.customRole.id,
          assignmentId: r.id,
          name: r.customRole.name,
          description: r.customRole.description,
          color: r.customRole.color || '#3B82F6',
          icon: r.customRole.icon || 'shield',
          priority: r.customRole.priority || 0,
          permissions: r.customRole.permissions || []
        }))
        .sort((a, b) => b.priority - a.priority);

      return {
        id: m.id,
        userId: m.userId,
        username: m.user?.username || 'Unknown',
        playerId: m.playerId,
        playerName: m.playerName,
        role: m.role,
        verificationStatus: m.verificationStatus,
        verificationCode: (isTeamAdmin || isSelf) ? m.verificationCode : undefined,
        verifiedAt: m.verifiedAt,
        createdAt: m.createdAt,
        points: pStats?.points ?? 0,
        townsCount: pStats?.towns ?? 0,
        rank: pStats?.rank ?? null,
        allianceName: pStats?.alliance?.name ?? 'No Alliance',
        allianceId: pStats?.allianceId ?? null,
        customRoles: roles
      };
    });

    return NextResponse.json({
      members: enrichedMembers
    });
  } catch (err) {
    console.error('Error fetching team members:', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}
