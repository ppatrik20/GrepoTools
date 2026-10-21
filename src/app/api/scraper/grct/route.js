import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/rbac';
import {
  digestBattleReport,
  validateGrctReportUrl,
} from '@/lib/reports/BattleReportDigester';
import { filterReportsBySearch } from '@/lib/reports/ReportOperationsAdapter';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { url, rawText, worldId = 'hu119' } = await request.json();

    const targetWorld = String(worldId || 'hu119').toLowerCase().trim();
    if (!/^[a-z0-9]+$/.test(targetWorld)) {
      return NextResponse.json(
        { error: 'Invalid worldId parameter' },
        { status: 400 }
      );
    }

    if (!url && (!rawText || !String(rawText).trim())) {
      return NextResponse.json(
        { error: 'Please provide either a GRCT report URL or raw report text' },
        { status: 400 }
      );
    }

    if (url) {
      const validation = validateGrctReportUrl(url);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
    }

    const auth = await requireAuth(request, { allowUnverified: true });
    if (!auth.authorized) {
      return auth.response;
    }

    let digested;
    try {
      digested = await digestBattleReport({ url, rawText, worldId: targetWorld });
    } catch (digestError) {
      const status = digestError.status || 400;
      return NextResponse.json({ error: digestError.message }, { status });
    }

    const reportData = {
      worldId: digested.worldId,
      originalId: digested.originalId,
      attacker: digested.attackerName,
      defender: digested.defenderName,
      date: digested.date,
      lootedWood: digested.wood,
      lootedStone: digested.stone,
      lootedIron: digested.iron,
      morale: digested.morale,
      luck: digested.luck,
      rawText: (digested.rawText || '').substring(0, 2000),
    };

    let report;
    if (digested.originalId) {
      const existing = await prisma.report.findFirst({
        where: {
          worldId: digested.worldId,
          originalId: digested.originalId,
        },
      });

      if (existing) {
        report = await prisma.report.update({
          where: { id: existing.id },
          data: reportData,
        });
      } else {
        report = await prisma.report.create({
          data: reportData,
        });
      }
    } else {
      report = await prisma.report.create({
        data: reportData,
      });
    }

    return NextResponse.json({
      success: true,
      report: {
        ...report,
        attackerTown: digested.attackerTown,
        defenderTown: digested.defenderTown,
        rawHtml: digested.rawHtml,
      },
    });
  } catch (error) {
    console.error('Scraper Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const worldId = (
      searchParams.get('world') ||
      searchParams.get('worldId') ||
      'hu119'
    )
      .toLowerCase()
      .trim();
    const search = (searchParams.get('search') || '').trim();

    if (!/^[a-z0-9]+$/.test(worldId)) {
      return NextResponse.json({ error: 'Invalid world parameter' }, { status: 400 });
    }

    const reports = await prisma.report.findMany({
      where: { worldId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const filtered = search ? filterReportsBySearch(reports, search) : reports;
    return NextResponse.json({ reports: filtered });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuth(request, { allowUnverified: true });
    if (!auth.authorized) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get('id');

    if (!idParam) {
      return NextResponse.json({ error: 'Missing report id parameter' }, { status: 400 });
    }

    const reportId = parseInt(idParam, 10);
    if (Number.isNaN(reportId)) {
      return NextResponse.json({ error: 'Invalid report id parameter' }, { status: 400 });
    }

    const existing = await prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    await prisma.report.delete({
      where: { id: reportId },
    });

    return NextResponse.json({ success: true, deletedId: reportId });
  } catch (error) {
    console.error('DELETE /api/scraper/grct error:', error);
    return NextResponse.json({ error: 'Failed to delete report' }, { status: 500 });
  }
}
