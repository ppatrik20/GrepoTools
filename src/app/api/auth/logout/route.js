import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  extractTokensFromRequest,
  hashRefreshToken,
  clearAuthCookies
} from '@/lib/auth/tokens';
import { logAuditEvent } from '@/lib/auth/audit';
import { extractClientIp, extractUserAgent } from '@/lib/auth/rbac';

export async function POST(request) {
  const ipAddress = extractClientIp(request);
  const userAgent = extractUserAgent(request);

  try {
    const { refreshToken } = extractTokensFromRequest(request);

    let revokedUserId = null;
    let revokedUsername = null;

    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      const tokenRecord = await prisma.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: true }
      });

      if (tokenRecord) {
        revokedUserId = tokenRecord.userId;
        revokedUsername = tokenRecord.user?.username;

        await prisma.refreshToken.update({
          where: { id: tokenRecord.id },
          data: { isRevoked: true }
        });
      }
    }

    await logAuditEvent({
      userId: revokedUserId,
      actorUsername: revokedUsername,
      action: 'AUTH_LOGOUT',
      targetResource: revokedUserId ? `user:${revokedUserId}` : null,
      ipAddress,
      userAgent,
      status: 'SUCCESS'
    });

    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully'
    });

    clearAuthCookies(response);

    return response;
  } catch (err) {
    console.error('Error during logout:', err);
    const response = NextResponse.json({ success: true, message: 'Logged out' });
    clearAuthCookies(response);
    return response;
  }
}
