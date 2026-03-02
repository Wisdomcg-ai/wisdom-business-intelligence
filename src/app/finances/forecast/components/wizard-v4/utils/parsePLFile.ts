/**
 * P&L File Parser
 * Parses CSV and Excel exports from various accounting packages
 * Extracts revenue, COGS, and operating expenses by account
 */

import * as XLSX from 'xlsx';
import { PriorYearData, MonthlyData } from '../types';

export interface ParsedPLData {
  revenue: {
    total: number;
    lines: { name: string; total: number; byMonth: MonthlyData }[];
  };
  cogs: {
    total: number;
    lines: { name: string; total: number; percentOfRevenue: number }[];
  };
  opex: {
    total: number;
    lines: { name: string; total: number; monthlyAvg: number }[];
  };
  grossProfit: number;
  netProfit: number;
}

export interface ParseResult {
  success: boolean;
  data?: PriorYearData;
  error?: string;
  warnings?: string[];
}

// Common account name patterns for categorization
const REVENUE_PATTERNS = [
  /^revenue/i,
  /^income/i,
  /^sales/i,
  /^service.*income/i,
  /^consulting.*income/i,
  /^fee.*income/i,
  /^other.*income/i,
];

const COGS_PATTERNS = [
  /^cost.*sales/i,
  /^cost.*goods/i,
  /^cogs/i,
  /^direct.*cost/i,
  /^materials/i,
  /^purchases/i,
  /^subcontract/i,
  /^freight.*in/i,
];

const OPEX_PATTERNS = [
  /^expense/i,
  /^operating/i,
  /^overhead/i,
  /^admin/i,
  /^rent/i,
  /^utilities/i,
  /^insurance/i,
  /^marketing/i,
  /^advertising/i,
  /^travel/i,
  /^office/i,
  /^telephone/i,
  /^internet/i,
  /^software/i,
  /^subscription/i,
  /^professional.*fee/i,
  /^accounting/i,
  /^legal/i,
  /^bank.*fee/i,
  /^depreciation/i,
  /^amortization/i,
  /^wages/i,
  /^salaries/i,
  /^payroll/i,
  /^superannuation/i,
  /^workers.*comp/i,
];

// Months for Australian FY (Jul-Jun)
const FY_MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const MONTH_ALIASES: Record<string, number> = {
  'jan': 6, 'january': 6,
  'feb': 7, 'february': 7,
  'mar': 8, 'march': 8,
  'apr': 9, 'april': 9,
  'may': 10,
  'jun': 11, 'june': 11,
  'jul': 0, 'july': 0,
  'aug': 1, 'august': 1,
  'sep': 2, 'september': 2,
  'oct': 3, 'october': 3,
  'nov': 4, 'november': 4,
  'dec': 5, 'december': 5,
};

function categorizeAccount(name: string): 'revenue' | 'cogs' | 'opex' | 'unknown' {
  const lowerName = name.toLowerCase().trim();

  for (const pattern of REVENUE_PATTERNS) {
    if (pattern.test(lowerName)) return 'revenue';
  }

  for (const pattern of COGS_PATTERNS) {
    if (pattern.test(lowerName)) return 'cogs';
  }

  for (const pattern of OPEX_PATTERNS) {
    if (pattern.test(lowerName)) return 'opex';
  }

  return 'unknown';
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Remove currency symbols, commas, parentheses (for negatives)
    const cleaned = value
      .replace(/[$,]/g, '')
      .replace(/\(([^)]+)\)/, '-$1')
      .trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

