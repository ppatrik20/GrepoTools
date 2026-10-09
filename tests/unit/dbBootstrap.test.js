import { describe, test, expect, vi, beforeEach } from 'vitest';
import { ensureDatabaseSchema, resetDatabaseSchemaCache, SYNC_SCHEMA_STATEMENTS } from '../../src/lib/dbBootstrap.js';

describe('dbBootstrap: Schema Self-Healing & Verification', () => {
  beforeEach(() => {
    resetDatabaseSchemaCache();
  });

  test('ensureDatabaseSchema executes all required DDL statements on first call', async () => {
    const executedSql = [];
    const mockPrisma = {
      $executeRawUnsafe: vi.fn(async (sql) => {
        executedSql.push(sql);
        return 1;
      })
    };

    await ensureDatabaseSchema(mockPrisma);

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(SYNC_SCHEMA_STATEMENTS.length);
    expect(executedSql).toEqual(SYNC_SCHEMA_STATEMENTS);
  });

  test('ensureDatabaseSchema memoizes promise and avoids duplicate executions across multiple calls', async () => {
    const mockPrisma = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1)
    };

    await Promise.all([
      ensureDatabaseSchema(mockPrisma),
      ensureDatabaseSchema(mockPrisma),
      ensureDatabaseSchema(mockPrisma)
    ]);

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(SYNC_SCHEMA_STATEMENTS.length);
  });

  test('ensureDatabaseSchema catches statement errors gracefully without failing promise', async () => {
    const mockPrisma = {
      $executeRawUnsafe: vi.fn().mockRejectedValue(new Error('Syntax or permission warning'))
    };

    await expect(ensureDatabaseSchema(mockPrisma)).resolves.not.toThrow();
  });
});
