import { DEFAULT_SPLIT_SECOND_SHIFT } from '@/constants/config';
import type {
  Employee,
  NormalShiftTimings,
  ShiftAssignment,
  ShiftChangeTimings,
  ShiftType,
} from '@/types/employee';
import { getEffectiveShiftTiming } from '@/utils/shiftHours';

function profileShift(
  employee: Employee,
  date: string,
  shiftType: ShiftType,
  startTime: string,
  endTime: string,
  suffix: string,
  notes?: string
): ShiftAssignment {
  return {
    id: `shift-${employee.employeeId}-${date}-${suffix}`,
    employeeId: employee.employeeId,
    date,
    shiftType,
    startTime,
    endTime,
    notes,
  };
}

/** Build schedule rows from employee profile when admin has not assigned a shift. */
export function buildProfileShiftAssignments(
  employee: Employee,
  date: string,
  isChangeDay: boolean,
  changeTimings?: ShiftChangeTimings,
  normalTimings?: NormalShiftTimings
): ShiftAssignment[] {
  if (employee.deletedAt) return [];

  if (employee.is24HourDuty) {
    const timing = getEffectiveShiftTiming(employee, 'day', isChangeDay, changeTimings, normalTimings);
    return [profileShift(employee, date, 'day', timing.start, timing.end, 'day', '24 hour duty')];
  }

  if (employee.splitShiftEnabled && employee.dayShiftEnabled) {
    const first = getEffectiveShiftTiming(employee, 'day', isChangeDay, changeTimings, normalTimings);
    const secondStart =
      employee.splitSecondShiftStart?.slice(0, 5) ?? DEFAULT_SPLIT_SECOND_SHIFT.start;
    const secondEnd = employee.splitSecondShiftEnd?.slice(0, 5) ?? DEFAULT_SPLIT_SECOND_SHIFT.end;
    return [
      profileShift(employee, date, 'day', first.start, first.end, 'day', 'Split · first shift'),
      profileShift(employee, date, 'day', secondStart, secondEnd, 'split2', 'Split · second shift'),
    ];
  }

  const rows: ShiftAssignment[] = [];
  if (employee.dayShiftEnabled) {
    const timing = getEffectiveShiftTiming(employee, 'day', isChangeDay, changeTimings, normalTimings);
    rows.push(profileShift(employee, date, 'day', timing.start, timing.end, 'day'));
  }
  if (employee.nightShiftEnabled) {
    const timing = getEffectiveShiftTiming(employee, 'night', isChangeDay, changeTimings, normalTimings);
    rows.push(profileShift(employee, date, 'night', timing.start, timing.end, 'night'));
  }
  if (rows.length === 0) {
    const timing = getEffectiveShiftTiming(employee, 'day', isChangeDay, changeTimings, normalTimings);
    rows.push(profileShift(employee, date, 'day', timing.start, timing.end, 'day'));
  }
  return rows;
}

export function employeeHasShiftOnDate(
  assignments: ShiftAssignment[],
  employeeId: string,
  date: string
): boolean {
  return assignments.some((shift) => shift.employeeId === employeeId && shift.date === date);
}
