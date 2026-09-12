import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { verifyAdminBearerAuth, verifyAdminPassword } from '../../src/lib/auth.js';
import { calculateTravelTimeSeconds, calculateDistance, formatDuration } from '../../src/lib/traveltime.js';
import { POST as scraperPost, GET as scraperGet } from '../../src/app/api/scraper/grct/route.js';
import { POST as worldsPost, PUT as worldsPut, DELETE as worldsDelete } from '../../src/app/api/worlds/route.js';
import { DELETE as cleanDelete } from '../../src/app/api/world/clean/route.js';
import { PUT as opIdPut, DELETE as opIdDelete } from '../../src/app/api/snipe/operations/[id]/route.js';
import { POST as opsPost, DELETE as opsDelete } from '../../src/app/api/snipe/operations/route.js';
import { syncWorld } from '../../src/lib/syncEngine.js';

describe('SEC-01 & SEC-02: Admin Bearer Authentication & Timing Safety', () => {
  const originalEnv = process.env.ADMIN_PASSWORD;

  beforeEach(() => {
    process.env.ADMIN_PASSWORD = 'super-secret-admin-pass-2026';
  });

  afterEach(() => {
    process.env.ADMIN_PASSWORD = originalEnv;
  });

  test('rejects unauthenticated requests without authorization header or null request', () => {
    expect(verifyAdminBearerAuth(null)).toBe(false);
    expect(verifyAdminBearerAuth({})).toBe(false);

    const req = new Request('http://localhost:3000/api/worlds', {
      method: 'POST',
      headers: {}
    });
    expect(verifyAdminBearerAuth(req)).toBe(false);
  });

  test('rejects requests with invalid bearer prefix, empty tokens, or basic auth', () => {
    const req1 = new Request('http://localhost:3000/api/worlds', {
      headers: { authorization: 'Basic super-secret-admin-pass-2026' }
    });
    expect(verifyAdminBearerAuth(req1)).toBe(false);

    const req2 = new Request('http://localhost:3000/api/worlds', {
      headers: { authorization: 'super-secret-admin-pass-2026' }
    });
    expect(verifyAdminBearerAuth(req2)).toBe(false);

    const req3 = new Request('http://localhost:3000/api/worlds', {
      headers: { authorization: 'Bearer   ' }
    });
    expect(verifyAdminBearerAuth(req3)).toBe(false);
  });

  test('rejects incorrect passwords with different or identical lengths', () => {
    const reqShort = new Request('http://localhost:3000/api/worlds', {
      headers: { authorization: 'Bearer wrong' }
    });
    expect(verifyAdminBearerAuth(reqShort)).toBe(false);

    const wrongSameLen = 'x'.repeat('super-secret-admin-pass-2026'.length);
    const reqSameLen = new Request('http://localhost:3000/api/worlds', {
      headers: { authorization: `Bearer ${wrongSameLen}` }
    });
    expect(verifyAdminBearerAuth(reqSameLen)).toBe(false);
  });

  test('accepts valid bearer authorization case-insensitively', () => {
    const req1 = new Request('http://localhost:3000/api/worlds', {
      headers: { authorization: 'Bearer super-secret-admin-pass-2026' }
    });
    expect(verifyAdminBearerAuth(req1)).toBe(true);

    const req2 = new Request('http://localhost:3000/api/worlds', {
      headers: { authorization: 'bearer super-secret-admin-pass-2026' }
    });
    expect(verifyAdminBearerAuth(req2)).toBe(true);
  });

  test('eliminates default "admin" password fallback when env is missing', () => {
    delete process.env.ADMIN_PASSWORD;
    const req = new Request('http://localhost:3000/api/worlds', {
      headers: { authorization: 'Bearer admin' }
    });
    expect(verifyAdminBearerAuth(req)).toBe(false);
    expect(verifyAdminPassword('admin')).toBe(false);
    expect(verifyAdminPassword('')).toBe(false);
    expect(verifyAdminPassword(null)).toBe(false);
  });
});

