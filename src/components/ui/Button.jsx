'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

const VARIANT_MAP = {
  primary: 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20 border-transparent',
  secondary: 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border-slate-700/70 hover:border-slate-600 hover:text-white',
  tactical: 'bg-slate-900/90 hover:bg-slate-800/90 text-amber-300 border-amber-500/30 hover:border-amber-500/60 shadow-sm shadow-amber-500/10',
  emerald: 'bg-emerald-600/90 hover:bg-emerald-500 text-white border-transparent shadow-lg shadow-emerald-500/20',
  danger: 'bg-red-600/90 hover:bg-red-500 text-white border-transparent shadow-lg shadow-red-500/20',
  ghost: 'bg-transparent hover:bg-slate-800/60 text-slate-400 hover:text-slate-100 border-transparent',
  outline: 'bg-transparent hover:bg-slate-800/50 text-slate-300 hover:text-white border-slate-700/80 hover:border-slate-500',
};

const SIZE_MAP = {
  xs: 'text-xs px-2.5 py-1 gap-1.5 rounded-lg',
  sm: 'text-xs px-3 py-1.5 gap-2 rounded-lg font-medium',
  md: 'text-sm px-4 py-2 gap-2 rounded-xl font-semibold',
  lg: 'text-base px-5 py-2.5 gap-2.5 rounded-xl font-semibold',
};

/**
 * Standardized tactical Button component
 */
export default function Button({
  children,
  variant = 'secondary',
  size = 'md',
  className = '',
  disabled = false,
  isLoading = false,
  icon: Icon,
  iconRight: IconRight,
  type = 'button',
  onClick,
  ...props
}) {
  const baseClasses = 'inline-flex items-center justify-center border font-sans select-none transition-all duration-200 cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';
  const variantClasses = VARIANT_MAP[variant] || VARIANT_MAP.secondary;
  const sizeClasses = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      onClick={onClick}
      className={`${baseClasses} ${variantClasses} ${sizeClasses} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="animate-spin" size={size === 'xs' || size === 'sm' ? 14 : 16} />
      ) : Icon ? (
        <Icon size={size === 'xs' || size === 'sm' ? 14 : 16} />
      ) : null}

      {children}

      {!isLoading && IconRight && (
        <IconRight size={size === 'xs' || size === 'sm' ? 14 : 16} />
      )}
    </button>
  );
}
