import { differenceInMinutes, parseISO } from 'date-fns';

import { OT_GRACE_HOURS } from '@/constants/config';
import type { Employee, ShiftAssignment, ShiftType } from '@/types/employee';

/** Parse HH:mm or HH:mm:ss into minutes from midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function calcHoursBetween(start: string, end: string): number {
  const startMin = timeToMinutes(start);
  let endMin = timeToMinutes(end);
  // Night shifts that cross midnight
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

export function getShiftTiming(
  employee: Employee,
  shiftType: ShiftType
): { start: string; end: string } {
  if (shiftType === 'day') {
    return { start: employee.dayShiftStart, end: employee.dayShiftEnd };
  }
  return { start: employee.nightShiftStart, end: employee.nightShiftEnd };
}

export function scheduledHoursFromAssignments(assignments: ShiftAssignment[]): number {
  return assignments.reduce((sum, a) => sum + calcHoursBetween(a.startTime, a.endTime), 0);
}

/**
 * Extra duty pay starts only after OT_GRACE_HOURS past the latest shift end.
 * Returns payable OT hours (already past the grace window).
 */
export function calculateOtHours(
  punchOut: string,
  assignments: ShiftAssignment[]
): number {
  if (!assignments.length) return 0;

  // Use the latest ending shift as the OT baseline for the day
  let latestEndMinutes = -1;
  for (const assignment of assignments) {
    const startMin = timeToMinutes(assignment.startTime);
    let endMin = timeToMinutes(assignment.endTime);
    if (endMin <= startMin) endMin += 24 * 60;
    if (endMin > latestEndMinutes) latestEndMinutes = endMin;
  }

  const punchOutMin = timeToMinutes(punchOut);
  // If punch-out looks earlier than start of day window, treat as next calendar day
  let adjustedPunchOut = punchOutMin;
  const earliestStart = Math.min(...assignments.map((a) => timeToMinutes(a.startTime)));
  if (adjustedPunchOut < earliestStart - 60) {
    adjustedPunchOut += 24 * 60;
  }

  const overtimeStart = latestEndMinutes + OT_GRACE_HOURS * 60;
  const otMinutes = Math.max(0, adjustedPunchOut - overtimeStart);
  return Math.round((otMinutes / 60) * 10) / 10;
}

export function primaryShiftType(assignments: ShiftAssignment[]): ShiftType | 'both' | null {
  if (!assignments.length) return null;
  const types = new Set(assignments.map((a) => a.shiftType));
  if (types.size > 1) return 'both';
  return assignments[0].shiftType;
}