describe('SEC-01: Endpoint Protection on /api/worlds and /api/world/clean', () => {
  const originalEnv = process.env.ADMIN_PASSWORD;

  beforeEach(() => {
    process.env.ADMIN_PASSWORD = 'test-admin-secret-xyz';
  });

  afterEach(() => {
    process.env.ADMIN_PASSWORD = originalEnv;
  });

  test('/api/worlds POST, PUT, DELETE return 401 when unauthorized', async () => {
    const unauthReq = new Request('http://localhost:3000/api/worlds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'en999', server: 'en999' })
    });
    const postRes = await worldsPost(unauthReq);
    expect(postRes.status).toBe(401);

    const putReq = new Request('http://localhost:3000/api/worlds', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'en999', speed: 2 })
    });
    const putRes = await worldsPut(putReq);
    expect(putRes.status).toBe(401);

    const deleteReq = new Request('http://localhost:3000/api/worlds?id=en999', {
      method: 'DELETE'
    });
    const deleteRes = await worldsDelete(deleteReq);
    expect(deleteRes.status).toBe(401);
  });

  test('/api/world/clean DELETE returns 401 when unauthorized', async () => {
    const unauthReq = new Request('http://localhost:3000/api/world/clean?worldId=hu119', {
      method: 'DELETE'
    });
    const res = await cleanDelete(unauthReq);
    expect(res.status).toBe(401);
  });

  test('/api/world/clean DELETE returns 400 for invalid worldId format', async () => {
    const req = new Request('http://localhost:3000/api/world/clean?worldId=hu-119;DROP', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-admin-secret-xyz' }
    });
    const res = await cleanDelete(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('matching /^[a-z0-9]+$/ is required');
  });
});

describe('SEC-03: Production Scraper Route SSRF & Hostname Validation', () => {
  test('rejects empty input without URL or rawText', async () => {
    const req = new Request('http://localhost:3000/api/scraper/grct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const res = await scraperPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Please provide either');
  });

  test('rejects invalid worldId in scraper POST and GET', async () => {
    const postReq = new Request('http://localhost:3000/api/scraper/grct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText: 'test', worldId: "hu119' OR '1'='1" })
    });
    const postRes = await scraperPost(postReq);
    expect(postRes.status).toBe(400);

    const getReq = new Request("http://localhost:3000/api/scraper/grct?world=bad-world$!", {
      method: 'GET'
    });
    const getRes = await scraperGet(getReq);
    expect(getRes.status).toBe(400);
  });

  test('blocks SSRF attacks to internal networks, non-standard ports, and credentials', async () => {
    const attackUrls = [
      'http://www.grcrt.net/repview.php?rep=123',           // unencrypted HTTP
      'http://localhost:3000/admin',                        // localhost
      'http://127.0.0.1:8080',                              // loopback IP
      'http://169.254.169.254/latest/meta-data/',           // cloud metadata
      'https://169.254.169.254/',                           // https IP
      'https://evil.com/?target=grcrt.net',                 // query spoofing
      'https://grcrt.net.attacker.org/report',              // subdomain hijack
      'https://user:pass@www.grcrt.net/repview.php',        // URL credentials
      'https://www.grcrt.net:8443/repview.php',             // non-standard port
      'file:///etc/passwd'                                  // file scheme
    ];

    for (const url of attackUrls) {
      const req = new Request('http://localhost:3000/api/scraper/grct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, worldId: 'hu119' })
      });
      const res = await scraperPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Invalid URL|Security validation failed/);
    }
  });
});

describe('SEC-04: SyncEngine Strict World ID Validation', () => {
  test('rejects SQL injection vectors and illegal characters in syncWorld', async () => {
    await expect(syncWorld("hu119' OR 1=1--")).rejects.toThrow(/Invalid worldId format/);
    await expect(syncWorld('hu119;DROP TABLE "World"')).rejects.toThrow(/Invalid worldId format/);
    await expect(syncWorld('../../etc/passwd')).rejects.toThrow(/Invalid worldId format/);
    await expect(syncWorld('hu-119')).rejects.toThrow(/Invalid worldId format/);
    await expect(syncWorld('')).rejects.toThrow(/Invalid worldId format/);
  });
});

