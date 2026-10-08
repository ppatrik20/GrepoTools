'use client';

import React from 'react';
import { Trash2 } from 'lucide-react';

export default function RoleDeleteModal({
  roleToDelete,
  onClose,
  deletingRole,
  onConfirm
}) {
  if (!roleToDelete) return null;

  return (
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
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
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
  );
}
