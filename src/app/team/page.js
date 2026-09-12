'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import {
  Users, Shield, UserPlus, Copy, Check,
  AlertCircle, CheckCircle2, Clock, Trash2,
  Edit3, Plus, X, Crown, Swords, Radar,
  Handshake, Crosshair, Flag, Zap, Compass,
  Anchor, Layers, Award, Sparkles, MapPin,
  Flame, ShieldAlert, Search, Sliders
} from 'lucide-react';
import { PERMISSION_DEFINITIONS, ALL_PERMISSIONS } from '@/lib/auth/rbac';

const AVAILABLE_ICONS = [
  { id: 'shield', label: 'Shield', icon: Shield },
  { id: 'swords', label: 'Swords', icon: Swords },
  { id: 'radar', label: 'Radar', icon: Radar },
  { id: 'handshake', label: 'Diplomacy', icon: Handshake },
  { id: 'crosshair', label: 'Crosshair', icon: Crosshair },
  { id: 'flag', label: 'Banner', icon: Flag },
  { id: 'crown', label: 'Crown', icon: Crown },
  { id: 'flame', label: 'Flame', icon: Flame },
  { id: 'compass', label: 'Compass', icon: Compass },
  { id: 'anchor', label: 'Naval Anchor', icon: Anchor }
];

const PRESET_COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#64748B'  // Slate
];

function getRoleIcon(iconName, size = 16, className = '') {
  const matched = AVAILABLE_ICONS.find(i => i.id === iconName);
  const IconComp = matched ? matched.icon : Shield;
  return <IconComp size={size} className={className} />;
}

