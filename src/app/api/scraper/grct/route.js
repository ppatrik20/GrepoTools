import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { url, rawText, worldId = 'hu119' } = await request.json();

    if (!url && !rawText) {
      return NextResponse.json({ error: 'Please provide either a GRCT report URL or raw report text' }, { status: 400 });
    }

    const targetWorld = String(worldId || 'hu119').toLowerCase().trim();
    if (!/^[a-z0-9]+$/.test(targetWorld)) {
      return NextResponse.json({ error: 'Invalid worldId parameter' }, { status: 400 });
    }

    let attacker = "Unknown Attacker";
    let defender = "Unknown Defender";
    let date = new Date();
    let lootedWood = 0;
    let lootedStone = 0;
    let lootedIron = 0;
    let morale = 100;
    let luck = 0;
    let reportId = null;
    let parsedText = rawText || '';

    if (url) {
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch (e) {
        return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
      }

      const allowedHostnames = ['www.grcrt.net', 'grcrt.net'];
      if (
        parsedUrl.protocol !== 'https:' ||
        !allowedHostnames.includes(parsedUrl.hostname.toLowerCase()) ||
        (parsedUrl.port && parsedUrl.port !== '443') ||
        parsedUrl.username ||
        parsedUrl.password
      ) {
        return NextResponse.json({ 
          error: 'Security validation failed: Only HTTPS requests to grcrt.net are allowed' 
        }, { status: 400 });
      }

      reportId = parsedUrl.searchParams.get('rep') || `rep_${Date.now()}`;

      let response;
      try {
        response = await fetch(parsedUrl.toString(), {
          signal: AbortSignal.timeout(10000)
        });
      } catch (fetchErr) {
        return NextResponse.json({ 
          error: `Network error contacting external report server: ${fetchErr.message}` 
        }, { status: 502 });
      }

      if (!response.ok) {
        return NextResponse.json({ 
          error: `Failed to fetch report from grcrt.net: HTTP ${response.status} ${response.statusText}` 
        }, { status: 502 });
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      parsedText = $('.quote_message').text() || html;

      // Extract date
      const dateMatch = parsedText.match(/\(\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}\)/);
      if (dateMatch) {
        const d = new Date(dateMatch[0].replace(/[()]/g, ''));
        if (!isNaN(d.getTime())) date = d;
      }

      // Extract player names
      const players = [];
      $('a[href*="player_id="]').each((i, el) => {
        const name = $(el).text().trim();
        if (name && !players.includes(name)) players.push(name);
      });
      
      if (players.length < 2) {
        $('.rep_player').each((i, el) => {
          const name = $(el).text().trim();
          if (name && !players.includes(name)) players.push(name);
        });
      }

      if (players.length >= 2) {
        attacker = players[0];
        defender = players[1];
      } else if (players.length === 1) {
        attacker = players[0];
      }

      // Extract resources
      const extractResource = (imgPattern) => {
        let val = 0;
        $(`img[src*="${imgPattern}"]`).each((i, el) => {
          const prevText = el.previousSibling ? el.previousSibling.nodeValue : '';
          const nextText = el.nextSibling ? el.nextSibling.nodeValue : '';
          const combined = `${prevText} ${nextText}`;
          const match = combined.match(/\b\d[\d\s.,]*\b/);
          if (match) {
            const num = parseInt(match[0].replace(/[^0-9]/g, ''), 10);
            if (!isNaN(num) && num > val) val = num;
          }
        });
        return val;
      };

      lootedWood = extractResource('wood');
      lootedStone = extractResource('stone');
      lootedIron = extractResource('iron');
    } else if (rawText) {
      // Parse manual text / BBCode
      const playerMatch = rawText.match(/\[player\](.*?)\[\/player\]/gi);
      if (playerMatch && playerMatch.length >= 2) {
        attacker = playerMatch[0].replace(/\[\/?player\]/gi, '').trim();
        defender = playerMatch[1].replace(/\[\/?player\]/gi, '').trim();
      }
    }

    const report = await prisma.report.create({
      data: {
        worldId: targetWorld,
        originalId: reportId,
        attacker,
        defender,
        date,
        lootedWood,
        lootedStone,
        lootedIron,
        morale,
        luck,
        rawText: parsedText.substring(0, 2000)
      }
    });

    return NextResponse.json({ success: true, report });

  } catch (error) {
    console.error('Scraper Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const worldId = (searchParams.get('world') || 'hu119').toLowerCase().trim();

    if (!/^[a-z0-9]+$/.test(worldId)) {
      return NextResponse.json({ error: 'Invalid world parameter' }, { status: 400 });
    }

    const reports = await prisma.report.findMany({
      where: { worldId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    return NextResponse.json({ reports });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}
