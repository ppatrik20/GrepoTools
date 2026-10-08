import { prisma as defaultPrisma } from '@/lib/prisma';
import { logAuditEvent, AUDIT_ACTIONS } from './audit';

/**
 * TownVerificationEngine: Domain Seam for Operative Town Rename Identity Verification
 * Consolidates verification criteria and audit event generation across background sync and on-demand handshakes.
 */
export const TownVerificationEngine = {
  /**
   * Pure evaluation verifying whether a town's name embeds the operative's verification code.
   * Case-insensitive substring matching.
   * 
   * @param {string} townName 
   * @param {string} verificationCode 
   * @returns {boolean}
   */
  isTownVerificationMatch(townName, verificationCode) {
    if (!townName || !verificationCode) return false;
    const cleanTown = String(townName).trim().toLowerCase();
    const cleanCode = String(verificationCode).trim().toLowerCase();
    if (!cleanCode) return false;
    return cleanTown.includes(cleanCode);
  },

  /**
   * Coordinates in-game town rename verification scanning, promotion, and audit trail recording.
   * 
   * @param {object} params
   * @param {string} [params.worldId] Scopes check to a specific world
   * @param {string} [params.userId] Scopes check to a specific user
   * @param {object} [params.prismaClient=defaultPrisma]
   * @param {string} [params.method='SYNC_AUTOMATIC'] 'SYNC_AUTOMATIC' | 'ON_DEMAND_CHECK'
   * @param {object} [params.actorContext] { ipAddress, userAgent, actorUsername }
   * @returns {Promise<{ verifiedCount: number, verifiedMembers: object[], verifiedTowns: object[] }>}
   */
  async executeTownVerificationCheck({
    worldId,
    userId,
    prismaClient = defaultPrisma,
    method = 'SYNC_AUTOMATIC',
    actorContext = {}
  }) {
    const where = {
      verificationStatus: 'UNVERIFIED',
      ...(worldId ? { worldId } : {}),
      ...(userId ? { userId } : {})
    };

    const unverifiedMembers = await prismaClient.teamMember.findMany({
      where,
      include: { user: true, team: true }
    });

    if (!unverifiedMembers || unverifiedMembers.length === 0) {
      return { verifiedCount: 0, verifiedMembers: [], verifiedTowns: [] };
    }

    let verifiedCount = 0;
    const verifiedMembers = [];
    const verifiedTowns = [];

    for (const member of unverifiedMembers) {
      if (!member.verificationCode || !member.playerId) continue;

      const matchingTown = await prismaClient.town.findFirst({
        where: {
          worldId: member.worldId,
          playerId: member.playerId,
          name: {
            contains: member.verificationCode
          }
        }
      });

      if (matchingTown) {
        const verifiedAt = new Date();

        await prismaClient.teamMember.update({
          where: { id: member.id },
          data: {
            verificationStatus: 'VERIFIED',
            verifiedAt
          }
        });

        const actorUsername = actorContext.actorUsername || member.user?.username || member.playerName;

        await logAuditEvent({
          userId: member.userId,
          actorUsername,
          action: AUDIT_ACTIONS.TOWN_VERIFIED,
          targetResource: `town:${matchingTown.id}`,
          ipAddress: actorContext.ipAddress || null,
          userAgent: actorContext.userAgent || null,
          status: 'SUCCESS',
          prismaClient,
          details: {
            worldId: member.worldId,
            playerId: member.playerId,
            townId: matchingTown.id,
            townName: matchingTown.name,
            verificationCode: member.verificationCode,
            method
          }
        });

        verifiedCount++;
        verifiedMembers.push({ ...member, verifiedAt });
        verifiedTowns.push({
          id: matchingTown.id,
          name: matchingTown.name,
          worldId: member.worldId,
          playerId: member.playerId
        });

        console.log(`[TownVerificationEngine] Verified operative "${member.playerName}" on world [${member.worldId}] via town "${matchingTown.name}" (${method})`);
      }
    }

    return { verifiedCount, verifiedMembers, verifiedTowns };
  }
};
