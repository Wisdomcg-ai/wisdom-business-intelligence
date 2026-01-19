'use client';

import { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { Plus, Trash2, HelpCircle, ChevronDown, ChevronUp, Info, Calendar, Sparkles, X, Briefcase, UserCheck, Loader2, Users, UserPlus, TrendingUp, DollarSign, Target, Lightbulb, ArrowRight } from 'lucide-react';
import {
  ForecastWizardState,
  WizardActions,
  formatCurrency,
  EmploymentType,
  ContractorType,
  SUPER_RATE,
} from '../types';

// AI Salary Suggestion type
interface AISuggestion {
  suggestion: string;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'coach_benchmark' | 'market_data' | 'ai_estimate';
  minValue?: number;
  maxValue?: number;
  typicalValue?: number;
  caveats?: string[];
  interactionId?: string;
}

interface Step4TeamProps {
  state: ForecastWizardState;
  actions: WizardActions;
  fiscalYear: number;
  forecastDuration?: 1 | 2 | 3;
}

interface TeamRow {
  id: string;
  name: string;
  role: string;
  type: EmploymentType;
  contractorType?: ContractorType; // For contractors - onshore/offshore
  isNewHire: boolean;
  startMonth?: string;
  endMonth?: string;
  hoursPerWeek: number;
  hourlyRate?: number;
  weeksPerYear?: number;
  salary: number;
  superAmount: number;
  bonusAmount: number;
  bonusMonth: number;
  commissionPct: number;
  commissionAmount: number;
  totalCost: number;
  teamMemberId?: string;
  newHireId?: string;
  departureId?: string;
  bonusId?: string;
  commissionId?: string;
  includeInHeadcount?: boolean; // For contractors
}

const STANDARD_HOURS = 38;
const DEFAULT_WEEKS = 48;

const calculateFTE = (hoursPerWeek: number): number => {
  return Math.round((hoursPerWeek / STANDARD_HOURS) * 100) / 100;
};

const calculateCasualAnnual = (hourlyRate: number, hoursPerWeek: number, weeksPerYear: number = DEFAULT_WEEKS): number => {
  return Math.round(hourlyRate * hoursPerWeek * weeksPerYear);
};

function getDefaultStartMonth(fiscalYear: number): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const fyStartYear = fiscalYear - 1;
  const fyEndYear = fiscalYear;

  if (currentYear === fyStartYear && currentMonth >= 7) {
    return `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  } else if (currentYear === fyEndYear && currentMonth <= 6) {
    return `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  } else if (currentYear < fyStartYear || (currentYear === fyStartYear && currentMonth < 7)) {
    return `${fyStartYear}-07`;
  }
  return `${fyEndYear}-06`;
}

// ============================================
// STABLE INPUT COMPONENTS (outside main component)
// ============================================

interface CurrencyInputProps {
  value: number;
  onChange: (val: number) => void;
  className?: string;
}

const CurrencyInput = memo(function CurrencyInput({ value, onChange, className = '' }: CurrencyInputProps) {
  const [localValue, setLocalValue] = useState(value ? value.toLocaleString() : '');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value ? value.toLocaleString() : '');
    }
  }, [value, isFocused]);

  return (
    <input
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onFocus={() => {
        setIsFocused(true);
        setLocalValue(value ? value.toString() : '');
      }}
      onBlur={() => {
        setIsFocused(false);
        const parsed = parseFloat(localValue.replace(/[^0-9.]/g, '')) || 0;
        onChange(parsed);
        setLocalValue(parsed ? parsed.toLocaleString() : '');
      }}
      className={className || "w-24 px-2 py-1 text-sm text-right border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"}
    />
  );
});

interface NumberInputProps {
  value: number;
  onChange: (val: number) => void;
  placeholder?: string;
  className?: string;
}

const NumberInput = memo(function NumberInput({ value, onChange, placeholder = "0", className = '' }: NumberInputProps) {
  const [localValue, setLocalValue] = useState(value ? value.toString() : '');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value ? value.toString() : '');
    }
  }, [value, isFocused]);

  return (
    <input
      type="number"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => {
        setIsFocused(false);
        const parsed = parseFloat(localValue) || 0;
        onChange(parsed);
      }}
      placeholder={placeholder}
      className={className || "w-12 px-1 py-0.5 text-xs text-right border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"}
    />
  );
});

// ============================================
// PART-TIME SALARY INPUT (handles pro-rata)
// ============================================

interface PartTimeSalaryInputProps {
  salary: number;
  hoursPerWeek: number;
  onSalaryChange: (salary: number) => void;
  onHoursChange: (hours: number, newSalary: number) => void;
}

const PartTimeSalaryInput = memo(function PartTimeSalaryInput({
  salary,
  hoursPerWeek,
  onSalaryChange,
  onHoursChange
}: PartTimeSalaryInputProps) {
  // Track previous hours for pro-rata calculation
  const [prevHours, setPrevHours] = useState(hoursPerWeek);
  const fte = calculateFTE(hoursPerWeek);

  const handleHoursChange = useCallback((newHours: number) => {
    // Pro-rate salary based on hours change
    const oldHours = prevHours > 0 ? prevHours : STANDARD_HOURS;
    const newSalary = oldHours > 0 && salary > 0
      ? Math.round(salary * (newHours / oldHours))
      : salary;
    setPrevHours(newHours);
    onHoursChange(newHours, newSalary);
  }, [prevHours, salary, onHoursChange]);

  // Update prevHours when external changes happen
  useEffect(() => {
    setPrevHours(hoursPerWeek);
  }, [hoursPerWeek]);

  return (
    <div className="w-28">
      <CurrencyInput
        value={salary}
        onChange={onSalaryChange}
        className="w-24 px-2 py-1 text-sm text-right border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy mb-0.5"
      />
      <div className="flex items-center gap-1">
        <NumberInput
          value={hoursPerWeek}
          onChange={handleHoursChange}
          className="w-10 px-1.5 py-1 text-xs text-right border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
        />
        <span className="text-[10px] text-gray-400">hrs</span>
        <span className="text-[10px] text-blue-600 font-medium whitespace-nowrap">({Math.round(fte * 100)}%)</span>
      </div>
    </div>
  );
});

// ============================================
// CASUAL SALARY INPUT
// ============================================

interface CasualSalaryInputProps {
  hourlyRate: number;
  hoursPerWeek: number;
  weeksPerYear: number;
  salary: number;
  onUpdate: (hourlyRate: number, hoursPerWeek: number, salary: number) => void;
}

const CasualSalaryInput = memo(function CasualSalaryInput({
  hourlyRate,
  hoursPerWeek,
  weeksPerYear,
  salary,
  onUpdate
}: CasualSalaryInputProps) {
  return (
    <div className="w-28">
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[10px] text-gray-400 w-6 flex-shrink-0">$/hr</span>
        <NumberInput
          value={hourlyRate}
          onChange={(newRate) => {
            const newSalary = calculateCasualAnnual(newRate, hoursPerWeek, weeksPerYear);
            onUpdate(newRate, hoursPerWeek, newSalary);
          }}
          className="w-14 px-1.5 py-1 text-xs text-right border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
        />
      </div>
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[10px] text-gray-400 w-6 flex-shrink-0">hrs</span>
        <NumberInput
          value={hoursPerWeek}
          onChange={(newHours) => {
            const newSalary = calculateCasualAnnual(hourlyRate, newHours, weeksPerYear);
            onUpdate(hourlyRate, newHours, newSalary);
          }}
          className="w-10 px-1.5 py-1 text-xs text-right border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
        />
        <span className="text-[10px] text-gray-400">/wk</span>
      </div>
      <div className="text-[10px] text-gray-500 font-medium tabular-nums text-right pr-1">
        {formatCurrency(salary)}/yr
      </div>
    </div>
  );
});

// ============================================
// TOOLTIP COMPONENT
// ============================================

