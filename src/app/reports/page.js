'use client';
import React, { useState, useEffect } from 'react';
import { FileText, Swords, Shield, ExternalLink, Trash2, ArrowRight, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Badge, Button, EmptyState } from '@/components/ui';

export default function ReportsPage() {
  const { activeWorldId, activeWorld } = useApp();
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [inputMode, setInputMode] = useState('url'); // 'url' or 'raw'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [reports, setReports] = useState([]);

  const fetchReports = React.useCallback(async () => {
    if (!activeWorldId) return;
    try {
      const res = await fetch(`/api/scraper/grct?world=${activeWorldId}`);
      const data = await res.json();
      if (data.reports) setReports(data.reports);
    } catch (err) {
      console.error(err);
    }
  }, [activeWorldId]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleScrape = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/scraper/grct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: inputMode === 'url' ? url : undefined,
          rawText: inputMode === 'raw' ? rawText : undefined,
          worldId: activeWorldId 
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse report');
      
      setSuccess('Battle report parsed and saved successfully!');
      setUrl('');
      setRawText('');
      fetchReports();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setTimeout(() => setSuccess(null), 4000);
    }
  };

  const headerBadges = [
    {
      text: `World: ${activeWorld?.name || activeWorldId?.toUpperCase() || ''}`,
      variant: 'primary',
      mono: true,
    }
  ];

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
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
          <CardTitle icon={Swords}>
            Ingest New Battle Report
          </CardTitle>
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
                onChange={e => setUrl(e.target.value)}
                required
              />
            ) : (
              <textarea 
                placeholder="Paste in-game report raw text or BBCode here..." 
                className="input-field min-h-[100px] font-mono text-xs"
                value={rawText}
                onChange={e => setRawText(e.target.value)}
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
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
              <span>{success}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reports Archive */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield size={18} className="text-blue-400" /> Parsed Reports Archive
          </h2>
          <Badge variant="neutral" mono size="sm">
            {reports.length} Reports
          </Badge>
        </div>

        {reports.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No Battle Reports Archived"
            description="Archive in-game battle reports using the GRCT URL parser or BBCode ingest above to maintain alliance battle intelligence."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reports.map(report => (
              <Card 
                key={report.id} 
                className="p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span className="text-red-400 font-bold">{report.attacker}</span>
                        <span className="text-slate-500 text-xs">VS</span>
                        <span className="text-blue-400 font-bold">{report.defender}</span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(report.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                    </div>

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
                  </div>

                  {/* Resource Loot Breakdown */}
                  {(report.lootedWood > 0 || report.lootedStone > 0 || report.lootedIron > 0) && (
                    <div className="grid grid-cols-3 gap-2 my-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-center text-xs font-mono">
                      <div>
                        <div className="text-amber-500 text-[10px]">WOOD</div>
                        <div className="font-bold text-slate-200">{report.lootedWood?.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-[10px]">STONE</div>
                        <div className="font-bold text-slate-200">{report.lootedStone?.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-blue-400 text-[10px]">IRON</div>
                        <div className="font-bold text-slate-200">{report.lootedIron?.toLocaleString()}</div>
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
