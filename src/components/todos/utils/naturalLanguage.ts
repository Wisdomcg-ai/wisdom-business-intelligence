// naturalLanguage.ts - Natural language parser for task input
// Location: /src/components/todos/utils/naturalLanguage.ts

import { ParsedTask, TodoCategory, SimplifiedPriority, EffortSize } from './types';
import { CATEGORIES, DATE_SHORTCUTS } from './constants';

/**
 * Main parser function - converts natural language input to structured task data
 * Examples:
 * - "Call John tomorrow 3pm !!" → Important task due tomorrow at 3pm
 * - "Team meeting every monday @sarah" → Recurring task assigned to Sarah
 * - "Review Q4 report" → Regular task with auto-detected Finance category
 */
export function parseTaskInput(input: string): ParsedTask {
  if (!input || input.trim().length === 0) {
    throw new Error('Task input cannot be empty');
  }

  const originalInput = input;
  let workingInput = input.trim();
  
  // Extract all components
  const priority = extractPriority(workingInput);
  const { text: textAfterDate, date, time } = extractDateTime(workingInput);
  const { text: textAfterRecurrence, pattern } = extractRecurrence(textAfterDate);
  const { text: textAfterAssignment, assignee } = extractAssignment(textAfterRecurrence);
  const { text: finalText, effort } = extractEffortSize(textAfterAssignment);
  
  // Clean up the title
  const title = cleanTitle(finalText);
  
  // Auto-detect category if not explicitly set
  const category = detectCategory(title);
  
  // Format the due date if we have one
  const formattedDate = date ? formatDate(date) : undefined;
  
  return {
    title,
    due_date: formattedDate,
    scheduled_date: formattedDate, // Using same date for both as discussed
    time,
    priority,
    category,
    assigned_to: assignee,
    recurrence_pattern: pattern,
    effort_size: effort,
    raw_input: originalInput
  };
}

/**
 * Extract priority from input
 * "!" or "urgent" or "important" = important
 * Otherwise = normal
 */
function extractPriority(input: string): SimplifiedPriority {
  const urgentKeywords = ['urgent', 'critical', 'important', 'asap', 'emergency'];
  const lowerInput = input.toLowerCase();
  
  // Check for exclamation mark
  if (input.includes('!')) {
    return 'important';
  }
  
  // Check for urgent keywords
  if (urgentKeywords.some(keyword => lowerInput.includes(keyword))) {
    return 'important';
  }
  
  return 'normal';
}

/**
 * Extract date and time from input
 */
function extractDateTime(input: string): { text: string, date?: Date, time?: string } {
  let workingText = input;
  let extractedDate: Date | undefined;
  let extractedTime: string | undefined;
  
  // First, try to extract time (e.g., "3pm", "15:00", "3:30pm")
  const timeRegex = /\b(\d{1,2}):?(\d{2})?\s*(am|pm)?\b/gi;
  const timeMatch = workingText.match(timeRegex);
  
  if (timeMatch) {
    extractedTime = parseTime(timeMatch[0]);
    workingText = workingText.replace(timeMatch[0], '').trim();
  }
  
  // Look for date keywords
  const today = new Date();
  const lowerText = workingText.toLowerCase();
  
  // Check shortcuts first - check longer phrases before shorter ones
  const shortcuts = [
    'this week',
    'next week',
    'today',
    'tomorrow',
    'yesterday',
    'monday',
    'tuesday', 
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'eod'
  ];
  
  for (const shortcut of shortcuts) {
    if (lowerText.includes(shortcut)) {
      extractedDate = DATE_SHORTCUTS[shortcut](today);
      // Remove the date keyword from text
      const regex = new RegExp(`\\b${shortcut}\\b`, 'gi');
      workingText = workingText.replace(regex, '').trim();
      break;
    }
  }
  
  // If no shortcut found, try to parse specific dates
  if (!extractedDate) {
    // Try formats like "dec 15", "12/15", "15th"
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthRegex = new RegExp(`\\b(${monthNames.join('|')})\\w*\\s+(\\d{1,2})\\b`, 'gi');
    const monthMatch = lowerText.match(monthRegex);
    
    if (monthMatch) {
      const monthIndex = monthNames.findIndex(m => monthMatch[0].toLowerCase().includes(m));
      const day = parseInt(monthMatch[0].match(/\d+/)?.[0] || '1');
      extractedDate = new Date(today.getFullYear(), monthIndex, day);
      
      // If date is in the past, assume next year
      if (extractedDate < today) {
        extractedDate.setFullYear(extractedDate.getFullYear() + 1);
      }
      
      workingText = workingText.replace(monthMatch[0], '').trim();
    }
    
    // Try MM/DD format
    const slashDateRegex = /\b(\d{1,2})\/(\d{1,2})\b/;
    const slashMatch = workingText.match(slashDateRegex);
    if (slashMatch && !extractedDate) {
      const month = parseInt(slashMatch[1]) - 1;
      const day = parseInt(slashMatch[2]);
      extractedDate = new Date(today.getFullYear(), month, day);
      
      // If date is in the past, assume next year
      if (extractedDate < today) {
        extractedDate.setFullYear(extractedDate.getFullYear() + 1);
      }
      
      workingText = workingText.replace(slashMatch[0], '').trim();
    }
  }
  
  // Apply time to date if both exist
  if (extractedDate && extractedTime) {
    const [hours, minutes] = extractedTime.split(':').map(Number);
    extractedDate.setHours(hours, minutes || 0, 0, 0);
  }
  
  return {
    text: workingText,
    date: extractedDate,
    time: extractedTime
  };
}

/**
 * Parse time string to 24-hour format
 */
