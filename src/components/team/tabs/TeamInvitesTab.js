import React from 'react';
import {
  UserPlus, Check, Copy, Clock, Trash2
} from 'lucide-react';
import { getRoleIcon } from '../constants';

export default function TeamInvitesTab({
  canManageInvites,
  customRoles,
  targetPlayerName,
  setTargetPlayerName,
  inviteRole,
  setInviteRole,
  selectedInviteCustomRoleIds,
  setSelectedInviteCustomRoleIds,
  expiresInDays,
  setExpiresInDays,
  creatingInvite,
  generatedInvite,
  copiedToken,
  activeInvites,
  isGlobalAdmin,
  handleCreateInvite,
  handleCopyLink,
  handleRevokeInvite
}) {
  return (
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
  );
}
