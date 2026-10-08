'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import {
  Users, Shield, Crown, AlertCircle, CheckCircle2,
  X, UserPlus, Award, Sparkles
} from 'lucide-react';
import { resolveTeamAuthority } from '@/lib/team/teamAuthority';
import { TeamOperationsAdapter } from '@/lib/team/TeamOperationsAdapter';
import TeamMembersTab from '@/components/team/tabs/TeamMembersTab';
import TeamInvitesTab from '@/components/team/tabs/TeamInvitesTab';
import TeamRolesTab from '@/components/team/tabs/TeamRolesTab';
import TeamRoadmapTab from '@/components/team/tabs/TeamRoadmapTab';
import MemberEditModal from '@/components/team/modals/MemberEditModal';
import MemberKickModal from '@/components/team/modals/MemberKickModal';
import CustomRoleModal from '@/components/team/modals/CustomRoleModal';
import RoleDeleteModal from '@/components/team/modals/RoleDeleteModal';

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

  // Domain authority resolution
  const authority = useMemo(() => {
    return resolveTeamAuthority(user, activeWorldId, team);
  }, [user, activeWorldId, team]);

  const {
    isGlobalAdmin,
    isTeamAdmin,
    canManageMembers,
    canManageInvites,
    canManageRoles,
    teamId
  } = authority;

  // Load team data and supplementary entities via TeamOperationsAdapter
  const loadTeamData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const bundle = await TeamOperationsAdapter.loadTeamBundle({
        teamId,
        activeWorldId,
        isGlobalAdmin,
        canManageInvites
      });

      setTeam(bundle.team);
      setMembers(bundle.members);
      setCustomRoles(bundle.customRoles);
      setInvites(bundle.invites);
    } catch (err) {
      setError('Error loading team data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [teamId, activeWorldId, isGlobalAdmin, canManageInvites]);

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
      const data = await TeamOperationsAdapter.createInvite({
        teamId: team.id,
        inviteData: {
          targetPlayerName: targetPlayerName.trim(),
          role: inviteRole,
          customRoleIds: selectedInviteCustomRoleIds,
          expiresInDays
        }
      });

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
      await TeamOperationsAdapter.revokeInvite({
        teamId: team.id,
        inviteId
      });

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
      await TeamOperationsAdapter.updateMember({
        teamId: team.id,
        memberId: editingMember.id,
        role: memberModalRole,
        customRoleIds: memberModalCustomRoleIds
      });

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
      const data = await TeamOperationsAdapter.removeMember({
        teamId: team.id,
        memberId: memberToKick.id
      });

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
    setRolePriority(role.priority ?? 0);
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
      await TeamOperationsAdapter.saveRole({
        teamId: team.id,
        roleId: editingRole?.id,
        roleData: payload
      });

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
      const data = await TeamOperationsAdapter.deleteRole({
        teamId: team.id,
        roleId: roleToDelete.id
      });

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

      {/* Tab Panels */}
      {activeTab === 'members' && (
        <TeamMembersTab
          members={members}
          filteredMembers={filteredMembers}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}
          canManageMembers={canManageMembers}
          currentUserId={user?.sub || user?.id}
          onEditMember={openEditMemberModal}
          onKickMember={setMemberToKick}
        />
      )}

      {activeTab === 'invites' && (
        <TeamInvitesTab
          canManageInvites={canManageInvites}
          customRoles={customRoles}
          targetPlayerName={targetPlayerName}
          setTargetPlayerName={setTargetPlayerName}
          inviteRole={inviteRole}
          setInviteRole={setInviteRole}
          selectedInviteCustomRoleIds={selectedInviteCustomRoleIds}
          setSelectedInviteCustomRoleIds={setSelectedInviteCustomRoleIds}
          expiresInDays={expiresInDays}
          setExpiresInDays={setExpiresInDays}
          creatingInvite={creatingInvite}
          generatedInvite={generatedInvite}
          copiedToken={copiedToken}
          activeInvites={activeInvites}
          isGlobalAdmin={isGlobalAdmin}
          handleCreateInvite={handleCreateInvite}
          handleCopyLink={handleCopyLink}
          handleRevokeInvite={handleRevokeInvite}
        />
      )}

      {activeTab === 'roles' && (
        <TeamRolesTab
          customRoles={customRoles}
          canManageRoles={canManageRoles}
          openCreateRoleModal={openCreateRoleModal}
          openEditRoleModal={openEditRoleModal}
          setRoleToDelete={setRoleToDelete}
        />
      )}

      {activeTab === 'roadmap' && (
        <TeamRoadmapTab />
      )}

      {/* Modals */}
      <MemberEditModal
        editingMember={editingMember}
        onClose={() => setEditingMember(null)}
        memberModalRole={memberModalRole}
        setMemberModalRole={setMemberModalRole}
        memberModalCustomRoleIds={memberModalCustomRoleIds}
        setMemberModalCustomRoleIds={setMemberModalCustomRoleIds}
        customRoles={customRoles}
        isTeamAdmin={isTeamAdmin}
        isGlobalAdmin={isGlobalAdmin}
        savingMember={savingMember}
        onSave={handleSaveMember}
      />

      <MemberKickModal
        memberToKick={memberToKick}
        onClose={() => setMemberToKick(null)}
        currentUserId={user?.sub || user?.id}
        teamName={team.name}
        kickingMember={kickingMember}
        onConfirm={handleConfirmKick}
      />

      <CustomRoleModal
        isOpen={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        editingRole={editingRole}
        roleName={roleName}
        setRoleName={setRoleName}
        roleDescription={roleDescription}
        setRoleDescription={setRoleDescription}
        roleColor={roleColor}
        setRoleColor={setRoleColor}
        roleIcon={roleIcon}
        setRoleIcon={setRoleIcon}
        rolePriority={rolePriority}
        setRolePriority={setRolePriority}
        rolePermissions={rolePermissions}
        setRolePermissions={setRolePermissions}
        savingRole={savingRole}
        onSave={handleSaveRole}
      />

      <RoleDeleteModal
        roleToDelete={roleToDelete}
        onClose={() => setRoleToDelete(null)}
        deletingRole={deletingRole}
        onConfirm={handleConfirmDeleteRole}
      />
    </div>
  );
}
