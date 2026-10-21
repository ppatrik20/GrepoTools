import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies
} from '@/lib/auth/tokens';
import { logAuditEvent, AUDIT_ACTIONS } from '@/lib/auth/audit';
import {
  extractClientIp,
  extractUserAgent,
  TEAM_MEMBERSHIP_INCLUDE,
  buildTeamMembershipPayload
} from '@/lib/auth/rbac';

export async function POST(request) {
  const ipAddress = extractClientIp(request);
  const userAgent = extractUserAgent(request);

  try {
    const body = await request.json().catch(() => ({}));
    const { token, password } = body;

    if (!token || typeof token !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Invite token and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // 1. Validate Invite
    const invite = await prisma.invite.findUnique({
      where: { token },
      include: {
        team: true,
        world: true
      }
    });

    if (!invite) {
      return NextResponse.json(
        { error: 'Invalid invite token' },
        { status: 404 }
      );
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'This invitation has expired' },
        { status: 410 }
      );
    }

    if (invite.usedCount >= invite.maxUses) {
      return NextResponse.json(
        { error: 'This invitation has already been redeemed' },
        { status: 410 }
      );
    }

    const username = invite.targetPlayerName.trim();

    // 2. Resolve In-Game Grepolis Player ID & candidate town BEFORE creating User
    const player = await prisma.player.findFirst({
      where: {
        worldId: invite.worldId,
        name: { equals: username, mode: 'insensitive' }
      }
    });

    if (!player) {
      return NextResponse.json(
        {
          error: `Player "${username}" was not found on world "${invite.worldId}". Please verify the world data has synced or contact your team administrator.`
        },
        { status: 400 }
      );
    }

    const playerId = player.id;
    const starterTown = typeof prisma.town?.findFirst === 'function'
      ? await prisma.town.findFirst({
          where: {
            worldId: invite.worldId,
            playerId
          },
          select: { id: true, name: true }
        }).catch(() => null)
      : null;

    // 3. Lookup existing user (and verify password) or hash password for new user
    const existingUser = await prisma.user.findFirst({
      where: {
        username: {
          equals: username,
          mode: 'insensitive'
        }
      }
    });

    let passwordHash = null;
    if (existingUser) {
      const isMatch = await verifyPassword(password, existingUser.passwordHash);
      if (!isMatch) {
        return NextResponse.json(
          { error: 'Account already exists for this player name. Provided password does not match existing account.' },
          { status: 401 }
        );
      }
    } else {
      passwordHash = await hashPassword(password);
    }

    // 4. Generate unique verification code e.g. "GP-742918" and refresh token
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const verificationCode = `GP-${randomSuffix}`;
    const { rawToken, tokenHash, expiresAt } = generateRefreshToken();
    const familyId = crypto.randomUUID();

    const existingMember = existingUser
      ? await prisma.teamMember.findUnique({
          where: {
            teamId_userId: {
              teamId: invite.teamId,
              userId: existingUser.id
            }
          }
        })
      : null;

    const keepVerified = existingMember?.verificationStatus === 'VERIFIED';
    const effectiveVerificationCode = keepVerified ? existingMember.verificationCode : verificationCode;

    // 5. Atomically create/resolve User, upsert TeamMember, assign custom roles, increment Invite, and persist RefreshToken
    const { user } = await prisma.$transaction(async (tx) => {
      const resolvedUser = existingUser
        ? existingUser
        : await tx.user.create({
            data: {
              username,
              passwordHash,
              globalRole: 'USER',
              isActive: true
            }
          });

      const member = await tx.teamMember.upsert({
        where: {
          teamId_userId: {
            teamId: invite.teamId,
            userId: resolvedUser.id
          }
        },
        update: {
          role: invite.role,
          playerId,
          playerName: player.name || username,
          verificationCode: effectiveVerificationCode,
          verificationStatus: keepVerified ? 'VERIFIED' : 'UNVERIFIED',
          verifiedAt: keepVerified ? existingMember.verifiedAt : null
        },
        create: {
          teamId: invite.teamId,
          userId: resolvedUser.id,
          worldId: invite.worldId,
          role: invite.role,
          playerId,
          playerName: player.name || username,
          verificationCode: effectiveVerificationCode,
          verificationStatus: 'UNVERIFIED'
        },
        include: { team: true }
      });

      if (Array.isArray(invite.customRoleIds) && invite.customRoleIds.length > 0) {
        await tx.teamMemberRoleAssignment.createMany({
          data: invite.customRoleIds.map(customRoleId => ({
            memberId: member.id,
            customRoleId
          })),
          skipDuplicates: true
        });
      }

      await tx.invite.update({
        where: { id: invite.id },
        data: {
          usedCount: { increment: 1 }
        }
      });

      await tx.refreshToken.create({
        data: {
          userId: resolvedUser.id,
          tokenHash,
          familyId,
          expiresAt,
          ipAddress,
          userAgent
        }
      });

      return { user: resolvedUser, member };
    });

    // 6. Record Audit Log
    await logAuditEvent({
      userId: user.id,
      actorUsername: user.username,
      action: AUDIT_ACTIONS.USER_REGISTERED_VIA_INVITE,
      targetResource: `team:${invite.teamId}`,
      ipAddress,
      userAgent,
      status: 'SUCCESS',
      details: {
        teamId: invite.teamId,
        worldId: invite.worldId,
        role: invite.role,
        verificationCode: effectiveVerificationCode,
        starterTownId: starterTown?.id ?? null
      }
    });

    // 7. Fetch updated team memberships with custom roles for JWT session
    const allMemberships = await prisma.teamMember.findMany({
      where: { userId: user.id },
      include: TEAM_MEMBERSHIP_INCLUDE
    });

    const teams = buildTeamMembershipPayload(allMemberships);

    // 8. Generate access token and set auth cookies
    const accessToken = await generateAccessToken({
      sub: user.id,
      username: user.username,
      globalRole: user.globalRole,
      teams
    });

    const response = NextResponse.json({
      success: true,
      message: 'Account registered successfully. Please verify your town in-game.',
      verificationCode: effectiveVerificationCode,
      user: {
        id: user.id,
        username: user.username,
        globalRole: user.globalRole,
        teams
      }
    });

    setAuthCookies(response, {
      accessToken,
      refreshToken: rawToken
    });

    return response;
  } catch (err) {
    console.error('Error during invite registration:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred during registration. Please try again later.' },
      { status: 500 }
    );
  }
}
