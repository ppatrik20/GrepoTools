import crypto from 'crypto';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/auth/password.js';
import { logAuditEvent } from '../src/lib/auth/audit.js';

async function main() {
  const username = 'perfi';
  const customPassword = process.argv[2] || process.env.NEW_ADMIN_PASSWORD;
  const rawPassword = customPassword || crypto.randomBytes(18).toString('base64url');

  console.log(`\n======================================================`);
  console.log(`  GrepoTools Global Administrator Initialization`);
  console.log(`======================================================\n`);

  console.log(`[1/4] Hashing password with bcrypt (12 salt rounds)...`);
  const passwordHash = await hashPassword(rawPassword);

  console.log(`[2/4] Upserting user "${username}" as GLOBAL_ADMIN...`);
  const user = await prisma.user.upsert({
    where: { username },
    update: {
      passwordHash,
      globalRole: 'GLOBAL_ADMIN',
      isActive: true,
      failedLoginAttempts: 0,
      lockoutUntil: null,
    },
    create: {
      username,
      passwordHash,
      globalRole: 'GLOBAL_ADMIN',
      isActive: true,
    },
  });

  console.log(`[3/4] Linking in-game player profile and team permissions...`);
  const players = await prisma.player.findMany({
    where: { name: { equals: username, mode: 'insensitive' } },
  });

  const hu119Player = players.find(p => p.worldId === 'hu119') || players[0];

  if (hu119Player) {
    const worldId = hu119Player.worldId;
    let team = await prisma.team.findFirst({
      where: { worldId },
    });

    if (!team) {
      team = await prisma.team.create({
        data: {
          name: 'Commanders',
          worldId,
          description: `Primary leadership team on ${worldId}`,
        },
      });
      console.log(`  Created default team "${team.name}" on ${worldId}`);
    }

    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: user.id } },
      update: {
        role: 'TEAM_ADMIN',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
      },
      create: {
        teamId: team.id,
        userId: user.id,
        worldId,
        role: 'TEAM_ADMIN',
        playerId: hu119Player.id,
        playerName: hu119Player.name,
        verificationCode: 'GP-BOOTSTRAP',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
      },
    });
    console.log(`  Linked player ID ${hu119Player.id} (${hu119Player.name}) on ${worldId} as verified TEAM_ADMIN.`);
  }

  console.log(`[4/4] Recording security audit log...`);
  await logAuditEvent({
    userId: user.id,
    actorUsername: user.username,
    action: 'BOOTSTRAP_SUPERADMIN_INITIALIZED',
    targetResource: `user:${user.id}`,
    status: 'SUCCESS',
    details: {
      username: user.username,
      globalRole: user.globalRole,
      method: 'cli_bootstrap',
    },
  });

  console.log(`\n======================================================`);
  console.log(`  GLOBAL ADMIN ACCOUNT CREATED SUCCESSFULLY!`);
  console.log(`======================================================`);
  console.log(`  Username : ${user.username}`);
  console.log(`  Role     : ${user.globalRole}`);
  console.log(`  Password : ${rawPassword}`);
  console.log(`======================================================`);
  console.log(`  Save this password securely. You can log in now at /login.`);
  console.log(`======================================================\n`);
}

main()
  .catch((err) => {
    console.error('[Error] Failed to initialize admin account:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
