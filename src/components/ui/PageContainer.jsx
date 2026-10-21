'use client';

import React from 'react';

export default function PageContainer({
  children,
  className = '',
  ...props
}) {
  return (
    <div
      className={`max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
