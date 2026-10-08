/**
 * TeamOperationsAdapter: Unified Client Seam for Team Operations
 * Encapsulates data bundling, member updates, role CRUD, and cryptographic invite lifecycles.
 */

export const TeamOperationsAdapter = {
  /**
   * Loads full team bundle including team details, enriched members, custom roles,
   * and pending invites in parallel.
   * 
   * @param {object} params
   * @param {string} [params.teamId]
   * @param {string} params.activeWorldId
   * @param {boolean} [params.isGlobalAdmin=false]
   * @param {boolean} [params.canManageInvites=false]
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<object>} { team, members, customRoles, invites }
   */
  async loadTeamBundle({
    teamId,
    activeWorldId,
    isGlobalAdmin = false,
    canManageInvites = false,
    fetchImpl = fetch
  }) {
    let resolvedTeamId = teamId;

    if (!resolvedTeamId) {
      if (isGlobalAdmin) {
        const res = await fetchImpl(`/api/teams?worldId=${encodeURIComponent(activeWorldId)}`);
        if (!res.ok) {
          throw new Error(`Failed to query world teams: HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.teams && data.teams.length > 0) {
          resolvedTeamId = data.teams[0].id;
        } else {
          return { team: null, members: [], customRoles: [], invites: [] };
        }
      } else {
        return { team: null, members: [], customRoles: [], invites: [] };
      }
    }

    const fetchCalls = [
      fetchImpl(`/api/teams/${resolvedTeamId}`),
      fetchImpl(`/api/teams/${resolvedTeamId}/members`),
      fetchImpl(`/api/teams/${resolvedTeamId}/roles`)
    ];

    if (canManageInvites) {
      fetchCalls.push(fetchImpl(`/api/teams/${resolvedTeamId}/invites`));
    }

    const results = await Promise.all(fetchCalls);
    const [teamRes, membersRes, rolesRes, invitesRes] = results;

    const [teamData, membersData, rolesData] = await Promise.all([
      teamRes.json(),
      membersRes.json(),
      rolesRes.json()
    ]);

    if (!teamRes.ok) {
      throw new Error(teamData.error || 'Failed to load team data');
    }

    let invites = [];
    if (invitesRes && invitesRes.ok) {
      const invitesData = await invitesRes.json();
      if (Array.isArray(invitesData.invites)) {
        invites = invitesData.invites;
      }
    } else if (Array.isArray(teamData.team?.invites)) {
      invites = teamData.team.invites;
    }

    return {
      team: teamData.team || null,
      members: Array.isArray(membersData.members) ? membersData.members : [],
      customRoles: Array.isArray(rolesData.roles) ? rolesData.roles : [],
      invites
    };
  },

  /**
   * Updates a member's base role and custom role assignments.
   * 
   * @param {object} params
   * @param {string} params.teamId
   * @param {string} params.memberId
   * @param {string} params.role 'TEAM_ADMIN' | 'TEAM_MEMBER'
   * @param {Array<string>} params.customRoleIds
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async updateMember({ teamId, memberId, role, customRoleIds, fetchImpl = fetch }) {
    const res = await fetchImpl(`/api/teams/${teamId}/members/${memberId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, customRoleIds })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update member');
    }
    return data;
  },

  /**
   * Removes (kicks) a member from the team.
   * 
   * @param {object} params
   * @param {string} params.teamId
   * @param {string} params.memberId
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async removeMember({ teamId, memberId, fetchImpl = fetch }) {
    const res = await fetchImpl(`/api/teams/${teamId}/members/${memberId}`, {
      method: 'DELETE'
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to remove member');
    }
    return data;
  },

  /**
   * Creates or updates a custom role.
   * 
   * @param {object} params
   * @param {string} params.teamId
   * @param {string} [params.roleId] If provided, updates existing role
   * @param {object} params.roleData { name, description, color, icon, priority, permissions }
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async saveRole({ teamId, roleId, roleData, fetchImpl = fetch }) {
    const url = roleId
      ? `/api/teams/${teamId}/roles/${roleId}`
      : `/api/teams/${teamId}/roles`;
    const method = roleId ? 'PUT' : 'POST';

    const res = await fetchImpl(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roleData)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save custom role');
    }
    return data;
  },

  /**
   * Deletes a custom role.
   * 
   * @param {object} params
   * @param {string} params.teamId
   * @param {string} params.roleId
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async deleteRole({ teamId, roleId, fetchImpl = fetch }) {
    const res = await fetchImpl(`/api/teams/${teamId}/roles/${roleId}`, {
      method: 'DELETE'
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to delete role');
    }
    return data;
  },

  /**
   * Generates a cryptographic invitation link for a target player.
   * 
   * @param {object} params
   * @param {string} params.teamId
   * @param {object} params.inviteData { targetPlayerName, role, customRoleIds, expiresInDays }
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<object>} Created invite { invite }
   */
  async createInvite({ teamId, inviteData, fetchImpl = fetch }) {
    const res = await fetchImpl(`/api/teams/${teamId}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inviteData)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create invitation');
    }
    return data;
  },

  /**
   * Revokes an active invitation.
   * 
   * @param {object} params
   * @param {string} params.teamId
   * @param {string} params.inviteId
   * @param {Function} [params.fetchImpl=fetch]
   * @returns {Promise<object>}
   */
  async revokeInvite({ teamId, inviteId, fetchImpl = fetch }) {
    const res = await fetchImpl(`/api/teams/${teamId}/invites/${inviteId}`, {
      method: 'DELETE'
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to revoke invitation');
    }
    return data;
  }
};
