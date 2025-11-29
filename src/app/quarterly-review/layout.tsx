'use client';

import { ReactNode } from 'react';

interface QuarterlyReviewLayoutProps {
  children: ReactNode;
}

export default function QuarterlyReviewLayout({ children }: QuarterlyReviewLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      {children}
    </div>
  );
}