describe('ARCH-03: Code Unity in Travel Time Routines', () => {
  test('RoutePlannerTool re-exports canonical routines from lib/traveltime without duplicated math', () => {
    const routePlannerCode = fs.readFileSync(path.resolve(__dirname, '../../src/components/map/RoutePlannerTool.js'), 'utf-8');
    expect(routePlannerCode).toContain("from '@/lib/traveltime'");
    expect(routePlannerCode).toContain('calculateTravelTimeSeconds');
    expect(routePlannerCode).toContain('calculateDistance');
    expect(routePlannerCode).toContain('formatDuration');
    // Ensure duplicate function definitions were removed
    expect(routePlannerCode).not.toContain('function calculateDistance(');
    expect(routePlannerCode).not.toContain('function calculateTravelTimeSeconds(');
    expect(routePlannerCode).not.toContain('function formatDuration(');
  });

  test('calculateTravelTimeSeconds supports research modifiers and naval delay', () => {
    const baseDuration = calculateTravelTimeSeconds(10, 15, 3, 1);
    
    // Cartography adds +10% speed
    const cartographyDuration = calculateTravelTimeSeconds(10, 15, 3, 1, { cartographyResearched: true });
    expect(cartographyDuration).toBeLessThan(baseDuration);

    // Lighthouse adds +15% speed
    const lighthouseDuration = calculateTravelTimeSeconds(10, 15, 3, 1, { hasLighthouse: true });
    expect(lighthouseDuration).toBeLessThan(baseDuration);

    // Naval delay adds 300s
    const navalDelayDuration = calculateTravelTimeSeconds(10, 15, 3, 1, { includeNavalDelay: true });
    expect(navalDelayDuration).toBe(baseDuration + 300);
  });
});

describe('BUG-01 & BUG-03: Route Parameter Handling & Operations Validation', () => {
  test('Next.js 16 dynamic route handles Promise params and validates missing status', async () => {
    const req = new Request('http://localhost:3000/api/snipe/operations/op-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // missing status
    });
    const res = await opIdPut(req, { params: Promise.resolve({ id: 'op-1' }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing status');
  });

  test('dynamic route returns 400 when operation id is missing', async () => {
    const req = new Request('http://localhost:3000/api/snipe/operations', {
      method: 'DELETE'
    });
    const res = await opIdDelete(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing operation ID');
  });

  test('snipe operations POST validates required fields, numeric IDs, and dates', async () => {
    // Missing required fields
    const reqMissing = new Request('http://localhost:3000/api/snipe/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Test' })
    });
    const resMissing = await opsPost(reqMissing);
    expect(resMissing.status).toBe(400);

    // Invalid non-numeric town ID
    const reqBadTown = new Request('http://localhost:3000/api/snipe/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: 'Test',
        targetTownId: 'not-a-number',
        targetReturnTime: '2026-09-12T18:00:00.000Z',
        sendTime: '2026-09-12T17:00:00.000Z'
      })
    });
    const resBadTown = await opsPost(reqBadTown);
    expect(resBadTown.status).toBe(400);
    const badTownData = await resBadTown.json();
    expect(badTownData.error).toBe('Invalid town ID format');

    // Invalid date string
    const reqBadDate = new Request('http://localhost:3000/api/snipe/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: 'Test',
        targetTownId: 101,
        targetReturnTime: 'invalid-date-string',
        sendTime: '2026-09-12T17:00:00.000Z'
      })
    });
    const resBadDate = await opsPost(reqBadDate);
    expect(resBadDate.status).toBe(400);
    const badDateData = await resBadDate.json();
    expect(badDateData.error).toBe('Invalid date format');
  });

  test('snipe operations DELETE returns 400 when operation ID is missing', async () => {
    const req = new Request('http://localhost:3000/api/snipe/operations', {
      method: 'DELETE'
    });
    const res = await opsDelete(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing operation ID');
  });
});

