import React from 'react';
import {
  Search, Sliders, Crown, Users, CheckCircle2,
  Clock, Edit3, Trash2
} from 'lucide-react';
import { getRoleIcon } from '../constants';

export default function TeamMembersTab({
  members,
  filteredMembers,
  searchQuery,
  setSearchQuery,
  roleFilter,
  setRoleFilter,
  canManageMembers,
  currentUserId,
  onEditMember,
  onKickMember
}) {
  return (
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
                  const isSelf = m.userId === currentUserId;
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
                              onClick={() => onEditMember(m)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                              title="Manage Roles & Permissions"
                            >
                              <Edit3 size={15} />
                            </button>
                          )}

                          {(canManageMembers || isSelf) && (
                            <button
                              onClick={() => onKickMember(m)}
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
  );
}
