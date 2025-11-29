'use client';

import React, { useState, useRef, useEffect } from 'react';
import { QuarterInfo, YearType, getCurrentQuarter, getAllQuartersForYear } from '@/lib/swot/types';
import { Calendar, ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface QuarterSelectorProps {
  currentQuarter: QuarterInfo;
  onQuarterChange: (quarter: QuarterInfo) => void;
  yearType: YearType;
  minYear?: number;
  maxYear?: number;
}

export function QuarterSelector({
  currentQuarter,
  onQuarterChange,
  yearType,
  minYear = 2020,
  maxYear = 2030
}: QuarterSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(currentQuarter.year);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Generate available years
  const years = Array.from(
    { length: maxYear - minYear + 1 },
    (_, i) => minYear + i
  );

  // Get all quarters for the selected year
  const quartersForYear = getAllQuartersForYear(yearType, selectedYear);

  // Handle quarter selection
  const handleQuarterSelect = (quarterInfo: QuarterInfo) => {
    onQuarterChange(quarterInfo);
    setIsOpen(false);
  };

  // Handle year navigation
  const handleYearChange = (direction: 'prev' | 'next') => {
    const newYear = direction === 'prev' ? selectedYear - 1 : selectedYear + 1;
    if (newYear >= minYear && newYear <= maxYear) {
      setSelectedYear(newYear);
    }
  };

  // Navigate to adjacent quarter
  const navigateQuarter = (direction: 'prev' | 'next') => {
    let newQuarter = currentQuarter.quarter;
    let newYear = currentQuarter.year;

    if (direction === 'prev') {
      if (newQuarter === 1) {
        newQuarter = 4;
        newYear--;
      } else {
        newQuarter--;
      }
    } else {
      if (newQuarter === 4) {
        newQuarter = 1;
        newYear++;
      } else {
        newQuarter++;
      }
    }

    if (newYear >= minYear && newYear <= maxYear) {
      const quarters = getAllQuartersForYear(yearType, newYear);
      const quarterData = quarters.find(q => q.quarter === newQuarter);
      if (quarterData) {
        onQuarterChange(quarterData);
      }
    }
  };

  // Get quarter status style
  const getQuarterStyle = (quarterInfo: QuarterInfo) => {
    if (quarterInfo.isCurrent) {
      return 'bg-teal-100 text-teal-700 border-teal-300';
    }
    if (quarterInfo.isPast) {
      return 'bg-gray-50 text-gray-600 hover:bg-gray-100';
    }
    return 'bg-white text-gray-500 hover:bg-gray-50';
  };

  // Check if quarter is selected
  const isQuarterSelected = (quarterInfo: QuarterInfo) => {
    return currentQuarter.quarter === quarterInfo.quarter && currentQuarter.year === quarterInfo.year;
  };

  // Format date range
  const formatDateRange = (start: Date, end: Date) => {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Main Button */}
      <div className="flex items-center space-x-1">
        {/* Previous Quarter */}
        <button
          onClick={() => navigateQuarter('prev')}
          disabled={currentQuarter.year === minYear && currentQuarter.quarter === 1}
          className="p-1.5 text-gray-500 hover:text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed"
          title="Previous Quarter"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Quarter Selector Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`
            inline-flex items-center px-4 py-2 border rounded-md text-sm font-medium
            ${currentQuarter.isCurrent
              ? 'border-teal-300 bg-teal-50 text-teal-700'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }
          `}
        >
          <Calendar className="h-4 w-4 mr-2" />
          {currentQuarter.label}
          <span className="ml-2 text-xs text-gray-500">
            ({currentQuarter.months})
          </span>
        </button>

        {/* Next Quarter */}
        <button
          onClick={() => navigateQuarter('next')}
          disabled={currentQuarter.year === maxYear && currentQuarter.quarter === 4}
          className="p-1.5 text-gray-500 hover:text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed"
          title="Next Quarter"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          {/* Year Type & Year Selector */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {yearType === 'FY' ? 'Fiscal Year' : 'Calendar Year'}
              </span>
              <span className="text-xs text-gray-400">
                {yearType === 'FY' ? 'Jul-Jun' : 'Jan-Dec'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={() => handleYearChange('prev')}
                disabled={selectedYear === minYear}
                className="p-1 text-gray-500 hover:text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center space-x-2">
                <span className="text-lg font-semibold text-gray-900">
                  {yearType === 'FY' ? `FY${selectedYear}` : selectedYear}
                </span>
              </div>

              <button
                onClick={() => handleYearChange('next')}
                disabled={selectedYear === maxYear}
                className="p-1 text-gray-500 hover:text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Quarters Grid */}
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3">
              {quartersForYear.map((quarterInfo) => {
                const isSelected = isQuarterSelected(quarterInfo);

                return (
                  <button
                    key={quarterInfo.quarter}
                    onClick={() => handleQuarterSelect(quarterInfo)}
                    className={`
                      relative px-4 py-3 rounded-lg border transition-all
                      ${getQuarterStyle(quarterInfo)}
                      ${isSelected ? 'ring-2 ring-teal-500' : ''}
                    `}
                  >
                    <div className="text-left">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Q{quarterInfo.quarter}</span>
                        {isSelected && (
                          <Check className="h-4 w-4 text-teal-600" />
                        )}
                      </div>
                      <div className="text-xs mt-1 font-medium text-gray-600">
                        {quarterInfo.months}
                      </div>
                      <div className="text-xs mt-0.5 opacity-75">
                        {formatDateRange(quarterInfo.startDate, quarterInfo.endDate)}
                      </div>
                      {quarterInfo.isCurrent && (
                        <div className="text-xs mt-1 font-semibold text-teal-600">
                          Current Quarter
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="flex justify-between text-xs">
              <button
                onClick={() => {
                  const currentQ = getCurrentQuarter(yearType);
                  onQuarterChange(currentQ);
                  setSelectedYear(currentQ.year);
                  setIsOpen(false);
                }}
                className="text-teal-600 hover:text-teal-700 font-medium"
              >
                Go to Current Quarter
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
