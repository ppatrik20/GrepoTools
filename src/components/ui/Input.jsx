'use client';

import React from 'react';

export function Input({
  className = '',
  icon: Icon,
  error = false,
  ...props
}) {
  const errorStyles = error
    ? 'border-red-500/80 focus:border-red-400 focus:ring-red-500/20'
    : 'border-slate-700/80 focus:border-blue-500 focus:ring-blue-500/20';

  if (Icon) {
    return (
      <div className="relative w-full">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
          <Icon size={16} />
        </div>
        <input
          className={`w-full pl-9 pr-3.5 py-2 bg-slate-950/80 border rounded-xl text-white text-sm placeholder:text-slate-500 transition-all outline-none focus:ring-2 ${errorStyles} ${className}`}
          {...props}
        />
      </div>
    );
  }

  return (
    <input
      className={`w-full px-3.5 py-2 bg-slate-950/80 border rounded-xl text-white text-sm placeholder:text-slate-500 transition-all outline-none focus:ring-2 ${errorStyles} ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = '',
  children,
  error = false,
  ...props
}) {
  const errorStyles = error
    ? 'border-red-500/80 focus:border-red-400 focus:ring-red-500/20'
    : 'border-slate-700/80 focus:border-blue-500 focus:ring-blue-500/20';

  return (
    <select
      className={`w-full px-3.5 py-2 bg-slate-950/80 border rounded-xl text-white text-sm transition-all outline-none focus:ring-2 cursor-pointer ${errorStyles} ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function FormField({
  label,
  hint,
  error,
  children,
  className = '',
  required = false,
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      {children}
      {hint && !error && (
        <p className="text-[11px] text-slate-400 font-sans">{hint}</p>
      )}
      {error && (
        <p className="text-[11px] text-red-400 font-medium font-sans">{error}</p>
      )}
    </div>
  );
}
