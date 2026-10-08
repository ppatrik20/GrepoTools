'use client';

import React from 'react';
import { Edit3, X, Check } from 'lucide-react';
import { getRoleIcon } from '../constants';

export default function MemberEditModal({
  editingMember,
  onClose,
  memberModalRole,
  setMemberModalRole,
  memberModalCustomRoleIds,
  setMemberModalCustomRoleIds,
  customRoles,
  isTeamAdmin,
  isGlobalAdmin,
  savingMember,
  onSave
}) {
  if (!editingMember) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold text-white">Manage Operative Roles</h3>
          </div>
          <button
            onClick={onClose}
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
              {editingMember.allianceName || 'No Alliance'} &bull; {editingMember.points?.toLocaleString?.() ?? editingMember.points} pts &bull; {editingMember.townsCount} towns
            </div>
          </div>
        </div>

        <form onSubmit={onSave} className="space-y-4">
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
              onClick={onClose}
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
  );
}
