'use client';

import React from 'react';
import { Award, X, Check } from 'lucide-react';
import { AVAILABLE_ICONS, PRESET_COLORS } from '../constants';
import { PERMISSION_DEFINITIONS } from '@/lib/auth/rbac';

export default function CustomRoleModal({
  isOpen,
  onClose,
  editingRole,
  roleName,
  setRoleName,
  roleDescription,
  setRoleDescription,
  roleColor,
  setRoleColor,
  roleIcon,
  setRoleIcon,
  rolePriority,
  setRolePriority,
  rolePermissions,
  setRolePermissions,
  savingRole,
  onSave
}) {
  if (!isOpen) return null;

  return (
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
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-4">
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
              onClick={onClose}
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
  );
}