function parseTime(timeStr: string): string {
  const cleaned = timeStr.toLowerCase().trim();
  const isPM = cleaned.includes('pm');
  const isAM = cleaned.includes('am');
  
  // Extract numbers
  const numbers = cleaned.match(/\d+/g);
  if (!numbers) return '';
  
  let hours = parseInt(numbers[0]);
  const minutes = numbers[1] ? parseInt(numbers[1]) : 0;
  
  // Convert to 24-hour format
  if (isPM && hours !== 12) {
    hours += 12;
  } else if (isAM && hours === 12) {
    hours = 0;
  } else if (!isPM && !isAM && hours < 8) {
    // Assume PM for times like "3" (3pm rather than 3am)
    hours += 12;
  }
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Extract recurrence pattern
 */
function extractRecurrence(input: string): { text: string, pattern?: string } {
  const lowerInput = input.toLowerCase();
  let pattern: string | undefined;
  let cleanedText = input;
  
  // Common patterns
  const patterns = [
    { regex: /\bevery\s+day\b/gi, pattern: 'daily' },
    { regex: /\bdaily\b/gi, pattern: 'daily' },
    { regex: /\bevery\s+weekday\b/gi, pattern: 'weekdays' },
    { regex: /\bweekdays\b/gi, pattern: 'weekdays' },
    { regex: /\bevery\s+week\b/gi, pattern: 'weekly' },
    { regex: /\bweekly\b/gi, pattern: 'weekly' },
    { regex: /\bevery\s+month\b/gi, pattern: 'monthly' },
    { regex: /\bmonthly\b/gi, pattern: 'monthly' },
    { regex: /\bevery\s+monday\b/gi, pattern: 'every monday' },
    { regex: /\bevery\s+tuesday\b/gi, pattern: 'every tuesday' },
    { regex: /\bevery\s+wednesday\b/gi, pattern: 'every wednesday' },
    { regex: /\bevery\s+thursday\b/gi, pattern: 'every thursday' },
    { regex: /\bevery\s+friday\b/gi, pattern: 'every friday' },
    { regex: /\bevery\s+saturday\b/gi, pattern: 'every saturday' },
    { regex: /\bevery\s+sunday\b/gi, pattern: 'every sunday' },
  ];
  
  for (const { regex, pattern: p } of patterns) {
    if (regex.test(input)) {
      pattern = p;
      cleanedText = cleanedText.replace(regex, '').trim();
      break;
    }
  }
  
  return { text: cleanedText, pattern };
}

/**
 * Extract assignment (@person)
 */
function extractAssignment(input: string): { text: string, assignee?: string } {
  const assignmentRegex = /@(\w+)/g;
  const match = input.match(assignmentRegex);
  
  if (match) {
    const assignee = match[0].substring(1); // Remove @
    const cleanedText = input.replace(match[0], '').trim();
    return { text: cleanedText, assignee: capitalizeFirst(assignee) };
  }
  
  return { text: input, assignee: undefined };
}

/**
 * Extract effort size (for quick wins)
 */
function extractEffortSize(input: string): { text: string, effort?: EffortSize } {
  const lowerInput = input.toLowerCase();
  
  // Check for quick win indicators
  if (lowerInput.includes('quick') || lowerInput.includes('2 min') || lowerInput.includes('2min')) {
    const cleanedText = input
      .replace(/\bquick\s*win\b/gi, '')
      .replace(/\b2\s*min(ute)?s?\b/gi, '')
      .trim();
    return { text: cleanedText, effort: 'quick-win' };
  }
  
  return { text: input, effort: undefined };
}

/**
 * Auto-detect category based on keywords
 */
function detectCategory(title: string): TodoCategory | undefined {
  const lowerTitle = title.toLowerCase();
  
  // Check each category's keywords
  for (const [category, config] of Object.entries(CATEGORIES)) {
    if (config.keywords.some(keyword => lowerTitle.includes(keyword))) {
      return category as TodoCategory;
    }
  }
  
  // Default to Other if no match
  return 'Other';
}

/**
 * Clean up the final title
 */
function cleanTitle(text: string): string {
  // Remove extra spaces, exclamation marks, etc.
  let cleaned = text
    .replace(/!+/g, '') // Remove exclamation marks
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
  
  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned[0].toUpperCase() + cleaned.slice(1);
  }
  
  return cleaned || 'Untitled Task';
}

/**
 * Format date to ISO string for database
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Capitalize first letter of a string
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Validate parsed task
 */
export function validateParsedTask(task: ParsedTask): string[] {
  const errors: string[] = [];
  
  if (!task.title || task.title.trim().length === 0) {
    errors.push('Task title is required');
  }
  
  if (task.title.length > 500) {
    errors.push('Task title is too long (max 500 characters)');
  }
  
  if (task.due_date) {
    const date = new Date(task.due_date);
    if (isNaN(date.getTime())) {
      errors.push('Invalid due date');
    }
  }
  
  if (task.time && !/^\d{2}:\d{2}$/.test(task.time)) {
    errors.push('Invalid time format');
  }
  
  return errors;
}

/**
 * Get natural language description of a parsed task
 */
export function getTaskDescription(task: ParsedTask): string {
  const parts: string[] = [task.title];
  
  if (task.priority === 'important') {
    parts.push('(Important)');
  }
  
  if (task.due_date) {
    const date = new Date(task.due_date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
      parts.push('due today');
    } else if (date.toDateString() === tomorrow.toDateString()) {
      parts.push('due tomorrow');
    } else {
      parts.push(`due ${date.toLocaleDateString()}`);
    }
    
    if (task.time) {
      parts.push(`at ${task.time}`);
    }
  }
  
  if (task.recurrence_pattern) {
    parts.push(`(${task.recurrence_pattern})`);
  }
  
  if (task.assigned_to) {
    parts.push(`assigned to ${task.assigned_to}`);
  }
  
  return parts.join(' ');
}