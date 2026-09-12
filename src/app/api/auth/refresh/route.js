import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  extractTokensFromRequest,
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  setAuthCookies,
  clearAuthCookies
} from '@/lib/auth/tokens';
import { logAuditEvent } from '@/lib/auth/audit';
import { extractClientIp, extractUserAgent, buildTeamMembershipPayload } from '@/lib/auth/rbac';

export async function POST(request) {
  const ipAddress = extractClientIp(request);
  const userAgent = extractUserAgent(request);

  try {
    let { refreshToken } = extractTokensFromRequest(request);

    // Fallback: check if refresh token was supplied in request body
    if (!refreshToken) {
      const body = await request.json().catch(() => ({}));
      if (body?.refreshToken && typeof body.refreshToken === 'string') {
        refreshToken = body.refreshToken;
      }
    }

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token required', code: 'REFRESH_TOKEN_REQUIRED' },
        { status: 401 }
      );
    }

    const tokenHash = hashRefreshToken(refreshToken);

    // Atomically find, validate, and rotate the refresh token in a single transaction
    const rotateResult = await prisma.$transaction(async (tx) => {
      // 1. Check if token exists
      const existing = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
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
          }
        }
      });

      if (!existing) {
        return { error: 'Invalid refresh token', code: 'TOKEN_NOT_FOUND', status: 401 };
      }

      // 2. Replay attack detection: if token is already revoked, invalidate entire token family
      if (existing.isRevoked) {
        await tx.refreshToken.updateMany({
          where: { familyId: existing.familyId },
          data: { isRevoked: true }
        });

        return {
          error: 'Replay attack detected. Token family invalidated for security.',
          code: 'TOKEN_REUSE_DETECTED',
          status: 401,
          familyId: existing.familyId,
          userId: existing.userId,
          username: existing.user?.username
        };
      }

      // 3. Atomically revoke the token using optimistic conditional update.
      // If a concurrent request raced and revoked it first, updateMany returns count === 0.
      const updated = await tx.refreshToken.updateMany({
        where: { id: existing.id, isRevoked: false },
        data: { isRevoked: true }
      });

      if (updated.count === 0) {
        // Concurrently raced! Invalidate entire family as reuse attempt
        await tx.refreshToken.updateMany({
          where: { familyId: existing.familyId },
          data: { isRevoked: true }
        });

        return {
          error: 'Replay attack detected. Token family invalidated for security.',
          code: 'TOKEN_REUSE_DETECTED',
          status: 401,
          familyId: existing.familyId,
          userId: existing.userId,
          username: existing.user?.username
        };
      }

      // 4. Expiration check
      if (existing.expiresAt < new Date()) {
        return { error: 'Refresh token expired', code: 'TOKEN_EXPIRED', status: 401 };
      }

      // 5. Check user state
      const user = existing.user;
      if (!user || !user.isActive) {
        return { error: 'Account inactive', code: 'USER_INACTIVE', status: 403 };
      }

      // 6. Issue new refresh token within same family lineage
      const newRefresh = generateRefreshToken();
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newRefresh.tokenHash,
          familyId: existing.familyId,
          expiresAt: newRefresh.expiresAt,
          ipAddress,
          userAgent
        }
      });

      return {
        success: true,
        user,
        familyId: existing.familyId,
        newRefresh
      };
    });

    if (!rotateResult.success) {
      if (rotateResult.code === 'TOKEN_REUSE_DETECTED') {
        await logAuditEvent({
          userId: rotateResult.userId,
          actorUsername: rotateResult.username,
          action: 'AUTH_TOKEN_REUSE_DETECTED',
          targetResource: `family:${rotateResult.familyId}`,
          ipAddress,
          userAgent,
          status: 'WARNING',
          details: { familyId: rotateResult.familyId }
        });
      }

      const res = NextResponse.json(
        { error: rotateResult.error, code: rotateResult.code },
        { status: rotateResult.status }
      );
      clearAuthCookies(res);
      return res;
    }

    const { user, familyId, newRefresh } = rotateResult;

    // 6. Generate fresh access token with current teams and capability permissions
    const teams = buildTeamMembershipPayload(user.teamMemberships || []);

    const newAccessToken = await generateAccessToken({
      sub: user.id,
      username: user.username,
      globalRole: user.globalRole,
      teams
    });

    await logAuditEvent({
      userId: user.id,
      actorUsername: user.username,
      action: 'AUTH_TOKEN_ROTATED',
      targetResource: `user:${user.id}`,
      ipAddress,
      userAgent,
      status: 'SUCCESS',
      details: { familyId }
    });

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
      accessToken: newAccessToken,
      refreshToken: newRefresh.rawToken
    });

    return response;
  } catch (err) {
    console.error('Error during token refresh:', err);
    return NextResponse.json(
      { error: 'Internal error during token refresh' },
      { status: 500 }
    );
  }
}
