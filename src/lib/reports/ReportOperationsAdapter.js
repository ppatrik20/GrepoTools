/**
 * ReportOperationsAdapter — Client/server HTTP adapter for battle report
 * archive querying, ingestion (GRCT URL or BBCode), and deletion.
 */

export function filterReportsBySearch(reports = [], search = '') {
  const query = String(search || '').toLowerCase().trim();
  if (!query) return Array.isArray(reports) ? reports : [];

  return (Array.isArray(reports) ? reports : []).filter((report) => {
    const haystack = [
      report?.attacker,
      report?.defender,
      report?.attackerName,
      report?.defenderName,
      report?.attackerTown,
      report?.defenderTown,
      report?.rawText,
      report?.originalId,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}

export async function fetchReports({
  worldId = 'hu119',
  search = '',
  fetchImpl = fetch,
} = {}) {
  const normalizedWorld = String(worldId || 'hu119').toLowerCase().trim();
  const params = new URLSearchParams({ world: normalizedWorld });
  if (search && String(search).trim()) {
    params.set('search', String(search).trim());
  }

  const response = await fetchImpl(`/api/scraper/grct?${params.toString()}`);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to fetch reports');
  }

  const list = Array.isArray(data?.reports)
    ? data.reports
    : Array.isArray(data)
    ? data
    : [];

  return filterReportsBySearch(list, search);
}

export async function ingestReport({
  worldId = 'hu119',
  url,
  rawText,
  fetchImpl = fetch,
} = {}) {
  const normalizedWorld = String(worldId || 'hu119').toLowerCase().trim();
  const response = await fetchImpl('/api/scraper/grct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      worldId: normalizedWorld,
      url: url || undefined,
      rawText: rawText || undefined,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to parse report');
  }

  return data?.report ?? data;
}

export async function deleteReport({
  id,
  worldId = 'hu119',
  fetchImpl = fetch,
} = {}) {
  if (id === undefined || id === null || id === '') {
    throw new Error('Missing report id');
  }
  const normalizedWorld = String(worldId || 'hu119').toLowerCase().trim();
  const params = new URLSearchParams({
    id: String(id),
    world: normalizedWorld,
  });

  const response = await fetchImpl(`/api/scraper/grct?${params.toString()}`, {
    method: 'DELETE',
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to delete report');
  }

  return data;
}

export const ReportOperationsAdapter = Object.freeze({
  fetchReports,
  ingestReport,
  deleteReport,
  filterReportsBySearch,
});

export default ReportOperationsAdapter;
