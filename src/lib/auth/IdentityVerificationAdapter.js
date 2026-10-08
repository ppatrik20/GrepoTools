/**
 * IdentityVerificationAdapter: Unified Client Seam for In-Game Operative Verification & Identity
 * Encapsulates on-demand town verification triggers and cross-world master player queries.
 */

export const IdentityVerificationAdapter = {
  /**
   * Executes an on-demand town verification handshake for the current user.
   * 
   * @param {object} params
   * @param {string} [params.worldId] Scopes check to a specific world
   * @param {object} [options]
   * @param {Function} [options.fetchImpl=fetch]
   * @returns {Promise<{ success: boolean, verified: boolean, message: string, town?: object }>}
   */
  async verifyTownOwnership({ worldId } = {}, { fetchImpl = fetch } = {}) {
    const res = await fetchImpl('/api/auth/verify-town', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || data.error || 'Verification check failed');
    }

    return {
      success: Boolean(data.success),
      verified: Boolean(data.verified),
      message: data.message || (data.verified ? 'Verification successful!' : 'Verification code not found yet'),
      town: data.town || null
    };
  },

  /**
   * Fetches master player profile, tactical towns, and recent conquest history for a world.
   * 
   * @param {object} params
   * @param {string} [params.worldId='hu119']
   * @param {string} [params.playerName]
   * @param {number|string} [params.playerId]
   * @param {object} [options]
   * @param {Function} [options.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async fetchMasterPlayer({ worldId = 'hu119', playerName, playerId } = {}, { fetchImpl = fetch } = {}) {
    const params = new URLSearchParams({ world: worldId.toLowerCase().trim() });
    if (playerId) params.set('playerId', String(playerId));
    if (playerName) params.set('playerName', String(playerName).trim());

    const res = await fetchImpl(`/api/master-player?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch player profile');
    }

    return data;
  }
};
