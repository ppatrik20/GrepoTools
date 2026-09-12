#!/bin/sh
set -e

echo "=========================================================="
echo "  GrepoTools Container Startup & Initialization"
echo "=========================================================="

# 1. Non-destructively push Prisma schema changes to PostgreSQL
if [ -f "node_modules/prisma/build/index.js" ]; then
  echo "[Startup 1/2] Synchronizing database schema via Prisma..."
  node node_modules/prisma/build/index.js db push --skip-generate || {
    echo "[Startup Warning] Prisma schema push encountered an issue. Proceeding with application launch..."
  }
else
  echo "[Startup Warning] Prisma CLI binary not found in node_modules/prisma."
fi

# 2. Ensure initial Global Admin exists
if [ -f "scripts/create-admin.js" ]; then
  echo "[Startup 2/2] Checking Global Admin account..."
  node scripts/create-admin.js --ensure || {
    echo "[Startup Warning] Admin initialization script failed. Continuing startup..."
  }
fi

echo "=========================================================="
echo "  Launching GrepoTools Application Process"
echo "=========================================================="

exec "$@"
