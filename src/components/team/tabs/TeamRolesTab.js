import React from 'react';
import { Award, Plus, Edit3, Trash2 } from 'lucide-react';
import { PERMISSION_DEFINITIONS } from '@/lib/auth/rbac';
import { getRoleIcon } from '../constants';

export default function TeamRolesTab({
  customRoles,
  canManageRoles,
  openCreateRoleModal,
  openEditRoleModal,
  setRoleToDelete
}) {
  return (
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
  );
}
