import { describe, it, expect, vi } from 'vitest';
import {
  validateGrctReportUrl,
  parseGrctHtmlReport,
  parseGrepolisBbCodeReport,
  digestBattleReport,
} from '@/lib/reports/BattleReportDigester';
import ReportOperationsAdapter, {
  fetchReports,
  ingestReport,
  deleteReport,
  filterReportsBySearch,
} from '@/lib/reports/ReportOperationsAdapter';

describe('BattleReportDigester & ReportOperationsAdapter', () => {
  describe('validateGrctReportUrl', () => {
    it('accepts valid HTTPS grcrt.net report URLs and extracts originalId', () => {
      const res = validateGrctReportUrl(
        'https://www.grcrt.net/repview.php?rep=rep_998877'
      );
      expect(res.valid).toBe(true);
      expect(res.originalId).toBe('rep_998877');
      expect(res.error).toBeNull();

      const resSub = validateGrctReportUrl('https://grcrt.net/repview.php?id=12345');
      expect(resSub.valid).toBe(true);
      expect(resSub.originalId).toBe('12345');
    });

    it('rejects non-HTTPS, non-grcrt domains, custom ports, and embedded credentials', () => {
      expect(validateGrctReportUrl('http://www.grcrt.net/repview.php?rep=1').valid).toBe(false);
      expect(validateGrctReportUrl('https://evil.example.com/repview.php?rep=1').valid).toBe(false);
      expect(validateGrctReportUrl('https://grcrt.net:8443/repview.php?rep=1').valid).toBe(false);
      expect(validateGrctReportUrl('https://user:pass@grcrt.net/repview.php?rep=1').valid).toBe(false);
      expect(validateGrctReportUrl('not-a-url').valid).toBe(false);
    });
  });

  describe('parseGrctHtmlReport', () => {
    it('extracts attackerName, defenderName, attackerTown, defenderTown, resources, and sanitizes rawHtml', () => {
      const sampleHtml = `
        <html>
          <body>
            <div class="quote_message">
              <div>(2026/10/21 14:30:00)</div>
              <a href="game?player_id=10">Leonidas</a> from <a href="game?town_id=100">Sparta</a>
              attacked
              <a href="game?player_id=20">Xerxes</a> in <a href="game?town_id=200">Persepolis</a>
              <div class="resources">
                <img src="/images/wood.png" /> 4,500
                <img src="/images/stone.png" /> 3,200
                <img src="/images/iron.png" /> 1,800
              </div>
              <div>Morale: 100% Luck: 15%</div>
              <script>alert("xss")</script>
            </div>
          </body>
        </html>
      `;

      const parsed = parseGrctHtmlReport(sampleHtml, { originalId: 'rep_sparta_1' });

      expect(parsed.originalId).toBe('rep_sparta_1');
      expect(parsed.attackerName).toBe('Leonidas');
      expect(parsed.defenderName).toBe('Xerxes');
      expect(parsed.attackerTown).toBe('Sparta');
      expect(parsed.defenderTown).toBe('Persepolis');
      expect(parsed.wood).toBe(4500);
      expect(parsed.stone).toBe(3200);
      expect(parsed.iron).toBe(1800);
      expect(parsed.morale).toBe(100);
      expect(parsed.luck).toBe(15);
      expect(parsed.rawHtml).not.toContain('<script>');
      expect(parsed.rawText).toContain('Sparta');
      expect(parsed.rawText).toContain('Persepolis');
    });
  });

  describe('parseGrepolisBbCodeReport', () => {
    it('extracts [player] and [town] tags, resources, and generates safe preview HTML', () => {
      const bbCode = `
        [b]Battle Report[/b]
        [player]Achilles[/player] ([ally]Myrmidons[/ally]) from [town]Phthia[/town]
        attacked [player]Hector[/player] ([ally]Trojans[/ally]) in [town]Ilium[/town].
        Looted resources: Wood: 2400, Stone: 1900, Iron: 3100
        Morale: 100% Luck: -8%
        <script>evil()</script>
      `;

      const parsed = parseGrepolisBbCodeReport(bbCode);

      expect(parsed.attackerName).toBe('Achilles');
      expect(parsed.defenderName).toBe('Hector');
      expect(parsed.attackerTown).toBe('Phthia');
      expect(parsed.defenderTown).toBe('Ilium');
      expect(parsed.wood).toBe(2400);
      expect(parsed.stone).toBe(1900);
      expect(parsed.iron).toBe(3100);
      expect(parsed.morale).toBe(100);
      expect(parsed.luck).toBe(-8);
      expect(parsed.rawHtml).toContain('class="bbcode-report-preview"');
      expect(parsed.rawHtml).toContain('Achilles');
      expect(parsed.rawHtml).toContain('Phthia');
      expect(parsed.rawHtml).not.toContain('<script>');
    });
  });

  describe('digestBattleReport', () => {
    it('fetches and digests a valid GRCT URL via fetchImpl', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `
          <div class="quote_message">
            <span class="rep_player">Athena</span> (<span class="rep_town">Athens</span>)
            vs
            <span class="rep_player">Ares</span> (<span class="rep_town">Thrace</span>)
            <img src="wood.png" /> 1200
          </div>
        `,
      });

      const result = await digestBattleReport({
        url: 'https://www.grcrt.net/repview.php?rep=athena_vs_ares',
        worldId: 'HU119',
        fetchImpl: mockFetch,
      });

      expect(result.worldId).toBe('hu119');
      expect(result.originalId).toBe('athena_vs_ares');
      expect(result.attackerName).toBe('Athena');
      expect(result.defenderName).toBe('Ares');
      expect(result.attackerTown).toBe('Athens');
      expect(result.defenderTown).toBe('Thrace');
      expect(result.wood).toBe(1200);
    });

    it('digests BBCode directly when rawText is provided', async () => {
      const result = await digestBattleReport({
        rawText: '[player]Odysseus[/player] from [town]Ithaca[/town] attacked [player]Polyphemus[/player] in [town]Sicily[/town]',
        worldId: 'en150',
      });

      expect(result.worldId).toBe('en150');
      expect(result.attackerName).toBe('Odysseus');
      expect(result.defenderName).toBe('Polyphemus');
      expect(result.attackerTown).toBe('Ithaca');
      expect(result.defenderTown).toBe('Sicily');
    });
  });

  describe('ReportOperationsAdapter', () => {
    it('supports fetchReports with search filtering, ingestReport, and deleteReport', async () => {
      const sampleReports = [
        {
          id: 1,
          worldId: 'hu119',
          attacker: 'Leonidas',
          defender: 'Xerxes',
          rawText: '[Leonidas (Sparta) vs Xerxes (Persepolis)]',
        },
        {
          id: 2,
          worldId: 'hu119',
          attacker: 'Achilles',
          defender: 'Hector',
          rawText: '[Achilles (Phthia) vs Hector (Ilium)]',
        },
      ];

      expect(filterReportsBySearch(sampleReports, 'sparta')).toHaveLength(1);
      expect(filterReportsBySearch(sampleReports, 'Hector')[0].id).toBe(2);

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ reports: sampleReports }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            report: { id: 3, attacker: 'Athena', defender: 'Ares' },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, deletedId: 2 }),
        });

      const fetched = await fetchReports({
        worldId: 'hu119',
        search: 'Ilium',
        fetchImpl: mockFetch,
      });
      expect(fetched).toHaveLength(1);
      expect(fetched[0].id).toBe(2);

      const ingested = await ingestReport({
        worldId: 'hu119',
        rawText: '[player]Athena[/player] vs [player]Ares[/player]',
        fetchImpl: mockFetch,
      });
      expect(ingested.id).toBe(3);

      const deleted = await deleteReport({
        id: 2,
        worldId: 'hu119',
        fetchImpl: mockFetch,
      });
      expect(deleted.deletedId).toBe(2);
      expect(ReportOperationsAdapter.deleteReport).toBe(deleteReport);
    });
  });

  describe('/api/scraper/grct Route Handlers', () => {
    it('deduplicates reports by (worldId, originalId) on POST and deletes by id on DELETE', async () => {
      vi.resetModules();

      const mockFindFirst = vi.fn().mockResolvedValue({ id: 99, worldId: 'hu119', originalId: 'rep_dup_1' });
      const mockUpdate = vi.fn().mockImplementation(async ({ where, data }) => ({
        id: where.id,
        ...data,
      }));
      const mockCreate = vi.fn();
      const mockFindUnique = vi.fn().mockResolvedValue({ id: 99, worldId: 'hu119' });
      const mockDelete = vi.fn().mockResolvedValue({ id: 99 });

      vi.doMock('@/lib/prisma', () => ({
        prisma: {
          report: {
            findFirst: mockFindFirst,
            update: mockUpdate,
            create: mockCreate,
            findUnique: mockFindUnique,
            delete: mockDelete,
          },
        },
      }));

      vi.doMock('@/lib/auth/rbac', () => ({
        requireAuth: vi.fn().mockResolvedValue({
          authorized: true,
          user: { id: 'u1', globalRole: 'USER' },
        }),
      }));

      const origFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          '<div class="quote_message"><a href="player_id=1">AttackerA</a><a href="player_id=2">DefenderB</a></div>',
      });

      try {
        const { POST, DELETE } = await import('@/app/api/scraper/grct/route');

        const postReq = new Request('http://localhost/api/scraper/grct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: 'https://www.grcrt.net/repview.php?rep=rep_dup_1',
            worldId: 'hu119',
          }),
        });

        const postRes = await POST(postReq);
        const postData = await postRes.json();

        expect(postRes.status).toBe(200);
        expect(mockFindFirst).toHaveBeenCalledWith({
          where: { worldId: 'hu119', originalId: 'rep_dup_1' },
        });
        expect(mockUpdate).toHaveBeenCalledTimes(1);
        expect(mockCreate).not.toHaveBeenCalled();
        expect(postData.report.id).toBe(99);

        const delReq = new Request('http://localhost/api/scraper/grct?id=99&world=hu119', {
          method: 'DELETE',
        });
        const delRes = await DELETE(delReq);
        const delData = await delRes.json();

        expect(delRes.status).toBe(200);
        expect(delData).toEqual({ success: true, deletedId: 99 });
        expect(mockDelete).toHaveBeenCalledWith({ where: { id: 99 } });
      } finally {
        global.fetch = origFetch;
        vi.doUnmock('@/lib/prisma');
        vi.doUnmock('@/lib/auth/rbac');
      }
    });
  });
});
