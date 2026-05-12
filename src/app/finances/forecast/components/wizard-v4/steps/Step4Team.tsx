'use client';

import { useState, useMemo, useEffect, useCallback, useRef, memo } from 'react';
import { Plus, Trash2, HelpCircle, ChevronDown, ChevronUp, Info, Calendar, Sparkles, X, Briefcase, UserCheck, Loader2, Users, UserPlus, TrendingUp, DollarSign, Target, Lightbulb, ArrowRight, DownloadCloud, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  ForecastWizardState,
  WizardActions,
  formatCurrency,
  EmploymentType,
  ContractorType,
  HoursMode,
  PayFrequency,
  TeamMember,
  SUPER_RATE,
} from '../types';
import { getFiscalYear, getFiscalMonthIndex, getFiscalYearDateRange, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils';
// Phase 52-01 (XERO-S4-01/03/04) — Import-from-Xero modal + Option D edit affordance.
// Phase 52-02 (XERO-S4-05) — Refresh-from-Xero reconciliation flow (4 new helpers).
import {
  enrichWizardMemberFromXeroEmployee,
  getDerivedAnnualSalary,
  markFieldOverridden,
  isFieldOverridden,
  isXeroSourcedRow,
  type XeroEmployeeApiShape,
  // Phase 52-02 additions:
  findMatchingTeamMember,
  computeReconciliationDiff,
  applyReconciliationDecision,
  applySilentXeroUpdates,
  XERO_TRACKED_FIELDS,
  type MemberDiff,
  type ReconciliationDecision,
  type XeroTrackedField,
} from '../utils/xero-payroll-mapping';

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

/**
 * Phase 54-02 — Add Xero employees to the wizard via the Operator Option D
 * path (addNewHire if start_date > today + 7 days, else addTeamMember).
 *
 * EXTRACTED FROM the body of the existing `importSelectedXeroEmployees`
 * (52-01) — see /tmp/54-02-importSelected-before.txt in the 54-02 PR diff.
 * The extracted body is byte-for-byte identical to the original loop
 * EXCEPT for the removed `if (!selectedXeroEmployeeIds.has(...)) continue;`
 * filter (the filter moves UP into the original button caller, where it
 * stays). Every other field, fallback, and provenance assignment is
 * preserved EXACTLY: `?? STANDARD_HOURS` fallback for hoursPerWeek, the
 * `7 * 24 * 60 * 60 * 1000` cutoff literal, `_xeroEmployeeId` /
 * `_xeroImportedAt` / `_xeroFingerprint` provenance on BOTH addNewHire AND
 * addTeamMember branches, `isFromXero: true` only on the addTeamMember
 * branch, `increasePct: 0` only on the addTeamMember branch.
 *
 * Callers (post-54-02):
 *   1. importSelectedXeroEmployees (existing 52-01 button) — pre-filters
 *      by selectedXeroEmployeeIds, then calls this helper with the
 *      filtered list.
 *   2. autoFillFromXero effect (new in 54-02) — calls with ALL fetched
 *      employees (no filter), gated by truly-empty + sentinel
 *      preconditions.
 */
function addXeroEmployeesToWizard(
  emps: XeroEmployeeApiShape[],
  actions: WizardActions,
): void {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  for (const emp of emps) {
    const enriched = enrichWizardMemberFromXeroEmployee(emp);
    const startDate = emp.start_date ? new Date(emp.start_date) : undefined;
    const isPlannedHire = !!startDate && !isNaN(startDate.getTime()) && startDate > cutoff;
    if (isPlannedHire) {
      const startMonth = `${startDate!.getFullYear()}-${String(startDate!.getMonth() + 1).padStart(2, '0')}`;
      actions.addNewHire({
        role: enriched.role!,
        type: enriched.type!,
        hoursPerWeek: enriched.hoursPerWeek ?? STANDARD_HOURS,
        hourlyRate: enriched.hourlyRate,
        startMonth,
        salary: enriched.currentSalary ?? 0,
        payFrequency: enriched.payFrequency,
        standardHours: enriched.standardHours,
        _xeroEmployeeId: enriched._xeroEmployeeId,
        _xeroImportedAt: enriched._xeroImportedAt,
        _xeroFingerprint: enriched._xeroFingerprint,
      });
    } else {
      actions.addTeamMember({
        name: enriched.name!,
        role: enriched.role!,
        type: enriched.type!,
        hoursPerWeek: enriched.hoursPerWeek ?? STANDARD_HOURS,
        hourlyRate: enriched.hourlyRate,
        currentSalary: enriched.currentSalary ?? 0,
        increasePct: 0,
        payFrequency: enriched.payFrequency,
        standardHours: enriched.standardHours,
        isFromXero: true,
        _xeroEmployeeId: enriched._xeroEmployeeId,
        _xeroImportedAt: enriched._xeroImportedAt,
        _xeroFingerprint: enriched._xeroFingerprint,
      });
    }
  }
}

const calculateFTE = (hoursPerWeek: number): number => {
  return Math.round((hoursPerWeek / STANDARD_HOURS) * 100) / 100;
};

/**
 * Per-person FTE contribution for the year summary aggregate.
 *
 * Two rules vs the raw hours/standard ratio:
 *   1. Capped at 1.0 — a person can't contribute more than one FTE-worth
 *      of work, even if their week is 40+ hours. The dashboard treats FTE
 *      as a "bodies in seats" metric; overtime doesn't add headcount.
 *   2. Pro-rated by months worked — a 6-month hire contributes 0.5 FTE
 *      for the year, not 1.0.
 *
 * Without these rules, a 5-person team imported from Xero at 40 hrs/wk
 * showed FTE = 5.26 (> headcount 5), which Matt flagged as confusing.
 */
const calculateFTEContribution = (hoursPerWeek: number, monthsWorked: number): number => {
  const ratio = (hoursPerWeek * monthsWorked) / (STANDARD_HOURS * 12);
  return Math.min(1, Math.max(0, ratio));
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
  // Phase 51 (UX-S4-02): undefined → treat as 'hours' (back-compat).
  hoursMode?: HoursMode;
  onSalaryChange: (salary: number) => void;
  onHoursChange: (hours: number, newSalary: number) => void;
  // Phase 51 (UX-S4-02): toggle between hours-per-week and %FTE input modes.
  // Optional so older call sites compile; mode toggle is a no-op if omitted.
  onHoursModeChange?: (mode: HoursMode) => void;
}

const PartTimeSalaryInput = memo(function PartTimeSalaryInput({
  salary,
  hoursPerWeek,
  hoursMode,
  onSalaryChange,
  onHoursChange,
  onHoursModeChange,
}: PartTimeSalaryInputProps) {
  // Track previous hours for pro-rata calculation
  const [prevHours, setPrevHours] = useState(hoursPerWeek);
  const fte = calculateFTE(hoursPerWeek);
  // Phase 51 (UX-S4-02): undefined hoursMode is treated as 'hours' for full
  // backward compatibility with forecasts saved before Phase 51.
  const effectiveMode: HoursMode = hoursMode ?? 'hours';

  const handleHoursChange = useCallback((newHours: number) => {
    // Pro-rate salary based on hours change
    const oldHours = prevHours > 0 ? prevHours : STANDARD_HOURS;
    const newSalary = oldHours > 0 && salary > 0
      ? Math.round(salary * (newHours / oldHours))
      : salary;
    setPrevHours(newHours);
    onHoursChange(newHours, newSalary);
  }, [prevHours, salary, onHoursChange]);

  // FTE-mode commit: convert %FTE → hoursPerWeek, then reuse the same pro-rata
  // path so salary updates consistently. Round to whole hours per the plan
  // (round(STANDARD_HOURS × pct/100)). When pct === current displayed FTE,
  // hoursPerWeek stays the same — no surprise math.
  const handleFTEChange = useCallback((pct: number) => {
    const newHours = Math.round((STANDARD_HOURS * pct) / 100);
    handleHoursChange(newHours);
  }, [handleHoursChange]);

  // Update prevHours when external changes happen
  useEffect(() => {
    setPrevHours(hoursPerWeek);
  }, [hoursPerWeek]);

  // Toggle mode without altering salary or hours — only flip the displayed input.
  const handleModeToggle = useCallback((mode: HoursMode) => {
    if (mode === effectiveMode) return;
    onHoursModeChange?.(mode);
  }, [effectiveMode, onHoursModeChange]);

  return (
    <div className="w-28">
      <CurrencyInput
        value={salary}
        onChange={onSalaryChange}
        className="w-24 px-2 py-1 text-sm text-right border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy mb-0.5"
      />
      {/* Phase 51 (UX-S4-02): Hours/FTE mode toggle */}
      <div className="flex items-center gap-0.5 mb-0.5">
        <button
          type="button"
          aria-label="Hours mode"
          onClick={() => handleModeToggle('hours')}
          className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${
            effectiveMode === 'hours'
              ? 'bg-brand-navy text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Hours
        </button>
        <button
          type="button"
          aria-label="FTE mode"
          onClick={() => handleModeToggle('fte')}
          className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${
            effectiveMode === 'fte'
              ? 'bg-brand-navy text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          %FTE
        </button>
      </div>
      <div className="flex items-center gap-1">
        {effectiveMode === 'fte' ? (
          <>
            <NumberInput
              value={Math.round(fte * 100)}
              onChange={handleFTEChange}
              className="w-10 px-1.5 py-1 text-xs text-right border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
            />
            <span className="text-[10px] text-gray-400">%</span>
            <span className="text-[10px] text-blue-600 font-medium whitespace-nowrap">({hoursPerWeek}h)</span>
          </>
        ) : (
          <>
            <NumberInput
              value={hoursPerWeek}
              onChange={handleHoursChange}
              className="w-10 px-1.5 py-1 text-xs text-right border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
            />
            <span className="text-[10px] text-gray-400">hrs</span>
            <span className="text-[10px] text-blue-600 font-medium whitespace-nowrap">({Math.round(fte * 100)}%)</span>
          </>
        )}
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
  const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
  const fy = getFiscalYear(date, DEFAULT_YEAR_START_MONTH);
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
  const ysm = DEFAULT_YEAR_START_MONTH;

  const getFYFromMonth = (monthKey: string): number => {
    const [yearStr, monthStr] = monthKey.split('-');
    const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
    return getFiscalYear(date, ysm);
  };

  const getMonthsInFY = (startMonth: string, fy: number): number => {
    const startFY = getFYFromMonth(startMonth);
    if (startFY > fy) return 0;
    if (startFY < fy) return 12;
    const month = parseInt(startMonth.split('-')[1]);
    const fyMonth = getFiscalMonthIndex(month, ysm) + 1;
    return 13 - fyMonth;
  };

  const getMonthsBeforeDeparture = (endMonth: string, fy: number): number => {
    const endFY = getFYFromMonth(endMonth);
    if (endFY > fy) return 12;
    if (endFY < fy) return 0;
    const month = parseInt(endMonth.split('-')[1]);
    const fyMonth = getFiscalMonthIndex(month, ysm) + 1;
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
          totalFTE += calculateFTEContribution(member.hoursPerWeek, monthsWorked);
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
          totalFTE += calculateFTEContribution(hire.hoursPerWeek, monthsWorked);
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
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl shadow overflow-hidden">
      {/* Header with gradient accent — compact variant (Matt felt the
          original was overpowering for a summary block). */}
      <div className="relative px-4 py-2.5 border-b border-white/10">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow">
              <Users className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Team Evolution</h3>
              <p className="text-[11px] text-slate-400">{duration}-year workforce plan</p>
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

      {/* Year Cards - compact variant. Reduced vertical rhythm so the
          summary doesn't dominate the page when there's a 3-year forecast. */}
      <div className="p-3">
        <div className="grid grid-cols-3 gap-3">
          {yearData.map((year, idx) => {
            const isCurrentYear = year.year === 1;
            const prevYear = idx > 0 ? yearData[idx - 1] : null;
            const headcountChange = prevYear ? year.headcount - prevYear.headcount : 0;

            return (
              <div
                key={year.year}
                className={`relative p-2.5 rounded-lg transition-all ${
                  isCurrentYear
                    ? 'bg-gradient-to-br from-blue-600 to-blue-700 shadow shadow-blue-600/20'
                    : 'bg-white/5 hover:bg-white/10 border border-white/10'
                }`}
              >
                {/* Year Badge */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
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

                {/* Headcount + FTE on a single line to halve the height. */}
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tabular-nums text-white leading-none">
                    {year.headcount}
                  </span>
                  <span className={`text-xs font-medium ${
                    isCurrentYear ? 'text-blue-200' : 'text-slate-400'
                  }`}>
                    team
                  </span>
                  <span
                    className={`text-[11px] tabular-nums cursor-help ${
                      isCurrentYear ? 'text-blue-100' : 'text-slate-400'
                    }`}
                    title="Full-Time Equivalent: max 1.0 per person, pro-rated by months worked (e.g., a 6-month hire counts as 0.5 FTE)."
                  >
                    · {year.fte} FTE
                  </span>
                  {!isCurrentYear && headcountChange !== 0 && (
                    <span className={`text-[11px] font-semibold ml-auto ${
                      headcountChange > 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {headcountChange > 0 ? '+' : ''}{headcountChange}
                    </span>
                  )}
                </div>

                {/* Cost row */}
                <div className="mt-2 flex items-baseline justify-between">
                  <span className={`text-[10px] uppercase tracking-wide ${
                    isCurrentYear ? 'text-blue-200' : 'text-slate-500'
                  }`}>
                    Total cost
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-white">
                    {formatCurrency(year.totalCost)}
                  </span>
                </div>

                {/* Revenue per FTE metric */}
                {year.revenue > 0 && (
                  <div className={`mt-1.5 flex items-baseline justify-between border-t pt-1.5 ${
                    isCurrentYear ? 'border-white/20' : 'border-white/10'
                  }`}>
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
                )}
              </div>
            );
          })}
        </div>

        {/* Growth Summary Bar - Only show for multi-year */}
        {duration > 1 && (
          <div className="mt-3 p-2 rounded-lg bg-white/5 border border-white/10">
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
  const getFYFromMonth = (monthKey: string): number => {
    const [yearStr, monthStr] = monthKey.split('-');
    const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
    return getFiscalYear(date, DEFAULT_YEAR_START_MONTH);
  };

  // Same definitions as the main Step4Team component (lines 636–650) — kept
  // local to this scope since calculateFTEContribution needs them for
  // pro-rating partial-year staff in the Planning Overview rollup.
  const getMonthsInFY = (startMonth: string, fy: number): number => {
    const startFY = getFYFromMonth(startMonth);
    if (startFY > fy) return 0;
    if (startFY < fy) return 12;
    const month = parseInt(startMonth.split('-')[1]);
    const ysm = DEFAULT_YEAR_START_MONTH;
    const fyMonthIdx = getFiscalMonthIndex(month, ysm);
    return 12 - fyMonthIdx;
  };

  const getMonthsBeforeDeparture = (endMonth: string, fy: number): number => {
    const endFY = getFYFromMonth(endMonth);
    if (endFY > fy) return 12;
    if (endFY < fy) return 0;
    const month = parseInt(endMonth.split('-')[1]);
    const ysm = DEFAULT_YEAR_START_MONTH;
    return getFiscalMonthIndex(month, ysm) + 1;
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

  // Calculate FTE per year using the capped + pro-rated formula so total
  // FTE is always ≤ headcount (matches the Team Evolution card after
  // PR #180; previously this rollup still used the uncapped hours/38
  // ratio, which is why Matt saw FTE > headcount on the Planning Overview
  // table even after #180 shipped).
  // For contractors, only include if includeInHeadcount is true.
  const calculateActualFTE = (yearNum: 1 | 2 | 3): number => {
    const targetFY = fiscalYear + yearNum - 1;
    let totalFTE = 0;

    teamMembers.forEach(member => {
      const departure = departures.find(d => d.teamMemberId === member.id);
      let monthsWorked = 12;
      if (departure) {
        const departureFY = getFYFromMonth(departure.endMonth);
        if (departureFY < targetFY) return;
        if (departureFY === targetFY) {
          monthsWorked = getMonthsBeforeDeparture(departure.endMonth, targetFY);
        }
      }
      if (member.type === 'contractor' && !member.includeInHeadcount) return;
      if (monthsWorked <= 0) return;
      totalFTE += calculateFTEContribution(member.hoursPerWeek, monthsWorked);
    });

    newHires.forEach(hire => {
      const hireFY = getFYFromMonth(hire.startMonth);
      if (hireFY > targetFY) return;
      if (hire.type === 'contractor' && !hire.includeInHeadcount) return;
      const monthsWorked = getMonthsInFY(hire.startMonth, targetFY);
      if (monthsWorked <= 0) return;
      totalFTE += calculateFTEContribution(hire.hoursPerWeek, monthsWorked);
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

            {/* FTE — capped at 1.0/person and pro-rated by months worked, so FTE ≤ headcount. */}
            <tr className="hover:bg-gray-50 bg-gray-50/50">
              <td
                className="px-4 py-3 text-sm text-gray-600 cursor-help"
                title="Full-Time Equivalent: max 1.0 per person, pro-rated by months worked (e.g., a 6-month hire counts as 0.5 FTE)."
              >
                FTE
              </td>
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
// PHASE 55-01 — YEAR FILTER CARDS (UX-S4-04)
// ============================================
// Three clickable year-summary cards rendered above the team tables.
// Click toggles the parent's `selectedYear` filter state. Card counts
// (headcount/cost) ALWAYS show full-year derived totals — they are NOT
// affected by the selected filter (the filter only changes which rows
// are visible in the tables below). Reuses TeamPlanningOverview's
// timeline derivation rules so both views stay consistent.

interface YearFilterCardsProps {
  teamMembers: ForecastWizardState['teamMembers'];
  newHires: ForecastWizardState['newHires'];
  departures: ForecastWizardState['departures'];
  bonuses: ForecastWizardState['bonuses'];
  goals: ForecastWizardState['goals'];
  fiscalYear: number;
  duration: 1 | 2 | 3;
  selectedYear: 1 | 2 | 3 | null;
  onSelectYear: (year: 1 | 2 | 3) => void;
}

function YearFilterCards({
  teamMembers,
  newHires,
  departures,
  bonuses,
  goals,
  fiscalYear,
  duration,
  selectedYear,
  onSelectYear,
}: YearFilterCardsProps) {
  const ysm = DEFAULT_YEAR_START_MONTH;

  const getFYFromMonth = (monthKey: string): number => {
    const [yearStr, monthStr] = monthKey.split('-');
    const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
    return getFiscalYear(date, ysm);
  };
  const getMonthsInFY = (startMonth: string, fy: number): number => {
    const startFY = getFYFromMonth(startMonth);
    if (startFY > fy) return 0;
    if (startFY < fy) return 12;
    const month = parseInt(startMonth.split('-')[1]);
    const fyMonth = getFiscalMonthIndex(month, ysm) + 1;
    return 13 - fyMonth;
  };
  const getMonthsBeforeDeparture = (endMonth: string, fy: number): number => {
    const endFY = getFYFromMonth(endMonth);
    if (endFY > fy) return 12;
    if (endFY < fy) return 0;
    const month = parseInt(endMonth.split('-')[1]);
    const fyMonth = getFiscalMonthIndex(month, ysm) + 1;
    return fyMonth;
  };

  // Full-year derived metrics per year (mirrors TeamTimelineSummary's logic).
  const yearData = useMemo(() => {
    const years: { year: 1 | 2 | 3; headcount: number; fte: number; totalCost: number }[] = [];
    for (let i = 1; i <= duration; i++) {
      const yearNum = i as 1 | 2 | 3;
      const targetFY = fiscalYear + yearNum - 1;
      let headcount = 0;
      let totalFTE = 0;
      let totalCost = 0;

      for (const member of teamMembers) {
        const departure = departures.find((d) => d.teamMemberId === member.id);
        const yearsOfIncrease = i - 1;
        const salary = member.newSalary * Math.pow(1 + (member.increasePct || 0) / 100, yearsOfIncrease);
        const superAmount = member.type !== 'contractor' ? salary * SUPER_RATE : 0;
        let monthsWorked = 12;
        if (departure) {
          monthsWorked = getMonthsBeforeDeparture(departure.endMonth, targetFY);
        }
        if (monthsWorked > 0) {
          headcount++;
          totalFTE += calculateFTEContribution(member.hoursPerWeek, monthsWorked);
          totalCost += ((salary + superAmount) * monthsWorked) / 12;
        }
      }

      for (const hire of newHires) {
        const hireFY = getFYFromMonth(hire.startMonth);
        if (hireFY > targetFY) continue;
        const yearsAfterStart = targetFY - hireFY;
        const salary = hire.salary * Math.pow(1.03, yearsAfterStart);
        const superAmount = hire.type !== 'contractor' ? salary * SUPER_RATE : 0;
        const monthsWorked = getMonthsInFY(hire.startMonth, targetFY);
        if (monthsWorked > 0) {
          headcount++;
          totalFTE += calculateFTEContribution(hire.hoursPerWeek, monthsWorked);
          totalCost += ((salary + superAmount) * monthsWorked) / 12;
        }
      }

      const bonusTotal = bonuses.reduce((sum, b) => sum + b.amount, 0);
      totalCost += bonusTotal;

      years.push({ year: yearNum, headcount, fte: Math.round(totalFTE * 10) / 10, totalCost: Math.round(totalCost) });
    }
    return years;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamMembers, newHires, departures, bonuses, fiscalYear, duration, goals]);

  // Always render three card slots (greyed when out-of-duration) for layout
  // stability. Click only enabled for the in-range cards.
  const slots: (1 | 2 | 3)[] = [1, 2, 3];

  return (
    <div className="grid grid-cols-3 gap-3" data-testid="year-filter-cards">
      {slots.map((yearNum) => {
        const data = yearData.find((y) => y.year === yearNum);
        const inRange = !!data && yearNum <= duration;
        const isSelected = selectedYear === yearNum;
        const isCurrentYear = yearNum === 1;

        // Disabled state for years beyond duration: render a placeholder card.
        if (!inRange) {
          return (
            <div
              key={yearNum}
              className="p-2.5 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 text-gray-400 text-xs"
              aria-hidden="true"
            >
              <div className="text-[10px] font-bold uppercase tracking-wider">FY{fiscalYear + yearNum - 1}</div>
              <div className="mt-1 text-[11px]">Outside forecast duration</div>
            </div>
          );
        }

        // Compact variant — Matt: the cards below the pay-frequency setting
        // were too tall. Headcount + FTE collapsed onto one line; cost line
        // reduced to a single row with "Total cost: $X" inline.
        const baseClasses = 'relative p-2.5 rounded-lg transition-all duration-200 text-left w-full cursor-pointer';
        const palette = isCurrentYear
          ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow'
          : 'bg-white border border-gray-200 hover:bg-gray-50';
        const selectedRing = isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : '';

        return (
          <button
            key={yearNum}
            type="button"
            role="button"
            aria-pressed={isSelected}
            aria-label={`Filter team table to FY${fiscalYear + yearNum - 1}`}
            onClick={() => onSelectYear(yearNum)}
            data-testid={`year-card-${yearNum}`}
            className={`${baseClasses} ${palette} ${selectedRing}`}
          >
            <div className={`text-[10px] font-bold uppercase tracking-wider ${isCurrentYear ? 'text-blue-100' : 'text-gray-500'}`}>
              FY{fiscalYear + yearNum - 1}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className={`text-2xl font-bold tabular-nums leading-none ${isCurrentYear ? 'text-white' : 'text-gray-900'}`}>
                {data!.headcount}
              </span>
              <span className={`text-xs ${isCurrentYear ? 'text-blue-100' : 'text-gray-500'}`}>
                team
              </span>
              <span className={`text-[11px] tabular-nums ${isCurrentYear ? 'text-blue-100' : 'text-gray-500'}`}>
                · {data!.fte} FTE
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between">
              <span className={`text-[10px] uppercase tracking-wide ${isCurrentYear ? 'text-blue-100' : 'text-gray-500'}`}>
                Total cost
              </span>
              <span className={`text-sm font-semibold tabular-nums ${isCurrentYear ? 'text-white' : 'text-gray-900'}`}>
                {formatCurrency(data!.totalCost)}
              </span>
            </div>
          </button>
        );
      })}
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
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // ─── Phase 55-01: Year-card filter (UX-S4-04) ──────────────────────────
  // Local-only view filter. Default null on every mount — NOT persisted to
  // wizard state (this is a viewer concern, not part of the saved plan).
  // null = "All years" (no filter, no badges).
  const [selectedYear, setSelectedYear] = useState<1 | 2 | 3 | null>(null);

  // Section-header dismiss state (per businessId, persisted in localStorage).
  const yearFilterHintKey = `wizard-v4:step4-yearfilter-hint:${state.businessId}`;
  const [yearFilterHintDismissed, setYearFilterHintDismissed] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(yearFilterHintKey);
      setYearFilterHintDismissed(stored === '1');
    } catch {
      // localStorage may be unavailable (private mode, SSR) — fall back to shown.
      setYearFilterHintDismissed(false);
    }
  }, [yearFilterHintKey]);

  const dismissYearFilterHint = useCallback(() => {
    setYearFilterHintDismissed(true);
    try {
      window.localStorage.setItem(yearFilterHintKey, '1');
    } catch {
      // ignore — UI state still reflects dismissal for this session
    }
  }, [yearFilterHintKey]);

  const handleSelectYear = useCallback((year: 1 | 2 | 3) => {
    setSelectedYear((prev) => (prev === year ? null : year));
  }, []);

  const clearSelectedYear = useCallback(() => setSelectedYear(null), []);

  // Phase 51 (UX-S4-01): Termination modal state. Pending end month defaults to
  // mid-FY (December of the calendar year that starts the current FY) so the
  // user always sees a sensible placeholder. Operator decision: ONLY the
  // "ends on date X" mode is supported — no remove-from-FY-entirely option.
  const [terminatingMember, setTerminatingMember] = useState<{ id: string; name: string } | null>(null);
  const [pendingEndMonth, setPendingEndMonth] = useState<string>(`${fiscalYear - 1}-12`);

  // Phase 52-01 (XERO-S4-01/03/04) — Import-from-Xero modal state. Empty-state
  // detection is reactive: hasXeroConnection starts true (button enabled), and
  // is downgraded to false only if the first GET to /api/Xero/employees returns
  // 404. Per 52-RESEARCH "no global Modal component" anti-pattern, the modal
  // body is inline at the bottom of this component (mirrors the existing
  // showAddEmployee / showAddHire / terminatingMember inline modals).
  const [showXeroImport, setShowXeroImport] = useState(false);
  const [xeroEmployees, setXeroEmployees] = useState<XeroEmployeeApiShape[] | null>(null);
  const [xeroImportLoading, setXeroImportLoading] = useState(false);
  const [xeroImportError, setXeroImportError] = useState<string | null>(null);
  const [hasXeroConnection, setHasXeroConnection] = useState<boolean>(true);
  const [selectedXeroEmployeeIds, setSelectedXeroEmployeeIds] = useState<Set<string>>(new Set());

  /**
   * Phase 52-01 — Open the Xero import modal and fetch /api/Xero/employees.
   * Treats 404 as "not connected" (downgrades hasXeroConnection so the button
   * disables on next render); rate-limit / 429 surfaces a friendly message;
   * any other error prints the raw error string. Per Operator's Option D the
   * modal stays open and shows the error inline rather than closing.
   */
  const openXeroImport = useCallback(async () => {
    setShowXeroImport(true);
    setXeroImportLoading(true);
    setXeroImportError(null);
    setSelectedXeroEmployeeIds(new Set());
    setXeroEmployees(null);
    try {
      const res = await fetch(`/api/Xero/employees?business_id=${state.businessId}`);
      if (res.status === 404) {
        setHasXeroConnection(false);
        setXeroImportError('Connect Xero to enable auto-import.');
        setXeroEmployees([]);
        return;
      }
      const data = await res.json();
      if (data.expired || data.needs_reconnect) {
        setXeroImportError(data.message || 'Reconnect Xero to access employee data.');
        setXeroEmployees([]);
        return;
      }
      if (data.error) {
        const isRateLimit = /rate limit|429|too many/i.test(String(data.error));
        setXeroImportError(
          isRateLimit
            ? 'Xero rate limit hit — retry in a moment.'
            : String(data.error),
        );
        setXeroEmployees([]);
        return;
      }
      setXeroEmployees((data.employees ?? []) as XeroEmployeeApiShape[]);
    } catch (err) {
      setXeroImportError(err instanceof Error ? err.message : 'Failed to fetch Xero employees');
      setXeroEmployees([]);
    } finally {
      setXeroImportLoading(false);
    }
  }, [state.businessId]);

  /**
   * Phase 52-01 — Toggle a single employee's selection in the import modal.
   */
  const toggleXeroEmployeeSelection = useCallback((employeeId: string) => {
    setSelectedXeroEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  }, []);

  /**
   * Phase 52-01 — Toggle "Select all" in the import modal.
   */
  const toggleSelectAllXeroEmployees = useCallback(() => {
    setSelectedXeroEmployeeIds((prev) => {
      if (!xeroEmployees || xeroEmployees.length === 0) return new Set();
      if (prev.size === xeroEmployees.length) return new Set();
      return new Set(xeroEmployees.map((e) => e.employee_id));
    });
  }, [xeroEmployees]);

  /**
   * Phase 52-01 — Import selected employees into the wizard.
   *
   * Per Operator's Option D and 52-RESEARCH Open Q3:
   *   - If start_date > today + 7 days → addNewHire (planned hire)
   *   - Otherwise → addTeamMember
   *
   * Both paths use enrichWizardMemberFromXeroEmployee to populate
   * payFrequency, standardHours, hourlyRate, currentSalary, _xeroEmployeeId,
   * _xeroImportedAt, _xeroFingerprint. _overriddenFields starts undefined
   * (no edits yet).
   *
   * No re-import / no diff in this plan — every clicked employee is added as
   * a new wizard row even if a row with the same name already exists. 52-02
   * introduces matching logic.
   */
  const importSelectedXeroEmployees = useCallback(() => {
    if (!xeroEmployees) return;
    // Phase 54-02: filter THEN call shared helper (extraction preserves the
    // 52-01 button's behavior — only the inline loop body moved out).
    const selected = xeroEmployees.filter((e) => selectedXeroEmployeeIds.has(e.employee_id));
    addXeroEmployeesToWizard(selected, actions);
    setShowXeroImport(false);
    setSelectedXeroEmployeeIds(new Set());
  }, [xeroEmployees, selectedXeroEmployeeIds, actions]);

  /**
   * Phase 52-01 — Wrapper around updateTeamMember that automatically appends
   * the changed field to _overriddenFields when the row originated from a
   * Xero import. Manual rows (no _xeroEmployeeId) leave _overriddenFields
   * untouched. Used in the salary cell + payFrequency dropdown onChange paths.
   */
  const updateXeroSourcedField = useCallback(
    (memberId: string, updates: Partial<TeamMember>, fieldNames: string[]) => {
      const member = state.teamMembers.find((m) => m.id === memberId);
      if (!member) return;
      const xeroSourced = isXeroSourcedRow(member);
      if (xeroSourced) {
        let nextOverrides = member._overriddenFields;
        for (const fieldName of fieldNames) {
          nextOverrides = markFieldOverridden(nextOverrides, fieldName);
        }
        actions.updateTeamMember(memberId, {
          ...updates,
          _overriddenFields: nextOverrides,
        });
      } else {
        actions.updateTeamMember(memberId, updates);
      }
    },
    [state.teamMembers, actions],
  );

  // ────────────────────────────────────────────────────────────────────────
  // Phase 52-02 (XERO-S4-05) — Refresh-from-Xero / reconciliation state.
  //
  // The reconciliation modal is a SEPARATE flow from the 52-01 import modal.
  // Visibility of the Refresh button is gated on `hasAnyXeroSourcedRow` (any
  // wizard row carrying _xeroFingerprint — i.e. an import has happened).
  //
  // CRITICAL SAFETY (52-RESEARCH Pitfall 6): the reconciliation algorithm
  // iterates `xeroEmployees` from the fresh fetch and for each one either
  // (a) matches via findMatchingTeamMember + reconciles, or (b) emits a
  // "New from Xero" candidate. It NEVER iterates `state.teamMembers` to
  // filter or remove. Manually-added rows (no _xeroEmployeeId) are
  // completely untouchable by this flow.
  // ────────────────────────────────────────────────────────────────────────
  const [showReconcile, setShowReconcile] = useState(false);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [reconcileConflicts, setReconcileConflicts] = useState<MemberDiff[]>([]);
  const [reconcileSilentUpdates, setReconcileSilentUpdates] = useState<
    Array<{ memberId: string; update: Partial<TeamMember> }>
  >([]);
  const [reconcileNewFromXero, setReconcileNewFromXero] = useState<XeroEmployeeApiShape[]>([]);
  const [reconcileSelectedNewIds, setReconcileSelectedNewIds] = useState<Set<string>>(new Set());
  // pendingDecisions[memberId][fieldName] = ReconciliationDecision
  const [pendingDecisions, setPendingDecisions] = useState<
    Record<string, Partial<Record<XeroTrackedField, ReconciliationDecision>>>
  >({});

  // ────────────────────────────────────────────────────────────────────────
  // Phase 54-02 — Soft auto-fill on truly-empty Step 4 + new-employees banner.
  //
  // Refs survive React StrictMode double-mount; sentinel survives navigation.
  // Auto-fill effect writes the sentinel BEFORE the fetch so any re-render
  // during the in-flight request does NOT re-fire (and so a back-navigate
  // re-mount does NOT re-poll a known-broken connection — the operator
  // clears localStorage to re-arm).
  //
  // Banner-probe effect is gated on teamMembers.length > 0 (auto-fill effect
  // handles the empty case). Diffs returned employee_id list against the
  // wizard's _xeroEmployeeId provenance and surfaces a non-blocking banner
  // when Xero has employees the wizard hasn't seen.
  // ────────────────────────────────────────────────────────────────────────
  const autoFillRef = useRef(false);
  const lastAutoFillBusinessIdRef = useRef<string | undefined>(undefined);
  const bannerProbeRef = useRef<string | undefined>(undefined);
  const [newEmployeesBanner, setNewEmployeesBanner] = useState<XeroEmployeeApiShape[]>([]);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Auto-fill effect: fires once per (businessId × truly-empty × no-sentinel).
  useEffect(() => {
    // Re-arm if businessId changed (rare — tenant switch mid-session).
    if (lastAutoFillBusinessIdRef.current !== state.businessId) {
      autoFillRef.current = false;
      lastAutoFillBusinessIdRef.current = state.businessId;
    }
    if (autoFillRef.current) return;
    if (!state.businessId) return;

    // Truly-empty gate: zero current + zero hires + zero departures.
    if (state.teamMembers.length !== 0) return;
    if ((state.newHires?.length ?? 0) !== 0) return;
    if ((state.departures?.length ?? 0) !== 0) return;

    // Sentinel: per-business localStorage key. Operator clearing localStorage
    // is the documented escape hatch to re-arm.
    const sentinelKey = `wizard-v4:step4-visited:${state.businessId}`;
    try {
      if (typeof window !== 'undefined' && window.localStorage.getItem(sentinelKey)) {
        autoFillRef.current = true;
        return;
      }
    } catch {
      // localStorage unavailable (private mode etc.) — still proceed; the
      // ref guard prevents double-fire within the session.
    }

    // ALL guards passed — set ref + sentinel BEFORE fetch so any re-render
    // during the in-flight fetch does NOT re-fire.
    autoFillRef.current = true;
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(sentinelKey, '1');
    } catch {
      /* no-op */
    }

    const businessId = state.businessId;
    // No cancellation flag: once auto-fill fires (sentinel + ref both set),
    // we WANT the import to complete even if the component unmounts before
    // the fetch resolves (e.g. React 18 StrictMode dev double-mount cleanup,
    // or operator navigating away mid-fetch). Wizard state is global via
    // reducer — applying the import remotely is safe. Returning the import
    // ALSO solves StrictMode test 13c which expects exactly N imports under
    // dev double-mount.
    (async () => {
      try {
        const res = await fetch(`/api/Xero/employees?business_id=${businessId}`);
        if (res.status === 404) return; // silent — no Xero connection
        const data = await res.json();
        if (data.expired || data.needs_reconnect) return; // silent
        if (data.error) return; // silent (incl. rate limit)
        const emps: XeroEmployeeApiShape[] = (data.employees ?? []) as XeroEmployeeApiShape[];
        if (emps.length === 0) return; // silent — no rows to fill
        addXeroEmployeesToWizard(emps, actions);
      } catch {
        // silent — operator has the explicit "Import from Xero" button as
        // an escape hatch.
      }
    })();
    // Intentionally narrow deps: businessId is the only re-arm signal. We do
    // NOT depend on teamMembers.length — once auto-fill fires (and members
    // appear), the autoFillRef guard prevents re-entry without needing a
    // dependency on the very state we just mutated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.businessId]);

  // Banner probe effect: fires once per (businessId × non-empty mount).
  useEffect(() => {
    if (!state.businessId) return;
    if (state.teamMembers.length === 0) return; // auto-fill handles empty
    if (bannerProbeRef.current === state.businessId) return;
    bannerProbeRef.current = state.businessId;

    const businessId = state.businessId;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/Xero/employees?business_id=${businessId}`);
        if (cancelled) return;
        if (res.status === 404) return; // silent
        const data = await res.json();
        if (cancelled) return;
        if (data.expired || data.needs_reconnect) return; // silent
        if (data.error) return; // silent
        const xeroEmps: XeroEmployeeApiShape[] = (data.employees ?? []) as XeroEmployeeApiShape[];
        if (xeroEmps.length === 0) return; // silent

        // Build knownIds: every wizard member with _xeroEmployeeId, plus
        // departures resolved through state.teamMembers (so a departing
        // employee doesn't re-surface as "new").
        const knownIds = new Set<string>();
        for (const m of state.teamMembers) {
          if (m._xeroEmployeeId) knownIds.add(m._xeroEmployeeId);
        }
        for (const h of state.newHires ?? []) {
          if (h._xeroEmployeeId) knownIds.add(h._xeroEmployeeId);
        }
        for (const d of state.departures ?? []) {
          const tm = state.teamMembers.find((m) => m.id === d.teamMemberId);
          if (tm?._xeroEmployeeId) knownIds.add(tm._xeroEmployeeId);
        }

        const newOnes = xeroEmps.filter((e) => !knownIds.has(e.employee_id));
        if (newOnes.length === 0) return; // silent — nothing new
        if (cancelled) return;
        setNewEmployeesBanner(newOnes);
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
    // Same narrow-deps rationale as auto-fill effect; teamMembers.length is
    // a re-arm signal so the probe re-runs when the empty→non-empty
    // transition happens (e.g. immediately after auto-fill imports).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.businessId, state.teamMembers.length]);

  // Visibility gate: Refresh button only shown when at least one row carries
  // _xeroFingerprint (i.e. an import has happened on this wizard).
  const hasAnyXeroSourcedRow = useMemo(
    () =>
      state.teamMembers.some((m) => !!m._xeroFingerprint) ||
      (state.newHires ?? []).some((h) => !!h._xeroFingerprint),
    [state.teamMembers, state.newHires],
  );

  /**
   * Phase 52-02 — Open the reconciliation modal and run the diff algorithm
   * against the freshly-fetched Xero employees.
   *
   * Algorithm (per 52-RESEARCH "Re-import provenance tracking"):
   *   for each xeroEmp in fresh fetch:
   *     match = findMatchingTeamMember(xeroEmp, state.teamMembers)
   *     if !match → New-from-Xero candidate
   *     else → diff = computeReconciliationDiff(match, freshXeroValues)
   *            collect silent updates (apply on Apply)
   *            if any field has 'conflict' verdict → push to conflicts
   */
  const openReconcile = useCallback(async () => {
    setShowReconcile(true);
    setReconcileLoading(true);
    setReconcileError(null);
    setReconcileConflicts([]);
    setReconcileSilentUpdates([]);
    setReconcileNewFromXero([]);
    setReconcileSelectedNewIds(new Set());
    setPendingDecisions({});
    try {
      const res = await fetch(`/api/Xero/employees?business_id=${state.businessId}`);
      if (res.status === 404) {
        setReconcileError('Connect Xero to enable refresh.');
        return;
      }
      const data = await res.json();
      if (data.expired || data.needs_reconnect) {
        setReconcileError(data.message || 'Reconnect Xero to refresh employee data.');
        return;
      }
      if (data.error) {
        const isRateLimit = /rate limit|429|too many/i.test(String(data.error));
        setReconcileError(
          isRateLimit ? 'Xero rate limit hit — retry in a moment.' : String(data.error),
        );
        return;
      }
      const xeroEmps: XeroEmployeeApiShape[] = (data.employees ?? []) as XeroEmployeeApiShape[];

      const newConflicts: MemberDiff[] = [];
      const newSilent: Array<{ memberId: string; update: Partial<TeamMember> }> = [];
      const newCandidates: XeroEmployeeApiShape[] = [];

      // ITERATE xeroEmps — NEVER state.teamMembers (Pitfall 6).
      for (const xeroEmp of xeroEmps) {
        const matchedId = findMatchingTeamMember(
          {
            employee_id: xeroEmp.employee_id,
            full_name: xeroEmp.full_name,
            email: xeroEmp.email,
          },
          state.teamMembers,
        );
        if (!matchedId) {
          newCandidates.push(xeroEmp);
          continue;
        }
        const member = state.teamMembers.find((m) => m.id === matchedId);
        if (!member) {
          // Defensive: id resolved but member vanished mid-flight (state churn).
          // Treat as new-from-Xero candidate so operator can re-add if desired.
          newCandidates.push(xeroEmp);
          continue;
        }
        // Build the "fresh Xero values" snapshot from the enriched mapper.
        const enriched = enrichWizardMemberFromXeroEmployee(xeroEmp);
        const freshValues: Partial<Record<XeroTrackedField, unknown>> = {
          name: enriched.name,
          role: enriched.role,
          type: enriched.type,
          payFrequency: enriched.payFrequency,
          standardHours: enriched.standardHours,
          hourlyRate: enriched.hourlyRate,
          currentSalary: enriched.currentSalary,
        };
        const diff = computeReconciliationDiff(member, freshValues);
        const hasConflict = diff.fields.some((f) => f.verdict === 'conflict');
        if (hasConflict) newConflicts.push(diff);
        const silentUpdate = applySilentXeroUpdates(member, diff);
        if (silentUpdate) newSilent.push({ memberId: member.id, update: silentUpdate });
      }

      setReconcileConflicts(newConflicts);
      setReconcileSilentUpdates(newSilent);
      setReconcileNewFromXero(newCandidates);
    } catch (err) {
      setReconcileError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setReconcileLoading(false);
    }
  }, [state.businessId, state.teamMembers]);

  /**
   * Phase 52-02 — Bulk action: pre-fill every conflict field's decision to
   * 'accept-xero'. Per-field clicks override.
   */
  const acceptAllXeroChanges = useCallback(() => {
    const next: typeof pendingDecisions = {};
    for (const memberDiff of reconcileConflicts) {
      next[memberDiff.memberId] = {};
      for (const f of memberDiff.fields) {
        if (f.verdict === 'conflict') {
          next[memberDiff.memberId][f.field] = 'accept-xero';
        }
      }
    }
    setPendingDecisions(next);
  }, [reconcileConflicts]);

  /**
   * Phase 52-02 — Bulk action: pre-fill every conflict field's decision to
   * 'keep-mine'. Per-field clicks override.
   */
  const keepAllMineChanges = useCallback(() => {
    const next: typeof pendingDecisions = {};
    for (const memberDiff of reconcileConflicts) {
      next[memberDiff.memberId] = {};
      for (const f of memberDiff.fields) {
        if (f.verdict === 'conflict') {
          next[memberDiff.memberId][f.field] = 'keep-mine';
        }
      }
    }
    setPendingDecisions(next);
  }, [reconcileConflicts]);

  /**
   * Phase 52-02 — Set a per-field decision for one conflict.
   */
  const setFieldDecision = useCallback(
    (memberId: string, field: XeroTrackedField, decision: ReconciliationDecision) => {
      setPendingDecisions((prev) => ({
        ...prev,
        [memberId]: { ...(prev[memberId] ?? {}), [field]: decision },
      }));
    },
    [],
  );

  /**
   * Phase 52-02 — Toggle "Add this Xero employee" checkbox in the New-from-
   * Xero section.
   */
  const toggleNewFromXeroSelection = useCallback((employeeId: string) => {
    setReconcileSelectedNewIds((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }, []);

  /**
   * Phase 52-02 — Apply all reconciliation changes:
   *   1. Silent updates (no operator interaction needed)
   *   2. Conflict decisions (per-field accept-xero / keep-mine)
   *   3. New-from-Xero opt-ins (route to addNewHire if start_date is future)
   *
   * Default decision for un-clicked conflict fields = 'keep-mine' (safer
   * default — never overwrites operator value without explicit consent).
   *
   * Apply is per-MEMBER (one updateTeamMember call per touched member,
   * batching all silent + decision updates). NOT per-field.
   */
  const applyReconciliation = useCallback(() => {
    // 1. Silent updates → one updateTeamMember call per affected member
    const silentByMember = new Map<string, Partial<TeamMember>>();
    for (const { memberId, update } of reconcileSilentUpdates) {
      silentByMember.set(memberId, update);
    }

    // 2. Conflict decisions → merge into the same per-member partial
    for (const memberDiff of reconcileConflicts) {
      const member = state.teamMembers.find((m) => m.id === memberDiff.memberId);
      if (!member) continue;
      const decisions = pendingDecisions[memberDiff.memberId] ?? {};
      let memberUpdate: Partial<TeamMember> = silentByMember.get(memberDiff.memberId) ?? {
        _xeroImportedAt: new Date().toISOString(),
      };
      for (const fieldDiff of memberDiff.fields) {
        if (fieldDiff.verdict !== 'conflict') continue;
        const decision = decisions[fieldDiff.field] ?? 'keep-mine';
        const partial = applyReconciliationDecision(
          member,
          fieldDiff.field,
          decision,
          fieldDiff.newXeroValue,
        );
        memberUpdate = {
          ...memberUpdate,
          ...partial,
          _xeroFingerprint: {
            ...(memberUpdate._xeroFingerprint ?? {}),
            ...(partial._xeroFingerprint ?? {}),
          },
        };
      }
      silentByMember.set(memberDiff.memberId, memberUpdate);
    }

    // Single dispatch per member
    for (const [memberId, update] of silentByMember.entries()) {
      actions.updateTeamMember(memberId, update);
    }

    // 3. New-from-Xero opt-ins (same path as 52-01 import)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    for (const emp of reconcileNewFromXero) {
      if (!reconcileSelectedNewIds.has(emp.employee_id)) continue;
      const enriched = enrichWizardMemberFromXeroEmployee(emp);
      const startDate = emp.start_date ? new Date(emp.start_date) : undefined;
      const isPlannedHire =
        !!startDate && !isNaN(startDate.getTime()) && startDate > cutoff;
      if (isPlannedHire) {
        const startMonth = `${startDate!.getFullYear()}-${String(
          startDate!.getMonth() + 1,
        ).padStart(2, '0')}`;
        actions.addNewHire({
          role: enriched.role!,
          type: enriched.type!,
          hoursPerWeek: enriched.hoursPerWeek ?? STANDARD_HOURS,
          hourlyRate: enriched.hourlyRate,
          startMonth,
          salary: enriched.currentSalary ?? 0,
          payFrequency: enriched.payFrequency,
          standardHours: enriched.standardHours,
          _xeroEmployeeId: enriched._xeroEmployeeId,
          _xeroImportedAt: enriched._xeroImportedAt,
          _xeroFingerprint: enriched._xeroFingerprint,
        });
      } else {
        actions.addTeamMember({
          name: enriched.name!,
          role: enriched.role!,
          type: enriched.type!,
          hoursPerWeek: enriched.hoursPerWeek ?? STANDARD_HOURS,
          hourlyRate: enriched.hourlyRate,
          currentSalary: enriched.currentSalary ?? 0,
          increasePct: 0,
          payFrequency: enriched.payFrequency,
          standardHours: enriched.standardHours,
          isFromXero: true,
          _xeroEmployeeId: enriched._xeroEmployeeId,
          _xeroImportedAt: enriched._xeroImportedAt,
          _xeroFingerprint: enriched._xeroFingerprint,
        });
      }
    }

    // 4. Close + clear modal state
    setShowReconcile(false);
    setReconcileConflicts([]);
    setReconcileSilentUpdates([]);
    setReconcileNewFromXero([]);
    setReconcileSelectedNewIds(new Set());
    setPendingDecisions({});
  }, [
    reconcileSilentUpdates,
    reconcileConflicts,
    reconcileNewFromXero,
    reconcileSelectedNewIds,
    pendingDecisions,
    state.teamMembers,
    actions,
  ]);

  // Derived: in-sync iff nothing changed in Xero AND no new candidates.
  const reconcileInSync =
    !reconcileLoading &&
    !reconcileError &&
    reconcileConflicts.length === 0 &&
    reconcileSilentUpdates.length === 0 &&
    reconcileNewFromXero.length === 0;
  // Total pending changes = silent + conflicts (each member counts once) + new opt-ins
  const reconcileTotalChanges =
    reconcileSilentUpdates.length +
    reconcileConflicts.length +
    reconcileSelectedNewIds.size;

  const toggleRowExpand = useCallback((id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

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

  // ─── Phase 55-01: Year-active predicate + filtered row sets ────────────
  // A row is "active in FY{N}" when it matches the SAME timeline rules used
  // by TeamPlanningOverview's `calculateActualHeadcount` (lines 1128-1156):
  //   - Existing teamMember: NOT departed before targetFY (FY of endMonth >= targetFY)
  //   - New hire: started by targetFY (FY of startMonth <= targetFY)
  // selectedYear === null → no filter, all rows pass.
  const getFYFromMonthKey = useCallback((monthKey: string): number => {
    if (!monthKey) return fiscalYear;
    const [yearStr, monthStr] = monthKey.split('-');
    const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
    return getFiscalYear(date, DEFAULT_YEAR_START_MONTH);
  }, [fiscalYear]);

  const isRowActiveInYear = useCallback((row: TeamRow, year: 1 | 2 | 3): boolean => {
    const targetFY = fiscalYear + year - 1;
    if (row.isNewHire && row.startMonth) {
      const hireFY = getFYFromMonthKey(row.startMonth);
      // Hire is on payroll in targetFY if they started in targetFY or earlier.
      return hireFY <= targetFY;
    }
    // Existing teamMember: included unless they departed BEFORE targetFY.
    if (row.endMonth) {
      const endFY = getFYFromMonthKey(row.endMonth);
      return endFY >= targetFY;
    }
    return true;
  }, [fiscalYear, getFYFromMonthKey]);

  // Phase 56 P1 (Audit-4 BUG-005): hide members who departed BEFORE the
  // forecast FY started. They cannot contribute to any forecast year and
  // only clutter the operator view. Phase 55 year-card filter already
  // hides them when a year is selected; this extends the same hide to
  // the default (selectedYear === null) view.
  const fiscalYearStartFY = fiscalYear; // FY1 == fiscalYear
  const isPreForecastDeparture = useCallback((row: TeamRow): boolean => {
    if (row.isNewHire || !row.endMonth) return false;
    return getFYFromMonthKey(row.endMonth) < fiscalYearStartFY;
  }, [getFYFromMonthKey, fiscalYearStartFY]);

  const visibleEmployeeRows = useMemo(() => {
    const base = employeeRows.filter((row) => !isPreForecastDeparture(row));
    if (selectedYear === null) return base;
    return base.filter((row) => isRowActiveInYear(row, selectedYear));
  }, [employeeRows, selectedYear, isRowActiveInYear, isPreForecastDeparture]);

  const visibleContractorRows = useMemo(() => {
    const base = contractorRows.filter((row) => !isPreForecastDeparture(row));
    if (selectedYear === null) return base;
    return base.filter((row) => isRowActiveInYear(row, selectedYear));
  }, [contractorRows, selectedYear, isRowActiveInYear, isPreForecastDeparture]);

  // Calculate totals from visible rows so the table footer reflects what's shown.
  const employeeTotals = useMemo(() => {
    return visibleEmployeeRows.reduce(
      (acc, row) => ({
        salary: acc.salary + row.salary,
        super: acc.super + row.superAmount,
        bonus: acc.bonus + row.bonusAmount,
        commission: acc.commission + row.commissionAmount,
        total: acc.total + row.totalCost,
      }),
      { salary: 0, super: 0, bonus: 0, commission: 0, total: 0 }
    );
  }, [visibleEmployeeRows]);

  const contractorTotals = useMemo(() => {
    return visibleContractorRows.reduce(
      (acc, row) => ({
        cost: acc.cost + row.salary,
        bonus: acc.bonus + row.bonusAmount,
        total: acc.total + row.totalCost,
      }),
      { cost: 0, bonus: 0, total: 0 }
    );
  }, [visibleContractorRows]);

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

  // Phase 56 P1 (Audit-4 BUG-004): reject NewHire start months before FY
  // start. Same person otherwise costed twice when already a TeamMember.
  const fiscalYearStartKey = `${fiscalYear - 1}-07`;
  const newHireStartTooEarly = !!newHireData.startMonth && newHireData.startMonth < fiscalYearStartKey;

  const handleAddNewHire = () => {
    if (!newHireData.role.trim()) return;
    if (newHireStartTooEarly) return;

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
      // Phase 51 (UX-S4-02): pull current hoursMode from the underlying record
      // (TeamMember or NewHire). undefined → 'hours' default in the input
      // component; commit hoursMode='fte' through onHoursModeChange when the
      // operator switches modes.
      const sourceMember = row.isNewHire
        ? newHires.find((h) => h.id === row.newHireId)
        : teamMembers.find((m) => m.id === row.teamMemberId);
      const currentHoursMode = sourceMember?.hoursMode;
      return (
        <PartTimeSalaryInput
          salary={row.salary}
          hoursPerWeek={row.hoursPerWeek}
          hoursMode={currentHoursMode}
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
          onHoursModeChange={(mode) => {
            if (row.isNewHire) {
              actions.updateNewHire(row.newHireId!, { hoursMode: mode });
            } else {
              actions.updateTeamMember(row.teamMemberId!, { hoursMode: mode });
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

  // ─── Phase 55-01: Per-row year badges ─────────────────────────────────
  // When a year is selected, surface "Starts {Mon YYYY}" on hires that begin
  // in that FY and "Leaves {Mon YYYY}" on members departing in that FY.
  // No badge when selectedYear === null (no anchor year for the relative copy).
  const formatMonthLabel = useCallback((monthKey: string): string => {
    if (!monthKey) return '';
    const [yearStr, monthStr] = monthKey.split('-');
    const monthIdx = parseInt(monthStr, 10) - 1;
    const monthAbbrev = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthIdx] || '';
    return `${monthAbbrev} ${yearStr}`;
  }, []);

  const getRowYearBadge = useCallback((row: TeamRow): { kind: 'starts' | 'leaves'; label: string } | null => {
    if (selectedYear === null) return null;
    const targetFY = fiscalYear + selectedYear - 1;
    if (row.isNewHire && row.startMonth) {
      const hireFY = getFYFromMonthKey(row.startMonth);
      if (hireFY === targetFY) {
        return { kind: 'starts', label: `Starts ${formatMonthLabel(row.startMonth)}` };
      }
    } else if (row.endMonth) {
      const endFY = getFYFromMonthKey(row.endMonth);
      if (endFY === targetFY) {
        return { kind: 'leaves', label: `Leaves ${formatMonthLabel(row.endMonth)}` };
      }
    }
    return null;
  }, [selectedYear, fiscalYear, getFYFromMonthKey, formatMonthLabel]);

  // Table component
  const [showDetailColumns, setShowDetailColumns] = useState(false);

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
      <div className="flex justify-end mb-1">
        <button
          onClick={() => setShowDetailColumns(!showDetailColumns)}
          className="text-xs text-brand-navy hover:underline flex items-center gap-1"
        >
          {showDetailColumns ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showDetailColumns ? 'Hide details' : 'Show details (rate, hours, bonus, commission)'}
        </button>
      </div>
      <table className="w-full text-sm">
        {/* Define column widths for consistent alignment */}
        <colgroup>
          <col className="w-[18%]" /> {/* Name - flexible */}
          <col className="w-[14%]" /> {/* Role - flexible */}
          <col style={{ width: '85px' }} /> {/* Type */}
          <col style={{ width: '110px' }} /> {/* Status */}
          <col style={{ width: '95px' }} /> {/* Salary/Cost */}
          {showDetailColumns && <col style={{ width: '80px' }} />} {/* Rate */}
          {showDetailColumns && <col style={{ width: '60px' }} />} {/* Hours */}
          {showDetailColumns && !isContractor && <col style={{ width: '80px' }} />} {/* Super */}
          {showDetailColumns && <col style={{ width: '70px' }} />} {/* Bonus */}
          {showDetailColumns && <col style={{ width: '55px' }} />} {/* Comm % / HC */}
          {showDetailColumns && !isContractor && <col style={{ width: '70px' }} />} {/* Comm $ */}
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
            {showDetailColumns && (
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                Rate
                <Tooltip text={isContractor ? 'Hourly/daily rate (optional)' : 'Hourly rate (casual only)'} />
              </th>
            )}
            {showDetailColumns && (
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                Hrs
                <Tooltip text="Hours per week" />
              </th>
            )}
            {showDetailColumns && !isContractor && (
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                Super
                <Tooltip text="Superannuation Guarantee (12% for 2026)" />
              </th>
            )}
            {showDetailColumns && (
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                Bonus
                <Tooltip text="One-off bonus payment" />
              </th>
            )}
            {showDetailColumns && (
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                {isContractor ? 'HC' : 'Comm%'}
                <Tooltip text={isContractor ? 'Include in team headcount' : 'Commission as % of revenue'} />
              </th>
            )}
            {showDetailColumns && !isContractor && (
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
          {rows.map((row) => {
            const yearBadge = getRowYearBadge(row);
            return (
            <tr key={row.id} className={`hover:bg-gray-50 ${row.isNewHire ? 'bg-green-50/30' : ''}`}>
              {/* Name */}
              <td className="px-2 py-1.5">
                <div className="flex items-center gap-1.5">
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
                  {yearBadge && (
                    <span
                      data-testid={`year-badge-${yearBadge.kind}-${row.id}`}
                      className={`shrink-0 inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full whitespace-nowrap ${
                        yearBadge.kind === 'starts'
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : 'bg-red-100 text-red-700 border border-red-200'
                      }`}
                    >
                      {yearBadge.label}
                    </span>
                  )}
                </div>
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
                  // Already-departed: show the End badge + the existing
                  // MonthPicker so operators can still adjust the end month.
                  // Phase 51 (UX-S4-01): no separate End-employee button on
                  // departed rows — the single-departure model means there's
                  // nothing to "end" again.
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
                  // Phase 51 (UX-S4-01): explicit, accessible "End employee"
                  // button replaces the buried MonthPicker placeholder. Opens
                  // the termination modal scoped to this member.
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                      Active
                    </span>
                    {row.teamMemberId && (
                      <button
                        type="button"
                        aria-label={`End employee ${row.name}`}
                        onClick={() => {
                          setTerminatingMember({ id: row.teamMemberId!, name: row.name });
                          setPendingEndMonth(`${fiscalYear - 1}-12`);
                        }}
                        className="px-1.5 py-0.5 text-[10px] font-medium text-amber-700 hover:text-amber-900 hover:bg-amber-50 rounded"
                      >
                        End employee
                      </button>
                    )}
                  </div>
                )}
              </td>

              {/* Salary */}
              <td className="px-2 py-1.5">
                <div className="flex flex-col gap-1">
                  {!isContractor && row.type === 'part-time' ? (
                    // Phase 51 (UX-S4-02): part-time rows render the
                    // PartTimeSalaryInput with the new Hours/FTE toggle. The
                    // CurrencyInput-only path is kept for full-time, casual, and
                    // contractor rows below.
                    (() => {
                      const sourceMember = row.isNewHire
                        ? newHires.find((h) => h.id === row.newHireId)
                        : teamMembers.find((m) => m.id === row.teamMemberId);
                      return (
                        <PartTimeSalaryInput
                          salary={row.salary}
                          hoursPerWeek={row.hoursPerWeek}
                          hoursMode={sourceMember?.hoursMode}
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
                          onHoursModeChange={(mode) => {
                            if (row.isNewHire) {
                              actions.updateNewHire(row.newHireId!, { hoursMode: mode });
                            } else {
                              actions.updateTeamMember(row.teamMemberId!, { hoursMode: mode });
                            }
                          }}
                        />
                      );
                    })()
                  ) : (
                    /* Phase 52-01 (Operator's Option D) — annual-salary cell
                       branches on Xero provenance + calculation type:
                       - Hourly Xero import + not yet overridden → read-only span
                         + Edit button + (Xero) hint. Click Edit → mark
                         currentSalary overridden, switches to editable input.
                       - Salaried Xero import → editable by default; edits add
                         to _overriddenFields and surface 'edited' pill.
                       - Manual rows → editable, no override tracking.
                       Contractors and new-hires use the original CurrencyInput
                       since the override marker is per-TeamMember (52-02 may
                       extend to NewHire). */
                    (() => {
                      const sourceMember = row.isNewHire
                        ? undefined
                        : teamMembers.find((m) => m.id === row.teamMemberId);
                      const xeroSourced = !!sourceMember && isXeroSourcedRow(sourceMember);
                      const wasHourlyImport =
                        xeroSourced &&
                        sourceMember!._xeroFingerprint &&
                        // hourly imports never carry currentSalary in fingerprint
                        // (extractCompensationFromPayTemplate sets calculationType
                        // 'hourly' → no annualSalary); detect via the inverse —
                        // hourlyRate present, currentSalary absent or 0.
                        sourceMember!._xeroFingerprint.hourlyRate !== undefined;
                      const overridden =
                        !!sourceMember && isFieldOverridden(sourceMember, 'currentSalary');
                      const showReadOnly = !!sourceMember && wasHourlyImport && !overridden;

                      const handleSalaryChange = (val: number) => {
                        if (isContractor) {
                          if (row.isNewHire) {
                            actions.updateNewHire(row.newHireId!, { salary: val });
                          } else {
                            updateXeroSourcedField(
                              row.teamMemberId!,
                              { currentSalary: val, increasePct: 0 },
                              ['currentSalary'],
                            );
                          }
                        } else if (row.type === 'casual') {
                          const weeksPerYear = row.weeksPerYear || DEFAULT_WEEKS;
                          const newRate = row.hoursPerWeek > 0 ? val / (row.hoursPerWeek * weeksPerYear) : 0;
                          if (row.isNewHire) {
                            actions.updateNewHire(row.newHireId!, { salary: val, hourlyRate: Math.round(newRate * 100) / 100 });
                          } else {
                            updateXeroSourcedField(
                              row.teamMemberId!,
                              { currentSalary: val, hourlyRate: Math.round(newRate * 100) / 100, increasePct: 0 },
                              ['currentSalary', 'hourlyRate'],
                            );
                          }
                        } else {
                          if (row.isNewHire) {
                            actions.updateNewHire(row.newHireId!, { salary: val });
                          } else {
                            updateXeroSourcedField(
                              row.teamMemberId!,
                              { currentSalary: val, increasePct: 0 },
                              ['currentSalary'],
                            );
                          }
                        }
                      };

                      if (showReadOnly) {
                        return (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-sm text-gray-700">
                              ${(row.salary || 0).toLocaleString()}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                actions.updateTeamMember(row.teamMemberId!, {
                                  _overriddenFields: markFieldOverridden(
                                    sourceMember!._overriddenFields,
                                    'currentSalary',
                                  ),
                                });
                              }}
                              aria-label={`Edit annual salary for ${row.name}`}
                              className="text-xs text-blue-600 hover:text-blue-700 underline"
                            >
                              Edit
                            </button>
                            <span
                              className="text-[10px] text-gray-400"
                              title="Derived from Xero hourly rate × standard hours × pay periods"
                            >
                              (Xero)
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div className="flex items-center gap-1">
                          <CurrencyInput
                            value={row.salary}
                            onChange={handleSalaryChange}
                            className="w-full px-1.5 py-1 text-right border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
                          />
                          {xeroSourced && overridden && (
                            <span
                              className="px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-700 rounded"
                              aria-label={`Annual salary edited from Xero value for ${row.name}`}
                            >
                              edited
                            </span>
                          )}
                        </div>
                      );
                    })()
                  )}
                  {/* Phase 51 (UX-S4-03): per-row pay frequency selector.
                      Display value falls through: row's own payFrequency →
                      business default → 'monthly'. Setting writes ONLY to the
                      row's own field — business default is never mutated by
                      per-row interaction. Phase 52 will consume this for Xero
                      auto-fill + cashflow timing. */}
                  {(() => {
                    const sourceMember = row.isNewHire
                      ? newHires.find((h) => h.id === row.newHireId)
                      : teamMembers.find((m) => m.id === row.teamMemberId);
                    const effective: PayFrequency =
                      sourceMember?.payFrequency ?? state.defaultPayFrequency ?? 'monthly';
                    return (
                      <select
                        value={effective}
                        onChange={(e) => {
                          const value = e.target.value as PayFrequency;
                          if (row.isNewHire) {
                            // NewHire override tracking is deferred to 52-02
                            // (matches scope — 52-01 only writes provenance on
                            // import, edit-tracking lands with reconciliation).
                            actions.updateNewHire(row.newHireId!, { payFrequency: value });
                          } else {
                            // Phase 52-01 — Xero-sourced rows: stamp
                            // payFrequency into _overriddenFields automatically.
                            updateXeroSourcedField(
                              row.teamMemberId!,
                              { payFrequency: value },
                              ['payFrequency'],
                            );
                          }
                        }}
                        aria-label={`Pay frequency for ${row.name}`}
                        className="w-full px-1 py-0.5 text-[10px] text-gray-600 border border-gray-200 rounded focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="fortnightly">Fortnightly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    );
                  })()}
                </div>
              </td>

              {/* Rate — detail column */}
              {showDetailColumns && (
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
              )}

              {/* Hours — detail column */}
              {showDetailColumns && (
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
              )}

              {/* Super - detail column, employees only */}
              {showDetailColumns && !isContractor && (
                <td className="px-2 py-1.5 text-gray-500 text-right tabular-nums">
                  {formatCurrency(row.superAmount)}
                </td>
              )}

              {/* Bonus — detail column */}
              {showDetailColumns && (
              <td className="px-2 py-1.5">
                <input
                  type="number"
                  value={row.bonusAmount || ''}
                  onChange={(e) => handleBonusChange(row, parseFloat(e.target.value) || 0)}
                  placeholder="-"
                  className="w-full px-1.5 py-1 text-right border border-gray-200 rounded focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
                />
              </td>
              )}

              {/* Commission % / Headcount — detail column */}
              {showDetailColumns && (
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
              )}

              {/* Commission $ — detail column, employees only */}
              {showDetailColumns && !isContractor && (
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
            );
          })}

          {rows.length === 0 && (
            <tr>
              <td colSpan={showDetailColumns ? (isContractor ? 11 : 13) : 7} className="px-4 py-6 text-center text-gray-500">
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
              {showDetailColumns && <td className="px-2 py-2"></td>}
              {showDetailColumns && <td className="px-2 py-2"></td>}
              {showDetailColumns && !isContractor && (
                <td className="px-2 py-2 font-semibold text-right tabular-nums">
                  {formatCurrency(totals.super || 0)}
                </td>
              )}
              {showDetailColumns && (
                <td className="px-2 py-2 font-semibold text-right tabular-nums">
                  {formatCurrency(totals.bonus)}
                </td>
              )}
              {showDetailColumns && <td className="px-2 py-2 text-center">-</td>}
              {showDetailColumns && !isContractor && (
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

      {/* Phase 51 (UX-S4-03) — business-level default pay frequency.
          Segmented-button design (was a plain dropdown) so the three
          choices are visible at once and the current value is unmissable.
          Left-accent stripe + gradient tint pulls the operator's eye to
          this setting on first visit (Matt: "needs to stand out more"). */}
      <div className="bg-gradient-to-r from-brand-navy/10 via-brand-navy/5 to-transparent rounded-xl border border-brand-navy/20 border-l-4 border-l-brand-navy px-5 py-4 shadow-sm">
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex items-start gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-lg bg-brand-navy text-white flex items-center justify-center flex-shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <label
                htmlFor="default-pay-frequency-segment"
                id="default-pay-frequency-label"
                className="block text-base font-bold text-gray-900 leading-tight"
              >
                Pay frequency
              </label>
              <p className="text-xs text-gray-600 mt-0.5">
                Set once for the business — all employees inherit
              </p>
            </div>
          </div>

          {/* Segmented control — three options always visible. The current
              selection is rendered as a brand-navy pill so the choice is
              unmissable even at a glance. */}
          <div
            id="default-pay-frequency-segment"
            role="radiogroup"
            aria-labelledby="default-pay-frequency-label"
            className="inline-flex items-center bg-white rounded-lg p-1 border-2 border-brand-navy/30 shadow-sm"
          >
            {(['weekly', 'fortnightly', 'monthly'] as const).map((freq) => {
              const isSelected = (state.defaultPayFrequency ?? 'monthly') === freq;
              const label = freq.charAt(0).toUpperCase() + freq.slice(1);
              return (
                <button
                  key={freq}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`Pay frequency: ${label}`}
                  onClick={() => actions.setDefaultPayFrequency(freq)}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all duration-150 ${
                    isSelected
                      ? 'bg-brand-navy text-white shadow'
                      : 'text-gray-600 hover:text-brand-navy hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <span className="text-xs text-gray-600 flex-1 min-w-[180px]">
            Affects cashflow timing only — annual salary unchanged.
          </span>
        </div>

        {/* Audit fix #5 — Xero-import mismatch warning. The business-level
            default applies only to team members whose own `payFrequency`
            is undefined; rows imported from Xero with an explicit
            different frequency keep theirs (row-level wins). Surface a
            single inline banner if there's a mismatch so the operator
            doesn't quietly forecast the wrong cashflow rhythm. */}
        {(() => {
          const mismatched = teamMembers.filter(m =>
            (m._xeroEmployeeId || m.isFromXero) &&
            m.payFrequency &&
            m.payFrequency !== (state.defaultPayFrequency ?? 'monthly')
          );
          if (mismatched.length === 0) return null;
          const sample = mismatched.slice(0, 2).map(m => `${m.name} (${m.payFrequency})`).join(', ');
          const extra = mismatched.length > 2 ? ` +${mismatched.length - 2} more` : '';
          return (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-700" />
              <div>
                <strong>{mismatched.length} Xero-imported team member{mismatched.length === 1 ? '' : 's'}</strong>{' '}
                use a different pay frequency: {sample}{extra}. Row-level frequency wins for cashflow timing — update the row dropdown if intended, or change this default to match.
              </div>
            </div>
          );
        })()}
      </div>

      {/* ─── Phase 55-01: Year-card filter ──────────────────────────────────
          Three clickable FY summary cards (Y1/Y2/Y3 of forecast). Click a
          card → set selectedYear → filter team tables. Click again → clear.
          Card counts (headcount/cost) ALWAYS show full-year totals; the filter
          only changes which rows are visible in the tables below. */}
      <YearFilterCards
        teamMembers={teamMembers}
        newHires={newHires}
        departures={departures}
        bonuses={bonuses}
        goals={goals}
        fiscalYear={fiscalYear}
        duration={duration}
        selectedYear={selectedYear}
        onSelectYear={handleSelectYear}
      />

      {/* Section-header hint (per-business dismissible) */}
      {!yearFilterHintDismissed && (
        <div className="flex items-start justify-between gap-3 px-2">
          <p className="text-xs text-gray-500 italic" data-testid="year-filter-hint">
            Build your team plan once — it covers all 3 years. Click a year card above to see who&apos;s on payroll then.
          </p>
          <button
            type="button"
            aria-label="Dismiss year filter hint"
            onClick={dismissYearFilterHint}
            className="shrink-0 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter pill — only when a year is selected */}
      {selectedYear !== null && (
        <div
          data-testid="year-filter-pill"
          className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm flex items-center justify-between"
        >
          <span className="text-blue-900">
            Showing FY{fiscalYear + selectedYear - 1} ({getFiscalYearDateRange(fiscalYear + selectedYear - 1, DEFAULT_YEAR_START_MONTH).replace(' - ', ' – ')})
          </span>
          <button
            type="button"
            onClick={clearSelectedYear}
            className="text-xs text-blue-700 hover:text-blue-900 font-medium underline"
          >
            Show all years
          </button>
        </div>
      )}

      {/* TEAM MEMBERS SECTION */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-brand-navy" />
            <h3 className="text-lg font-semibold text-gray-900">Team Members</h3>
            <span className="text-sm text-gray-500" data-testid="team-members-count">
              ({selectedYear === null
                ? employeeRows.length
                : `${visibleEmployeeRows.length} of ${employeeRows.length}`})
            </span>
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
            {/* Phase 52-01 (XERO-S4-01) — Import-from-Xero button. Disabled state
                triggered when a prior fetch returned 404 (no active Xero
                connection). Tooltip surfaces the same message via title attr. */}
            <button
              type="button"
              onClick={openXeroImport}
              disabled={!hasXeroConnection}
              aria-label="Import from Xero"
              title={
                hasXeroConnection
                  ? 'Import employees from connected Xero tenant'
                  : 'Connect Xero to enable auto-import'
              }
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DownloadCloud className="w-4 h-4" />
              Import from Xero
            </button>
            {/* Phase 52-02 (XERO-S4-05) — Refresh-from-Xero button. Visibility
                gated on hasAnyXeroSourcedRow so operators only see this control
                AFTER an initial import. Click → reconciliation modal with per-
                field diffs, conflicts, and New-from-Xero candidates. */}
            {hasAnyXeroSourcedRow && (
              <button
                type="button"
                onClick={openReconcile}
                aria-label="Refresh from Xero"
                title="Refresh employee data from Xero (per-field diff with manual edits preserved)"
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh from Xero
              </button>
            )}
          </div>
        </div>

        {/* Phase 54-02 (XERO-S4-AUTOFILL-02) — Non-blocking banner above the
            team table when Xero has employees the wizard hasn't seen. Click
            "Review" to open the existing 52-01 import modal pre-checked
            with the new ones only. Dismiss is session-scoped (not persisted). */}
        {newEmployeesBanner.length > 0 && !bannerDismissed && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between mx-6 mt-4">
            <div className="flex items-center gap-2 text-sm text-blue-900">
              <Users className="w-4 h-4 text-blue-600" />
              <span>
                {newEmployeesBanner.length} new employee
                {newEmployeesBanner.length === 1 ? '' : 's'} in Xero since your last import — review.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  // Reuse the EXISTING 52-01 import modal: pre-load it with
                  // the filtered new-only list AND pre-check every row.
                  setXeroEmployees(newEmployeesBanner);
                  setSelectedXeroEmployeeIds(
                    new Set(newEmployeesBanner.map((e) => e.employee_id)),
                  );
                  setXeroImportError(null);
                  setXeroImportLoading(false);
                  setShowXeroImport(true);
                }}
                aria-label="Review new Xero employees"
                className="px-3 py-1 text-sm font-medium text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-md"
              >
                Review
              </button>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                aria-label="Dismiss new-employees banner"
                className="p-1 text-blue-700 hover:bg-blue-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Phase 55-01: filtered rows when a year card is selected (visibleEmployeeRows);
            falls back to all rows when no year is selected. */}
        <TeamTable rows={visibleEmployeeRows} totals={employeeTotals} />
      </div>

      {/* CONTRACTORS SECTION */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-orange-600" />
            <h3 className="text-lg font-semibold text-gray-900">Contractors</h3>
            <span className="text-sm text-gray-500" data-testid="contractors-count">
              ({selectedYear === null
                ? contractorRows.length
                : `${visibleContractorRows.length} of ${contractorRows.length}`})
            </span>
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

        <TeamTable rows={visibleContractorRows} isContractor totals={contractorTotals} />
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
                {newHireStartTooEarly && (
                  <p className="text-xs text-red-600 mt-1.5">
                    Hire date must be on or after FY start ({fiscalYearStartKey}). If
                    this person is already employed, add them as a Team Member
                    instead.
                  </p>
                )}
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
                disabled={newHireStartTooEarly}
                className={`flex-1 px-4 py-2 text-white text-sm font-medium rounded-lg ${
                  newHireStartTooEarly
                    ? 'bg-gray-300 cursor-not-allowed'
                    : hireType === 'contractor'
                      ? 'bg-orange-600 hover:bg-orange-700'
                      : 'bg-green-600 hover:bg-green-700'
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

      {/* Phase 51 (UX-S4-01): Termination modal. Forward-looking only — salary
          continues through the chosen end month, then drops to zero. Operator
          decision: no remove-from-FY-entirely option.
          Phase 56 P1 (Audit-2 BUG-012): block end months before the member's
          earliest valid start. Existing TeamMembers are assumed to be employed
          at FY start (no startMonth field on TeamMember). */}
      {terminatingMember && (() => {
        const fiscalYearStartKey = `${fiscalYear - 1}-07`;
        const earliestValidEnd = fiscalYearStartKey;
        const departureInvalid = !!pendingEndMonth && pendingEndMonth < earliestValidEnd;
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80]">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">End {terminatingMember.name}</h3>
              <button
                onClick={() => setTerminatingMember(null)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close termination dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Salary continues through the chosen end month, then drops to zero from
              the following month onward.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">End month</label>
              <MonthPicker
                value={pendingEndMonth}
                onChange={(val) => setPendingEndMonth(val)}
                minYear={startYear}
                maxYear={endYear}
                placeholder="Select end month"
                className="w-full py-2"
              />
              {departureInvalid && (
                <p className="text-xs text-red-600 mt-1.5">
                  End month must be on or after FY start ({earliestValidEnd}). For
                  members who left before FY start, remove them from the team list
                  instead.
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={departureInvalid}
                onClick={() => {
                  if (terminatingMember && pendingEndMonth && !departureInvalid) {
                    actions.addDeparture({
                      teamMemberId: terminatingMember.id,
                      endMonth: pendingEndMonth,
                    });
                  }
                  setTerminatingMember(null);
                }}
                className={`flex-1 px-4 py-2 text-white text-sm font-medium rounded-lg ${
                  departureInvalid
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-brand-navy hover:bg-brand-navy/90'
                }`}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setTerminatingMember(null)}
                className="px-4 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Phase 52-01 (XERO-S4-01) — Import-from-Xero modal. Inline (no global
          Modal component per 52-RESEARCH anti-pattern). Loading skeleton ↔
          inline error ↔ employee table; primary-rate display branches on
          calculation_type per Operator's Option D. */}
      {showXeroImport && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Import employees from Xero"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Import employees from Xero
              </h3>
              <button
                type="button"
                onClick={() => setShowXeroImport(false)}
                aria-label="Close import dialog"
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {xeroImportLoading && (
                <div className="flex items-center gap-2 text-gray-500 text-sm py-8 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading employees from Xero…
                </div>
              )}
              {!xeroImportLoading && xeroImportError && (
                <div className="text-red-600 text-sm py-4">{xeroImportError}</div>
              )}
              {!xeroImportLoading &&
                !xeroImportError &&
                xeroEmployees &&
                xeroEmployees.length === 0 && (
                  <div className="text-gray-500 text-sm py-4">
                    No employees found in connected Xero tenant.
                  </div>
                )}
              {!xeroImportLoading &&
                xeroEmployees &&
                xeroEmployees.length > 0 && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-600">
                        <th className="py-2 px-2 w-8">
                          <input
                            type="checkbox"
                            aria-label="Select all employees"
                            checked={
                              selectedXeroEmployeeIds.size === xeroEmployees.length &&
                              xeroEmployees.length > 0
                            }
                            onChange={toggleSelectAllXeroEmployees}
                          />
                        </th>
                        <th className="py-2 px-2">Name</th>
                        <th className="py-2 px-2">Type</th>
                        <th className="py-2 px-2">Pay frequency</th>
                        <th className="py-2 px-2">Pay rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {xeroEmployees.map((emp) => {
                        const derived = getDerivedAnnualSalary(
                          emp.hourly_rate,
                          emp.standard_hours,
                          emp.pay_frequency,
                        );
                        const checked = selectedXeroEmployeeIds.has(emp.employee_id);
                        return (
                          <tr key={emp.employee_id} className="border-b border-gray-100">
                            <td className="py-2 px-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                aria-label={`Select ${emp.full_name}`}
                                onChange={() => toggleXeroEmployeeSelection(emp.employee_id)}
                              />
                            </td>
                            <td className="py-2 px-2 text-gray-900">{emp.full_name}</td>
                            <td className="py-2 px-2">
                              <span className="text-xs text-gray-600 capitalize">
                                {emp.employment_type ?? '—'}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-xs text-gray-600 capitalize">
                              {emp.pay_frequency ?? '—'}
                            </td>
                            <td className="py-2 px-2">
                              {emp.calculation_type === 'hourly' ? (
                                <div className="flex flex-col">
                                  <span className="text-gray-900">
                                    ${(emp.hourly_rate ?? 0).toFixed(2)}/hr × {emp.standard_hours ?? 0}h
                                  </span>
                                  {derived != null && (
                                    <span className="text-[11px] text-gray-500">
                                      ≈ ${derived.toLocaleString()}/yr (Xero-derived)
                                    </span>
                                  )}
                                </div>
                              ) : emp.calculation_type === 'salaried' ? (
                                <div className="flex flex-col">
                                  <span className="text-gray-900">
                                    ${(emp.annual_salary ?? 0).toLocaleString()}/yr
                                  </span>
                                  {emp.hourly_rate != null && (
                                    <span className="text-[11px] text-gray-500">
                                      ${emp.hourly_rate.toFixed(2)}/hr × {emp.standard_hours ?? 0}h hint
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-900">
                                  {emp.annual_salary != null
                                    ? `$${emp.annual_salary.toLocaleString()}/yr`
                                    : '—'}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
            </div>
            <div className="flex justify-end gap-2 px-6 py-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowXeroImport(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={importSelectedXeroEmployees}
                disabled={selectedXeroEmployeeIds.size === 0}
                aria-label={`Import ${selectedXeroEmployeeIds.size} selected`}
                className="px-3 py-1.5 text-sm font-medium bg-brand-navy text-white rounded-lg hover:bg-brand-navy/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Import {selectedXeroEmployeeIds.size} selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 52-02 (XERO-S4-05) — Refresh-from-Xero reconciliation modal.
          Distinct from the 52-01 import modal above. Per Operator's Option D:
            - silentUpdates summary line (no operator interaction needed)
            - conflicts section with bulk actions + per-row per-field decisions
            - "New from Xero" section with opt-in checkboxes
          Manually-added members are NEVER iterated by this flow (Pitfall 6). */}
      {showReconcile && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Reconcile with Xero"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Reconcile with Xero</h3>
              <button
                type="button"
                onClick={() => setShowReconcile(false)}
                aria-label="Close reconciliation dialog"
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {reconcileLoading && (
                <div className="flex items-center gap-2 text-gray-500 text-sm py-8 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking Xero for changes…
                </div>
              )}
              {!reconcileLoading && reconcileError && (
                <div className="text-red-600 text-sm py-4">{reconcileError}</div>
              )}
              {reconcileInSync && (
                <div className="text-center py-8">
                  <div className="text-3xl mb-2 text-green-600">✓</div>
                  <div className="text-gray-700 font-medium">Everything is in sync with Xero</div>
                  <div className="text-xs text-gray-500 mt-1">
                    No changes detected since last import.
                  </div>
                </div>
              )}

              {!reconcileLoading && !reconcileError && reconcileSilentUpdates.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-900">
                  <strong>{reconcileSilentUpdates.length}</strong> employee
                  {reconcileSilentUpdates.length === 1 ? '' : 's'} will be silently updated with new
                  Xero values for fields you haven&apos;t edited.
                </div>
              )}

              {!reconcileLoading && !reconcileError && reconcileConflicts.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900">
                      Conflicts requiring your decision ({reconcileConflicts.length})
                    </h4>
                    <div className="flex gap-3 text-xs">
                      <button
                        type="button"
                        onClick={acceptAllXeroChanges}
                        className="text-blue-600 hover:underline"
                      >
                        Accept all Xero changes
                      </button>
                      <button
                        type="button"
                        onClick={keepAllMineChanges}
                        className="text-gray-600 hover:underline"
                      >
                        Keep all my changes
                      </button>
                    </div>
                  </div>
                  {reconcileConflicts.map((memberDiff) => {
                    const member = state.teamMembers.find((m) => m.id === memberDiff.memberId);
                    if (!member) return null;
                    const conflictFields = memberDiff.fields.filter((f) => f.verdict === 'conflict');
                    return (
                      <div
                        key={memberDiff.memberId}
                        className="border border-gray-200 rounded p-3 mb-2"
                      >
                        <div className="font-medium text-gray-900 mb-2">{member.name}</div>
                        {conflictFields.map((f) => {
                          const decision = pendingDecisions[memberDiff.memberId]?.[f.field];
                          const formatVal = (v: unknown) =>
                            v == null
                              ? '—'
                              : typeof v === 'number'
                                ? String(v)
                                : String(v);
                          return (
                            <div
                              key={f.field}
                              className="flex items-start justify-between py-1.5 text-sm gap-3"
                              data-conflict-field={f.field}
                            >
                              <div className="flex-1 min-w-0">
                                <span className="font-mono text-xs text-gray-500">{f.field}</span>
                                <span className="text-gray-700">: Xero now shows </span>
                                <strong className="text-gray-900">{formatVal(f.newXeroValue)}</strong>
                                <span className="text-gray-700">; you have </span>
                                <strong className="text-gray-900">{formatVal(f.currentValue)}</strong>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setFieldDecision(memberDiff.memberId, f.field, 'keep-mine')
                                  }
                                  aria-label={`Keep yours for ${f.field}`}
                                  className={`px-2 py-1 text-xs rounded border ${
                                    decision === 'keep-mine'
                                      ? 'bg-gray-200 border-gray-400'
                                      : 'border-gray-300 hover:bg-gray-50'
                                  }`}
                                >
                                  Keep yours
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setFieldDecision(memberDiff.memberId, f.field, 'accept-xero')
                                  }
                                  aria-label={`Accept Xero for ${f.field}`}
                                  className={`px-2 py-1 text-xs rounded border ${
                                    decision === 'accept-xero'
                                      ? 'bg-blue-100 border-blue-400 text-blue-800'
                                      : 'border-gray-300 hover:bg-gray-50'
                                  }`}
                                >
                                  Accept Xero
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </section>
              )}

              {!reconcileLoading && !reconcileError && reconcileNewFromXero.length > 0 && (
                <section>
                  <h4 className="font-medium text-gray-900 mb-2">
                    New from Xero ({reconcileNewFromXero.length})
                  </h4>
                  <div className="text-xs text-gray-500 mb-2">
                    Employees in Xero not yet in your forecast.
                  </div>
                  {reconcileNewFromXero.map((emp) => (
                    <label
                      key={emp.employee_id}
                      className="flex items-center gap-2 py-1 text-sm text-gray-800"
                    >
                      <input
                        type="checkbox"
                        aria-label={`Add ${emp.full_name}`}
                        checked={reconcileSelectedNewIds.has(emp.employee_id)}
                        onChange={() => toggleNewFromXeroSelection(emp.employee_id)}
                      />
                      <span className="font-medium">{emp.full_name}</span>
                      <span className="text-xs text-gray-500">
                        — {emp.employment_type ?? '—'} — {emp.pay_frequency ?? '—'}
                      </span>
                    </label>
                  ))}
                </section>
              )}
            </div>
            <div className="flex justify-end gap-2 px-6 py-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowReconcile(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                {reconcileInSync ? 'Close' : 'Cancel'}
              </button>
              {!reconcileInSync && (
                <button
                  type="button"
                  onClick={applyReconciliation}
                  disabled={reconcileTotalChanges === 0}
                  aria-label={`Apply ${reconcileTotalChanges} changes`}
                  className="px-3 py-1.5 text-sm font-medium bg-brand-navy text-white rounded-lg hover:bg-brand-navy/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply {reconcileTotalChanges} change{reconcileTotalChanges === 1 ? '' : 's'}
                </button>
              )}
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
