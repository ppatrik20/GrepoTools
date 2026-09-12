import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies
} from '@/lib/auth/tokens';
import { logAuditEvent } from '@/lib/auth/audit';
import { extractClientIp, extractUserAgent, buildTeamMembershipPayload } from '@/lib/auth/rbac';

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

    // 2. Lookup or create User
    let user = await prisma.user.findFirst({
      where: {
        username: {
          equals: username,
          mode: 'insensitive'
        }
      }
    });

    if (user) {
      // Existing user claiming an additional team or world: verify password
      const isMatch = await verifyPassword(password, user.passwordHash);
      if (!isMatch) {
        return NextResponse.json(
          { error: 'Account already exists for this player name. Provided password does not match existing account.' },
          { status: 401 }
        );
      }
    } else {
      // New user registration
      const passwordHash = await hashPassword(password);
      user = await prisma.user.create({
        data: {
          username,
          passwordHash,
          globalRole: 'USER',
          isActive: true
        }
      });
    }

    // 3. Resolve In-Game Grepolis Player ID from World
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

    // 4. Generate unique verification code e.g. "GP-742918"
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const verificationCode = `GP-${randomSuffix}`;

    // 5. Upsert TeamMember record (preserving verified status if already verified)
    const existingMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: invite.teamId,
          userId: user.id
        }
      }
    });

    let member;
    if (existingMember) {
      const keepVerified = existingMember.verificationStatus === 'VERIFIED';
      member = await prisma.teamMember.update({
        where: { id: existingMember.id },
        data: {
          role: invite.role,
          playerId,
          playerName: player.name || username,
          verificationCode: keepVerified ? existingMember.verificationCode : verificationCode,
          verificationStatus: keepVerified ? 'VERIFIED' : 'UNVERIFIED',
          verifiedAt: keepVerified ? existingMember.verifiedAt : null
        },
        include: { team: true }
      });
    } else {
      member = await prisma.teamMember.create({
        data: {
          teamId: invite.teamId,
          userId: user.id,
          worldId: invite.worldId,
          role: invite.role,
          playerId,
          playerName: player.name || username,
          verificationCode,
          verificationStatus: 'UNVERIFIED'
        },
        include: { team: true }
      });
    }

    // 5.5 Assign pre-assigned custom roles from invitation if present
    if (Array.isArray(invite.customRoleIds) && invite.customRoleIds.length > 0) {
      for (const customRoleId of invite.customRoleIds) {
        await prisma.teamMemberRoleAssignment.upsert({
          where: {
            memberId_customRoleId: {
              memberId: member.id,
              customRoleId
            }
          },
          update: {},
          create: {
            memberId: member.id,
            customRoleId
          }
        }).catch(() => {});
      }
    }

    // 6. Update invite usage
    await prisma.invite.update({
      where: { id: invite.id },
      data: {
        usedCount: { increment: 1 }
      }
    });

    // 7. Record Audit Log
    await logAuditEvent({
      userId: user.id,
      actorUsername: user.username,
      action: 'USER_REGISTERED_VIA_INVITE',
      targetResource: `team:${invite.teamId}`,
      ipAddress,
      userAgent,
      status: 'SUCCESS',
      details: {
        teamId: invite.teamId,
        worldId: invite.worldId,
        role: invite.role,
        verificationCode
      }
    });

    // 8. Fetch updated team memberships with custom roles for JWT session
    const allMemberships = await prisma.teamMember.findMany({
      where: { userId: user.id },
      include: {
        team: true,
        customRoles: {
          include: {
            customRole: true
          }
        }
      }
    });

    const teams = buildTeamMembershipPayload(allMemberships);

    // 9. Generate dual tokens and set auth cookies
    const accessToken = await generateAccessToken({
      sub: user.id,
      username: user.username,
      globalRole: user.globalRole,
      teams
    });

    const { rawToken, tokenHash, expiresAt } = generateRefreshToken();
    const familyId = crypto.randomUUID();

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        familyId,
        expiresAt,
        ipAddress,
        userAgent
      }
    });

    const response = NextResponse.json({
      success: true,
      message: 'Account registered successfully. Please verify your town in-game.',
      verificationCode,
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
      { error: 'Internal server error during registration: ' + err.message },
      { status: 500 }
    );
  }
}
