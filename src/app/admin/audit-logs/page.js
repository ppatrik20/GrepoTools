'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Filter, RefreshCw, AlertTriangle, CheckCircle, XCircle, Search } from 'lucide-react';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedLogId, setExpandedLogId] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.append('action', actionFilter);
      if (actorFilter) params.append('actorUsername', actorFilter);
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', '50');

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      } else {
        setError(data.error || 'Failed to fetch audit logs');
      }
    } catch (err) {
      setError('Error connecting to audit service: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, actorFilter, statusFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-slate-900/90 border border-slate-800 rounded-2xl backdrop-blur-xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Shield size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">System Security & Audit Logs</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Append-only audit trail of authentication events, team mutations, and verification handshakes
            </p>
          </div>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer self-start md:self-auto"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Filter Action
          </label>
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="e.g. AUTH_LOGIN"
            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Actor Username
          </label>
          <input
            type="text"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            placeholder="e.g. Leonidas"
            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Outcome Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="">All Statuses</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="WARNING">WARNING</option>
            <option value="FAILURE">FAILURE</option>
          </select>
        </div>

        <div className="flex items-end">
          <span className="text-xs text-slate-400 py-2">
            Showing {logs.length} of {total} events
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/50 border border-red-800 rounded-xl text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="uppercase bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold tracking-wider">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Resource</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {logs.map((log) => (
                <React.Fragment key={log.id}>
                  <tr className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-sans font-bold text-white">
                      {log.actorUsername || log.user?.username || '—'}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 text-[11px] font-semibold border border-slate-700">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      {log.targetResource || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {log.ipAddress || '—'}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold inline-flex items-center gap-1 ${
                        log.status === 'SUCCESS'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : log.status === 'WARNING'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-red-500/20 text-red-300'
                      }`}>
                        {log.status === 'SUCCESS' && <CheckCircle size={10} />}
                        {log.status === 'WARNING' && <AlertTriangle size={10} />}
                        {log.status === 'FAILURE' && <XCircle size={10} />}
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-sans">
                      {log.details ? (
                        <button
                          onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                          className="text-[11px] text-primary hover:underline cursor-pointer"
                        >
                          {expandedLogId === log.id ? 'Hide' : 'View'}
                        </button>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                  {expandedLogId === log.id && (
                    <tr className="bg-slate-950/70">
                      <td colSpan={7} className="p-4 border-y border-slate-800 text-xs">
                        <div className="font-sans text-slate-400 font-semibold mb-1">
                          Log Payload Details & User Agent:
                        </div>
                        {log.userAgent && (
                          <div className="text-slate-500 text-[11px] mb-2 font-mono break-all">
                            UA: {log.userAgent}
                          </div>
                        )}
                        <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-amber-200/90 text-xs overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-sans">
                    No audit log records match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