function detectMonthColumns(headers: string[]): Map<number, number> {
  // Map column index to FY month index (0-11 for Jul-Jun)
  const monthMap = new Map<number, number>();

  headers.forEach((header, colIndex) => {
    if (!header) return;
    const lower = header.toLowerCase().trim();

    // Check for month names
    for (const [monthName, fyIndex] of Object.entries(MONTH_ALIASES)) {
      if (lower.includes(monthName)) {
        monthMap.set(colIndex, fyIndex);
        break;
      }
    }

    // Check for date patterns like "Jul 2024", "2024-07", "07/2024"
    const dateMatch = lower.match(/(\d{4})[/-]?(\d{1,2})|(\d{1,2})[/-](\d{4})/);
    if (dateMatch) {
      const month = parseInt(dateMatch[2] || dateMatch[3], 10);
      if (month >= 1 && month <= 12) {
        // Convert calendar month to FY index
        const fyIndex = month >= 7 ? month - 7 : month + 5;
        monthMap.set(colIndex, fyIndex);
      }
    }
  });

  return monthMap;
}

function detectTotalColumn(headers: string[]): number {
  // Find the "Total" or "Annual" column
  for (let i = headers.length - 1; i >= 0; i--) {
    const header = (headers[i] || '').toLowerCase().trim();
    if (header === 'total' || header === 'annual' || header === 'ytd' || header.includes('total')) {
      return i;
    }
  }
  return -1;
}

function detectAccountNameColumn(headers: string[]): number {
  // Find the account name column
  for (let i = 0; i < headers.length; i++) {
    const header = (headers[i] || '').toLowerCase().trim();
    if (
      header === 'account' ||
      header === 'account name' ||
      header === 'description' ||
      header === 'name' ||
      header === 'category' ||
      header === ''  // First column often has no header
    ) {
      return i;
    }
  }
  return 0; // Default to first column
}

