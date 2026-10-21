import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getBaselineTime } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get('id'), 10);
    const type = searchParams.get('type');
    const worldId = (searchParams.get('world') || 'hu119').toLowerCase();

    if (!id || !type || (type !== 'player' && type !== 'alliance')) {
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
    }

    const baseline = getBaselineTime();

    let history;
    if (type === 'player') {
      history = await prisma.playerHistory.findMany({
        where: { worldId, playerId: id, timestamp: { gte: baseline } },
        orderBy: { timestamp: 'asc' }
      });
    } else {
      history = await prisma.allianceHistory.findMany({
        where: { worldId, allianceId: id, timestamp: { gte: baseline } },
        orderBy: { timestamp: 'asc' }
      });
    }

    // Format the history into hourly deltas and cumulative totals
    let cumulativePts = 0;
    let cumulativeAbp = 0;
    let cumulativeDbp = 0;

    const formattedHistory = history.map(h => {
      const timeStr = h.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      
      const ptsDelta = h.newPoints - h.oldPoints;
      cumulativePts += ptsDelta;
      cumulativeAbp += h.abpDelta;
      cumulativeDbp += h.dbpDelta;

      return {
        time: timeStr,
        timestamp: h.timestamp,
        ptsDelta: ptsDelta,
        abpDelta: h.abpDelta,
        dbpDelta: h.dbpDelta,
        cumulativePts: cumulativePts,
        cumulativeAbp: cumulativeAbp,
        cumulativeDbp: cumulativeDbp
      };
    });

    return NextResponse.json({ worldId, history: formattedHistory });
  } catch (error) {
    console.error("Hourly History API Error:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
