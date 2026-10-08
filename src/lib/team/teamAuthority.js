/**
 * Team Authority and RBAC Resolution Engine
 * Pure domain logic evaluating user operational privileges across team scopes.
 */

/**
 * Resolves tactical authority, effective role, and operational capability flags
 * for a user within a team and world context.
 * 
 * @param {object} user Active user payload (token or session profile)
 * @param {string} [activeWorldId] Current active world identifier
 * @param {object} [team] Optional team data object
 * @returns {object} Immutable authority evaluation
 */
export function resolveTeamAuthority(user, activeWorldId, team = null) {
  if (!user) {
    return Object.freeze({
      isGlobalAdmin: false,
      isTeamAdmin: false,
      effectiveRole: 'GUEST',
      userPermissions: [],
      canManageMembers: false,
      canManageInvites: false,
      canManageRoles: false,
      teamId: null
    });
  }

  const isGlobalAdmin = user.globalRole === 'GLOBAL_ADMIN';
  const teams = Array.isArray(user.teams) ? user.teams : [];
  let membership = teams.find(t => t.worldId === activeWorldId) || teams[0];

  // If a live team object with members is supplied, resolve live member status
  if (team && Array.isArray(team.members)) {
    const directMember = team.members.find(
      m => m.userId === user.id || m.userId === user.sub
    );
    if (directMember) {
      membership = {
        ...membership,
        role: directMember.role,
        teamId: team.id,
        worldId: team.worldId
      };
    }
  }

  const permissionsSet = new Set(membership?.permissions || []);
  if (Array.isArray(user.permissions)) {
    for (const p of user.permissions) permissionsSet.add(p);
  }
  if (isGlobalAdmin) {
    permissionsSet.add('*');
  }

  const userPermissions = Array.from(permissionsSet);
  const isTeamAdmin = isGlobalAdmin || membership?.role === 'TEAM_ADMIN';
  const hasWildcard = isGlobalAdmin || userPermissions.includes('*');

  return Object.freeze({
    isGlobalAdmin,
    isTeamAdmin,
    effectiveRole: isGlobalAdmin ? 'GLOBAL_ADMIN' : (membership?.role || 'TEAM_MEMBER'),
    userPermissions,
    canManageMembers: isTeamAdmin || hasWildcard || userPermissions.includes('MEMBERS_MANAGE'),
    canManageInvites: isTeamAdmin || hasWildcard || userPermissions.includes('INVITES_MANAGE'),
    canManageRoles: isTeamAdmin || hasWildcard || userPermissions.includes('ROLES_MANAGE'),
    teamId: membership?.teamId || team?.id || null
  });
}
