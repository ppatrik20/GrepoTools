import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

let isTableEnsured = false;

async function ensureCoalitionTable() {
  if (isTableEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Coalition" (
        "id" TEXT NOT NULL,
        "worldId" TEXT NOT NULL DEFAULT 'hu119',
        "name" TEXT NOT NULL,
        "color" TEXT NOT NULL DEFAULT '#10b981',
        "allianceIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
        "alliances" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Coalition_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Coalition_worldId_name_key" ON "Coalition"("worldId", "name");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Coalition_worldId_idx" ON "Coalition"("worldId");`);
    isTableEnsured = true;
  } catch (err) {
    console.warn("Could not auto-ensure Coalition table via raw SQL:", err);
  }
}

function normalizeCoalitionInput(c) {
  const name = (c.name || '').trim();
  const color = c.color || '#10b981';

  const allianceIds = new Set();
  const alliances = new Set();

  // If allianceIds array provided
  if (Array.isArray(c.allianceIds)) {
    c.allianceIds.forEach(id => {
      const num = parseInt(id, 10);
      if (!isNaN(num)) allianceIds.add(num);
    });
  }

  // If alliances array provided (could be names, objects, or numbers)
  if (Array.isArray(c.alliances)) {
    c.alliances.forEach(m => {
      if (typeof m === 'string') {
        const trimmed = m.trim();
        if (trimmed) alliances.add(trimmed);
      } else if (m && typeof m === 'object') {
        if (m.name) alliances.add(m.name.trim());
        if (m.id !== undefined && m.id !== null) {
          const num = parseInt(m.id, 10);
          if (!isNaN(num)) allianceIds.add(num);
        }
      } else if (typeof m === 'number') {
        allianceIds.add(m);
      }
    });
  }

  return {
    id: c.id && !c.id.startsWith('coalition_') ? c.id : undefined,
    name,
    color,
    allianceIds: Array.from(allianceIds),
    alliances: Array.from(alliances)
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const worldId = (searchParams.get('world') || 'hu119').toLowerCase();

  try {
    let dbCoalitions;
    try {
      dbCoalitions = await prisma.coalition.findMany({
        where: { worldId },
        orderBy: { name: 'asc' }
      });
    } catch (dbErr) {
      if (dbErr.code === 'P2021' || (dbErr.message && dbErr.message.includes('does not exist'))) {
        await ensureCoalitionTable();
        dbCoalitions = await prisma.coalition.findMany({
          where: { worldId },
          orderBy: { name: 'asc' }
        });
      } else {
        throw dbErr;
      }
    }

    const coalitions = dbCoalitions.map(c => ({
      id: c.id,
      worldId: c.worldId,
      name: c.name,
      color: c.color,
      allianceIds: c.allianceIds,
      alliances: c.alliances,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }));

    return NextResponse.json({ success: true, worldId, coalitions });
  } catch (error) {
    console.error("Coalitions API GET Error:", error);
    // Graceful fallback to empty list instead of 500 if database table is not ready
    return NextResponse.json({ 
      success: true, 
      worldId, 
      coalitions: [], 
      warning: "Database table not ready; returning empty coalitions list" 
    });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const worldId = (body.worldId || 'hu119').toLowerCase();
    const inputList = Array.isArray(body.coalitions) ? body.coalitions : [];

    // Ensure world exists before attaching foreign key
    await prisma.world.upsert({
      where: { id: worldId },
      update: {},
      create: {
        id: worldId,
        name: worldId.toUpperCase(),
        server: worldId
      }
    });

    const executeSync = async () => {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.coalition.findMany({
          where: { worldId }
        });
        const existingMap = new Map(existing.map(e => [e.id, e]));

        const inputNormalized = inputList
          .map(normalizeCoalitionInput)
          .filter(c => c.name.length > 0 && (c.alliances.length > 0 || c.allianceIds.length > 0));

        const incomingIds = new Set();

        // Upsert / Create
        const results = [];
        for (const item of inputNormalized) {
          if (item.id && existingMap.has(item.id)) {
            // Update existing
            incomingIds.add(item.id);
            const updated = await tx.coalition.update({
              where: { id: item.id },
              data: {
                name: item.name,
                color: item.color,
                allianceIds: item.allianceIds,
                alliances: item.alliances
              }
            });
            results.push(updated);
          } else {
            // Check by name in case of rename or collision
            const byName = existing.find(e => e.name.toLowerCase() === item.name.toLowerCase());
            if (byName) {
              incomingIds.add(byName.id);
              const updated = await tx.coalition.update({
                where: { id: byName.id },
                data: {
                  color: item.color,
                  allianceIds: item.allianceIds,
                  alliances: item.alliances
                }
              });
              results.push(updated);
            } else {
              // Create fresh
              const created = await tx.coalition.create({
                data: {
                  worldId,
                  name: item.name,
                  color: item.color,
                  allianceIds: item.allianceIds,
                  alliances: item.alliances
                }
              });
              incomingIds.add(created.id);
              results.push(created);
            }
          }
        }

        // Delete removed coalitions
        const toDelete = existing.filter(e => !incomingIds.has(e.id));
        if (toDelete.length > 0) {
          await tx.coalition.deleteMany({
            where: { id: { in: toDelete.map(d => d.id) } }
          });
        }

        return results;
      });
    };

    let savedCoalitions;
    try {
      savedCoalitions = await executeSync();
    } catch (syncErr) {
      if (syncErr.code === 'P2021' || (syncErr.message && syncErr.message.includes('does not exist'))) {
        await ensureCoalitionTable();
        savedCoalitions = await executeSync();
      } else {
        throw syncErr;
      }
    }

    return NextResponse.json({
      success: true,
      worldId,
      coalitions: savedCoalitions
    });
  } catch (error) {
    console.error("Coalitions API POST Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const worldId = (searchParams.get('world') || 'hu119').toLowerCase();

  if (!id) {
    return NextResponse.json({ success: false, error: 'Coalition ID required' }, { status: 400 });
  }

  try {
    try {
      await prisma.coalition.delete({
        where: { id }
      });
    } catch (delErr) {
      if (delErr.code === 'P2021' || (delErr.message && delErr.message.includes('does not exist'))) {
        await ensureCoalitionTable();
      } else {
        throw delErr;
      }
    }

    const remaining = await prisma.coalition.findMany({
      where: { worldId },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json({ success: true, worldId, coalitions: remaining });
  } catch (error) {
    console.error("Coalitions API DELETE Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
