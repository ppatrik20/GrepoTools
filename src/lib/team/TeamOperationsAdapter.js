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
  async loadTeamBundle(teamIdOrParams, options = {}) {
    const params = typeof teamIdOrParams === 'string'
      ? { teamId: teamIdOrParams, ...(options || {}) }
      : (teamIdOrParams || {});

    const {
      teamId,
      activeWorldId,
      isGlobalAdmin = false,
      canManageInvites = false,
      fetchImpl = fetch
    } = params;

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

    const encodedTeamId = encodeURIComponent(resolvedTeamId);
    const teamRes = await fetchImpl(`/api/teams/${encodedTeamId}`);
    const teamData = await teamRes.json();

    if (!teamRes.ok) {
      throw new Error(teamData.error || 'Failed to load team data');
    }

    const teamObj = teamData.team || null;
    const bundledMembers = Array.isArray(teamData.members)
      ? teamData.members
      : Array.isArray(teamObj?.members)
        ? teamObj.members
        : null;
    const bundledRoles = Array.isArray(teamData.customRoles)
      ? teamData.customRoles
      : Array.isArray(teamData.roles)
        ? teamData.roles
        : Array.isArray(teamObj?.customRoles)
          ? teamObj.customRoles
          : null;
    const bundledInvites = Array.isArray(teamData.invites)
      ? teamData.invites
      : Array.isArray(teamObj?.invites)
        ? teamObj.invites
        : null;

    if (
      Array.isArray(bundledMembers) &&
      Array.isArray(bundledRoles) &&
      (Array.isArray(bundledInvites) || !canManageInvites)
    ) {
      return {
        team: teamObj,
        members: bundledMembers,
        customRoles: bundledRoles,
        invites: Array.isArray(bundledInvites) ? bundledInvites : []
      };
    }

    // Fallback for test fixtures that only return partial team metadata on GET /api/teams/[id]
    const fetchCalls = [
      Array.isArray(bundledMembers)
        ? Promise.resolve({ ok: true, json: async () => ({ members: bundledMembers }) })
        : fetchImpl(`/api/teams/${encodedTeamId}/members`),
      Array.isArray(bundledRoles)
        ? Promise.resolve({ ok: true, json: async () => ({ roles: bundledRoles }) })
        : fetchImpl(`/api/teams/${encodedTeamId}/roles`)
    ];

    if (canManageInvites && !Array.isArray(bundledInvites)) {
      fetchCalls.push(fetchImpl(`/api/teams/${encodedTeamId}/invites`));
    }

    const [membersRes, rolesRes, invitesRes] = await Promise.all(fetchCalls);
    const [membersData, rolesData] = await Promise.all([
      membersRes.json(),
      rolesRes.json()
    ]);

    let invites = Array.isArray(bundledInvites) ? bundledInvites : [];
    if (invitesRes && invitesRes.ok) {
      const invitesData = await invitesRes.json();
      if (Array.isArray(invitesData.invites)) {
        invites = invitesData.invites;
      }
    }

    return {
      team: teamObj,
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
  },

  /**
   * Loads the active world endgame state and team war room projects.
   */
  async loadEndgameState({ teamId, fetchImpl = fetch }) {
    const res = await fetchImpl(`/api/teams/${encodeURIComponent(teamId)}/endgame`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to load endgame state');
    }
    return data;
  },

  /**
   * Upserts a world wonder project for the team.
   */
  async updateWonderProject({ teamId, projectData, fetchImpl = fetch }) {
    const res = await fetchImpl(`/api/teams/${encodeURIComponent(teamId)}/endgame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'UPSERT_WONDER_PROJECT', ...projectData })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update wonder project');
    }
    return data;
  },

  /**
   * Records resource or favor contribution towards a wonder stage.
   */
  async recordWonderContribution({ teamId, contributionData, fetchImpl = fetch }) {
    const res = await fetchImpl(`/api/teams/${encodeURIComponent(teamId)}/endgame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ADD_WONDER_CONTRIBUTION', ...contributionData })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to record wonder contribution');
    }
    return data;
  },

  /**
   * Updates operative vacation status or alliance join date.
   */
  async updateMemberEndgameStatus({ teamId, memberData, fetchImpl = fetch }) {
    const res = await fetchImpl(`/api/teams/${encodeURIComponent(teamId)}/endgame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'UPDATE_MEMBER_STATUS', ...memberData })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update operative endgame status');
    }
    return data;
  },

  /**
   * Toggles valid island status for domination war room.
   */
  async toggleDominationIsland({ teamId, islandData, fetchImpl = fetch }) {
    const res = await fetchImpl(`/api/teams/${encodeURIComponent(teamId)}/endgame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'TOGGLE_DOMINATION_ISLAND', ...islandData })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to toggle domination island');
    }
    return data;
  },

  /**
   * Updates an Olympus temple garrison, shield, or portal state.
   */
  async updateTempleState({ teamId, templeData, fetchImpl = fetch }) {
    const res = await fetchImpl(`/api/teams/${encodeURIComponent(teamId)}/endgame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'UPSERT_TEMPLE_STATE', ...templeData })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update temple state');
    }
    return data;
  }
};
