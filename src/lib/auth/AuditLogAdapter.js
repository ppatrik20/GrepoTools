/**
 * AuditLogAdapter: Unified Client Seam for Security & System Audit Logs
 * Encapsulates query serialization, pagination, and multi-field filtering behind a normalized interface.
 */

export const AuditLogAdapter = {
  /**
   * Retrieves paginated security audit logs with optional filtering.
   * 
   * @param {object} [filters]
   * @param {number} [filters.limit=50]
   * @param {number} [filters.offset=0]
   * @param {string} [filters.action]
   * @param {string} [filters.actorUsername]
   * @param {string} [filters.status]
   * @param {string} [filters.targetResource]
   * @param {object} [options]
   * @param {Function} [options.fetchImpl=fetch]
   * @returns {Promise<{ logs: object[], total: number }>}
   */
  async fetchAuditLogs(filters = {}, { fetchImpl = fetch } = {}) {
    const {
      limit = 50,
      offset = 0,
      action,
      actorUsername,
      status,
      targetResource
    } = filters;

    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    if (action) params.set('action', action.trim());
    if (actorUsername) params.set('actorUsername', actorUsername.trim());
    if (status) params.set('status', status.trim());
    if (targetResource) params.set('targetResource', targetResource.trim());

    const res = await fetchImpl(`/api/admin/audit-logs?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Failed to fetch audit logs (HTTP ${res.status})`);
    }

    return {
      logs: Array.isArray(data.logs) ? data.logs : [],
      total: Number(data.total) || 0
    };
  }
};
