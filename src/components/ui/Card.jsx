'use client';

import React from 'react';

export function Card({
  children,
  className = '',
  hoverEffect = false,
  glowColor = null,
  onClick,
  ...props
}) {
  const hoverStyles = hoverEffect
    ? 'hover:border-slate-600/80 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-200'
    : '';

  const glowStyles = glowColor === 'blue'
    ? 'shadow-lg shadow-blue-500/10 border-blue-500/30'
    : glowColor === 'amber'
    ? 'shadow-lg shadow-amber-500/10 border-amber-500/30'
    : glowColor === 'emerald'
    ? 'shadow-lg shadow-emerald-500/10 border-emerald-500/30'
    : '';

  return (
    <div
      onClick={onClick}
      className={`glass-panel bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 ${hoverStyles} ${glowStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', ...props }) {
  return (
    <div className={`flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/60 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ children, icon: Icon, className = '', ...props }) {
  return (
    <h3 className={`text-base font-bold text-white tracking-tight flex items-center gap-2 ${className}`} {...props}>
      {Icon && <Icon size={18} className="text-blue-400 shrink-0" />}
      {children}
    </h3>
  );
}

export function CardDescription({ children, className = '', ...props }) {
  return (
    <p className={`text-xs text-slate-400 font-sans mt-0.5 ${className}`} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ children, className = '', ...props }) {
  return (
    <div className={`space-y-3 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = '', ...props }) {
  return (
    <div className={`flex items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-800/60 ${className}`} {...props}>
      {children}
    </div>
  );
}

/**
 * Metric/KPI Stat Tile
 */
export function StatCard({
  label,
  value,
  subvalue,
  icon: Icon,
  variant = 'default', // default | primary | accent | emerald | amber
  className = '',
}) {
  const valueColors = {
    default: 'text-white',
    primary: 'text-blue-400',
    accent: 'text-indigo-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
  };

  const iconBgColors = {
    default: 'bg-slate-800 text-slate-300 border-slate-700',
    primary: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    accent: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };

  return (
    <div className={`bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">
          {label}
        </div>
        <div className={`text-2xl font-mono font-bold tracking-tight mt-0.5 truncate ${valueColors[variant] || 'text-white'}`}>
          {value ?? '—'}
        </div>
        {subvalue && (
          <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
            {subvalue}
          </div>
        )}
      </div>

      {Icon && (
        <div className={`p-2.5 rounded-xl border shrink-0 ${iconBgColors[variant] || iconBgColors.default}`}>
          <Icon size={18} />
        </div>
      )}
    </div>
  );
}
