'use client';
import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Swords,
  Shield,
  ExternalLink,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Search,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  EmptyState,
} from '@/components/ui';
import ReportOperationsAdapter, {
  filterReportsBySearch,
} from '@/lib/reports/ReportOperationsAdapter';

export default function ReportsPage() {
  const { activeWorldId, activeWorld } = useApp();
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [inputMode, setInputMode] = useState('url'); // 'url' or 'raw'
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [reports, setReports] = useState([]);

  const loadReports = React.useCallback(async () => {
    if (!activeWorldId) return;
    try {
      const list = await ReportOperationsAdapter.fetchReports({
        worldId: activeWorldId,
      });
      setReports(list);
    } catch (err) {
      console.error(err);
    }
  }, [activeWorldId]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleScrape = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await ReportOperationsAdapter.ingestReport({
        worldId: activeWorldId,
        url: inputMode === 'url' ? url : undefined,
        rawText: inputMode === 'raw' ? rawText : undefined,
      });

      setSuccess('Battle report parsed and saved successfully!');
      setUrl('');
      setRawText('');
      await loadReports();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setTimeout(() => setSuccess(null), 4000);
    }
  };

  const handleDeleteReport = async (reportId) => {
    setDeletingId(reportId);
    setError(null);
    try {
      await ReportOperationsAdapter.deleteReport({
        id: reportId,
        worldId: activeWorldId,
      });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredReports = useMemo(
    () => filterReportsBySearch(reports, searchQuery),
    [reports, searchQuery]
  );

  const headerBadges = [
    {
      text: `World: ${activeWorld?.name || activeWorldId?.toUpperCase() || ''}`,
      variant: 'primary',
      mono: true,
    },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Standardized Hero Header */}
      <PageHeader
        title="Battle Report Intelligence & Archive"
        subtitle="Ingest GRCT published reports or paste raw in-game BBCodes to extract loot, troop losses, and player records."
        icon={FileText}
        badges={headerBadges}
      />

      {/* Parsing Card */}
      <Card>
        <CardHeader className="flex-col sm:flex-row items-start sm:items-center gap-3">
          <CardTitle icon={Swords}>Ingest New Battle Report</CardTitle>
          <div className="flex gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <Button
              size="xs"
              variant={inputMode === 'url' ? 'primary' : 'ghost'}
              onClick={() => setInputMode('url')}
            >
              GRCT URL
            </Button>
            <Button
              size="xs"
              variant={inputMode === 'raw' ? 'primary' : 'ghost'}
              onClick={() => setInputMode('raw')}
            >
              Raw Text / BBCode
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleScrape} className="flex flex-col gap-3">
            {inputMode === 'url' ? (
              <input
                type="url"
                placeholder="Paste GRCT Report URL (e.g. https://www.grcrt.net/repview.php?rep=...)"
                className="input-field"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            ) : (
              <textarea
                placeholder="Paste in-game report raw text or BBCode here..."
                className="input-field min-h-[100px] font-mono text-xs"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                required
              />
            )}

            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={loading}
              >
                Save Report to Archive
              </Button>
            </div>
          </form>

          {error && (
            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
              <span>{success}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reports Archive */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield size={18} className="text-blue-400" /> Parsed Reports
              Archive
            </h2>
            <Badge variant="neutral" mono size="sm">
              {filteredReports.length} Reports
            </Badge>
          </div>

          <div className="relative w-full sm:w-80">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
            />
            <input
              type="search"
              aria-label="Filter battle reports"
              placeholder="Filter by attacker, defender, or town..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-9 py-1.5 text-xs w-full"
            />
          </div>
        </div>

        {filteredReports.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No Battle Reports Archived"
            description={
              searchQuery
                ? `No archived battle reports match "${searchQuery}".`
                : 'Archive in-game battle reports using the GRCT URL parser or BBCode ingest above to maintain alliance battle intelligence.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredReports.map((report) => (
              <Card
                key={report.id}
                className="p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span className="text-red-400 font-bold">
                          {report.attacker}
                        </span>
                        <span className="text-slate-500 text-xs">VS</span>
                        <span className="text-blue-400 font-bold">
                          {report.defender}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(report.date).toLocaleString([], {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {report.originalId && (
                        <a
                          href={`https://www.grcrt.net/repview.php?rep=${report.originalId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 hover:text-blue-300 p-1"
                          title="View Original GRCT Report"
                        >
                          <ExternalLink size={15} />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteReport(report.id)}
                        disabled={deletingId === report.id}
                        aria-label={`Delete report ${report.id}`}
                        title="Delete Report"
                        className="text-slate-500 hover:text-rose-400 p-1 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Resource Loot Breakdown */}
                  {(report.lootedWood > 0 ||
                    report.lootedStone > 0 ||
                    report.lootedIron > 0) && (
                    <div className="grid grid-cols-3 gap-2 my-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-center text-xs font-mono">
                      <div>
                        <div className="text-amber-500 text-[10px]">WOOD</div>
                        <div className="font-bold text-slate-200">
                          {report.lootedWood?.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-[10px]">STONE</div>
                        <div className="font-bold text-slate-200">
                          {report.lootedStone?.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-blue-400 text-[10px]">IRON</div>
                        <div className="font-bold text-slate-200">
                          {report.lootedIron?.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}

                  {report.rawText && (
                    <div className="mt-2 text-[11px] text-slate-400 line-clamp-2 font-mono bg-slate-950/30 p-2 rounded-lg border border-slate-800/50">
                      {report.rawText}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-800/80 mt-3 pt-2.5 flex justify-between items-center text-xs text-slate-500 font-mono">
                  <span>ID: #{report.id}</span>
                  <span>World: {report.worldId?.toUpperCase()}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