export default function TeamManagementPage() {
  const { user, activeWorldId } = useApp();

  const [activeTab, setActiveTab] = useState('members');
  const [team, setTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [customRoles, setCustomRoles] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Search & Filters for Member Directory
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Invite form state
  const [targetPlayerName, setTargetPlayerName] = useState('');
  const [inviteRole, setInviteRole] = useState('TEAM_MEMBER');
  const [selectedInviteCustomRoleIds, setSelectedInviteCustomRoleIds] = useState([]);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [generatedInvite, setGeneratedInvite] = useState(null);
  const [copiedToken, setCopiedToken] = useState('');

  // Member Modal State
  const [editingMember, setEditingMember] = useState(null);
  const [memberModalRole, setMemberModalRole] = useState('TEAM_MEMBER');
  const [memberModalCustomRoleIds, setMemberModalCustomRoleIds] = useState([]);
  const [savingMember, setSavingMember] = useState(false);

  // Kick Member Confirmation Modal
  const [memberToKick, setMemberToKick] = useState(null);
  const [kickingMember, setKickingMember] = useState(false);

  // Custom Role Modal State (Create / Edit)
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [roleColor, setRoleColor] = useState('#3B82F6');
  const [roleIcon, setRoleIcon] = useState('shield');
  const [rolePriority, setRolePriority] = useState(50);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [savingRole, setSavingRole] = useState(false);

  // Delete Role Confirmation Modal
  const [roleToDelete, setRoleToDelete] = useState(null);
  const [deletingRole, setDeletingRole] = useState(false);

  const isGlobalAdmin = user?.globalRole === 'GLOBAL_ADMIN';
  const teams = user?.teams || [];
  const currentTeamMembership = teams.find(t => t.worldId === activeWorldId) || teams[0];
  const teamId = currentTeamMembership?.teamId;

  // Computed Permissions for the active user
  const userPermissions = useMemo(() => {
    if (isGlobalAdmin) return ['*'];
    const perms = new Set(currentTeamMembership?.permissions || []);
    if (user?.permissions) {
      for (const p of user.permissions) perms.add(p);
    }
    return Array.from(perms);
  }, [isGlobalAdmin, currentTeamMembership, user]);

  const isTeamAdmin = isGlobalAdmin || currentTeamMembership?.role === 'TEAM_ADMIN';
  const canManageMembers = isTeamAdmin || userPermissions.includes('MEMBERS_MANAGE') || userPermissions.includes('*');
  const canManageInvites = isTeamAdmin || userPermissions.includes('INVITES_MANAGE') || userPermissions.includes('*');
  const canManageRoles = isTeamAdmin || userPermissions.includes('ROLES_MANAGE') || userPermissions.includes('*');

  // Load team data and supplementary entities
  const loadTeamData = useCallback(async () => {
    let resolvedTeamId = teamId;

    if (!resolvedTeamId) {
      if (isGlobalAdmin) {
        try {
          const res = await fetch(`/api/teams?worldId=${activeWorldId}`);
          const data = await res.json();
          if (data.teams && data.teams.length > 0) {
            resolvedTeamId = data.teams[0].id;
          } else {
            setTeam(null);
            setLoading(false);
            return;
          }
        } catch {
          setLoading(false);
          return;
        }
      } else {
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      setError('');

      // Parallel fetch of Team, Members (with in-game stats), Custom Roles, and Invites
      const fetchCalls = [
        fetch(`/api/teams/${resolvedTeamId}`),
        fetch(`/api/teams/${resolvedTeamId}/members`),
        fetch(`/api/teams/${resolvedTeamId}/roles`)
      ];

      if (canManageInvites) {
        fetchCalls.push(fetch(`/api/teams/${resolvedTeamId}/invites`));
      }

      const results = await Promise.all(fetchCalls);
      const teamRes = results[0];
      const membersRes = results[1];
      const rolesRes = results[2];
      const invitesRes = results[3] || null;

      const [teamData, membersData, rolesData] = await Promise.all([
        teamRes.json(),
        membersRes.json(),
        rolesRes.json()
      ]);

      if (teamRes.ok) {
        setTeam(teamData.team);
        if (teamData.team?.invites) {
          setInvites(teamData.team.invites);
        }
      } else {
        setError(teamData.error || 'Failed to load team data');
      }

      if (membersRes.ok && membersData.members) {
        setMembers(membersData.members);
      }

      if (rolesRes.ok && rolesData.roles) {
        setCustomRoles(rolesData.roles);
      }

      if (invitesRes && invitesRes.ok) {
        const invitesData = await invitesRes.json();
        if (Array.isArray(invitesData.invites)) {
          setInvites(invitesData.invites);
        }
      }
    } catch (err) {
      setError('Error loading team data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [teamId, isGlobalAdmin, activeWorldId, canManageInvites]);

  useEffect(() => {
    loadTeamData();
  }, [loadTeamData]);

  // Handle Invite Generation
  const handleCreateInvite = async (e) => {
    e.preventDefault();
    if (!targetPlayerName.trim() || !team?.id) return;

    setCreatingInvite(true);
    setError('');
    setSuccessMsg('');
    setGeneratedInvite(null);

    try {
      const res = await fetch(`/api/teams/${team.id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPlayerName: targetPlayerName.trim(),
          role: inviteRole,
          customRoleIds: selectedInviteCustomRoleIds,
          expiresInDays
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create invitation');
        return;
      }

      setGeneratedInvite(data.invite);
      setSuccessMsg(`Invitation successfully generated for ${targetPlayerName}!`);
      setTargetPlayerName('');
      setSelectedInviteCustomRoleIds([]);
      loadTeamData();
    } catch (err) {
      setError('Error creating invite: ' + err.message);
    } finally {
      setCreatingInvite(false);
    }
  };

  // Handle Invite Revocation
  const handleRevokeInvite = async (inviteId) => {
    if (!team?.id || !inviteId) return;
    setError('');
    setSuccessMsg('');

    try {
      const res = await fetch(`/api/teams/${team.id}/invites/${inviteId}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to revoke invite');
        return;
      }

      setSuccessMsg('Invitation revoked successfully');
      loadTeamData();
    } catch (err) {
      setError('Error revoking invite: ' + err.message);
    }
  };

  const handleCopyLink = (token) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const fullUrl = `${origin}/invite/${token}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(''), 3000);
  };

  // Open Member Edit Modal
  const openEditMemberModal = (m) => {
    setEditingMember(m);
    setMemberModalRole(m.role);
    setMemberModalCustomRoleIds((m.customRoles || []).map(r => r.id));
  };

  // Save Member Updates
  const handleSaveMember = async (e) => {
    e.preventDefault();
    if (!editingMember || !team?.id) return;

    setSavingMember(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await fetch(`/api/teams/${team.id}/members/${editingMember.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: memberModalRole,
          customRoleIds: memberModalCustomRoleIds
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update member');
        return;
      }

      setSuccessMsg(`Updated roles & permissions for ${editingMember.playerName}`);
      setEditingMember(null);
      loadTeamData();
    } catch (err) {
      setError('Error updating member: ' + err.message);
    } finally {
      setSavingMember(false);
    }
  };

  // Execute Member Kick / Removal
  const handleConfirmKick = async () => {
    if (!memberToKick || !team?.id) return;

    setKickingMember(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await fetch(`/api/teams/${team.id}/members/${memberToKick.id}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to remove member');
        return;
      }

      setSuccessMsg(data.message || `${memberToKick.playerName} was removed from the team`);
      setMemberToKick(null);
      loadTeamData();
    } catch (err) {
      setError('Error removing member: ' + err.message);
    } finally {
      setKickingMember(false);
    }
  };

  // Open Create Role Modal
  const openCreateRoleModal = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDescription('');
    setRoleColor('#3B82F6');
    setRoleIcon('shield');
    setRolePriority(50);
    setRolePermissions([]);
    setRoleModalOpen(true);
  };

  // Open Edit Role Modal
  const openEditRoleModal = (role) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description || '');
    setRoleColor(role.color || '#3B82F6');
    setRoleIcon(role.icon || 'shield');
    setRolePriority(role.priority || 0);
    setRolePermissions(role.permissions || []);
    setRoleModalOpen(true);
  };

  // Save Custom Role (Create / Update)
  const handleSaveRole = async (e) => {
    e.preventDefault();
    if (!team?.id || !roleName.trim()) return;

    setSavingRole(true);
    setError('');
    setSuccessMsg('');

    const payload = {
      name: roleName.trim(),
      description: roleDescription.trim(),
      color: roleColor,
      icon: roleIcon,
      priority: Number(rolePriority) || 0,
      permissions: rolePermissions
    };

    try {
      const url = editingRole
        ? `/api/teams/${team.id}/roles/${editingRole.id}`
        : `/api/teams/${team.id}/roles`;
      const method = editingRole ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save custom role');
        return;
      }

      setSuccessMsg(editingRole ? `Role "${payload.name}" updated successfully` : `Role "${payload.name}" created!`);
      setRoleModalOpen(false);
      loadTeamData();
    } catch (err) {
      setError('Error saving role: ' + err.message);
    } finally {
      setSavingRole(false);
    }
  };

  // Execute Delete Custom Role
  const handleConfirmDeleteRole = async () => {
    if (!roleToDelete || !team?.id) return;

    setDeletingRole(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await fetch(`/api/teams/${team.id}/roles/${roleToDelete.id}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to delete role');
        return;
      }

      setSuccessMsg(data.message || `Role "${roleToDelete.name}" deleted`);
      setRoleToDelete(null);
      loadTeamData();
    } catch (err) {
      setError('Error deleting role: ' + err.message);
    } finally {
      setDeletingRole(false);
    }
  };

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      const matchesSearch =
        m.playerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.allianceName && m.allianceName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.username && m.username.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesRole =
        roleFilter === 'ALL' ||
        (roleFilter === 'TEAM_ADMIN' && m.role === 'TEAM_ADMIN') ||
        (roleFilter === 'TEAM_MEMBER' && m.role === 'TEAM_MEMBER') ||
        (roleFilter === 'VERIFIED' && m.verificationStatus === 'VERIFIED') ||
        (roleFilter === 'UNVERIFIED' && m.verificationStatus !== 'VERIFIED');

      return matchesSearch && matchesRole;
    });
  }, [members, searchQuery, roleFilter]);

  // Active invites list (from dedicated endpoint or team payload)
  const activeInvites = useMemo(() => {
    return invites.length > 0 ? invites : (team?.invites || []);
  }, [invites, team]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl text-center">
        <div className="p-8 bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl backdrop-blur-md">
          <Users className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">No Active Team Membership</h2>
          <p className="text-slate-400 text-sm mb-6">
            You are not currently assigned to a team on world <span className="font-mono text-amber-400 uppercase">{activeWorldId}</span>.
          </p>
          {isGlobalAdmin && (
            <p className="text-xs text-slate-500">
              As a Global Admin, create a team from the Admin dashboard to begin organizing alliances and players.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      {/* Team Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-slate-900/90 border border-slate-800 rounded-2xl backdrop-blur-xl shadow-2xl">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">{team.name}</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
              {team.worldId.toUpperCase()}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
              {members.length} {members.length === 1 ? 'Member' : 'Members'}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {customRoles.length} Custom Roles
            </span>
          </div>
          {team.description && (
            <p className="text-sm text-slate-400">{team.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Your Authority:</span>
          <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold rounded-lg text-xs flex items-center gap-1.5">
            {isGlobalAdmin ? <Crown size={14} /> : isTeamAdmin ? <Shield size={14} /> : <Users size={14} />}
            <span>{isGlobalAdmin ? 'Global Admin' : isTeamAdmin ? 'Team Commander' : 'Team Member'}</span>
          </span>
        </div>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="p-4 bg-red-950/50 border border-red-800 rounded-xl flex items-center justify-between gap-3 text-red-200 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-red-400 hover:text-white"><X size={16} /></button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-950/50 border border-emerald-800 rounded-xl flex items-center justify-between gap-3 text-emerald-200 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-400 hover:text-white"><X size={16} /></button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === 'members'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Users size={16} />
          <span>Members & Roster</span>
          <span className={`px-2 py-0.2 rounded-full text-xs ${activeTab === 'members' ? 'bg-slate-950/20 text-slate-950 font-mono' : 'bg-slate-800 text-slate-400'}`}>
            {members.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('invites')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === 'invites'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <UserPlus size={16} />
          <span>Invite Management</span>
          {activeInvites.length > 0 && (
            <span className={`px-2 py-0.2 rounded-full text-xs ${activeTab === 'invites' ? 'bg-slate-950/20 text-slate-950 font-mono' : 'bg-slate-800 text-slate-400'}`}>
              {activeInvites.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('roles')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === 'roles'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Award size={16} />
          <span>Custom Roles & Capabilities</span>
          <span className={`px-2 py-0.2 rounded-full text-xs ${activeTab === 'roles' ? 'bg-slate-950/20 text-slate-950 font-mono' : 'bg-slate-800 text-slate-400'}`}>
            {customRoles.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('roadmap')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === 'roadmap'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Sparkles size={16} />
          <span>Tactical Roadmap</span>
          <span className="px-2 py-0.2 rounded-full text-xs bg-amber-500/20 text-amber-300 font-mono">
            Upcoming
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MEMBERS DIRECTORY */}
      {/* ========================================================================= */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search player, alliance, account..."
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Sliders size={16} className="text-slate-500" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">All Roster ({members.length})</option>
                <option value="TEAM_ADMIN">Team Admins</option>
                <option value="TEAM_MEMBER">Team Members</option>
                <option value="VERIFIED">Verified Only</option>
                <option value="UNVERIFIED">Unverified Only</option>
              </select>
            </div>
          </div>

          {/* Members Table */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="text-xs uppercase bg-slate-950/70 text-slate-400 border-b border-slate-800 tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Operative</th>
                    <th className="py-3.5 px-4">Alliance</th>
                    <th className="py-3.5 px-4">In-Game Stats</th>
                    <th className="py-3.5 px-4">Authority</th>
                    <th className="py-3.5 px-4">Custom Roles</th>
                    <th className="py-3.5 px-4">Verification</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-500 text-sm">
                        No team operatives match the specified filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((m) => {
                      const isSelf = m.userId === user?.sub;
                      return (
                        <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-xs">
                                {m.playerName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-white flex items-center gap-1.5">
                                  <span>{m.playerName}</span>
                                  {isSelf && (
                                    <span className="text-[10px] px-1.5 py-0.2 bg-slate-800 text-amber-400 border border-amber-500/30 rounded">YOU</span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 font-mono">
                                  ID: {m.playerId} &bull; user: {m.username}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-semibold text-slate-300">
                              {m.allianceName || 'No Alliance'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="text-xs space-y-0.5 font-mono">
                              <div className="text-amber-400 font-bold">
                                {m.points.toLocaleString()} pts
                              </div>
                              <div className="text-slate-400">
                                {m.townsCount} towns &bull; {m.rank ? `Rank #${m.rank}` : 'Unranked'}
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className={`px-2.5 py-0.5 rounded text-xs font-bold inline-flex items-center gap-1 ${
                              m.role === 'TEAM_ADMIN'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}>
                              {m.role === 'TEAM_ADMIN' ? <Crown size={12} /> : <Users size={12} />}
                              <span>{m.role === 'TEAM_ADMIN' ? 'Commander' : 'Member'}</span>
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap max-w-xs">
                              {m.customRoles && m.customRoles.length > 0 ? (
                                m.customRoles.map(cr => (
                                  <span
                                    key={cr.id}
                                    style={{
                                      backgroundColor: `${cr.color}22`,
                                      borderColor: `${cr.color}66`,
                                      color: cr.color
                                    }}
                                    className="px-2 py-0.5 rounded text-[11px] font-bold border inline-flex items-center gap-1"
                                    title={cr.description || cr.name}
                                  >
                                    {getRoleIcon(cr.icon, 11)}
                                    <span>{cr.name}</span>
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-slate-500 italic">None</span>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            {m.verificationStatus === 'VERIFIED' ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                                <CheckCircle2 size={13} /> Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                                <Clock size={13} /> Unverified
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {canManageMembers && (
                                <button
                                  onClick={() => openEditMemberModal(m)}
                                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                                  title="Manage Roles & Permissions"
                                >
                                  <Edit3 size={15} />
                                </button>
                              )}

                              {(canManageMembers || isSelf) && (
                                <button
                                  onClick={() => setMemberToKick(m)}
                                  className="p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-200 border border-red-800/40 rounded-lg transition-colors cursor-pointer"
                                  title={isSelf ? 'Leave Team' : 'Remove Member'}
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: INVITES MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'invites' && (
        <div className="space-y-6">
          {canManageInvites ? (
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold text-white">Generate Cryptographic Team Invitation</h2>
              </div>
              <p className="text-xs text-slate-400">
                Invitations are cryptographically bound to the target Grepolis in-game username. You can optionally pre-assign custom tactical capabilities.
              </p>

              <form onSubmit={handleCreateInvite} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Grepolis In-Game Username
                    </label>
                    <input
                      type="text"
                      required
                      value={targetPlayerName}
                      onChange={(e) => setTargetPlayerName(e.target.value)}
                      placeholder="e.g. Leonidas"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Assigned Base Role
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                    >
                      <option value="TEAM_MEMBER">Team Member (Tactical Operative)</option>
                      {isGlobalAdmin && <option value="TEAM_ADMIN">Team Administrator (Commander)</option>}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Link Expiration
                    </label>
                    <select
                      value={expiresInDays}
                      onChange={(e) => setExpiresInDays(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                    >
                      <option value={1}>24 Hours</option>
                      <option value={3}>3 Days</option>
                      <option value={7}>7 Days (Standard)</option>
                      <option value={14}>14 Days</option>
                      <option value={30}>30 Days</option>
                    </select>
                  </div>
                </div>

                {/* Pre-assign Custom Roles */}
                {customRoles.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Pre-assign Tactical Custom Roles (Optional)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {customRoles.map(cr => {
                        const isSelected = selectedInviteCustomRoleIds.includes(cr.id);
                        return (
                          <button
                            type="button"
                            key={cr.id}
                            onClick={() => {
                              setSelectedInviteCustomRoleIds(prev =>
                                isSelected ? prev.filter(id => id !== cr.id) : [...prev, cr.id]
                              );
                            }}
                            style={{
                              borderColor: isSelected ? cr.color : undefined,
                              backgroundColor: isSelected ? `${cr.color}22` : undefined,
                              color: isSelected ? cr.color : undefined
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                              isSelected
                                ? 'shadow-sm'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            {getRoleIcon(cr.icon, 13)}
                            <span>{cr.name}</span>
                            {isSelected && <Check size={12} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={creatingInvite}
                    className="py-2.5 px-6 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-lg shadow-amber-500/20"
                  >
                    {creatingInvite ? (
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <UserPlus size={16} />
                        <span>Issue Invitation Link</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Newly Generated Invite Banner */}
              {generatedInvite && (
                <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/40 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 animate-fade-in">
                  <div>
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                      Invitation Link Created for {generatedInvite.targetPlayerName} ({generatedInvite.role})
                    </span>
                    <p className="text-xs font-mono text-slate-300 mt-1 break-all">
                      {typeof window !== 'undefined' ? `${window.location.origin}/invite/${generatedInvite.token}` : `/invite/${generatedInvite.token}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopyLink(generatedInvite.token)}
                    className="px-4 py-2 bg-amber-500 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shrink-0 cursor-pointer hover:bg-amber-400 transition-colors"
                  >
                    {copiedToken === generatedInvite.token ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedToken === generatedInvite.token ? 'Link Copied!' : 'Copy Link'}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl text-center text-slate-400 text-sm">
              You do not have sufficient permissions (INVITES_MANAGE) to generate team invitations.
            </div>
          )}

          {/* Active Invites Table */}
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 shadow-xl">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <span>Pending Team Invitations ({activeInvites.length})</span>
            </h2>

            {activeInvites.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="text-xs uppercase bg-slate-950/70 text-slate-400 border-b border-slate-800 tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Invitee</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Pre-Assigned Custom Roles</th>
                      <th className="py-3 px-4">Status & Expiration</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {activeInvites.map((inv) => {
                      const expDate = new Date(inv.expiresAt);
                      const isExpired = expDate < new Date();
                      const daysLeft = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                      const assignedRoles = (inv.customRoleIds || []).map(id =>
                        customRoles.find(r => r.id === id)
                      ).filter(Boolean);

                      return (
                        <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                            <span>{inv.targetPlayerName}</span>
                          </td>

                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              inv.role === 'TEAM_ADMIN'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-300'
                            }`}>
                              {inv.role === 'TEAM_ADMIN' ? 'Commander' : 'Member'}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {assignedRoles.length > 0 ? (
                                assignedRoles.map(cr => (
                                  <span
                                    key={cr.id}
                                    style={{
                                      backgroundColor: `${cr.color}22`,
                                      borderColor: `${cr.color}66`,
                                      color: cr.color
                                    }}
                                    className="px-2 py-0.5 rounded text-[11px] font-bold border inline-flex items-center gap-1"
                                  >
                                    {getRoleIcon(cr.icon, 11)}
                                    <span>{cr.name}</span>
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-slate-500 italic">Standard</span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="text-xs">
                              {isExpired ? (
                                <span className="text-red-400 font-bold">Expired</span>
                              ) : (
                                <span className="text-slate-300 flex items-center gap-1">
                                  <Clock size={12} className="text-amber-400" />
                                  <span>{daysLeft} {daysLeft === 1 ? 'day' : 'days'} remaining ({expDate.toLocaleDateString()})</span>
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleCopyLink(inv.token)}
                                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors text-xs inline-flex items-center gap-1.5 cursor-pointer font-semibold"
                                title="Copy 1-click invitation link"
                              >
                                {copiedToken === inv.token ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                                <span>{copiedToken === inv.token ? 'Copied' : 'Copy'}</span>
                              </button>

                              {canManageInvites && (
                                <button
                                  onClick={() => handleRevokeInvite(inv.id)}
                                  className="p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-200 border border-red-800/40 rounded-lg transition-colors cursor-pointer"
                                  title="Revoke Invitation"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No pending invitations for this team.</p>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CUSTOM ROLES & CAPABILITIES */}
      {/* ========================================================================= */}
      {activeTab === 'roles' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <span>Capability-Based Custom Roles</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure fine-grained roles (e.g. Attack Coordinator, Defense Lead) and assign specialized tactical authorities.
              </p>
            </div>

            {canManageRoles && (
              <button
                onClick={openCreateRoleModal}
                className="py-2 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-lg shadow-amber-500/20"
              >
                <Plus size={16} />
                <span>Create Custom Role</span>
              </button>
            )}
          </div>

          {/* Grid of Role Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {customRoles.map((role) => (
              <div
                key={role.id}
                className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all shadow-xl"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        style={{
                          backgroundColor: `${role.color}22`,
                          borderColor: `${role.color}66`,
                          color: role.color
                        }}
                        className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
                      >
                        {getRoleIcon(role.icon, 20)}
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-base leading-tight">{role.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] font-mono text-slate-500">
                            Priority {role.priority}
                          </span>
                          <span className="text-[11px] text-slate-400 bg-slate-800/80 px-2 py-0.2 rounded-full font-semibold">
                            {role.memberCount} {role.memberCount === 1 ? 'member' : 'members'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {canManageRoles && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditRoleModal(role)}
                          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                          title="Edit Role"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => setRoleToDelete(role)}
                          className="p-1.5 hover:bg-red-950/50 text-red-400 hover:text-red-300 rounded-lg transition-colors cursor-pointer"
                          title="Delete Role"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>

                  {role.description && (
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {role.description}
                    </p>
                  )}

                  {/* Capabilities Badges */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Granted Capabilities ({role.permissions?.length || 0})
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {role.permissions && role.permissions.length > 0 ? (
                        role.permissions.map(p => {
                          const def = PERMISSION_DEFINITIONS.find(d => d.key === p);
                          return (
                            <span
                              key={p}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-950 text-slate-300 border border-slate-800"
                              title={def?.description || p}
                            >
                              {def?.label || p}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-xs text-slate-500 italic">No specific permissions granted</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: TACTICAL ROADMAP */}
      {/* ========================================================================= */}
      {activeTab === 'roadmap' && (
        <div className="space-y-6">
          <div className="p-6 bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-800 rounded-2xl space-y-2">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-amber-400" />
              <span>Tactical Command Modules Roadmap</span>
            </h2>
            <p className="text-sm text-slate-400 max-w-3xl">
              The capability-based RBAC system is fully wired to seamlessly govern these advanced upcoming tactical modules.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Feature 1: Operation Rooms */}
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 hover:border-amber-500/40 transition-all shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                    <Swords size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Operation Rooms (Synchronous Landings)</h3>
                    <span className="text-xs text-red-400 font-semibold">Offensive Coordination</span>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  RBAC Connected
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Coordinate synchronized CS siege strikes, timing windows, anti-timing buffer offsets, and wave schedules across alliance wings.
              </p>
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500">Required Capability:</span>
                <span className="font-mono font-bold text-amber-400">OPERATIONS_COORDINATE</span>
              </div>
            </div>

            {/* Feature 2: Bireme Defense Dispatcher */}
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 hover:border-blue-500/40 transition-all shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <ShieldAlert size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Bireme Defense Dispatcher</h3>
                    <span className="text-xs text-blue-400 font-semibold">Emergency Reinforcements</span>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  RBAC Connected
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Emergency siege alarm dispatcher that calculates nearest available bireme stacks, naval travel times, and sends 1-click reinforcement orders.
              </p>
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500">Required Capability:</span>
                <span className="font-mono font-bold text-blue-400">DEFENSE_COORDINATE</span>
              </div>
            </div>

            {/* Feature 3: Coalition Frontline Heatmap */}
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 hover:border-emerald-500/40 transition-all shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Layers size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Coalition Frontline Heatmap</h3>
                    <span className="text-xs text-emerald-400 font-semibold">Territorial Dominance</span>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  RBAC Connected
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Live ocean border and island pressure heatmap highlighting contested warzones, safe-core islands, and strategic frontlines across pacts.
              </p>
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500">Required Capability:</span>
                <span className="font-mono font-bold text-emerald-400">COALITIONS_MANAGE</span>
              </div>
            </div>

            {/* Feature 4: Ghost Town Radar */}
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 hover:border-purple-500/40 transition-all shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <Radar size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Ghost Town Radar & Claim Lock</h3>
                    <span className="text-xs text-purple-400 font-semibold">Asset Reclamation</span>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  RBAC Connected
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Automated detection of abandoned ghost towns above 5k points with built-in team reservation locks to avoid friendly fire claims.
              </p>
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500">Required Capability:</span>
                <span className="font-mono font-bold text-purple-400">GHOST_RADAR_RESERVE</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: EDIT MEMBER ROLE & CUSTOM ROLES */}
      {/* ========================================================================= */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold text-white">Manage Operative Roles</h3>
              </div>
              <button
                onClick={() => setEditingMember(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-sm">
                {editingMember.playerName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-white">{editingMember.playerName}</div>
                <div className="text-xs text-slate-400 font-mono">
                  {editingMember.allianceName || 'No Alliance'} &bull; {editingMember.points.toLocaleString()} pts &bull; {editingMember.townsCount} towns
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveMember} className="space-y-4">
              {/* Base Team Role */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Base Team Role
                </label>
                <select
                  value={memberModalRole}
                  onChange={(e) => setMemberModalRole(e.target.value)}
                  disabled={!isTeamAdmin && !isGlobalAdmin}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500 disabled:opacity-60"
                >
                  <option value="TEAM_MEMBER">Team Member (Operative)</option>
                  {(isTeamAdmin || isGlobalAdmin) && (
                    <option value="TEAM_ADMIN">Team Administrator (Commander)</option>
                  )}
                </select>
                {memberModalRole === 'TEAM_ADMIN' && (
                  <p className="text-xs text-amber-400/80">
                    Team Administrators inherit full operational and administrative capabilities across all modules.
                  </p>
                )}
              </div>

              {/* Custom Roles Assignment */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Assigned Custom Roles
                </label>

                {customRoles.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No custom roles created yet.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {customRoles.map(cr => {
                      const isAssigned = memberModalCustomRoleIds.includes(cr.id);
                      return (
                        <div
                          key={cr.id}
                          onClick={() => {
                            setMemberModalCustomRoleIds(prev =>
                              isAssigned ? prev.filter(id => id !== cr.id) : [...prev, cr.id]
                            );
                          }}
                          style={{
                            borderColor: isAssigned ? cr.color : undefined
                          }}
                          className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                            isAssigned
                              ? 'bg-slate-950 border-opacity-80'
                              : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              style={{
                                backgroundColor: `${cr.color}22`,
                                borderColor: `${cr.color}66`,
                                color: cr.color
                              }}
                              className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0"
                            >
                              {getRoleIcon(cr.icon, 14)}
                            </div>
                            <div>
                              <div className="font-bold text-white text-xs">{cr.name}</div>
                              <div className="text-[10px] text-slate-400">
                                {cr.permissions?.length || 0} capabilities granted
                              </div>
                            </div>
                          </div>

                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                            isAssigned ? 'bg-amber-500 border-amber-500 text-slate-950' : 'border-slate-700 bg-slate-900'
                          }`}>
                            {isAssigned && <Check size={13} strokeWidth={3} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMember}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {savingMember ? (
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>Save Role Assignments</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: KICK / REMOVE MEMBER CONFIRMATION */}
      {/* ========================================================================= */}
      {memberToKick && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <h3 className="text-lg font-bold text-white">
                {memberToKick.userId === user?.sub ? 'Leave Team?' : 'Remove Operative?'}
              </h3>
            </div>

            <p className="text-sm text-slate-300">
              {memberToKick.userId === user?.sub
                ? `Are you sure you want to leave ${team.name}? You will lose tactical access to alliance coordinates and operations.`
                : `Are you sure you want to remove ${memberToKick.playerName} from ${team.name}?`}
            </p>

            {memberToKick.role === 'TEAM_ADMIN' && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300">
                Notice: If this operative is the sole Team Administrator, removal is safely blocked until another administrator is designated.
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setMemberToKick(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmKick}
                disabled={kickingMember}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {kickingMember ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>{memberToKick.userId === user?.sub ? 'Leave Team' : 'Confirm Removal'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CREATE / EDIT CUSTOM ROLE */}
      {/* ========================================================================= */}
      {roleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold text-white">
                  {editingRole ? `Edit Role: ${editingRole.name}` : 'Create Custom Tactical Role'}
                </h3>
              </div>
              <button
                onClick={() => setRoleModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Role Title
                  </label>
                  <input
                    type="text"
                    required
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="e.g. Strike Coordinator"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Display Priority (Order)
                  </label>
                  <input
                    type="number"
                    value={rolePriority}
                    onChange={(e) => setRolePriority(Number(e.target.value))}
                    min={0}
                    max={100}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Tactical Purpose / Description
                </label>
                <textarea
                  rows={2}
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  placeholder="Describe operational responsibilities and squad command duties..."
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Color Swatch Picker */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Insignia Color
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setRoleColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-lg transition-transform cursor-pointer ${
                        roleColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'opacity-80 hover:opacity-100'
                      }`}
                    />
                  ))}
                  <input
                    type="color"
                    value={roleColor}
                    onChange={(e) => setRoleColor(e.target.value)}
                    className="w-8 h-8 rounded-lg bg-transparent border-0 cursor-pointer p-0"
                    title="Custom hex color"
                  />
                </div>
              </div>

              {/* Icon Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Insignia Emblem
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {AVAILABLE_ICONS.map(item => {
                    const isSelected = roleIcon === item.id;
                    const IconComp = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setRoleIcon(item.id)}
                        className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <IconComp size={18} />
                        <span className="text-[10px] font-semibold">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Capability Checkboxes */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Assigned Capabilities
                  </label>
                  <span className="text-[11px] font-mono text-amber-400">
                    {rolePermissions.length} / {PERMISSION_DEFINITIONS.length} active
                  </span>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {PERMISSION_DEFINITIONS.map(def => {
                    const isChecked = rolePermissions.includes(def.key);
                    return (
                      <div
                        key={def.key}
                        onClick={() => {
                          setRolePermissions(prev =>
                            isChecked ? prev.filter(k => k !== def.key) : [...prev, def.key]
                          );
                        }}
                        className={`p-2.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-slate-950 border-amber-500/60'
                            : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          isChecked ? 'bg-amber-500 border-amber-500 text-slate-950' : 'border-slate-700 bg-slate-900'
                        }`}>
                          {isChecked && <Check size={11} strokeWidth={3} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">{def.label}</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded font-mono uppercase">{def.category}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{def.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setRoleModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRole}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {savingRole ? (
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>{editingRole ? 'Save Changes' : 'Create Custom Role'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: DELETE CUSTOM ROLE CONFIRMATION */}
      {/* ========================================================================= */}
      {roleToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <h3 className="text-lg font-bold text-white">Delete Custom Role</h3>
            </div>

            <p className="text-sm text-slate-300">
              Are you sure you want to delete the role <span className="font-bold text-white">&quot;{roleToDelete.name}&quot;</span>?
              It will be unassigned from all {roleToDelete.memberCount || 0} team members.
            </p>

            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setRoleToDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRole}
                disabled={deletingRole}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {deletingRole ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Delete Role</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
