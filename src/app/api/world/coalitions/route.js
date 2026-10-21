import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseSchema } from '@/lib/dbBootstrap';
import { requireAuth } from '@/lib/auth/rbac';

export const dynamic = 'force-dynamic';

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
    await ensureDatabaseSchema();

    const dbCoalitions = await prisma.coalition.findMany({
      where: { worldId },
      orderBy: { name: 'asc' }
    });

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
  const auth = await requireAuth(request);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    await ensureDatabaseSchema();

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

    const dedupedByName = new Map();
    for (const raw of inputList) {
      const item = normalizeCoalitionInput(raw);
      if (item.name.length > 0 && (item.alliances.length > 0 || item.allianceIds.length > 0)) {
        dedupedByName.set(item.name.toLowerCase(), item);
      }
    }
    const inputNormalized = Array.from(dedupedByName.values());

    const savedCoalitions = await prisma.$transaction(async (tx) => {
      await tx.coalition.deleteMany({
        where: { worldId }
      });

      if (inputNormalized.length > 0) {
        await tx.coalition.createMany({
          data: inputNormalized.map(item => ({
            id: item.id || crypto.randomUUID(),
            worldId,
            name: item.name,
            color: item.color,
            allianceIds: item.allianceIds,
            alliances: item.alliances
          })),
          skipDuplicates: true
        });
      }

      return await tx.coalition.findMany({
        where: { worldId },
        orderBy: { name: 'asc' }
      });
    });

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
  const auth = await requireAuth(request);
  if (!auth.authorized) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const worldId = (searchParams.get('world') || 'hu119').toLowerCase();

  if (!id) {
    return NextResponse.json({ success: false, error: 'Coalition ID required' }, { status: 400 });
  }

  try {
    await ensureDatabaseSchema();

    await prisma.coalition.delete({
      where: { id }
    });

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
