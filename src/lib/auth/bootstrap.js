import { prisma } from '../prisma.js';
import { hashPassword } from './password.js';
import { logAuditEvent } from './audit.js';

/**
 * Ensures at least one GLOBAL_ADMIN account exists in the database.
 * Seeds initial credentials and links default team membership from environment
 * variables if the user table is empty.
 *
 * @returns {Promise<object|null>}
 */
export async function ensureSuperAdmin() {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return null;
    }

    const username = (
      process.env.ROOT_ADMIN_USERNAME ||
      process.env.NEXT_PUBLIC_MASTER_PLAYER_NAME ||
      'perfi'
    ).trim();

    const plainPassword = (
      process.env.ROOT_ADMIN_PASSWORD ||
      process.env.ADMIN_PASSWORD ||
      'admin'
    ).trim();

    const passwordHash = await hashPassword(plainPassword);

    const admin = await prisma.user.create({
      data: {
        username,
        passwordHash,
        globalRole: 'GLOBAL_ADMIN',
        isActive: true
      }
    });

    // Try linking in-game player profile and default team
    try {
      const targetWorld = process.env.NEXT_PUBLIC_MASTER_WORLD || 'hu119';
      const players = await prisma.player.findMany({
        where: { name: { equals: username, mode: 'insensitive' } },
      });
      const matchedPlayer = players.find(p => p.worldId === targetWorld) || players[0];

      if (matchedPlayer) {
        const worldId = matchedPlayer.worldId;
        let team = await prisma.team.findFirst({
          where: { worldId }
        });

        if (!team) {
          team = await prisma.team.create({
            data: {
              name: 'Commanders',
              worldId,
              description: `Primary leadership team on ${worldId}`
            }
          });
        }

        await prisma.teamMember.upsert({
          where: { teamId_userId: { teamId: team.id, userId: admin.id } },
          update: {
            role: 'TEAM_ADMIN',
            verificationStatus: 'VERIFIED',
            verifiedAt: new Date(),
          },
          create: {
            teamId: team.id,
            userId: admin.id,
            worldId,
            role: 'TEAM_ADMIN',
            playerId: matchedPlayer.id,
            playerName: matchedPlayer.name,
            verificationCode: 'GP-BOOTSTRAP',
            verificationStatus: 'VERIFIED',
            verifiedAt: new Date(),
          }
        });
      }
    } catch (linkErr) {
      console.warn('[Bootstrap] Could not link player profile during bootstrap:', linkErr.message);
    }

    await logAuditEvent({
      userId: admin.id,
      actorUsername: admin.username,
      action: 'BOOTSTRAP_SUPERADMIN_INITIALIZED',
      targetResource: `user:${admin.id}`,
      status: 'SUCCESS',
      details: {
        username: admin.username,
        role: admin.globalRole
      }
    });

    console.log(`[Bootstrap] Initial Super Admin account created: "${username}"`);
    return admin;
  } catch (err) {
    console.error('[Bootstrap] Failed to ensure super admin:', err.message);
    return null;
  }
}