export async function parsePLFile(file: File): Promise<ParseResult> {
  const warnings: string[] = [];

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // Get the first sheet (or find one named P&L, Profit and Loss, etc.)
    let sheetName = workbook.SheetNames[0];
    for (const name of workbook.SheetNames) {
      const lower = name.toLowerCase();
      if (lower.includes('p&l') || lower.includes('profit') || lower.includes('income')) {
        sheetName = name;
        break;
      }
    }

    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rows.length < 2) {
      return { success: false, error: 'File appears to be empty or has no data rows' };
    }

    // Find the header row (first row with multiple non-empty cells)
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const nonEmptyCells = rows[i].filter(cell => cell !== '').length;
      if (nonEmptyCells >= 3) {
        headerRowIndex = i;
        break;
      }
    }

    const headers = rows[headerRowIndex].map(h => String(h || ''));
    const accountCol = detectAccountNameColumn(headers);
    const totalCol = detectTotalColumn(headers);
    const monthColumns = detectMonthColumns(headers);

    if (totalCol === -1 && monthColumns.size === 0) {
      warnings.push('Could not detect month columns or total column. Using rightmost numeric column as total.');
    }

    // Parse data rows
    const revenueLines: { name: string; total: number; byMonth: MonthlyData }[] = [];
    const cogsLines: { name: string; total: number; percentOfRevenue: number }[] = [];
    const opexLines: { name: string; total: number; monthlyAvg: number }[] = [];

    let currentSection: 'revenue' | 'cogs' | 'opex' | 'unknown' = 'unknown';

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const accountName = String(row[accountCol] || '').trim();

      if (!accountName) continue;

      // Check if this is a section header
      const lowerName = accountName.toLowerCase();
      if (lowerName.includes('revenue') || lowerName.includes('income')) {
        currentSection = 'revenue';
        continue;
      } else if (lowerName.includes('cost of') || lowerName.includes('direct cost')) {
        currentSection = 'cogs';
        continue;
      } else if (lowerName.includes('operating') || lowerName.includes('expense')) {
        currentSection = 'opex';
        continue;
      } else if (lowerName.includes('total') || lowerName.includes('gross profit') || lowerName.includes('net profit')) {
        // Skip total/summary rows
        continue;
      }

      // Get total for this row
      let total = 0;
      if (totalCol !== -1) {
        total = parseNumber(row[totalCol]);
      } else {
        // Sum all numeric columns
        for (let j = accountCol + 1; j < row.length; j++) {
          total += parseNumber(row[j]);
        }
      }

      // Skip rows with zero or very small amounts
      if (Math.abs(total) < 0.01) continue;

      // Get monthly breakdown
      const byMonth: MonthlyData = {};
      monthColumns.forEach((fyIndex, colIndex) => {
        const value = parseNumber(row[colIndex]);
        if (value !== 0) {
          // Convert FY index to month key (assuming current FY)
          const calMonth = fyIndex >= 6 ? fyIndex - 5 : fyIndex + 7;
          const year = fyIndex >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;
          byMonth[`${year}-${String(calMonth).padStart(2, '0')}`] = value;
        }
      });

      // Determine category
      let category = currentSection;
      if (category === 'unknown') {
        category = categorizeAccount(accountName);
      }

      switch (category) {
        case 'revenue':
          // Revenue is typically positive in P&L exports
          revenueLines.push({ name: accountName, total: Math.abs(total), byMonth });
          break;
        case 'cogs':
          cogsLines.push({ name: accountName, total: Math.abs(total), percentOfRevenue: 0 });
          break;
        case 'opex':
          opexLines.push({ name: accountName, total: Math.abs(total), monthlyAvg: Math.abs(total) / 12 });
          break;
        default:
          // Default to opex for unknown
          if (total < 0 || lowerName.includes('expense')) {
            opexLines.push({ name: accountName, total: Math.abs(total), monthlyAvg: Math.abs(total) / 12 });
          }
      }
    }

    // Calculate totals
    const totalRevenue = revenueLines.reduce((sum, l) => sum + l.total, 0);
    const totalCogs = cogsLines.reduce((sum, l) => sum + l.total, 0);
    const totalOpex = opexLines.reduce((sum, l) => sum + l.total, 0);

    // Update COGS percentages
    cogsLines.forEach(line => {
      line.percentOfRevenue = totalRevenue > 0 ? (line.total / totalRevenue) * 100 : 0;
    });

    if (totalRevenue === 0) {
      warnings.push('No revenue accounts detected. Please verify the file contains your P&L data.');
    }

    // Build PriorYearData structure
    const priorYear: PriorYearData = {
      revenue: {
        total: totalRevenue,
        byMonth: {},
        byLine: revenueLines.map((l, i) => ({
          id: `rev-${i}`,
          name: l.name,
          total: l.total,
          byMonth: l.byMonth,
        })),
      },
      cogs: {
        total: totalCogs,
        percentOfRevenue: totalRevenue > 0 ? (totalCogs / totalRevenue) * 100 : 0,
        byMonth: {},
        byLine: cogsLines.map((l, i) => ({
          id: `cogs-${i}`,
          name: l.name,
          total: l.total,
          percentOfRevenue: l.percentOfRevenue,
        })),
      },
      grossProfit: {
        total: totalRevenue - totalCogs,
        percent: totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue) * 100 : 0,
        byMonth: {},
      },
      opex: {
        total: totalOpex,
        byMonth: {},
        byLine: opexLines.map((l, i) => ({
          id: `opex-${i}`,
          name: l.name,
          total: l.total,
          monthlyAvg: l.monthlyAvg,
          isOneOff: false,
        })),
      },
      seasonalityPattern: Array(12).fill(8.33), // Default even distribution
    };

    // Calculate seasonality from revenue by month if available
    const monthlyRevenue: number[] = Array(12).fill(0);
    revenueLines.forEach(line => {
      Object.entries(line.byMonth).forEach(([monthKey, value]) => {
        const match = monthKey.match(/\d{4}-(\d{2})/);
        if (match) {
          const calMonth = parseInt(match[1], 10);
          const fyIndex = calMonth >= 7 ? calMonth - 7 : calMonth + 5;
          monthlyRevenue[fyIndex] += value;
        }
      });
    });

    const monthlyTotal = monthlyRevenue.reduce((a, b) => a + b, 0);
    if (monthlyTotal > 0) {
      priorYear.seasonalityPattern = monthlyRevenue.map(m => (m / monthlyTotal) * 100);
    }

    return {
      success: true,
      data: priorYear,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

  } catch (error) {
    console.error('P&L file parsing error:', error);
    return {
      success: false,
      error: `Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
