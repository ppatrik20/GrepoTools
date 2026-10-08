'use client';

import React from 'react';

export function Skeleton({ className = '', rounded = 'rounded-xl', ...props }) {
  return (
    <div
      className={`bg-slate-800/60 animate-pulse ${rounded} ${className}`}
      {...props}
    />
  );
}

export function SkeletonStatGrid({ count = 4, className = '' }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 space-y-2">
          <Skeleton className="h-3 w-16" rounded="rounded" />
          <Skeleton className="h-7 w-24" rounded="rounded-md" />
        </div>
      ))}
    </div>
  );
}