function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);

  return (
    <div
      className="relative inline-flex items-center ml-1"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-[9999]">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

// ============================================
// MONTH PICKER COMPONENT
// ============================================

function MonthPicker({
  value,
  onChange,
  minYear,
  maxYear,
  placeholder = 'Select month',
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  minYear: number;
  maxYear: number;
  placeholder?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(() => {
    if (value) return parseInt(value.split('-')[0]);
    return Math.max(minYear, Math.min(maxYear, new Date().getFullYear()));
  });
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const handleMonthSelect = (monthIndex: number) => {
    const monthStr = String(monthIndex + 1).padStart(2, '0');
    onChange(`${selectedYear}-${monthStr}`);
    setIsOpen(false);
  };

  const formatDisplay = (val: string) => {
    if (!val) return placeholder;
    const [year, month] = val.split('-');
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  };

  const isMonthValid = (monthIndex: number) => {
    if (selectedYear === minYear) return monthIndex >= 6;
    if (selectedYear === maxYear) return monthIndex <= 5;
    return true;
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 px-2 py-1 text-xs border border-gray-200 rounded hover:border-gray-300 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 bg-white ${className}`}
      >
        <Calendar className="w-3 h-3 text-gray-400" />
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{formatDisplay(value)}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[9999] p-3 w-56">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setSelectedYear(Math.max(minYear, selectedYear - 1))}
              disabled={selectedYear <= minYear}
              className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
            >
              <ChevronDown className="w-4 h-4 rotate-90" />
            </button>
            <span className="font-medium text-gray-900">{selectedYear}</span>
            <button
              type="button"
              onClick={() => setSelectedYear(Math.min(maxYear, selectedYear + 1))}
              disabled={selectedYear >= maxYear}
              className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
            >
              <ChevronDown className="w-4 h-4 -rotate-90" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {monthNames.map((month, idx) => {
              const isValid = isMonthValid(idx);
              const monthStr = String(idx + 1).padStart(2, '0');
              const isSelected = value === `${selectedYear}-${monthStr}`;
              return (
                <button
                  key={month}
                  type="button"
                  onClick={() => isValid && handleMonthSelect(idx)}
                  disabled={!isValid}
                  className={`px-2 py-1.5 text-xs rounded transition-colors ${
                    isSelected ? 'bg-brand-navy text-white' : isValid ? 'hover:bg-gray-100 text-gray-700' : 'text-gray-300 cursor-not-allowed'
                  }`}
                >
                  {month}
                </button>
              );
            })}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); setIsOpen(false); }}
              className="w-full mt-2 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Employment type options
const employeeTypes: { value: EmploymentType; label: string }[] = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'casual', label: 'Casual' },
];

const contractorTypes: { value: ContractorType; label: string }[] = [
  { value: 'onshore', label: 'Onshore' },
  { value: 'offshore', label: 'Offshore' },
];

function getForecastYear(monthKey: string, fiscalYear: number): 1 | 2 | 3 {
  if (!monthKey) return 1;
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const fy = month >= 7 ? year + 1 : year;
  const yearNum = fy - fiscalYear + 1;
  return Math.max(1, Math.min(3, yearNum)) as 1 | 2 | 3;
}

// ============================================
// TEAM TIMELINE SUMMARY COMPONENT
// ============================================

interface TeamTimelineSummaryProps {
  teamMembers: ForecastWizardState['teamMembers'];
  newHires: ForecastWizardState['newHires'];
  departures: ForecastWizardState['departures'];
  bonuses: ForecastWizardState['bonuses'];
  fiscalYear: number;
  duration: 1 | 2 | 3;
  goals: ForecastWizardState['goals'];
  onAddHire: () => void;
}

function TeamTimelineSummary({
  teamMembers,
  newHires,
  departures,
  bonuses,
  fiscalYear,
  duration,
  goals,
  onAddHire,
}: TeamTimelineSummaryProps) {
  // Helper to get fiscal year from month key
  const getFYFromMonth = (monthKey: string): number => {
    const [yearStr, monthStr] = monthKey.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    return month >= 7 ? year + 1 : year;
  };

  // Helper to get months worked in a fiscal year
  const getMonthsInFY = (startMonth: string, fy: number): number => {
    const startFY = getFYFromMonth(startMonth);
    if (startFY > fy) return 0;
    if (startFY < fy) return 12;
    const [, monthStr] = startMonth.split('-');
    const month = parseInt(monthStr);
    const fyMonth = month >= 7 ? month - 6 : month + 6;
    return 13 - fyMonth;
  };

  // Helper to check if departed before end of fiscal year
  const getMonthsBeforeDeparture = (endMonth: string, fy: number): number => {
    const endFY = getFYFromMonth(endMonth);
    if (endFY > fy) return 12;
    if (endFY < fy) return 0;
    const [, monthStr] = endMonth.split('-');
    const month = parseInt(monthStr);
    const fyMonth = month >= 7 ? month - 6 : month + 6;
    return fyMonth;
  };

  // Calculate headcount, FTE, costs, and revenue metrics for each year
  const yearData = useMemo(() => {
    const years: {
      year: number;
      headcount: number;
      fte: number;
      newHires: number;
      departures: number;
      totalCost: number;
      revenue: number;
      revenuePerHead: number;
      revenuePerFTE: number;
    }[] = [];

    for (let i = 1; i <= duration; i++) {
      const targetFY = fiscalYear + i - 1;
      let headcount = 0;
      let totalFTE = 0;
      let yearNewHires = 0;
      let yearDepartures = 0;
      let totalCost = 0;

      // Get revenue for this year
      const yearGoals = i === 1 ? goals.year1 : i === 2 ? goals.year2 : goals.year3;
      const revenue = yearGoals?.revenue || 0;

      // Existing team
      for (const member of teamMembers) {
        const departure = departures.find(d => d.teamMemberId === member.id);
        const yearsOfIncrease = i - 1;
        const salary = member.newSalary * Math.pow(1 + (member.increasePct || 0) / 100, yearsOfIncrease);
        const superAmount = member.type !== 'contractor' ? salary * SUPER_RATE : 0;

        let monthsWorked = 12;
        if (departure) {
          monthsWorked = getMonthsBeforeDeparture(departure.endMonth, targetFY);
          if (getFYFromMonth(departure.endMonth) === targetFY) {
            yearDepartures++;
          }
        }

        if (monthsWorked > 0) {
          headcount++;
          totalFTE += calculateFTE(member.hoursPerWeek);
          totalCost += ((salary + superAmount) * monthsWorked) / 12;
        }
      }

      // New hires
      for (const hire of newHires) {
        const hireFY = getFYFromMonth(hire.startMonth);
        if (hireFY > targetFY) continue;

        const yearsAfterStart = targetFY - hireFY;
        const salary = hire.salary * Math.pow(1.03, yearsAfterStart);
        const superAmount = hire.type !== 'contractor' ? salary * SUPER_RATE : 0;
        const monthsWorked = getMonthsInFY(hire.startMonth, targetFY);

        if (monthsWorked > 0) {
          headcount++;
          totalFTE += calculateFTE(hire.hoursPerWeek);
          totalCost += ((salary + superAmount) * monthsWorked) / 12;
          if (hireFY === targetFY) {
            yearNewHires++;
          }
        }
      }

      // Bonuses
      const bonusTotal = bonuses.reduce((sum, b) => sum + b.amount, 0);
      totalCost += bonusTotal;

      years.push({
        year: i,
        headcount,
        fte: Math.round(totalFTE * 10) / 10,
        newHires: yearNewHires,
        departures: yearDepartures,
        totalCost: Math.round(totalCost),
        revenue,
        revenuePerHead: headcount > 0 ? Math.round(revenue / headcount) : 0,
        revenuePerFTE: totalFTE > 0 ? Math.round(revenue / totalFTE) : 0,
      });
    }

    return years;
  }, [teamMembers, newHires, departures, bonuses, fiscalYear, duration, goals]);

  // Find hires planned for Y2/Y3
  const futureHires = useMemo(() => {
    return newHires.filter(hire => {
      const hireFY = getFYFromMonth(hire.startMonth);
      return hireFY > fiscalYear;
    }).map(hire => ({
      ...hire,
      year: getFYFromMonth(hire.startMonth) - fiscalYear + 1,
    }));
  }, [newHires, fiscalYear]);

  // Calculate growth metrics
  const y1Data = yearData[0];
  const finalData = yearData[yearData.length - 1];
  const headcountGrowth = y1Data && finalData && y1Data.headcount > 0
    ? Math.round(((finalData.headcount - y1Data.headcount) / y1Data.headcount) * 100)
    : 0;
  const costGrowth = y1Data && finalData && y1Data.totalCost > 0
    ? Math.round(((finalData.totalCost - y1Data.totalCost) / y1Data.totalCost) * 100)
    : 0;
  const revenuePerFTEGrowth = y1Data && finalData && y1Data.revenuePerFTE > 0
    ? Math.round(((finalData.revenuePerFTE - y1Data.revenuePerFTE) / y1Data.revenuePerFTE) * 100)
    : 0;

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-xl overflow-hidden">
      {/* Header with gradient accent */}
      <div className="relative px-5 py-4 border-b border-white/10">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Team Evolution</h3>
              <p className="text-xs text-slate-400">{duration}-year workforce plan</p>
            </div>
          </div>
          {duration > 1 && (
            <button
              onClick={onAddHire}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg transition-all duration-200 border border-white/10 hover:border-white/20"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Plan Hire
            </button>
          )}
        </div>
      </div>

      {/* Year Cards - Premium Design */}
      <div className="p-5">
        <div className="grid grid-cols-3 gap-4">
          {yearData.map((year, idx) => {
            const isCurrentYear = year.year === 1;
            const prevYear = idx > 0 ? yearData[idx - 1] : null;
            const headcountChange = prevYear ? year.headcount - prevYear.headcount : 0;

            return (
              <div
                key={year.year}
                className={`relative p-4 rounded-xl transition-all duration-300 ${
                  isCurrentYear
                    ? 'bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg shadow-blue-600/25'
                    : 'bg-white/5 hover:bg-white/10 border border-white/10'
                }`}
              >
                {/* Year Badge */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${
                    isCurrentYear ? 'text-blue-200' : 'text-slate-500'
                  }`}>
                    FY{fiscalYear + year.year - 1}
                  </span>
                  {(year.newHires > 0 || year.departures > 0) && (
                    <div className="flex gap-1">
                      {year.newHires > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                          isCurrentYear ? 'bg-green-400/30 text-green-200' : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          +{year.newHires}
                        </span>
                      )}
                      {year.departures > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                          isCurrentYear ? 'bg-red-400/30 text-red-200' : 'bg-red-500/20 text-red-400'
                        }`}>
                          -{year.departures}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Main Metric - Headcount */}
                <div className="flex items-end gap-2 mb-1">
                  <span className={`text-3xl font-bold tabular-nums ${
                    isCurrentYear ? 'text-white' : 'text-white'
                  }`}>
                    {year.headcount}
                  </span>
                  <span className={`text-sm font-medium mb-1 ${
                    isCurrentYear ? 'text-blue-200' : 'text-slate-400'
                  }`}>
                    team
                  </span>
                  {!isCurrentYear && headcountChange !== 0 && (
                    <span className={`text-xs font-semibold mb-1 ${
                      headcountChange > 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {headcountChange > 0 ? '+' : ''}{headcountChange}
                    </span>
                  )}
                </div>

                {/* FTE Badge */}
                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium mb-3 ${
                  isCurrentYear ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-300'
                }`}>
                  {year.fte} FTE
                </div>

                {/* Cost */}
                <div className={`text-sm font-semibold tabular-nums ${
                  isCurrentYear ? 'text-white' : 'text-white'
                }`}>
                  {formatCurrency(year.totalCost)}
                </div>
                <div className={`text-[10px] uppercase tracking-wide ${
                  isCurrentYear ? 'text-blue-200' : 'text-slate-500'
                }`}>
                  total cost
                </div>

                {/* Revenue per FTE metric */}
                {year.revenue > 0 && (
                  <div className={`mt-3 pt-3 border-t ${
                    isCurrentYear ? 'border-white/20' : 'border-white/10'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] uppercase tracking-wide ${
                        isCurrentYear ? 'text-blue-200' : 'text-slate-500'
                      }`}>
                        Rev/FTE
                      </span>
                      <span className={`text-sm font-bold tabular-nums ${
                        isCurrentYear ? 'text-white' : 'text-emerald-400'
                      }`}>
                        {formatCurrency(year.revenuePerFTE)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Growth Summary Bar - Only show for multi-year */}
        {duration > 1 && (
          <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-400">Team Growth</span>
                  <span className={`text-sm font-bold ${headcountGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {headcountGrowth >= 0 ? '+' : ''}{headcountGrowth}%
                  </span>
                </div>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-400">Cost Growth</span>
                  <span className={`text-sm font-bold ${costGrowth <= 20 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    +{costGrowth}%
                  </span>
                </div>
                {revenuePerFTEGrowth !== 0 && (
                  <>
                    <div className="w-px h-4 bg-white/10" />
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-slate-400" />
                      <span className="text-xs text-slate-400">Efficiency</span>
                      <span className={`text-sm font-bold ${revenuePerFTEGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {revenuePerFTEGrowth >= 0 ? '+' : ''}{revenuePerFTEGrowth}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Future Hires - Visual Timeline */}
        {futureHires.length > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-semibold text-blue-300 uppercase tracking-wide">Planned Hires</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {futureHires.map((hire) => (
                <div
                  key={hire.id}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg border border-white/10"
                >
                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white flex items-center justify-center text-[10px] font-bold">
                    Y{hire.year}
                  </span>
                  <span className="text-sm text-white font-medium">{hire.role}</span>
                  <span className="text-xs text-slate-400">{hire.startMonth}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Smart Insight - Action-oriented */}
        {duration > 1 && futureHires.length === 0 && headcountGrowth === 0 && (
          <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span className="text-sm text-amber-200">
                  Your revenue grows but team stays flat. Consider hiring for capacity.
                </span>
              </div>
              <button
                onClick={onAddHire}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold rounded-lg transition-colors"
              >
                Plan Hire
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Compact insight badge - shows most important insight
function TeamInsightBadge({
  yearData,
  futureHires,
  duration,
  onAddHire,
}: {
  yearData: { year: number; headcount: number; fte: number; newHires: number; departures: number; totalCost: number; revenue: number; revenuePerHead: number; revenuePerFTE: number }[];
  futureHires: { id: string; role: string; startMonth: string; year: number }[];
  duration: 1 | 2 | 3;
  onAddHire: () => void;
}) {
  const y1Headcount = yearData[0]?.headcount || 0;
  const finalHeadcount = yearData[yearData.length - 1]?.headcount || 0;
  const y1Revenue = yearData[0]?.revenue || 0;
  const finalRevenue = yearData[yearData.length - 1]?.revenue || 0;
  const revenueGrowth = y1Revenue > 0 ? ((finalRevenue - y1Revenue) / y1Revenue) * 100 : 0;
  const headcountGrowth = y1Headcount > 0 ? ((finalHeadcount - y1Headcount) / y1Headcount) * 100 : 0;

  // Determine insight
  let insight: { type: 'warning' | 'tip' | 'success'; message: string; action?: () => void; actionLabel?: string } | null = null;

  if (futureHires.length === 0 && revenueGrowth > 10 && headcountGrowth === 0) {
    insight = {
      type: 'warning',
      message: `Revenue grows ${revenueGrowth.toFixed(0)}% but team stays flat. Plan capacity.`,
      action: onAddHire,
      actionLabel: 'Add hire'
    };
  } else if (futureHires.length > 0) {
    insight = {
      type: 'success',
      message: `${futureHires.length} future hire${futureHires.length > 1 ? 's' : ''} planned for growth.`
    };
  } else if (headcountGrowth === 0 && duration > 1) {
    insight = {
      type: 'tip',
      message: 'No hires planned for Y2/Y3. Consider capacity needs.',
      action: onAddHire,
      actionLabel: 'Plan hire'
    };
  }

  if (!insight) return null;

  return (
    <div className={`mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2 text-xs ${
      insight.type === 'warning' ? 'text-amber-700' :
      insight.type === 'success' ? 'text-green-700' : 'text-blue-700'
    }`}>
      <div className="flex items-center gap-1.5">
        {insight.type === 'warning' && <span>⚠️</span>}
        {insight.type === 'success' && <span>✓</span>}
        {insight.type === 'tip' && <Sparkles className="w-3 h-3" />}
        <span>{insight.message}</span>
      </div>
      {insight.action && (
        <button
          onClick={insight.action}
          className={`px-2 py-0.5 rounded font-medium ${
            insight.type === 'warning' ? 'bg-amber-100 hover:bg-amber-200' :
            insight.type === 'tip' ? 'bg-blue-100 hover:bg-blue-200' : ''
          }`}
        >
          {insight.actionLabel}
        </button>
      )}
    </div>
  );
}

// Legacy function kept for reference but not used
function TeamStrategicPrompts_Legacy({
  yearData,
  teamMembers,
  newHires,
  futureHires,
  duration,
  fiscalYear,
}: {
  yearData: { year: number; headcount: number; newHires: number; departures: number; totalCost: number }[];
  teamMembers: ForecastWizardState['teamMembers'];
  newHires: ForecastWizardState['newHires'];
  futureHires: { id: string; role: string; startMonth: string; year: number }[];
  duration: 1 | 2 | 3;
  fiscalYear: number;
}) {
  // Calculate insights
  const y1Headcount = yearData[0]?.headcount || 0;
  const finalHeadcount = yearData[yearData.length - 1]?.headcount || 0;
  const headcountGrowth = y1Headcount > 0 ? ((finalHeadcount - y1Headcount) / y1Headcount) * 100 : 0;

  const y1Cost = yearData[0]?.totalCost || 0;
  const finalCost = yearData[yearData.length - 1]?.totalCost || 0;
  const costGrowth = y1Cost > 0 ? ((finalCost - y1Cost) / y1Cost) * 100 : 0;

  // Identify issues and suggestions
  const insights: { type: 'warning' | 'tip' | 'success'; message: string }[] = [];

  // No future hires planned
  if (futureHires.length === 0 && duration > 1) {
    insights.push({
      type: 'tip',
      message: `You're doing a ${duration}-year forecast but haven't planned any hires for Year 2${duration > 2 ? ' or 3' : ''}. Consider: Will you need additional capacity to achieve your growth targets?`
    });
  }

  // Headcount staying flat while planning for growth
  if (headcountGrowth === 0 && duration > 1 && y1Headcount > 0) {
    insights.push({
      type: 'warning',
      message: `Your team stays at ${y1Headcount} people across all ${duration} years. If you're planning revenue growth, consider whether you'll need additional team members.`
    });
  }

  // Very high cost growth (salary increases adding up)
  if (costGrowth > 15 && headcountGrowth === 0) {
    insights.push({
      type: 'tip',
      message: `Team costs grow ${costGrowth.toFixed(0)}% while headcount stays flat. This is due to salary increases. Consider if this aligns with your budget.`
    });
  }

  // Check for key roles missing
  const hasLeadership = [...teamMembers, ...newHires].some(p =>
    /ceo|cfo|coo|director|manager|lead|head/i.test(p.role)
  );
  const hasSales = [...teamMembers, ...newHires].some(p =>
    /sales|business dev|account/i.test(p.role)
  );
  const hasOps = [...teamMembers, ...newHires].some(p =>
    /operation|admin|office|coordinator/i.test(p.role)
  );

  if (y1Headcount >= 8 && !hasLeadership) {
    insights.push({
      type: 'tip',
      message: `With ${y1Headcount}+ team members, consider if you need dedicated management or leadership roles.`
    });
  }

  if (y1Headcount >= 5 && !hasOps) {
    insights.push({
      type: 'tip',
      message: `Your team is growing but you don't appear to have operations/admin support. This could create bottlenecks.`
    });
  }

  // Positive feedback
  if (futureHires.length > 0) {
    const y2Hires = futureHires.filter(h => h.year === 2).length;
    const y3Hires = futureHires.filter(h => h.year === 3).length;
    insights.push({
      type: 'success',
      message: `Great planning! You've scheduled ${futureHires.length} future hire${futureHires.length > 1 ? 's' : ''}: ${y2Hires} in Year 2${y3Hires > 0 ? ` and ${y3Hires} in Year 3` : ''}.`
    });
  }

  if (insights.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {insights.map((insight, idx) => (
        <div
          key={idx}
          className={`p-3 rounded-lg border ${
            insight.type === 'warning'
              ? 'bg-amber-50 border-amber-200'
              : insight.type === 'success'
              ? 'bg-green-50 border-green-200'
              : 'bg-blue-50 border-blue-200'
          }`}
        >
          <div className="flex items-start gap-2">
            {insight.type === 'warning' && (
              <span className="text-amber-600 text-lg">⚠️</span>
            )}
            {insight.type === 'success' && (
              <span className="text-green-600 text-lg">✓</span>
            )}
            {insight.type === 'tip' && (
              <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            )}
            <p className={`text-sm ${
              insight.type === 'warning'
                ? 'text-amber-800'
                : insight.type === 'success'
                ? 'text-green-800'
                : 'text-blue-800'
            }`}>
              {insight.message}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// TEAM PLANNING OVERVIEW - Summary metrics table
// ============================================

interface TeamPlanningOverviewProps {
  goals: ForecastWizardState['goals'];
  teamMembers: ForecastWizardState['teamMembers'];
  newHires: ForecastWizardState['newHires'];
  departures: ForecastWizardState['departures'];
  duration: 1 | 2 | 3;
  fiscalYear: number;
  onUpdateHeadcountTarget: (year: 1 | 2 | 3, value: number) => void;
}

function TeamPlanningOverview({
  goals,
  teamMembers,
  newHires,
  departures,
  duration,
  fiscalYear,
  onUpdateHeadcountTarget,
}: TeamPlanningOverviewProps) {
  // Helper to get FY from month key
  const getFYFromMonth = (monthKey: string): number => {
    const [yearStr, monthStr] = monthKey.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    return month >= 7 ? year + 1 : year;
  };

  // Calculate actual headcount per year
  const calculateActualHeadcount = (yearNum: 1 | 2 | 3): number => {
    const targetFY = fiscalYear + yearNum - 1;
    let headcount = 0;

    // Count existing team members (excluding departed)
    // For contractors, only count if includeInHeadcount is true
    teamMembers.forEach(member => {
      const departure = departures.find(d => d.teamMemberId === member.id);
      if (departure) {
        const departureFY = getFYFromMonth(departure.endMonth);
        if (departureFY <= targetFY) return; // Already departed
      }
      // For contractors, check includeInHeadcount flag
      if (member.type === 'contractor' && !member.includeInHeadcount) return;
      headcount++;
    });

    // Count new hires that have started by this FY
    // For contractors, only count if includeInHeadcount is true
    newHires.forEach(hire => {
      const hireFY = getFYFromMonth(hire.startMonth);
      if (hireFY <= targetFY) {
        // For contractors, check includeInHeadcount flag
        if (hire.type === 'contractor' && !hire.includeInHeadcount) return;
        headcount++;
      }
    });

    return headcount;
  };

  // Calculate FTE per year
  // For contractors, only include if includeInHeadcount is true
  const calculateActualFTE = (yearNum: 1 | 2 | 3): number => {
    const targetFY = fiscalYear + yearNum - 1;
    let totalFTE = 0;

    teamMembers.forEach(member => {
      const departure = departures.find(d => d.teamMemberId === member.id);
      if (departure) {
        const departureFY = getFYFromMonth(departure.endMonth);
        if (departureFY <= targetFY) return;
      }
      // For contractors, check includeInHeadcount flag
      if (member.type === 'contractor' && !member.includeInHeadcount) return;
      totalFTE += calculateFTE(member.hoursPerWeek);
    });

    newHires.forEach(hire => {
      const hireFY = getFYFromMonth(hire.startMonth);
      if (hireFY <= targetFY) {
        // For contractors, check includeInHeadcount flag
        if (hire.type === 'contractor' && !hire.includeInHeadcount) return;
        totalFTE += calculateFTE(hire.hoursPerWeek);
      }
    });

    return Math.round(totalFTE * 10) / 10;
  };

  // Get yearly data
  const yearlyData = useMemo(() => {
    const years: Array<{
      yearNum: 1 | 2 | 3;
      fyLabel: string;
      revenue: number;
      grossProfit: number;
      grossProfitPct: number;
      netProfit: number;
      netProfitPct: number;
      headcountTarget: number;
      headcountActual: number;
      fte: number;
      revenuePerFTE: number;
      hasVariance: boolean;
    }> = [];

    for (let i = 1; i <= duration; i++) {
      const yearNum = i as 1 | 2 | 3;
      const yearGoals = i === 1 ? goals.year1 : i === 2 ? goals.year2 : goals.year3;

      if (!yearGoals) continue;

      const revenue = yearGoals.revenue || 0;
      const grossProfitPct = yearGoals.grossProfitPct || 0;
      const netProfitPct = yearGoals.netProfitPct || 0;
      const grossProfit = Math.round(revenue * (grossProfitPct / 100));
      const netProfit = Math.round(revenue * (netProfitPct / 100));

      const headcountTarget = yearGoals.headcountTarget || 0;
      const headcountActual = calculateActualHeadcount(yearNum);
      const fte = calculateActualFTE(yearNum);
      const revenuePerFTE = fte > 0 ? Math.round(revenue / fte) : 0;

      years.push({
        yearNum,
        fyLabel: `FY${fiscalYear + i - 1}`,
        revenue,
        grossProfit,
        grossProfitPct,
        netProfit,
        netProfitPct,
        headcountTarget,
        headcountActual,
        fte,
        revenuePerFTE,
        hasVariance: headcountTarget > 0 && headcountTarget !== headcountActual,
      });
    }

    return years;
  }, [goals, duration, fiscalYear, teamMembers, newHires, departures]);

  // Check if any year has variance
  const hasAnyVariance = yearlyData.some(y => y.hasVariance);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-brand-navy" />
          <h3 className="text-lg font-semibold text-gray-900">Planning Overview</h3>
        </div>
        {hasAnyVariance && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full flex items-center gap-1">
            <Info className="w-3 h-3" />
            Headcount variance detected
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-48">
                Metric
              </th>
              {yearlyData.map(year => (
                <th key={year.fyLabel} className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  {year.fyLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* Revenue */}
            <tr className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">Revenue</td>
              {yearlyData.map(year => (
                <td key={`rev-${year.fyLabel}`} className="px-4 py-3 text-sm text-right font-semibold text-gray-900 tabular-nums">
                  {formatCurrency(year.revenue)}
                </td>
              ))}
            </tr>

            {/* Gross Profit */}
            <tr className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">Gross Profit</td>
              {yearlyData.map(year => (
                <td key={`gp-${year.fyLabel}`} className="px-4 py-3 text-sm text-right tabular-nums">
                  <span className="font-semibold text-gray-900">{formatCurrency(year.grossProfit)}</span>
                  <span className="text-gray-500 ml-1">({year.grossProfitPct}%)</span>
                </td>
              ))}
            </tr>

            {/* Net Profit */}
            <tr className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">Net Profit</td>
              {yearlyData.map(year => (
                <td key={`np-${year.fyLabel}`} className="px-4 py-3 text-sm text-right tabular-nums">
                  <span className={`font-semibold ${year.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(year.netProfit)}
                  </span>
                  <span className="text-gray-500 ml-1">({year.netProfitPct}%)</span>
                </td>
              ))}
            </tr>

            {/* Divider row */}
            <tr>
              <td colSpan={duration + 1} className="h-2 bg-gray-50" />
            </tr>

            {/* Headcount Target - Editable */}
            <tr className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                <div className="flex items-center gap-1.5">
                  <span>Headcount Target</span>
                  <span className="text-xs text-gray-400">(from plan)</span>
                </div>
              </td>
              {yearlyData.map(year => (
                <td key={`hc-target-${year.fyLabel}`} className="px-4 py-3 text-right">
                  <input
                    type="number"
                    value={year.headcountTarget || ''}
                    onChange={(e) => onUpdateHeadcountTarget(year.yearNum, parseInt(e.target.value) || 0)}
                    placeholder="-"
                    className="w-16 px-2 py-1 text-sm text-right font-semibold border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy tabular-nums"
                  />
                </td>
              ))}
            </tr>

            {/* Headcount Actual */}
            <tr className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">Headcount Actual</td>
              {yearlyData.map(year => (
                <td key={`hc-actual-${year.fyLabel}`} className="px-4 py-3 text-sm text-right tabular-nums">
                  <span className={`font-semibold ${year.hasVariance ? 'text-amber-600' : 'text-gray-900'}`}>
                    {year.headcountActual}
                  </span>
                  {year.hasVariance && (
                    <span className={`ml-1 text-xs ${year.headcountActual > year.headcountTarget ? 'text-amber-600' : 'text-red-500'}`}>
                      ({year.headcountActual > year.headcountTarget ? '+' : ''}{year.headcountActual - year.headcountTarget})
                    </span>
                  )}
                </td>
              ))}
            </tr>

            {/* FTE */}
            <tr className="hover:bg-gray-50 bg-gray-50/50">
              <td className="px-4 py-3 text-sm text-gray-600">FTE</td>
              {yearlyData.map(year => (
                <td key={`fte-${year.fyLabel}`} className="px-4 py-3 text-sm text-right text-gray-600 tabular-nums">
                  {year.fte}
                </td>
              ))}
            </tr>

            {/* Revenue per FTE */}
            <tr className="hover:bg-gray-50 bg-gradient-to-r from-brand-navy/5 to-brand-navy/10">
              <td className="px-4 py-3 text-sm font-medium text-brand-navy">Revenue / FTE</td>
              {yearlyData.map(year => (
                <td key={`rev-fte-${year.fyLabel}`} className="px-4 py-3 text-sm text-right font-semibold text-brand-navy tabular-nums">
                  {year.revenuePerFTE > 0 ? formatCurrency(year.revenuePerFTE) : '-'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Variance Warning */}
      {hasAnyVariance && (
        <div className="px-6 py-3 bg-amber-50 border-t border-amber-100">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              Your planned team differs from your headcount targets. Review the team below or adjust your targets above.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function Step4Team({ state, actions, fiscalYear, forecastDuration = 1 }: Step4TeamProps) {
  const { teamMembers, newHires, departures, bonuses, commissions, revenueLines, goals } = state;

  const duration = forecastDuration || state.forecastDuration || 1;
  const startYear = fiscalYear - 1;
  const endYear = fiscalYear + duration - 1;

  const [showGuidance, setShowGuidance] = useState(true);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showAddContractor, setShowAddContractor] = useState(false);
  const [showAddHire, setShowAddHire] = useState(false);
  const [hireType, setHireType] = useState<'employee' | 'contractor'>('employee');

  const defaultStartMonth = useMemo(() => getDefaultStartMonth(fiscalYear), [fiscalYear]);

  // Form states
  const [newEmployeeData, setNewEmployeeData] = useState({
    name: '',
    role: '',
    type: 'full-time' as EmploymentType,
    hoursPerWeek: STANDARD_HOURS,
    hourlyRate: 0,
    weeksPerYear: DEFAULT_WEEKS,
    salary: 0,
  });

  const [newContractorData, setNewContractorData] = useState({
    name: '',
    role: '',
    salary: 0,
  });

  const [newHireData, setNewHireData] = useState({
    role: '',
    type: 'full-time' as EmploymentType,
    hoursPerWeek: STANDARD_HOURS,
    hourlyRate: 0,
    weeksPerYear: DEFAULT_WEEKS,
    salary: 0,
    startMonth: defaultStartMonth,
  });

  // AI Salary Suggestion state
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [lastAIRole, setLastAIRole] = useState('');

  // Fetch AI salary suggestion
  const fetchAISuggestion = useCallback(async (role: string, employmentType: EmploymentType) => {
    if (!role.trim()) return;

    setIsLoadingAI(true);
    setLastAIRole(role);
    setAiSuggestion(null);

    try {
      const response = await fetch('/api/ai/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'salary_estimate',
          position: role,
          businessId: state.businessId,
          employmentType,
        }),
      });

      if (response.ok) {
        const suggestion = await response.json();
        setAiSuggestion(suggestion);
      }
    } catch (error) {
      console.error('Failed to fetch AI suggestion:', error);
    } finally {
      setIsLoadingAI(false);
    }
  }, [state.businessId]);

  // Record AI action
  const recordAIAction = useCallback(async (
    interactionId: string,
    action: 'used' | 'adjusted' | 'ignored',
    value?: number
  ) => {
    try {
      await fetch('/api/ai/advisor', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interactionId, action, userValue: value }),
      });
    } catch (error) {
      console.error('Failed to record AI action:', error);
    }
  }, []);

  const resetAISuggestion = useCallback(() => {
    setAiSuggestion(null);
    setLastAIRole('');
  }, []);

  // Build rows split by type
  const { employeeRows, contractorRows } = useMemo(() => {
    const employees: TeamRow[] = [];
    const contractors: TeamRow[] = [];

    teamMembers.forEach((member) => {
      const departure = departures.find((d) => d.teamMemberId === member.id);
      const bonus = bonuses.find((b) => b.teamMemberId === member.id);
      const commission = commissions.find((c) => c.teamMemberId === member.id);

      let commissionAmount = 0;
      if (commission) {
        const revLine = revenueLines.find((r) => r.id === commission.revenueLineId);
        if (revLine) {
          const lineTotal = Object.values(revLine.year1Monthly).reduce((a, b) => a + b, 0);
          commissionAmount = (lineTotal * commission.percentOfRevenue) / 100;
        }
      }

      const superAmount = member.type === 'contractor' ? 0 : member.superAmount;
      const totalCost = member.newSalary + superAmount + (bonus?.amount || 0) + commissionAmount;

      const row: TeamRow = {
        id: member.id,
        name: member.name,
        role: member.role,
        type: member.type,
        contractorType: member.contractorType,
        isNewHire: false,
        endMonth: departure?.endMonth,
        hoursPerWeek: member.hoursPerWeek,
        hourlyRate: member.hourlyRate,
        weeksPerYear: member.weeksPerYear,
        salary: member.newSalary,
        superAmount,
        bonusAmount: bonus?.amount || 0,
        bonusMonth: bonus?.month || 6,
        commissionPct: commission?.percentOfRevenue || 0,
        commissionAmount,
        totalCost,
        teamMemberId: member.id,
        departureId: departure?.id,
        bonusId: bonus?.id,
        commissionId: commission?.id,
        includeInHeadcount: member.includeInHeadcount,
      };

      if (member.type === 'contractor') {
        contractors.push(row);
      } else {
        employees.push(row);
      }
    });

    newHires.forEach((hire) => {
      const bonus = bonuses.find((b) => b.teamMemberId === hire.id);
      const commission = commissions.find((c) => c.teamMemberId === hire.id);

      let commissionAmount = 0;
      if (commission) {
        const revLine = revenueLines.find((r) => r.id === commission.revenueLineId);
        if (revLine) {
          const lineTotal = Object.values(revLine.year1Monthly).reduce((a, b) => a + b, 0);
          commissionAmount = (lineTotal * commission.percentOfRevenue) / 100;
        }
      }

      const superAmount = hire.type === 'contractor' ? 0 : hire.superAmount;
      const totalCost = hire.salary + superAmount + (bonus?.amount || 0) + commissionAmount;

      const row: TeamRow = {
        id: hire.id,
        name: 'TBD',
        role: hire.role,
        type: hire.type,
        contractorType: hire.contractorType,
        isNewHire: true,
        startMonth: hire.startMonth,
        hoursPerWeek: hire.hoursPerWeek,
        hourlyRate: hire.hourlyRate,
        weeksPerYear: hire.weeksPerYear,
        salary: hire.salary,
        superAmount,
        bonusAmount: bonus?.amount || 0,
        bonusMonth: bonus?.month || 6,
        commissionPct: commission?.percentOfRevenue || 0,
        commissionAmount,
        totalCost,
        newHireId: hire.id,
        bonusId: bonus?.id,
        commissionId: commission?.id,
        includeInHeadcount: hire.includeInHeadcount,
      };

      if (hire.type === 'contractor') {
        contractors.push(row);
      } else {
        employees.push(row);
      }
    });

    return { employeeRows: employees, contractorRows: contractors };
  }, [teamMembers, newHires, departures, bonuses, commissions, revenueLines]);

  // Calculate totals
  const employeeTotals = useMemo(() => {
    return employeeRows.reduce(
      (acc, row) => ({
        salary: acc.salary + row.salary,
        super: acc.super + row.superAmount,
        bonus: acc.bonus + row.bonusAmount,
        commission: acc.commission + row.commissionAmount,
        total: acc.total + row.totalCost,
      }),
      { salary: 0, super: 0, bonus: 0, commission: 0, total: 0 }
    );
  }, [employeeRows]);

  const contractorTotals = useMemo(() => {
    return contractorRows.reduce(
      (acc, row) => ({
        cost: acc.cost + row.salary,
        bonus: acc.bonus + row.bonusAmount,
        total: acc.total + row.totalCost,
      }),
      { cost: 0, bonus: 0, total: 0 }
    );
  }, [contractorRows]);

  // Handler functions
  const handleAddEmployee = () => {
    if (!newEmployeeData.name.trim() || !newEmployeeData.role.trim()) return;

    let salary = newEmployeeData.salary;
    if (newEmployeeData.type === 'casual' && newEmployeeData.hourlyRate > 0) {
      salary = calculateCasualAnnual(newEmployeeData.hourlyRate, newEmployeeData.hoursPerWeek, newEmployeeData.weeksPerYear);
    }

    actions.addTeamMember({
      name: newEmployeeData.name.trim(),
      role: newEmployeeData.role.trim(),
      type: newEmployeeData.type,
      hoursPerWeek: newEmployeeData.hoursPerWeek,
      hourlyRate: newEmployeeData.type === 'casual' ? newEmployeeData.hourlyRate : undefined,
      weeksPerYear: newEmployeeData.type === 'casual' ? newEmployeeData.weeksPerYear : undefined,
      currentSalary: salary,
      increasePct: 0,
      isFromXero: false,
    });
    setNewEmployeeData({ name: '', role: '', type: 'full-time', hoursPerWeek: STANDARD_HOURS, hourlyRate: 0, weeksPerYear: DEFAULT_WEEKS, salary: 0 });
    setShowAddEmployee(false);
    resetAISuggestion();
  };

  const handleAddContractor = () => {
    if (!newContractorData.name.trim() || !newContractorData.role.trim()) return;

    actions.addTeamMember({
      name: newContractorData.name.trim(),
      role: newContractorData.role.trim(),
      type: 'contractor',
      hoursPerWeek: STANDARD_HOURS,
      currentSalary: newContractorData.salary,
      increasePct: 0,
      isFromXero: false,
    });
    setNewContractorData({ name: '', role: '', salary: 0 });
    setShowAddContractor(false);
    resetAISuggestion();
  };

  const handleAddNewHire = () => {
    if (!newHireData.role.trim()) return;

    const isContractor = hireType === 'contractor';
    let salary = newHireData.salary;

    if (!isContractor && newHireData.type === 'casual' && newHireData.hourlyRate > 0) {
      salary = calculateCasualAnnual(newHireData.hourlyRate, newHireData.hoursPerWeek, newHireData.weeksPerYear);
    }

    actions.addNewHire({
      role: newHireData.role.trim(),
      type: isContractor ? 'contractor' : newHireData.type,
      hoursPerWeek: newHireData.hoursPerWeek,
      hourlyRate: !isContractor && newHireData.type === 'casual' ? newHireData.hourlyRate : undefined,
      weeksPerYear: !isContractor && newHireData.type === 'casual' ? newHireData.weeksPerYear : undefined,
      startMonth: newHireData.startMonth,
      salary,
    });
    setNewHireData({ role: '', type: 'full-time', hoursPerWeek: STANDARD_HOURS, hourlyRate: 0, weeksPerYear: DEFAULT_WEEKS, salary: 0, startMonth: defaultStartMonth });
    setShowAddHire(false);
    resetAISuggestion();
  };

  const handleDeleteRow = (row: TeamRow) => {
    if (row.isNewHire && row.newHireId) {
      actions.removeNewHire(row.newHireId);
    } else if (row.teamMemberId) {
      actions.removeTeamMember(row.teamMemberId);
    }
  };

  // Handler to update headcount target in goals
  const handleUpdateHeadcountTarget = useCallback((year: 1 | 2 | 3, value: number) => {
    const updatedGoals = { ...goals };
    if (year === 1) {
      updatedGoals.year1 = { ...goals.year1, headcountTarget: value };
    } else if (year === 2 && goals.year2) {
      updatedGoals.year2 = { ...goals.year2, headcountTarget: value };
    } else if (year === 3 && goals.year3) {
      updatedGoals.year3 = { ...goals.year3, headcountTarget: value };
    }
    actions.updateGoals(updatedGoals);
  }, [goals, actions]);

  const handleDepartureChange = (row: TeamRow, endMonth: string) => {
    if (!row.teamMemberId) return;
    if (row.departureId) {
      if (endMonth) {
        actions.removeDeparture(row.departureId);
        actions.addDeparture({ teamMemberId: row.teamMemberId, endMonth });
      } else {
        actions.removeDeparture(row.departureId);
      }
    } else if (endMonth) {
      actions.addDeparture({ teamMemberId: row.teamMemberId, endMonth });
    }
  };

  const handleBonusChange = (row: TeamRow, amount: number) => {
    const memberId = row.teamMemberId || row.newHireId;
    if (!memberId) return;
    if (row.bonusId) {
      if (amount > 0) {
        actions.updateBonus(row.bonusId, { amount });
      } else {
        actions.removeBonus(row.bonusId);
      }
    } else if (amount > 0) {
      actions.addBonus({ teamMemberId: memberId, amount, month: row.bonusMonth });
    }
  };

  const handleCommissionChange = (row: TeamRow, pct: number) => {
    const memberId = row.teamMemberId || row.newHireId;
    if (!memberId) return;
    if (row.commissionId) {
      if (pct > 0) {
        actions.updateCommission(row.commissionId, { percentOfRevenue: pct });
      } else {
        actions.removeCommission(row.commissionId);
      }
    } else if (pct > 0 && revenueLines.length > 0) {
      actions.addCommission({
        teamMemberId: memberId,
        percentOfRevenue: pct,
        revenueLineId: revenueLines[0].id,
        timing: 'monthly',
      });
    }
  };

  // Render salary input based on type
  const renderSalaryInput = (row: TeamRow) => {
    if (row.type === 'casual') {
      return (
        <CasualSalaryInput
          hourlyRate={row.hourlyRate || 0}
          hoursPerWeek={row.hoursPerWeek}
          weeksPerYear={row.weeksPerYear || DEFAULT_WEEKS}
          salary={row.salary}
          onUpdate={(hourlyRate, hoursPerWeek, salary) => {
            if (row.isNewHire) {
              actions.updateNewHire(row.newHireId!, { hourlyRate, hoursPerWeek, salary });
            } else {
              actions.updateTeamMember(row.teamMemberId!, { hourlyRate, hoursPerWeek, currentSalary: salary, increasePct: 0 });
            }
          }}
        />
      );
    }

    if (row.type === 'part-time') {
      return (
        <PartTimeSalaryInput
          salary={row.salary}
          hoursPerWeek={row.hoursPerWeek}
          onSalaryChange={(salary) => {
            if (row.isNewHire) {
              actions.updateNewHire(row.newHireId!, { salary });
            } else {
              actions.updateTeamMember(row.teamMemberId!, { currentSalary: salary, increasePct: 0 });
            }
          }}
          onHoursChange={(hoursPerWeek, salary) => {
            if (row.isNewHire) {
              actions.updateNewHire(row.newHireId!, { hoursPerWeek, salary });
            } else {
              actions.updateTeamMember(row.teamMemberId!, { hoursPerWeek, currentSalary: salary, increasePct: 0 });
            }
          }}
        />
      );
    }

    // Full-time: just salary
    return (
      <CurrencyInput
        value={row.salary}
        onChange={(val) => {
          if (row.isNewHire) {
            actions.updateNewHire(row.newHireId!, { salary: val });
          } else {
            actions.updateTeamMember(row.teamMemberId!, { currentSalary: val, increasePct: 0 });
          }
        }}
      />
    );
  };

  // Table component
  const TeamTable = ({
    rows,
    isContractor = false,
    totals,
  }: {
    rows: TeamRow[];
    isContractor?: boolean;
    totals: { salary?: number; cost?: number; super?: number; bonus: number; commission?: number; total: number };
  }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        {/* Define column widths for consistent alignment */}
        <colgroup>
          <col className="w-[18%]" /> {/* Name - flexible */}
          <col className="w-[14%]" /> {/* Role - flexible */}
          <col style={{ width: '85px' }} /> {/* Type */}
          <col style={{ width: '110px' }} /> {/* Status */}
          <col style={{ width: '95px' }} /> {/* Salary/Cost */}
          <col style={{ width: '80px' }} /> {/* Rate */}
          <col style={{ width: '60px' }} /> {/* Hours */}
          {!isContractor && <col style={{ width: '80px' }} />} {/* Super - employees only */}
          <col style={{ width: '70px' }} /> {/* Bonus */}
          <col style={{ width: '55px' }} /> {/* Comm % / HC */}
          {!isContractor && <col style={{ width: '70px' }} />} {/* Comm $ - employees only */}
          <col style={{ width: '90px' }} /> {/* Total */}
          <col style={{ width: '32px' }} /> {/* Delete */}
        </colgroup>
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Name</th>
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Role</th>
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Type</th>
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
              Status
              <Tooltip text="Current, New Hire (with start), or Leaving (with end date)" />
            </th>
            <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
              {isContractor ? 'Cost' : 'Salary'}
              <Tooltip text={isContractor ? 'Total annual cost' : 'Annual salary amount'} />
            </th>
            <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
              Rate
              <Tooltip text={isContractor ? 'Hourly/daily rate (optional)' : 'Hourly rate (casual only)'} />
            </th>
            <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
              Hrs
              <Tooltip text="Hours per week" />
            </th>
            {!isContractor && (
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                Super
                <Tooltip text="Superannuation Guarantee (12% for 2026)" />
              </th>
            )}
            <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
              Bonus
              <Tooltip text="One-off bonus payment" />
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
              {isContractor ? 'HC' : 'Comm%'}
              <Tooltip text={isContractor ? 'Include in team headcount' : 'Commission as % of revenue'} />
            </th>
            {!isContractor && (
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                Comm$
                <Tooltip text="Calculated commission amount" />
              </th>
            )}
            <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Total</th>
            <th className="px-1 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.id} className={`hover:bg-gray-50 ${row.isNewHire ? 'bg-green-50/30' : ''}`}>
              {/* Name */}
              <td className="px-2 py-1.5">
                {row.isNewHire ? (
                  <span className="text-gray-400 italic">TBD</span>
                ) : (
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => actions.updateTeamMember(row.teamMemberId!, { name: e.target.value })}
                    className="w-full px-1.5 py-1 text-sm border border-transparent hover:border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy bg-transparent truncate"
                  />
                )}
              </td>

              {/* Role */}
              <td className="px-2 py-1.5">
                <input
                  type="text"
                  value={row.role}
                  onChange={(e) => {
                    if (row.isNewHire) {
                      actions.updateNewHire(row.newHireId!, { role: e.target.value });
                    } else {
                      actions.updateTeamMember(row.teamMemberId!, { role: e.target.value });
                    }
                  }}
                  className="w-full px-1.5 py-1 text-sm border border-transparent hover:border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy bg-transparent truncate"
                />
              </td>

              {/* Type */}
              <td className="px-2 py-1.5">
                {isContractor ? (
                  <select
                    value={row.contractorType || 'onshore'}
                    onChange={(e) => {
                      const newType = e.target.value as ContractorType;
                      if (row.isNewHire) {
                        actions.updateNewHire(row.newHireId!, { contractorType: newType });
                      } else {
                        actions.updateTeamMember(row.teamMemberId!, { contractorType: newType });
                      }
                    }}
                    className="w-full px-1 py-1 text-sm border border-gray-200 rounded focus:border-orange-400 focus:ring-1 focus:ring-orange-400 bg-transparent"
                  >
                    {contractorTypes.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={row.type}
                    onChange={(e) => {
                      const newType = e.target.value as EmploymentType;
                      if (row.isNewHire) {
                        actions.updateNewHire(row.newHireId!, {
                          type: newType,
                          hoursPerWeek: newType === 'full-time' ? STANDARD_HOURS : row.hoursPerWeek,
                        });
                      } else {
                        actions.updateTeamMember(row.teamMemberId!, {
                          type: newType,
                          hoursPerWeek: newType === 'full-time' ? STANDARD_HOURS : row.hoursPerWeek,
                        });
                      }
                    }}
                    className="w-full px-1 py-1 text-sm border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy bg-transparent"
                  >
                    {employeeTypes.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                )}
              </td>

              {/* Status */}
              <td className="px-2 py-1.5">
                {row.isNewHire ? (
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">
                      New
                    </span>
                    <MonthPicker
                      value={row.startMonth || ''}
                      onChange={(val) => actions.updateNewHire(row.newHireId!, { startMonth: val })}
                      minYear={startYear}
                      maxYear={endYear}
                      placeholder="Start"
                    />
                  </div>
                ) : row.endMonth ? (
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
                      End
                    </span>
                    <MonthPicker
                      value={row.endMonth}
                      onChange={(val) => handleDepartureChange(row, val)}
                      minYear={startYear}
                      maxYear={endYear}
                      placeholder="End"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                      Active
                    </span>
                    <MonthPicker
                      value=""
                      onChange={(val) => handleDepartureChange(row, val)}
                      minYear={startYear}
                      maxYear={endYear}
                      placeholder="..."
                    />
                  </div>
                )}
              </td>

              {/* Salary */}
              <td className="px-2 py-1.5">
                <CurrencyInput
                  value={row.salary}
                  onChange={(val) => {
                    if (isContractor) {
                      if (row.isNewHire) {
                        actions.updateNewHire(row.newHireId!, { salary: val });
                      } else {
                        actions.updateTeamMember(row.teamMemberId!, { currentSalary: val, increasePct: 0 });
                      }
                    } else if (row.type === 'casual') {
                      // For casual, recalculate hourly rate from new salary
                      const weeksPerYear = row.weeksPerYear || DEFAULT_WEEKS;
                      const newRate = row.hoursPerWeek > 0 ? val / (row.hoursPerWeek * weeksPerYear) : 0;
                      if (row.isNewHire) {
                        actions.updateNewHire(row.newHireId!, { salary: val, hourlyRate: Math.round(newRate * 100) / 100 });
                      } else {
                        actions.updateTeamMember(row.teamMemberId!, { currentSalary: val, hourlyRate: Math.round(newRate * 100) / 100, increasePct: 0 });
                      }
                    } else {
                      if (row.isNewHire) {
                        actions.updateNewHire(row.newHireId!, { salary: val });
                      } else {
                        actions.updateTeamMember(row.teamMemberId!, { currentSalary: val, increasePct: 0 });
                      }
                    }
                  }}
                  className="w-full px-1.5 py-1 text-right border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
                />
              </td>

              {/* Rate */}
              <td className="px-2 py-1.5">
                {isContractor || row.type === 'casual' ? (
                  <div className="flex items-center justify-end">
                    <input
                      type="number"
                      defaultValue={row.hourlyRate || ''}
                      key={`rate-${row.id}-${row.hourlyRate}`}
                      onBlur={(e) => {
                        const newRate = parseFloat(e.target.value) || 0;
                        if (isContractor) {
                          if (row.isNewHire) {
                            actions.updateNewHire(row.newHireId!, { hourlyRate: newRate });
                          } else {
                            actions.updateTeamMember(row.teamMemberId!, { hourlyRate: newRate });
                          }
                        } else if (newRate !== row.hourlyRate) {
                          const weeksPerYear = row.weeksPerYear || DEFAULT_WEEKS;
                          const newSalary = calculateCasualAnnual(newRate, row.hoursPerWeek, weeksPerYear);
                          if (row.isNewHire) {
                            actions.updateNewHire(row.newHireId!, { hourlyRate: newRate, salary: newSalary });
                          } else {
                            actions.updateTeamMember(row.teamMemberId!, { hourlyRate: newRate, currentSalary: newSalary, increasePct: 0 });
                          }
                        }
                      }}
                      placeholder="-"
                      className="w-full px-1.5 py-1 text-right border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
                    />
                  </div>
                ) : (
                  <span className="text-gray-400 text-right block">-</span>
                )}
              </td>

              {/* Hours */}
              <td className="px-2 py-1.5 text-right">
                {isContractor || row.type !== 'full-time' ? (
                  <input
                    type="number"
                    defaultValue={row.hoursPerWeek || ''}
                    key={`hours-${row.id}-${row.hoursPerWeek}`}
                    onBlur={(e) => {
                      const newHours = parseFloat(e.target.value) || 0;
                      if (isContractor) {
                        if (row.isNewHire) {
                          actions.updateNewHire(row.newHireId!, { hoursPerWeek: newHours });
                        } else {
                          actions.updateTeamMember(row.teamMemberId!, { hoursPerWeek: newHours });
                        }
                      } else if (newHours !== row.hoursPerWeek) {
                        if (row.type === 'casual') {
                          const weeksPerYear = row.weeksPerYear || DEFAULT_WEEKS;
                          const newSalary = calculateCasualAnnual(row.hourlyRate || 0, newHours, weeksPerYear);
                          if (row.isNewHire) {
                            actions.updateNewHire(row.newHireId!, { hoursPerWeek: newHours, salary: newSalary });
                          } else {
                            actions.updateTeamMember(row.teamMemberId!, { hoursPerWeek: newHours, currentSalary: newSalary, increasePct: 0 });
                          }
                        } else {
                          const oldHours = row.hoursPerWeek > 0 ? row.hoursPerWeek : STANDARD_HOURS;
                          const newSalary = oldHours > 0 && row.salary > 0
                            ? Math.round(row.salary * (newHours / oldHours))
                            : row.salary;
                          if (row.isNewHire) {
                            actions.updateNewHire(row.newHireId!, { hoursPerWeek: newHours, salary: newSalary });
                          } else {
                            actions.updateTeamMember(row.teamMemberId!, { hoursPerWeek: newHours, currentSalary: newSalary, increasePct: 0 });
                          }
                        }
                      }
                    }}
                    placeholder="-"
                    className="w-full px-1 py-1 text-right tabular-nums border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
                  />
                ) : (
                  <span className="text-gray-500 tabular-nums">38</span>
                )}
              </td>

              {/* Super - only for employees */}
              {!isContractor && (
                <td className="px-2 py-1.5 text-gray-500 text-right tabular-nums">
                  {formatCurrency(row.superAmount)}
                </td>
              )}

              {/* Bonus */}
              <td className="px-2 py-1.5">
                <input
                  type="number"
                  value={row.bonusAmount || ''}
                  onChange={(e) => handleBonusChange(row, parseFloat(e.target.value) || 0)}
                  placeholder="-"
                  className="w-full px-1.5 py-1 text-right border border-gray-200 rounded focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
                />
              </td>

              {/* Commission % / Headcount */}
              <td className="px-2 py-1.5 text-center">
                {isContractor ? (
                  <input
                    type="checkbox"
                    checked={row.includeInHeadcount || false}
                    onChange={(e) => {
                      if (row.isNewHire && row.newHireId) {
                        actions.updateNewHire(row.newHireId, { includeInHeadcount: e.target.checked });
                      } else if (row.teamMemberId) {
                        actions.updateTeamMember(row.teamMemberId, { includeInHeadcount: e.target.checked });
                      }
                    }}
                    title={row.includeInHeadcount ? "Included in headcount" : "Not included in headcount"}
                    className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-400 cursor-pointer"
                  />
                ) : (
                  <input
                    type="number"
                    value={row.commissionPct || ''}
                    onChange={(e) => handleCommissionChange(row, parseFloat(e.target.value) || 0)}
                    placeholder="-"
                    step="0.1"
                    className="w-full px-1 py-1 text-right border border-gray-200 rounded focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                  />
                )}
              </td>

              {/* Commission $ - only for employees */}
              {!isContractor && (
                <td className="px-2 py-1.5 text-gray-500 text-right tabular-nums">
                  {row.commissionAmount > 0 ? formatCurrency(row.commissionAmount) : '-'}
                </td>
              )}

              {/* Total */}
              <td className="px-2 py-1.5 font-semibold text-gray-900 text-right tabular-nums">
                {formatCurrency(row.totalCost)}
              </td>

              {/* Delete */}
              <td className="px-1 py-1.5">
                <button
                  onClick={() => handleDeleteRow(row)}
                  className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan={isContractor ? 11 : 13} className="px-4 py-6 text-center text-gray-500">
                No {isContractor ? 'contractors' : 'team members'} added yet
              </td>
            </tr>
          )}
        </tbody>

        {/* Totals */}
        {rows.length > 0 && (
          <tfoot className={isContractor ? 'bg-orange-600 text-white' : 'bg-brand-navy text-white'}>
            <tr>
              <td colSpan={4} className="px-2 py-2 text-xs font-semibold uppercase tracking-wide">
                {isContractor ? 'Total Contractors' : 'Total Team'}
              </td>
              <td className="px-2 py-2 font-semibold text-right tabular-nums">
                {formatCurrency(isContractor ? totals.cost || 0 : totals.salary || 0)}
              </td>
              <td className="px-2 py-2"></td>
              <td className="px-2 py-2"></td>
              {!isContractor && (
                <td className="px-2 py-2 font-semibold text-right tabular-nums">
                  {formatCurrency(totals.super || 0)}
                </td>
              )}
              <td className="px-2 py-2 font-semibold text-right tabular-nums">
                {formatCurrency(totals.bonus)}
              </td>
              <td className="px-2 py-2 text-center">-</td>
              {!isContractor && (
                <td className="px-2 py-2 font-semibold text-right tabular-nums">
                  {formatCurrency(totals.commission || 0)}
                </td>
              )}
              <td className="px-2 py-2 font-bold text-right tabular-nums">
                {formatCurrency(totals.total)}
              </td>
              <td className="px-1 py-2"></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  /**
   * AI Suggestion Panel Component - Context-aware for employment type
   *
   * ============================================================================
   * AI DESIGN STANDARD - IMPORTANT FOR FUTURE DEVELOPMENT
   * ============================================================================
   *
   * All AI-powered features in this platform MUST use PURPLE as the primary color.
   * This creates a consistent visual language where users instantly recognize
   * "purple = AI is helping me".
   *
   * Standard AI styling:
   * - Background: bg-gradient-to-r from-purple-50 to-indigo-50
   * - Border: border-purple-200
   * - Icon badge: bg-gradient-to-br from-purple-500 to-indigo-500 (with Sparkles icon)
   * - Text: text-purple-900
   * - Buttons: bg-purple-600 hover:bg-purple-700
   * - Links: text-purple-700 hover:text-purple-900
   *
   * This follows industry standards (GitHub Copilot, Notion AI, etc.) where purple
   * is the de facto color for AI features.
   *
   * DO NOT use different colors for AI features based on context (e.g., orange for
   * contractors, green for new hires). The context is already clear from the UI
   * section - the AI panel should always be purple to maintain recognition.
   * ============================================================================
   */
  const AISuggestionPanel = ({
    role,
    employmentType,
    hoursPerWeek = STANDARD_HOURS,
    onUseSuggestion,
    onUseHourlyRate,
  }: {
    role: string;
    employmentType: EmploymentType;
    hoursPerWeek?: number;
    onUseSuggestion: (value: number) => void;
    onUseHourlyRate?: (hourlyRate: number) => void;
  }) => {
    // AI Design Standard: Always use purple for AI features (see comment above)
    const aiColors = {
      bg: 'bg-gradient-to-r from-purple-50 to-indigo-50',
      border: 'border-purple-200',
      icon: 'text-purple-600',
      text: 'text-purple-900',
      button: 'bg-purple-600 hover:bg-purple-700',
      link: 'text-purple-700 hover:text-purple-900',
      star: 'from-purple-500 to-indigo-500'
    };
    const c = aiColors;

    // Convert annual salary to hourly rate (48 weeks × hours per week)
    const annualToHourly = (annual: number, hours: number = STANDARD_HOURS) => {
      return Math.round(annual / (DEFAULT_WEEKS * hours));
    };

    // Calculate pro-rata salary based on hours
    const calculateProRata = (fteSalary: number, hours: number) => {
      return Math.round(fteSalary * (hours / STANDARD_HOURS));
    };

    // Get display values based on employment type
    const getDisplayValues = () => {
      if (!aiSuggestion?.typicalValue) return null;

      const fteAnnual = aiSuggestion.typicalValue;
      const fteMin = aiSuggestion.minValue;
      const fteMax = aiSuggestion.maxValue;

      if (employmentType === 'casual') {
        // For casual: show hourly rate
        const hourlyTypical = annualToHourly(fteAnnual);
        const hourlyMin = fteMin ? annualToHourly(fteMin) : null;
        const hourlyMax = fteMax ? annualToHourly(fteMax) : null;
        return {
          label: 'Suggested hourly rate',
          typical: { display: `$${hourlyTypical}/hr`, value: hourlyTypical, isHourly: true },
          min: hourlyMin ? { display: `$${hourlyMin}/hr`, value: hourlyMin, isHourly: true } : null,
          max: hourlyMax ? { display: `$${hourlyMax}/hr`, value: hourlyMax, isHourly: true } : null,
          note: `Based on ${formatCurrency(fteAnnual)} FTE equivalent`,
        };
      }

      if (employmentType === 'part-time' && hoursPerWeek < STANDARD_HOURS) {
        // For part-time: show FTE salary with pro-rata preview
        const proRataTypical = calculateProRata(fteAnnual, hoursPerWeek);
        const proRataMin = fteMin ? calculateProRata(fteMin, hoursPerWeek) : null;
        const proRataMax = fteMax ? calculateProRata(fteMax, hoursPerWeek) : null;
        const ftePct = Math.round((hoursPerWeek / STANDARD_HOURS) * 100);
        return {
          label: `Suggested salary (${ftePct}% FTE)`,
          typical: { display: formatCurrency(proRataTypical), value: proRataTypical, isHourly: false },
          min: proRataMin ? { display: formatCurrency(proRataMin), value: proRataMin, isHourly: false } : null,
          max: proRataMax ? { display: formatCurrency(proRataMax), value: proRataMax, isHourly: false } : null,
          note: `Pro-rata from ${formatCurrency(fteAnnual)} FTE (38 hrs/wk)`,
        };
      }

      // Full-time or contractor: show annual salary
      return {
        label: 'Suggested annual salary',
        typical: { display: formatCurrency(fteAnnual), value: fteAnnual, isHourly: false },
        min: fteMin ? { display: formatCurrency(fteMin), value: fteMin, isHourly: false } : null,
        max: fteMax ? { display: formatCurrency(fteMax), value: fteMax, isHourly: false } : null,
        note: null,
      };
    };

    const displayValues = getDisplayValues();

    return (
      <div className={`p-4 ${c.bg} border ${c.border} rounded-xl`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${c.star} flex items-center justify-center`}>
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className={`text-sm font-semibold ${c.text}`}>AI Salary Suggestion</span>
          </div>
          {role.trim() && (role !== lastAIRole || !aiSuggestion) && !isLoadingAI && (
            <button
              type="button"
              onClick={() => fetchAISuggestion(role, employmentType)}
              className={`text-xs font-medium px-2 py-1 rounded-lg ${c.link} hover:bg-white/50 transition-colors`}
            >
              Get suggestion
            </button>
          )}
        </div>

        {!role.trim() && !isLoadingAI && !aiSuggestion && (
          <p className="text-xs text-gray-500">Enter a role above to get AI salary suggestions</p>
        )}

        {isLoadingAI && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Analyzing market data...</span>
          </div>
        )}

        {aiSuggestion && !isLoadingAI && role === lastAIRole && displayValues && (
          <div className="space-y-3">
            {/* Header with confidence badge */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">{displayValues.label}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                aiSuggestion.confidence === 'high' ? 'bg-green-100 text-green-700' :
                aiSuggestion.confidence === 'medium' ? 'bg-blue-100 text-blue-700' :
                'bg-amber-100 text-amber-700'
              }`}>
                {aiSuggestion.confidence === 'high' ? 'High confidence' :
                 aiSuggestion.confidence === 'medium' ? 'Moderate' : 'Ask coach'}
              </span>
            </div>

            {/* Main value display */}
            <div className="text-2xl font-bold text-gray-900">
              {displayValues.typical.display}
            </div>

            {/* Note about conversion */}
            {displayValues.note && (
              <p className="text-xs text-gray-500 bg-white/50 px-2 py-1 rounded">
                {displayValues.note}
              </p>
            )}

            {/* Reasoning */}
            <p className="text-xs text-gray-600">{aiSuggestion.reasoning}</p>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (displayValues.typical.isHourly && onUseHourlyRate) {
                    onUseHourlyRate(displayValues.typical.value);
                  } else {
                    onUseSuggestion(displayValues.typical.value);
                  }
                  if (aiSuggestion.interactionId) {
                    recordAIAction(aiSuggestion.interactionId, 'used', displayValues.typical.value);
                  }
                }}
                className={`flex-1 text-xs py-2 text-white rounded-lg font-medium ${c.button} transition-colors`}
              >
                Use {displayValues.typical.display}
              </button>
              {displayValues.min && (
                <button
                  type="button"
                  onClick={() => {
                    if (displayValues.min!.isHourly && onUseHourlyRate) {
                      onUseHourlyRate(displayValues.min!.value);
                    } else {
                      onUseSuggestion(displayValues.min!.value);
                    }
                    if (aiSuggestion.interactionId) {
                      recordAIAction(aiSuggestion.interactionId, 'adjusted', displayValues.min!.value);
                    }
                  }}
                  className="text-xs py-2 px-3 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {displayValues.min.display}
                </button>
              )}
              {displayValues.max && (
                <button
                  type="button"
                  onClick={() => {
                    if (displayValues.max!.isHourly && onUseHourlyRate) {
                      onUseHourlyRate(displayValues.max!.value);
                    } else {
                      onUseSuggestion(displayValues.max!.value);
                    }
                    if (aiSuggestion.interactionId) {
                      recordAIAction(aiSuggestion.interactionId, 'adjusted', displayValues.max!.value);
                    }
                  }}
                  className="text-xs py-2 px-3 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {displayValues.max.display}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Guidance Banner */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setShowGuidance(!showGuidance)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900">Team Cost Guide</h3>
          </div>
          {showGuidance ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>

        {showGuidance && (
          <div className="px-6 py-4 bg-blue-50 border-t border-blue-100">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-900">Full-time</span>
                <p className="text-gray-500 text-xs mt-1">38 hrs/week standard. Enter annual salary.</p>
              </div>
              <div>
                <span className="font-medium text-gray-900">Part-time</span>
                <p className="text-gray-500 text-xs mt-1">Enter salary, then hours. Salary adjusts proportionally when hours change.</p>
              </div>
              <div>
                <span className="font-medium text-gray-900">Casual</span>
                <p className="text-gray-500 text-xs mt-1">Enter hourly rate + hours/week. Annual cost calculated.</p>
              </div>
              <div>
                <span className="font-medium text-orange-600">Contractors</span>
                <p className="text-gray-500 text-xs mt-1">No super obligations. Enter total annual cost.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PLANNING OVERVIEW - Summary table */}
      <TeamPlanningOverview
        goals={goals}
        teamMembers={teamMembers}
        newHires={newHires}
        departures={departures}
        duration={duration}
        fiscalYear={fiscalYear}
        onUpdateHeadcountTarget={handleUpdateHeadcountTarget}
      />

      {/* TEAM MEMBERS SECTION */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-brand-navy" />
            <h3 className="text-lg font-semibold text-gray-900">Team Members</h3>
            <span className="text-sm text-gray-500">({employeeRows.length})</span>
            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">+12% Super</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddEmployee(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-brand-navy bg-brand-navy/10 hover:bg-brand-navy/20 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Current
            </button>
            <button
              onClick={() => { setHireType('employee'); setShowAddHire(true); }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Plan Hire
            </button>
          </div>
        </div>

        <TeamTable rows={employeeRows} totals={employeeTotals} />
      </div>

      {/* CONTRACTORS SECTION */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-orange-600" />
            <h3 className="text-lg font-semibold text-gray-900">Contractors</h3>
            <span className="text-sm text-gray-500">({contractorRows.length})</span>
            <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded">No Super</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddContractor(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Current
            </button>
            <button
              onClick={() => { setHireType('contractor'); setShowAddHire(true); }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Plan Hire
            </button>
          </div>
        </div>

        <TeamTable rows={contractorRows} isContractor totals={contractorTotals} />
      </div>

      {/* Add Team Member Modal */}
      {showAddEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add Current Team Member</h3>
              <button onClick={() => { setShowAddEmployee(false); resetAISuggestion(); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newEmployeeData.name}
                  onChange={(e) => setNewEmployeeData({ ...newEmployeeData, name: e.target.value })}
                  placeholder="e.g., John Smith"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role / Position</label>
                <input
                  type="text"
                  value={newEmployeeData.role}
                  onChange={(e) => setNewEmployeeData({ ...newEmployeeData, role: e.target.value })}
                  placeholder="e.g., Marketing Manager"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
                <select
                  value={newEmployeeData.type}
                  onChange={(e) => {
                    const type = e.target.value as EmploymentType;
                    setNewEmployeeData({
                      ...newEmployeeData,
                      type,
                      hoursPerWeek: type === 'full-time' ? STANDARD_HOURS : newEmployeeData.hoursPerWeek,
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {employeeTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {newEmployeeData.type === 'part-time' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Annual Salary</label>
                    <input
                      type="number"
                      value={newEmployeeData.salary || ''}
                      onChange={(e) => setNewEmployeeData({ ...newEmployeeData, salary: parseFloat(e.target.value) || 0 })}
                      placeholder="e.g., 80000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hours per Week</label>
                    <input
                      type="number"
                      value={newEmployeeData.hoursPerWeek || ''}
                      onChange={(e) => setNewEmployeeData({ ...newEmployeeData, hoursPerWeek: parseFloat(e.target.value) || 0 })}
                      placeholder="e.g., 24"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div className="col-span-2 text-sm text-gray-600 bg-blue-50 p-2 rounded">
                    {newEmployeeData.hoursPerWeek > 0 && (
                      <>
                        <span className="font-medium">{Math.round((newEmployeeData.hoursPerWeek / STANDARD_HOURS) * 100)}% FTE</span>
                        {newEmployeeData.salary > 0 && (
                          <span className="ml-2">• Actual cost: {formatCurrency(newEmployeeData.salary)}/yr</span>
                        )}
                      </>
                    )}
                    {!newEmployeeData.hoursPerWeek && "Enter hours to see FTE %"}
                  </div>
                </div>
              )}

              {newEmployeeData.type === 'casual' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate ($)</label>
                    <input
                      type="number"
                      value={newEmployeeData.hourlyRate || ''}
                      onChange={(e) => setNewEmployeeData({ ...newEmployeeData, hourlyRate: parseFloat(e.target.value) || 0 })}
                      placeholder="$/hr"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hours per Week</label>
                    <input
                      type="number"
                      value={newEmployeeData.hoursPerWeek || ''}
                      onChange={(e) => setNewEmployeeData({ ...newEmployeeData, hoursPerWeek: parseFloat(e.target.value) || 0 })}
                      placeholder="Hrs/wk"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  {newEmployeeData.hourlyRate > 0 && newEmployeeData.hoursPerWeek > 0 && (
                    <div className="col-span-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                      Estimated annual: {formatCurrency(calculateCasualAnnual(newEmployeeData.hourlyRate, newEmployeeData.hoursPerWeek, DEFAULT_WEEKS))}
                      <span className="text-xs text-gray-400 ml-1">(48 weeks)</span>
                    </div>
                  )}
                </div>
              )}

              {newEmployeeData.type === 'full-time' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Annual Salary</label>
                  <input
                    type="number"
                    value={newEmployeeData.salary || ''}
                    onChange={(e) => setNewEmployeeData({ ...newEmployeeData, salary: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g., 85000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              )}

              {/* AI Salary Suggestion */}
              <AISuggestionPanel
                role={newEmployeeData.role}
                employmentType={newEmployeeData.type}
                hoursPerWeek={newEmployeeData.hoursPerWeek}
                onUseSuggestion={(value) => setNewEmployeeData({ ...newEmployeeData, salary: value })}
                onUseHourlyRate={(hourlyRate) => setNewEmployeeData({ ...newEmployeeData, hourlyRate, salary: calculateCasualAnnual(hourlyRate, newEmployeeData.hoursPerWeek, DEFAULT_WEEKS) })}
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddEmployee}
                className="flex-1 px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy-dark"
              >
                Add Team Member
              </button>
              <button
                onClick={() => { setShowAddEmployee(false); resetAISuggestion(); }}
                className="px-4 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Contractor Modal */}
      {showAddContractor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add Current Contractor</h3>
              <button onClick={() => { setShowAddContractor(false); resetAISuggestion(); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name / Company</label>
                <input
                  type="text"
                  value={newContractorData.name}
                  onChange={(e) => setNewContractorData({ ...newContractorData, name: e.target.value })}
                  placeholder="e.g., ABC Consulting"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role / Service</label>
                <input
                  type="text"
                  value={newContractorData.role}
                  onChange={(e) => setNewContractorData({ ...newContractorData, role: e.target.value })}
                  placeholder="e.g., IT Support"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Annual Cost</label>
                <input
                  type="number"
                  value={newContractorData.salary || ''}
                  onChange={(e) => setNewContractorData({ ...newContractorData, salary: parseFloat(e.target.value) || 0 })}
                  placeholder="e.g., 50000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              {/* AI Rate Suggestion */}
              <AISuggestionPanel
                role={newContractorData.role}
                employmentType="contractor"
                onUseSuggestion={(value) => setNewContractorData({ ...newContractorData, salary: value })}
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddContractor}
                className="flex-1 px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700"
              >
                Add Contractor
              </button>
              <button
                onClick={() => { setShowAddContractor(false); resetAISuggestion(); }}
                className="px-4 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan New Hire Modal */}
      {showAddHire && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Plan New {hireType === 'contractor' ? 'Contractor' : 'Team Member'}
              </h3>
              <button onClick={() => { setShowAddHire(false); resetAISuggestion(); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role / Position</label>
                <input
                  type="text"
                  value={newHireData.role}
                  onChange={(e) => setNewHireData({ ...newHireData, role: e.target.value })}
                  placeholder="e.g., Marketing Manager"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              {hireType === 'employee' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
                  <select
                    value={newHireData.type}
                    onChange={(e) => setNewHireData({ ...newHireData, type: e.target.value as EmploymentType })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    {employeeTypes.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Month</label>
                <MonthPicker
                  value={newHireData.startMonth}
                  onChange={(val) => setNewHireData({ ...newHireData, startMonth: val })}
                  minYear={startYear}
                  maxYear={endYear}
                  placeholder="Select start month"
                  className="w-full py-2"
                />
              </div>

              {hireType === 'employee' && newHireData.type === 'part-time' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hours per Week</label>
                  <input
                    type="number"
                    value={newHireData.hoursPerWeek || ''}
                    onChange={(e) => setNewHireData({ ...newHireData, hoursPerWeek: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g., 24"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {newHireData.hoursPerWeek > 0 && `= ${Math.round((newHireData.hoursPerWeek / STANDARD_HOURS) * 100)}% FTE`}
                  </p>
                </div>
              )}

              {hireType === 'employee' && newHireData.type === 'casual' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate ($)</label>
                    <input
                      type="number"
                      value={newHireData.hourlyRate || ''}
                      onChange={(e) => setNewHireData({ ...newHireData, hourlyRate: parseFloat(e.target.value) || 0 })}
                      placeholder="$/hr"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hours per Week</label>
                    <input
                      type="number"
                      value={newHireData.hoursPerWeek || ''}
                      onChange={(e) => setNewHireData({ ...newHireData, hoursPerWeek: parseFloat(e.target.value) || 0 })}
                      placeholder="Hrs/wk"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  {newHireData.hourlyRate > 0 && newHireData.hoursPerWeek > 0 && (
                    <div className="col-span-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                      Estimated annual: {formatCurrency(calculateCasualAnnual(newHireData.hourlyRate, newHireData.hoursPerWeek, DEFAULT_WEEKS))}
                      <span className="text-xs text-gray-400 ml-1">(48 weeks)</span>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {hireType === 'contractor' ? 'Annual Cost' : 'Annual Salary'}
                  </label>
                  <input
                    type="number"
                    value={newHireData.salary || ''}
                    onChange={(e) => setNewHireData({ ...newHireData, salary: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g., 85000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              )}

              {/* AI Salary Suggestion */}
              <AISuggestionPanel
                role={newHireData.role}
                employmentType={hireType === 'contractor' ? 'contractor' : newHireData.type}
                hoursPerWeek={newHireData.hoursPerWeek}
                onUseSuggestion={(value) => setNewHireData({ ...newHireData, salary: value })}
                onUseHourlyRate={(hourlyRate) => setNewHireData({ ...newHireData, hourlyRate, salary: calculateCasualAnnual(hourlyRate, newHireData.hoursPerWeek, DEFAULT_WEEKS) })}
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddNewHire}
                className={`flex-1 px-4 py-2 text-white text-sm font-medium rounded-lg ${
                  hireType === 'contractor' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                Add {hireType === 'contractor' ? 'Contractor' : 'Team Member'}
              </button>
              <button
                onClick={() => { setShowAddHire(false); resetAISuggestion(); }}
                className="px-4 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grand Total */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-24">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Total Team Costs</h3>
            <p className="text-sm text-gray-500">
              {employeeRows.length} team member{employeeRows.length !== 1 ? 's' : ''} + {contractorRows.length} contractor{contractorRows.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-brand-navy">{formatCurrency(employeeTotals.total + contractorTotals.total)}</p>
            <p className="text-sm text-gray-500">per year (inc. super)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
