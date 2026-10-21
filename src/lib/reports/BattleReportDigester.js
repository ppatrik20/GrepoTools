import * as cheerio from 'cheerio';

/**
 * BattleReportDigester — Pure domain module for validating GRCT URLs,
 * parsing GRCT HTML battle reports, parsing Grepolis BBCode reports,
 * and coordinating battle report ingestion.
 */

function escapeHtml(unsafe = '') {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validates that a URL is a safe HTTPS URL pointing to grcrt.net (*.grcrt.net).
 * Returns `{ valid, parsedUrl, originalId, error }`.
 */
export function validateGrctReportUrl(url) {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return {
      valid: false,
      parsedUrl: null,
      originalId: null,
      error: 'Invalid URL format',
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
  } catch {
    return {
      valid: false,
      parsedUrl: null,
      originalId: null,
      error: 'Invalid URL format',
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const isAllowedHostname =
    hostname === 'grcrt.net' || hostname.endsWith('.grcrt.net');

  if (
    parsedUrl.protocol !== 'https:' ||
    !isAllowedHostname ||
    (parsedUrl.port && parsedUrl.port !== '443') ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    return {
      valid: false,
      parsedUrl: null,
      originalId: null,
      error:
        'Security validation failed: Only HTTPS requests to grcrt.net are allowed',
    };
  }

  const originalId =
    parsedUrl.searchParams.get('rep') ||
    parsedUrl.searchParams.get('id') ||
    null;

  return {
    valid: true,
    parsedUrl,
    originalId,
    error: null,
  };
}

function parseNumericResource(rawStr) {
  if (!rawStr) return 0;
  const match = String(rawStr).match(/\b\d(?:[\d.,]*\d)?\b/);
  if (!match) return 0;
  const num = parseInt(match[0].replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Pure function that parses GRCT HTML report markup using cheerio.
 * Extracts `{ attackerName, defenderName, attackerTown, defenderTown, wood, stone, iron, rawHtml, ... }`.
 */
export function parseGrctHtmlReport(html, { originalId = null } = {}) {
  const safeInput = typeof html === 'string' ? html : '';
  const $ = cheerio.load(safeInput);

  // Strip dangerous elements before extracting HTML or text
  $('script, iframe, object, embed, style').remove();
  $('*').each((_, el) => {
    if (el.attribs) {
      for (const attr of Object.keys(el.attribs)) {
        if (attr.toLowerCase().startsWith('on')) {
          $(el).removeAttr(attr);
        }
      }
    }
  });

  const textBody = ($('.quote_message').text() || $('body').text() || '').trim();

  // Extract date if present: (YYYY/MM/DD HH:MM:SS) or YYYY-MM-DD HH:MM:SS
  let date = new Date();
  const dateMatch = textBody.match(
    /\(?(\d{4}[/-]\d{2}[/-]\d{2}\s+\d{2}:\d{2}(?::\d{2})?)\)?/
  );
  if (dateMatch) {
    const parsedDate = new Date(dateMatch[1].replace(/\//g, '-'));
    if (!Number.isNaN(parsedDate.getTime())) {
      date = parsedDate;
    }
  }

  // Extract player names
  const players = [];
  const addPlayer = (name) => {
    const trimmed = String(name || '').trim();
    if (trimmed && !players.includes(trimmed)) {
      players.push(trimmed);
    }
  };

  $('a[href*="player_id="], .rep_player, .player_name, .gp_player_link, [data-player]').each(
    (_, el) => {
      addPlayer($(el).text() || $(el).attr('data-player'));
    }
  );

  if (players.length < 2) {
    const bbPlayers = [...textBody.matchAll(/\[player\](.*?)\[\/player\]/gi)];
    for (const match of bbPlayers) {
      addPlayer(match[1]);
    }
  }

  const attackerName = players[0] || 'Unknown Attacker';
  const defenderName = players[1] || 'Unknown Defender';

  // Extract town names
  const towns = [];
  const addTown = (name) => {
    const trimmed = String(name || '').trim();
    if (trimmed && !towns.includes(trimmed)) {
      towns.push(trimmed);
    }
  };

  $('a[href*="town_id="], .rep_town, .town_name, .gp_town_link, [data-town]').each(
    (_, el) => {
      addTown($(el).text() || $(el).attr('data-town'));
    }
  );

  if (towns.length < 2) {
    const bbTowns = [...textBody.matchAll(/\[town\](.*?)\[\/town\]/gi)];
    for (const match of bbTowns) {
      addTown(match[1]);
    }
  }

  const attackerTown = towns[0] || 'Unknown Town';
  const defenderTown = towns[1] || 'Unknown Town';

  // Extract resources
  const extractResourceByKeyword = (keyword, aliases = []) => {
    let maxVal = 0;

    $(`img[src*="${keyword}"], [data-resource="${keyword}"], .${keyword}`).each(
      (_, el) => {
        const nextText = el.nextSibling ? el.nextSibling.nodeValue || '' : '';
        const prevText = el.previousSibling ? el.previousSibling.nodeValue || '' : '';
        const ownText = $(el).text() || '';
        const parentText = $(el).parent().text() || '';
        for (const candidate of [nextText, prevText, ownText, parentText]) {
          const val = parseNumericResource(candidate);
          if (val > 0) {
            if (val > maxVal) maxVal = val;
            break;
          }
        }
      }
    );

    if (maxVal === 0) {
      const allKeywords = [keyword, ...aliases].join('|');
      const regex = new RegExp(`(?:${allKeywords})\\s*[:=-]?\\s*(\\d[\\d.,]*)`, 'i');
      const match = textBody.match(regex);
      if (match) {
        maxVal = parseNumericResource(match[1]);
      }
    }

    return maxVal;
  };

  const wood = extractResourceByKeyword('wood', ['fa', 'lumber', 'timber']);
  const stone = extractResourceByKeyword('stone', ['kő', 'ko', 'rock']);
  const iron = extractResourceByKeyword('iron', ['silver', 'ezüst', 'ezust', 'coins']);

  // Morale & Luck
  let morale = 100;
  const moraleMatch = textBody.match(/(?:morale|morál|moral)\s*[:=-]?\s*(\d+)\s*%/i);
  if (moraleMatch) {
    morale = parseInt(moraleMatch[1], 10);
  }

  let luck = 0;
  const luckMatch = textBody.match(/(?:luck|szerencse)\s*[:=-]?\s*([+-]?\d+)\s*%/i);
  if (luckMatch) {
    luck = parseInt(luckMatch[1], 10);
  }

  const innerHtml =
    $('.quote_message').html() ||
    $('#report_game_body').html() ||
    $('body').html() ||
    '';
  const rawHtml = innerHtml.trim();

  const townSummaryPrefix = `[${attackerName} (${attackerTown}) vs ${defenderName} (${defenderTown})]`;
  const rawText = textBody
    ? `${townSummaryPrefix} ${textBody}`.substring(0, 2000)
    : townSummaryPrefix;

  return {
    originalId,
    attackerName,
    defenderName,
    attacker: attackerName,
    defender: defenderName,
    attackerTown,
    defenderTown,
    wood,
    stone,
    iron,
    lootedWood: wood,
    lootedStone: stone,
    lootedIron: iron,
    morale,
    luck,
    date,
    rawHtml,
    rawText,
  };
}

/**
 * Pure function that parses Grepolis in-game BBCode / raw text reports.
 * Extracts `[player]...[/player]`, `[town]...[/town]`, resources, morale/luck,
 * and generates a clean, XSS-safe `rawHtml` preview.
 */
export function parseGrepolisBbCodeReport(rawText) {
  const input = typeof rawText === 'string' ? rawText.trim() : '';

  const playerMatches = [...input.matchAll(/\[player\](.*?)\[\/player\]/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  const townMatches = [...input.matchAll(/\[town\](.*?)\[\/town\]/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  const allyMatches = [...input.matchAll(/\[ally\](.*?)\[\/ally\]/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean);

  const attackerName = playerMatches[0] || 'Unknown Attacker';
  const defenderName = playerMatches[1] || 'Unknown Defender';
  const attackerTown = townMatches[0] || 'Unknown Town';
  const defenderTown = townMatches[1] || 'Unknown Town';
  const attackerAlliance = allyMatches[0] || null;
  const defenderAlliance = allyMatches[1] || null;

  const extractBbResource = (patterns) => {
    const joined = patterns.join('|');
    const regex = new RegExp(
      `(?:\\[(?:${joined})\\]|(?:${joined}))\\s*[:=-]?\\s*(\\d[\\d.,]*)`,
      'i'
    );
    const match = input.match(regex);
    return match ? parseNumericResource(match[1]) : 0;
  };

  const wood = extractBbResource(['wood', 'fa', 'lumber', 'timber']);
  const stone = extractBbResource(['stone', 'kő', 'ko', 'rock']);
  const iron = extractBbResource(['iron', 'silver', 'ezüst', 'ezust']);

  let morale = 100;
  const moraleMatch = input.match(/(?:morale|morál|moral)\s*[:=-]?\s*(\d+)\s*%?/i);
  if (moraleMatch) {
    morale = parseInt(moraleMatch[1], 10);
  }

  let luck = 0;
  const luckMatch = input.match(/(?:luck|szerencse)\s*[:=-]?\s*([+-]?\d+)\s*%?/i);
  if (luckMatch) {
    luck = parseInt(luckMatch[1], 10);
  }

  // Build clean, XSS-safe preview HTML from BBCode
  const escaped = escapeHtml(input);
  const formattedBody = escaped
    .replace(
      /\[player\](.*?)\[\/player\]/gi,
      '<span class="bb-player font-bold text-indigo-300">$1</span>'
    )
    .replace(
      /\[town\](.*?)\[\/town\]/gi,
      '<span class="bb-town font-semibold text-amber-300">$1</span>'
    )
    .replace(
      /\[ally\](.*?)\[\/ally\]/gi,
      '<span class="bb-ally font-medium text-emerald-300">[$1]</span>'
    )
    .replace(/\[b\](.*?)\[\/b\]/gi, '<strong>$1</strong>')
    .replace(/\[i\](.*?)\[\/i\]/gi, '<em>$1</em>')
    .replace(/\r?\n/g, '<br />');

  const rawHtml = `<div class="bbcode-report-preview">${formattedBody}</div>`;

  return {
    originalId: null,
    attackerName,
    defenderName,
    attacker: attackerName,
    defender: defenderName,
    attackerTown,
    defenderTown,
    attackerAlliance,
    defenderAlliance,
    wood,
    stone,
    iron,
    lootedWood: wood,
    lootedStone: stone,
    lootedIron: iron,
    morale,
    luck,
    date: new Date(),
    rawHtml,
    rawText: input.substring(0, 2000),
  };
}

/**
 * Coordinates URL validation, external HTML fetching, and HTML/BBCode parsing.
 */
export async function digestBattleReport({
  url,
  rawText,
  worldId = 'hu119',
  fetchImpl = fetch,
} = {}) {
  const targetWorld = String(worldId || 'hu119').toLowerCase().trim();
  if (!/^[a-z0-9]+$/.test(targetWorld)) {
    const err = new Error('Invalid worldId parameter');
    err.status = 400;
    throw err;
  }

  if (!url && (!rawText || !String(rawText).trim())) {
    const err = new Error(
      'Please provide either a GRCT report URL or raw report text'
    );
    err.status = 400;
    throw err;
  }

  if (url) {
    const validation = validateGrctReportUrl(url);
    if (!validation.valid) {
      const err = new Error(validation.error);
      err.status = 400;
      throw err;
    }

    let response;
    try {
      response = await fetchImpl(validation.parsedUrl.toString(), {
        signal:
          typeof AbortSignal !== 'undefined' && AbortSignal.timeout
            ? AbortSignal.timeout(10000)
            : undefined,
      });
    } catch (fetchErr) {
      const err = new Error(
        `Network error contacting external report server: ${fetchErr.message}`
      );
      err.status = 502;
      throw err;
    }

    if (!response.ok) {
      const err = new Error(
        `Failed to fetch report from grcrt.net: HTTP ${response.status} ${
          response.statusText || ''
        }`.trim()
      );
      err.status = 502;
      throw err;
    }

    const html = await response.text();
    const originalId = validation.originalId || `rep_${Date.now()}`;
    const parsed = parseGrctHtmlReport(html, { originalId });

    return {
      worldId: targetWorld,
      ...parsed,
    };
  }

  const parsedBb = parseGrepolisBbCodeReport(rawText);
  return {
    worldId: targetWorld,
    ...parsedBb,
  };
}
