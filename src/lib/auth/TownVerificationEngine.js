import { prisma as defaultPrisma } from '../prisma.js';
import { logAuditEvent, AUDIT_ACTIONS } from './audit.js';

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

    // Batch-fetch candidate towns when findMany is available to eliminate N+1 queries
    const hasBatchTownQuery = typeof prismaClient.town?.findMany === 'function';
    let candidateTowns = [];

    if (hasBatchTownQuery) {
      const targetTownIds = Array.from(
        new Set(unverifiedMembers.map(m => m.targetTownId).filter(Boolean))
      );
      const candidatePlayerIds = Array.from(
        new Set(unverifiedMembers.map(m => m.playerId).filter(Boolean))
      );
      const candidateWorldIds = Array.from(
        new Set(unverifiedMembers.map(m => m.worldId).filter(Boolean))
      );
      const resolvedWorldFilter = worldId
        ? { worldId }
        : candidateWorldIds.length === 1
          ? { worldId: candidateWorldIds[0] }
          : candidateWorldIds.length > 1
            ? { worldId: { in: candidateWorldIds } }
            : {};

      if (targetTownIds.length > 0 && candidatePlayerIds.length === 0) {
        candidateTowns = await prismaClient.town.findMany({
          where: {
            ...resolvedWorldFilter,
            id: { in: targetTownIds }
          },
          select: { id: true, name: true, points: true, worldId: true, playerId: true }
        });
      } else if (candidatePlayerIds.length > 0) {
        candidateTowns = await prismaClient.town.findMany({
          where: {
            ...resolvedWorldFilter,
            ...(targetTownIds.length > 0 ? { id: { in: targetTownIds } } : {}),
            playerId: { in: candidatePlayerIds }
          },
          select: { id: true, name: true, points: true, worldId: true, playerId: true }
        });
      }
    }

    for (const member of unverifiedMembers) {
      if (!member.verificationCode || (!member.playerId && !member.targetTownId)) continue;

      let matchingTown = null;
      if (hasBatchTownQuery) {
        matchingTown = candidateTowns.find(t => {
          if (member.worldId && t.worldId && t.worldId !== member.worldId) return false;
          if (member.targetTownId && t.id !== member.targetTownId) return false;
          if (member.playerId && t.playerId !== undefined && t.playerId !== member.playerId) return false;
          return this.isTownVerificationMatch(t.name, member.verificationCode);
        }) || null;
      } else if (typeof prismaClient.town?.findFirst === 'function') {
        matchingTown = await prismaClient.town.findFirst({
          where: {
            worldId: member.worldId,
            playerId: member.playerId,
            name: {
              contains: member.verificationCode
            }
          }
        });
      }

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
  },

  /**
   * Alias for background world sync town verification scanning.
   */
  async scanWorldForVerifiedTowns(worldIdOrParams, prismaClient = defaultPrisma) {
    if (typeof worldIdOrParams === 'string') {
      return this.executeTownVerificationCheck({
        worldId: worldIdOrParams,
        prismaClient,
        method: 'SYNC_AUTOMATIC'
      });
    }
    return this.executeTownVerificationCheck({
      prismaClient,
      ...(worldIdOrParams || {})
    });
  }
};
