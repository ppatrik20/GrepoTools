import { prisma } from '../src/lib/prisma.js';
import { ensureDatabaseSchema } from '../src/lib/dbBootstrap.js';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {}
}

async function main() {
  console.log('[ensure-schema] Verifying PostgreSQL database schema columns & sync tables...');
  await ensureDatabaseSchema(prisma);
  console.log('[ensure-schema] Database schema is verified and up-to-date!');
  process.exit(0);
}

main().catch(err => {
  console.error('[ensure-schema] Error during schema verification:', err);
  process.exit(1);
});
