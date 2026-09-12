import { prisma } from '../prisma.js';

/**
 * Records an audit log event in the database.
 * Gracefully captures failures to prevent disruption of primary operations.
 *
 * @param {object} params
 * @param {string} [params.userId]
 * @param {string} [params.actorUsername]
 * @param {string} params.action - e.g. "AUTH_LOGIN_SUCCESS", "TOWN_VERIFIED", "TEAM_CREATED"
 * @param {string} [params.targetResource] - e.g. "team:uuid", "world:hu119", "user:Leonidas"
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @param {string} [params.status='SUCCESS'] - "SUCCESS" | "WARNING" | "FAILURE"
 * @param {object} [params.details] - Arbitrary JSON-serializable details
 * @returns {Promise<object|null>}
 */
export async function logAuditEvent({
  userId,
  actorUsername,
  action,
  targetResource,
  ipAddress,
  userAgent,
  status = 'SUCCESS',
  details = null
}) {
  try {
    return await prisma.auditLog.create({
      data: {
        userId: userId || null,
        actorUsername: actorUsername || null,
        action,
        targetResource: targetResource || null,
        ipAddress: ipAddress || null,
        userAgent: userAgent ? userAgent.substring(0, 500) : null,
        status,
        details: details || undefined
      }
    });
  } catch (err) {
    console.error('[AuditLog] Failed to record audit log:', err.message, { action, actorUsername });
    return null;
  }
}

/**
 * Retrieves paginated audit logs with optional filtering.
 *
 * @param {object} [filters]
 * @param {number} [filters.limit=50]
 * @param {number} [filters.offset=0]
 * @param {string} [filters.action]
 * @param {string} [filters.actorUsername]
 * @param {string} [filters.status]
 * @param {string} [filters.targetResource]
 * @returns {Promise<{ logs: object[], total: number }>}
 */
export async function getAuditLogs(filters = {}) {
  const {
    limit = 50,
    offset = 0,
    action,
    actorUsername,
    status,
    targetResource
  } = filters;

  const where = {};
  if (action) where.action = action;
  if (actorUsername) where.actorUsername = { contains: actorUsername, mode: 'insensitive' };
  if (status) where.status = status;
  if (targetResource) where.targetResource = { contains: targetResource, mode: 'insensitive' };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 200),
      skip: Math.max(Number(offset) || 0, 0),
      include: {
        user: {
          select: { id: true, username: true, globalRole: true }
        }
      }
    }),
    prisma.auditLog.count({ where })
  ]);

  return { logs, total };
}
