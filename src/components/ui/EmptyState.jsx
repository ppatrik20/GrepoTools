'use client';

import React from 'react';
import Button from './Button';

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon: ActionIcon,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center bg-slate-950/40 border border-dashed border-slate-800 rounded-2xl ${className}`}>
      {Icon && (
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 mb-3.5 shadow-inner">
          <Icon size={24} />
        </div>
      )}
      <h4 className="text-sm font-bold text-white tracking-tight">{title}</h4>
      {description && (
        <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4 leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button
          size="sm"
          variant="primary"
          onClick={onAction}
          icon={ActionIcon}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
