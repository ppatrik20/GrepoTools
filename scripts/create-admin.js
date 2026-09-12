import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/auth/password.js';
import { logAuditEvent } from '../src/lib/auth/audit.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  node scripts/create-admin.js [password]     # Create or reset Global Admin password
  node scripts/create-admin.js --ensure        # Idempotent: creates only if admin doesn't exist
    `);
    process.exit(0);
  }

  const isEnsureMode = args.includes('--ensure');
  const passwordArg = args.find(a => !a.startsWith('--'));

  const username = (
    process.env.ROOT_ADMIN_USERNAME ||
    process.env.NEXT_PUBLIC_MASTER_PLAYER_NAME ||
    'perfi'
  ).trim();

  // Check if admin already exists
  const existingUser = await prisma.user.findFirst({
    where: {
      username: {
        equals: username,
        mode: 'insensitive'
      }
    }
  });

  if (isEnsureMode && existingUser) {
    console.log(`[Admin Setup] Global Admin account "${username}" already exists. Leaving credentials intact.`);
    return;
  }

  // Password resolution order:
  // 1. Explicit CLI argument
  // 2. NEW_ADMIN_PASSWORD env
  // 3. ROOT_ADMIN_PASSWORD env
  // 4. ADMIN_PASSWORD env
  // 5. If user exists and no password provided, keep existing password
  // 6. Default fallback 'admin'
  let rawPassword =
    passwordArg ||
    process.env.NEW_ADMIN_PASSWORD ||
    process.env.ROOT_ADMIN_PASSWORD ||
    process.env.ADMIN_PASSWORD;

  if (!rawPassword && existingUser) {
    console.log(`[Admin Setup] Admin account "${username}" exists and no new password was specified.`);
    return;
  }

  if (!rawPassword) {
    rawPassword = 'admin';
  }

  console.log(`\n======================================================`);
  console.log(`  GrepoTools Global Administrator Setup`);
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
  const targetWorld = process.env.NEXT_PUBLIC_MASTER_WORLD || 'hu119';
  const players = await prisma.player.findMany({
    where: { name: { equals: username, mode: 'insensitive' } },
  });

  const matchedPlayer = players.find(p => p.worldId === targetWorld) || players[0];

  if (matchedPlayer) {
    const worldId = matchedPlayer.worldId;
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
        playerId: matchedPlayer.id,
        playerName: matchedPlayer.name,
        verificationCode: 'GP-BOOTSTRAP',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
      },
    });
    console.log(`  Linked player ID ${matchedPlayer.id} (${matchedPlayer.name}) on ${worldId} as verified TEAM_ADMIN.`);
  } else {
    console.log(`  Note: In-game player record for "${username}" not yet in database. Profile link will occur on sync.`);
  }

  console.log(`[4/4] Recording security audit log...`);
  await logAuditEvent({
    userId: user.id,
    actorUsername: user.username,
    action: existingUser ? 'AUTH_ADMIN_PASSWORD_RESET' : 'BOOTSTRAP_SUPERADMIN_INITIALIZED',
    targetResource: `user:${user.id}`,
    status: 'SUCCESS',
    details: {
      username: user.username,
      globalRole: user.globalRole,
      method: isEnsureMode ? 'entrypoint_bootstrap' : 'cli_setup',
    },
  });

  console.log(`\n======================================================`);
  console.log(`  GLOBAL ADMIN ACCOUNT READY!`);
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
