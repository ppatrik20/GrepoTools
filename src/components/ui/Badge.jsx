'use client';

import React from 'react';

const BADGE_VARIANTS = {
  primary: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  accent: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  danger: 'bg-red-500/15 text-red-300 border-red-500/30',
  cyan: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  neutral: 'bg-slate-800 text-slate-300 border-slate-700/70',
};

const DOT_COLORS = {
  primary: 'bg-blue-400',
  accent: 'bg-indigo-400',
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  danger: 'bg-red-400',
  cyan: 'bg-cyan-400',
  neutral: 'bg-slate-400',
};

const SIZE_CLASSES = {
  xs: 'text-[10px] px-2 py-0.5 gap-1',
  sm: 'text-xs px-2.5 py-0.5 gap-1.5',
  md: 'text-sm px-3 py-1 gap-2',
};

export default function Badge({
  children,
  variant = 'neutral',
  size = 'sm',
  dot = false,
  mono = false,
  icon: Icon,
  className = '',
  ...props
}) {
  const variantClass = BADGE_VARIANTS[variant] || BADGE_VARIANTS.neutral;
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.sm;
  const dotColor = DOT_COLORS[variant] || DOT_COLORS.neutral;

  return (
    <span
      className={`inline-flex items-center font-medium border rounded-full select-none ${mono ? 'font-mono' : 'font-sans'} ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor} animate-pulse`} />}
      {Icon && <Icon size={size === 'xs' ? 11 : 13} className="shrink-0" />}
      {children}
    </span>
  );
}
