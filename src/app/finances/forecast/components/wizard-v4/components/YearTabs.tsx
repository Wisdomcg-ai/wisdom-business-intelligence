'use client';

import { ForecastDuration } from '../types';

interface YearTabsProps {
  activeYear: 1 | 2 | 3;
  onYearChange: (year: 1 | 2 | 3) => void;
  fiscalYear: number;
  forecastDuration?: ForecastDuration;
}

export function YearTabs({ activeYear, onYearChange, fiscalYear, forecastDuration = 3 }: YearTabsProps) {
  // Sublabel reflects the actual data granularity rendered in each year's
  // grid. Phase 57+ stores Y2/Y3 as `year2Monthly`/`year3Monthly` (12-month
  // arrays); the legacy `year2Quarterly`/`year3Quarterly` shape is read-only
  // back-compat (see types.ts:92-95). The UI grid is monthly for all 3 years,
  // so the sublabel must say "Monthly" for Y2/Y3 too — labelling them
  // "Quarterly" misled operators (May 2026 user report).
  const allYears = [
    { year: 1 as const, label: `FY${fiscalYear}`, sublabel: 'Monthly' },
    { year: 2 as const, label: `FY${fiscalYear + 1}`, sublabel: 'Monthly' },
    { year: 3 as const, label: `FY${fiscalYear + 2}`, sublabel: 'Monthly' },
  ];

  // Filter years based on forecast duration
  const years = allYears.filter((y) => y.year <= forecastDuration);

  // If only 1 year, don't show tabs at all
  if (forecastDuration === 1) {
    return null;
  }

  // Visibility note (May 2026 user report): operators reported FY28/FY29
  // tabs "go missing". The render gate (forecastDuration > 1) was correct,
  // but inactive tabs only had `text-gray-600` on a white background with
  // no border — they read as floating labels rather than tabs. Inactive
  // tabs now carry a visible border + faint fill so the tab cluster always
  // reads as a tab control, regardless of which year is active.
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">
        Year
      </span>
      {years.map((y) => (
        <button
          key={y.year}
          onClick={() => onYearChange(y.year)}
          aria-pressed={activeYear === y.year}
          className={`
            relative px-4 py-2 text-sm font-medium rounded-lg transition-all border
            ${activeYear === y.year
              ? 'bg-brand-navy text-white border-brand-navy shadow-sm'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-400'
            }
          `}
        >
          <span className="block">{y.label}</span>
          <span
            className={`block text-xs ${
              activeYear === y.year ? 'text-white/80' : 'text-gray-500'
            }`}
          >
            {y.sublabel}
          </span>
        </button>
      ))}
    </div>
  );
}
