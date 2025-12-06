// /src/components/swot/SwotStatisticsCard.tsx
// Statistics card component for SWOT dashboard

'use client';

import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface SwotStatisticsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'gray' | 'blue' | 'green' | 'red' | 'orange' | 'navy';
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  description?: string;
}

export function SwotStatisticsCard({
  title,
  value,
  icon,
  color,
  trend,
  trendValue,
  description
}: SwotStatisticsCardProps) {
  const colorClasses = {
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
    blue: 'bg-brand-orange-50 text-brand-orange-700 border-brand-orange-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-brand-orange-50 text-brand-orange-700 border-brand-orange-200',
    navy: 'bg-brand-navy-50 text-brand-navy-700 border-brand-navy-200'
  };

  const iconBgClasses = {
    gray: 'bg-gray-100',
    blue: 'bg-brand-orange-100',
    green: 'bg-green-100',
    red: 'bg-red-100',
    orange: 'bg-brand-orange-100',
    navy: 'bg-brand-navy-100'
  };
  
  return (
    <div className={`p-6 rounded-lg border ${colorClasses[color]} bg-white`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center">
            <div className={`p-2 rounded-lg ${iconBgClasses[color]} mr-3`}>
              {icon}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">{title}</p>
              <div className="flex items-baseline mt-1">
                <p className="text-2xl font-bold">{value}</p>
                {trend && (
                  <div className={`ml-2 flex items-center text-sm ${
                    trend === 'up' ? 'text-green-600' : 
                    trend === 'down' ? 'text-red-600' : 
                    'text-gray-500'
                  }`}>
                    {trend === 'up' ? (
                      <TrendingUp className="h-4 w-4 mr-1" />
                    ) : trend === 'down' ? (
                      <TrendingDown className="h-4 w-4 mr-1" />
                    ) : null}
                    {trendValue && <span>{trendValue}</span>}
                  </div>
                )}
              </div>
              {description && (
                <p className="text-xs text-gray-500 mt-1">{description}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
