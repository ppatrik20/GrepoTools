import { prisma } from '../prisma.js';
import { hashPassword } from './password.js';
import { logAuditEvent } from './audit.js';

/**
 * Ensures at least one GLOBAL_ADMIN account exists in the database.
 * Seeds initial credentials from environment variables if the user table is empty.
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
      'admin'
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
