'use client';

import { ForecastDuration } from '../types';

interface YearTabsProps {
  activeYear: 1 | 2 | 3;
  onYearChange: (year: 1 | 2 | 3) => void;
  fiscalYear: number;
  forecastDuration?: ForecastDuration;
}

export function YearTabs({ activeYear, onYearChange, fiscalYear, forecastDuration = 3 }: YearTabsProps) {
  const allYears = [
    { year: 1 as const, label: `FY${fiscalYear}`, sublabel: 'Monthly' },
    { year: 2 as const, label: `FY${fiscalYear + 1}`, sublabel: 'Quarterly' },
    { year: 3 as const, label: `FY${fiscalYear + 2}`, sublabel: 'Quarterly' },
  ];

  // Filter years based on forecast duration
  const years = allYears.filter((y) => y.year <= forecastDuration);

  // If only 1 year, don't show tabs at all
  if (forecastDuration === 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 py-2">
      {years.map((y) => (
        <button
          key={y.year}
          onClick={() => onYearChange(y.year)}
          className={`
            relative px-4 py-2 text-sm font-medium rounded-lg transition-all
            ${activeYear === y.year
              ? 'bg-brand-navy text-white'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }
          `}
        >
          <span className="block">{y.label}</span>
          <span
            className={`block text-xs ${
              activeYear === y.year ? 'text-white/70' : 'text-gray-400'
            }`}
          >
            {y.sublabel}
          </span>
        </button>
      ))}
    </div>
  );
}
