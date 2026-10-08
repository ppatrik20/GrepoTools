'use client';

import React from 'react';
import Badge from './Badge';

export default function PageHeader({
  title,
  subtitle,
  icon: Icon,
  badges = [],
  actions,
  className = '',
}) {
  return (
    <div className={`flex flex-col md:flex-row md:items-end justify-between border-b border-slate-800/80 pb-5 gap-4 ${className}`}>
      <div>
        {badges.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {badges.map((b, idx) => (
              <Badge
                key={idx}
                variant={b.variant || 'primary'}
                size="sm"
                mono={b.mono ?? true}
                dot={b.dot}
              >
                {b.text}
              </Badge>
            ))}
          </div>
        )}

        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight flex items-center gap-2.5">
          {Icon && <Icon className="text-blue-400 shrink-0" size={28} />}
          <span>{title}</span>
        </h1>

        {subtitle && (
          <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
