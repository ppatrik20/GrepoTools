import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, buildTeamMembershipPayload } from '@/lib/auth/rbac';
import { generateAccessToken, setAuthCookies } from '@/lib/auth/tokens';
import { logAuditEvent, AUDIT_ACTIONS } from '@/lib/auth/audit';
import { TownVerificationEngine } from '@/lib/auth/TownVerificationEngine';

export async function POST(request) {
  const auth = await requireAuth(request, { allowUnverified: true });
  if (!auth.authorized) {
    return auth.response;
  }

  const { user, ipAddress, userAgent } = auth;

  try {
    const body = await request.json().catch(() => ({}));
    const { worldId } = body;

    // Fetch user's team memberships
    const whereClause = {
      userId: user.sub,
      ...(worldId ? { worldId } : {})
    };

    const memberships = await prisma.teamMember.findMany({
      where: whereClause,
      include: { team: true }
    });

    if (memberships.length === 0) {
      return NextResponse.json(
        { success: false, verified: false, error: 'No team memberships found' },
        { status: 404 }
      );
    }

    const unverified = memberships.filter(m => m.verificationStatus === 'UNVERIFIED');
    if (unverified.length === 0) {
      return NextResponse.json({
        success: true,
        verified: true,
        message: 'All team memberships are already verified'
      });
    }

    const verificationResult = await TownVerificationEngine.executeTownVerificationCheck({
      worldId,
      userId: user.sub,
      prismaClient: prisma,
      method: 'ON_DEMAND_CHECK',
      actorContext: {
        ipAddress,
        userAgent,
        actorUsername: user.username
      }
    });

    const verifiedCount = verificationResult.verifiedCount;
    const verifiedTown = verificationResult.verifiedTowns[0] || null;

    if (verifiedCount > 0) {
      // Re-query all memberships to generate updated access token
      const updatedMemberships = await prisma.teamMember.findMany({
        where: { userId: user.sub },
        include: {
          team: true,
          customRoles: {
            include: {
              customRole: true
            }
          }
        }
      });

      const teams = buildTeamMembershipPayload(updatedMemberships);

      const newAccessToken = await generateAccessToken({
        sub: user.sub,
        username: user.username,
        globalRole: user.globalRole,
        teams
      });

      const response = NextResponse.json({
        success: true,
        verified: true,
        message: 'Town verification successful! Full tactical features are now unlocked.',
        town: verifiedTown,
        teams
      });

      setAuthCookies(response, { accessToken: newAccessToken });
      return response;
    }

    // No matching town found
    const codesNeeded = unverified.map(m => m.verificationCode).join(', ');
    await logAuditEvent({
      userId: user.sub,
      actorUsername: user.username,
      action: 'TOWN_VERIFICATION_CHECK_FAILED',
      targetResource: `user:${user.sub}`,
      ipAddress,
      userAgent,
      status: 'FAILURE',
      details: {
        codesChecked: unverified.map(m => ({
          worldId: m.worldId,
          playerId: m.playerId,
          code: m.verificationCode
        }))
      }
    });

    return NextResponse.json({
      success: false,
      verified: false,
      message: `No town containing "${codesNeeded}" was found. Please make sure you renamed a town on the server and that the latest data has synced.`
    });

  } catch (err) {
    console.error('Error during town verification check:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred during verification check. Please try again later.' },
      { status: 500 }
    );
  }
}
