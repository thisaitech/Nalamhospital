import { format, isBefore, isValid, parseISO, startOfDay } from 'date-fns';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface LeaveDateErrors {
  start?: string;
  end?: string;
  reason?: string;
}

export interface LeaveFormValidation {
  valid: boolean;
  errors: LeaveDateErrors;
  summary: string | null;
}

export const INVALID_DATE_MSG = 'Enter a valid date (YYYY-MM-DD)';
export const FORMAT_MSG = 'Use format YYYY-MM-DD';

export function formatDateInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export function formatLeaveDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function getTodayString(): string {
  return formatLeaveDate(startOfDay(new Date()));
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function parseLeaveDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!DATE_PATTERN.test(trimmed)) return null;

  const [year, month, day] = trimmed.split('-').map(Number);
  if (!isValidCalendarDate(year, month, day)) return null;

  const date = startOfDay(parseISO(trimmed));
  if (!isValid(date)) return null;
  if (formatLeaveDate(date) !== trimmed) return null;

  return date;
}

export function getDateInputError(
  value: string,
  options: {
    required?: boolean;
    minDate?: string;
    rejectPast?: boolean;
    fieldLabel?: string;
  } = {}
): string | undefined {
  const trimmed = value.trim();
  const label = options.fieldLabel ?? 'Date';

  if (!trimmed) {
    return options.required ? `${label} is required` : undefined;
  }

  if (trimmed.length < 10) {
    return FORMAT_MSG;
  }

  if (!parseLeaveDate(trimmed)) {
    return INVALID_DATE_MSG;
  }

  const date = parseLeaveDate(trimmed)!;
  const today = startOfDay(new Date());

  if (options.rejectPast && isBefore(date, today)) {
    return 'Date cannot be in the past';
  }

  if (options.minDate) {
    const min = parseLeaveDate(options.minDate);
    if (min && isBefore(date, min)) {
      return `Date cannot be before ${options.minDate}`;
    }
  }

  return undefined;
}

export function validateLeaveDateRange(
  startDate: string,
  endDate: string,
  options: { rejectPastStart?: boolean } = { rejectPastStart: true }
): LeaveFormValidation {
  const errors: LeaveDateErrors = {};

  const startError = getDateInputError(startDate, {
    required: true,
    fieldLabel: 'Start date',
    rejectPast: options.rejectPastStart,
  });
  if (startError) errors.start = startError;

  const endError = getDateInputError(endDate, {
    required: true,
    fieldLabel: 'End date',
    minDate: parseLeaveDate(startDate) ? startDate : undefined,
  });
  if (endError) errors.end = endError;

  if (!errors.start && !errors.end) {
    const start = parseLeaveDate(startDate)!;
    const end = parseLeaveDate(endDate)!;
    if (isBefore(end, start)) {
      errors.end = 'End date cannot be before start date';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    summary: buildValidationSummary(errors),
  };
}

export function validateLeaveForm(
  startDate: string,
  endDate: string,
  reason: string,
  options: { rejectPastStart?: boolean } = { rejectPastStart: true }
): LeaveFormValidation {
  const dateValidation = validateLeaveDateRange(startDate, endDate, options);
  const errors = { ...dateValidation.errors };

  if (!reason.trim()) {
    errors.reason = 'Reason is required';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    summary: buildValidationSummary(errors),
  };
}

function buildValidationSummary(errors: LeaveDateErrors): string | null {
  const messages = [errors.start, errors.end, errors.reason].filter(Boolean) as string[];
  if (messages.length === 0) return null;
  return messages.join('\n');
}

export function calculateLeaveDays(startDate: string, endDate: string): number {
  const start = parseLeaveDate(startDate);
  const end = parseLeaveDate(endDate);
  if (!start || !end) return 0;
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/** True when two inclusive date ranges overlap (yyyy-MM-dd). */
export function leaveRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA <= endB && endA >= startB;
}

export function findOverlappingLeaveRequest<
  T extends { id: string; startDate: string; endDate: string; status: string },
>(
  requests: T[],
  startDate: string,
  endDate: string,
  options?: { excludeId?: string }
): T | undefined {
  return requests.find(
    (r) =>
      (r.status === 'pending' || r.status === 'approved') &&
      r.id !== options?.excludeId &&
      leaveRangesOverlap(startDate, endDate, r.startDate, r.endDate)
  );
}

export function isLeaveDateValueComplete(value: string): boolean {
  return value.trim().length === 10;
}

export function shouldValidateDateField(value: string, touched: boolean, showAllErrors: boolean): boolean {
  return showAllErrors || touched || value.length > 0;
}
