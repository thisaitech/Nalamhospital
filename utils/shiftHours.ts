import { differenceInMinutes, parseISO } from 'date-fns';

import {
  DEFAULT_DAY_SHIFT,
  DEFAULT_FULL_DAY_SHIFT,
  DEFAULT_NIGHT_SHIFT,
  OT_GRACE_HOURS,
  SHIFT_CHANGE_DAY_TIMING,
  SHIFT_CHANGE_NIGHT_TIMING,
} from '@/constants/config';
import type { Employee, ShiftAssignment, ShiftChangeTimings, ShiftType } from '@/types/employee';

/** Parse HH:mm or HH:mm:ss into minutes from midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function shiftCrossesMidnight(start: string, end: string): boolean {
  return timeToMinutes(end) <= timeToMinutes(start);
}

export function calcHoursBetween(start: string, end: string): number {
  const startMin = timeToMinutes(start);
  let endMin = timeToMinutes(end);
  // Night / change-day windows that cross midnight
  if (endMin <= startMin) {
    endMin += 24 * 60;
  }
  return Math.round(((endMin - startMin) / 60) * 10) / 10;
}

export function calcPunchHours(punchIn: string, punchOut: string): number {
  const start = parseISO(`2000-01-01T${normalizeTime(punchIn)}`);
  let end = parseISO(`2000-01-01T${normalizeTime(punchOut)}`);
  if (end.getTime() <= start.getTime()) {
    end = parseISO(`2000-01-02T${normalizeTime(punchOut)}`);
  }
  return Math.round((differenceInMinutes(end, start) / 60) * 10) / 10;
}

function normalizeTime(time: string): string {
  const parts = time.split(':');
  if (parts.length === 2) return `${time}:00`;
  return time;
}

/** Fixed 24-hour duty window (same clock time next day = 24h). */
export function get24HourDutyTiming(): { start: string; end: string } {
  return {
    start: DEFAULT_FULL_DAY_SHIFT.start,
    end: DEFAULT_FULL_DAY_SHIFT.end,
  };
}

/** Normal clinic timings from the employee profile (admin-fixed 8–8 by default). */
export function getShiftTiming(
  employee: Employee,
  shiftType: ShiftType
): { start: string; end: string } {
  if (employee.is24HourDuty) {
    return get24HourDutyTiming();
  }
  if (shiftType === 'day') {
    return {
      start: employee.dayShiftStart || DEFAULT_DAY_SHIFT.start,
      end: employee.dayShiftEnd || DEFAULT_DAY_SHIFT.end,
    };
  }
  return {
    start: employee.nightShiftStart || DEFAULT_NIGHT_SHIFT.start,
    end: employee.nightShiftEnd || DEFAULT_NIGHT_SHIFT.end,
  };
}

/**
 * Effective window for a date.
 * 24h doctors always get a full 24h window (never clinic normal/change-day times).
 * Change days / normal days apply only to non-24h staff.
 */
export function getEffectiveShiftTiming(
  employee: Employee,
  shiftType: ShiftType,
  isChangeDay: boolean,
  changeTimings?: ShiftChangeTimings,
  normalTimings?: ShiftChangeTimings
): { start: string; end: string } {
  if (employee.is24HourDuty) {
    return get24HourDutyTiming();
  }
  if (isChangeDay) {
    const night = {
      start: changeTimings?.nightStart ?? SHIFT_CHANGE_DAY_TIMING.start,
      end: changeTimings?.nightEnd ?? SHIFT_CHANGE_DAY_TIMING.end,
    };
    const day = {
      start: changeTimings?.dayStart ?? SHIFT_CHANGE_NIGHT_TIMING.start,
      end: changeTimings?.dayEnd ?? SHIFT_CHANGE_NIGHT_TIMING.end,
    };
    return shiftType === 'night' ? night : day;
  }
  if (normalTimings) {
    if (shiftType === 'day') {
      return { start: normalTimings.dayStart, end: normalTimings.dayEnd };
    }
    return { start: normalTimings.nightStart, end: normalTimings.nightEnd };
  }
  return getShiftTiming(employee, shiftType);
}

export function scheduledHoursFromAssignments(assignments: ShiftAssignment[]): number {
  return assignments.reduce((sum, a) => sum + calcHoursBetween(a.startTime, a.endTime), 0);
}

/**
 * OT hours: time worked past scheduled shift end, only after the OT threshold.
 * Default threshold = 1 hour after shift end.
 *
 * Example: shift ends 18:00, threshold 1h, punch-out 19:30 → OT = 0.5h
 * (19:30 − 19:00). Time from 18:00–19:00 is not OT.
 * Early punch-in never counts as OT.
 */
export function calculateOtHours(
  punchOut: string,
  assignments: ShiftAssignment[],
  otStartsAfterHours: number = OT_GRACE_HOURS
): number {
  if (!assignments.length) return 0;

  let latestEndMinutes = -1;
  let earliestStartMinutes = Number.POSITIVE_INFINITY;
  for (const assignment of assignments) {
    const startMin = timeToMinutes(assignment.startTime);
    let endMin = timeToMinutes(assignment.endTime);
    if (endMin <= startMin) endMin += 24 * 60;
    if (endMin > latestEndMinutes) latestEndMinutes = endMin;
    if (startMin < earliestStartMinutes) earliestStartMinutes = startMin;
  }

  if (latestEndMinutes < 0 || !Number.isFinite(earliestStartMinutes)) return 0;

  let adjustedPunchOut = timeToMinutes(punchOut);
  // Night / overnight: punch-out earlier than morning start → next calendar day
  if (adjustedPunchOut < earliestStartMinutes - 60) {
    adjustedPunchOut += 24 * 60;
  }
  // Still before or at shift end window start → try next day if past midnight shift
  if (adjustedPunchOut < latestEndMinutes - 12 * 60) {
    adjustedPunchOut += 24 * 60;
  }

  const thresholdHours = Number.isFinite(otStartsAfterHours) ? Math.max(0, otStartsAfterHours) : OT_GRACE_HOURS;
  const overtimeStart = latestEndMinutes + thresholdHours * 60;
  if (adjustedPunchOut <= overtimeStart) return 0;

  const otMinutes = adjustedPunchOut - overtimeStart;
  return Math.round((otMinutes / 60) * 10) / 10;
}

/**
 * Count worked hours from punch-in to punch-out, but never credit time
 * before the earliest scheduled shift start (early login is not paid / not OT).
 */
export function calcPayablePunchHours(
  punchIn: string,
  punchOut: string,
  assignments: ShiftAssignment[]
): number {
  if (!assignments.length) {
    return calcPunchHours(punchIn, punchOut);
  }

  const earliestStart = Math.min(...assignments.map((a) => timeToMinutes(a.startTime)));
  const punchInMin = timeToMinutes(punchIn);
  const effectivePunchIn =
    punchInMin < earliestStart
      ? `${String(Math.floor(earliestStart / 60)).padStart(2, '0')}:${String(earliestStart % 60).padStart(2, '0')}`
      : punchIn;

  return calcPunchHours(effectivePunchIn, punchOut);
}

export function primaryShiftType(assignments: ShiftAssignment[]): ShiftType | 'both' | null {
  if (!assignments.length) return null;
  const types = new Set(assignments.map((a) => a.shiftType));
  if (types.size > 1) return 'both';
  return assignments[0].shiftType;
}
