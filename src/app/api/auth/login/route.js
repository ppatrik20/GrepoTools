import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { verifyPassword, dummyVerify } from '@/lib/auth/password';
import {
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies
} from '@/lib/auth/tokens';
import { logAuditEvent } from '@/lib/auth/audit';
import { extractClientIp, extractUserAgent, buildTeamMembershipPayload } from '@/lib/auth/rbac';
import { ensureSuperAdmin } from '@/lib/auth/bootstrap';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request) {
  const ipAddress = extractClientIp(request);
  const userAgent = extractUserAgent(request);

  try {
    // Ensure Super Admin exists if DB was uninitialized
    await ensureSuperAdmin();

    const body = await request.json().catch(() => ({}));
    const { username, password } = body;

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const trimmedUsername = username.trim();

    // 1. Case-insensitive username lookup
    const user = await prisma.user.findFirst({
      where: {
        username: {
          equals: trimmedUsername,
          mode: 'insensitive'
        }
      },
      include: {
        teamMemberships: {
          include: {
            team: true,
            customRoles: {
              include: {
                customRole: true
              }
            }
          }
        }
      }
    });

    // 2. Mitigate username enumeration timing side-channel
    if (!user) {
      await dummyVerify(password);
      await logAuditEvent({
        actorUsername: trimmedUsername,
        action: 'AUTH_LOGIN_FAILED',
        targetResource: `username:${trimmedUsername}`,
        ipAddress,
        userAgent,
        status: 'FAILURE',
        details: { reason: 'USER_NOT_FOUND' }
      });

      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // 3. Check account lockout
    const now = new Date();
    if (user.lockoutUntil && user.lockoutUntil > now) {
      const remainingSeconds = Math.ceil((user.lockoutUntil.getTime() - now.getTime()) / 1000);
      await logAuditEvent({
        userId: user.id,
        actorUsername: user.username,
        action: 'AUTH_LOGIN_BLOCKED_LOCKOUT',
        targetResource: `user:${user.id}`,
        ipAddress,
        userAgent,
        status: 'WARNING',
        details: { remainingSeconds }
      });

      return NextResponse.json(
        {
          error: `Account is temporarily locked. Try again in ${Math.ceil(remainingSeconds / 60)} minutes.`,
          code: 'ACCOUNT_LOCKED',
          lockoutUntil: user.lockoutUntil
        },
        { status: 423 }
      );
    }

    // 4. Check if account is active
    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Account is deactivated. Contact system administrator.' },
        { status: 403 }
      );
    }

    // 5. Verify password
    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      const nextAttempts = user.failedLoginAttempts + 1;
      const isNowLocked = nextAttempts >= MAX_FAILED_ATTEMPTS;
      const newLockoutUntil = isNowLocked ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: nextAttempts,
          lockoutUntil: newLockoutUntil
        }
      });

      await logAuditEvent({
        userId: user.id,
        actorUsername: user.username,
        action: isNowLocked ? 'AUTH_ACCOUNT_LOCKED' : 'AUTH_LOGIN_FAILED',
        targetResource: `user:${user.id}`,
        ipAddress,
        userAgent,
        status: 'FAILURE',
        details: { attempts: nextAttempts, locked: isNowLocked }
      });

      if (isNowLocked) {
        return NextResponse.json(
          {
            error: 'Account locked due to 5 consecutive failed login attempts. Locked for 15 minutes.',
            code: 'ACCOUNT_LOCKED',
            lockoutUntil: newLockoutUntil
          },
          { status: 423 }
        );
      }

      return NextResponse.json(
        {
          error: 'Invalid username or password',
          attemptsRemaining: MAX_FAILED_ATTEMPTS - nextAttempts
        },
        { status: 401 }
      );
    }

    // 6. Reset failed attempts upon successful authentication
    if (user.failedLoginAttempts > 0 || user.lockoutUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockoutUntil: null
        }
      });
    }

    // 7. Assemble team memberships payload with custom roles and permissions
    const teams = buildTeamMembershipPayload(user.teamMemberships || []);

    const tokenPayload = {
      sub: user.id,
      username: user.username,
      globalRole: user.globalRole,
      teams
    };

    // 8. Generate dual tokens
    const accessToken = await generateAccessToken(tokenPayload);
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

    // 9. Record audit log
    await logAuditEvent({
      userId: user.id,
      actorUsername: user.username,
      action: 'AUTH_LOGIN_SUCCESS',
      targetResource: `user:${user.id}`,
      ipAddress,
      userAgent,
      status: 'SUCCESS',
      details: { role: user.globalRole, teamCount: teams.length }
    });

    // 10. Send response with cookies
    const response = NextResponse.json({
      success: true,
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
    console.error('Error during login:', err);

    if (err.message && (err.message.includes('relation "User" does not exist') || err.message.includes('relation "public.User" does not exist'))) {
      return NextResponse.json(
        { error: 'Database schema is not yet initialized. Please wait for schema synchronization or run prisma db push.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error during login' },
      { status: 500 }
    );
  }
}
