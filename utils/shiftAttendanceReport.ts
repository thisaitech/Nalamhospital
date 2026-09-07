import { format, parseISO } from 'date-fns';

import type { AttendanceRecord, Employee, ShiftAssignment } from '@/types/employee';
import { mergeAttendanceByDate } from '@/utils/punchSessions';

/** Change-day rotation direction used for attendance credit. */
export type ShiftTransition = 'day_to_night' | 'night_to_day';

export type ShiftAttendanceReportRow = {
  employeeId: string;
  staffName: string;
  clinicId: string;
  clinicName: string;
  date: string;
  dateLabel: string;
  /** Original assignment on the change day. */
  assignedTransition: ShiftTransition;
  /** Used for credit + filters (Day→Night + continue becomes Night→Day). */
  effectiveTransition: ShiftTransition;
  shiftLabel: string;
  timing: string;
  startTime: string;
  endTime: string;
  continued: boolean;
  present: boolean;
  attendanceCredit: number;
};

export type ShiftAttendanceReportSummary = {
  totalStaff: number;
  dayToNightCount: number;
  dayToNightDays: number;
  nightToDayCount: number;
  nightToDayDays: number;
  totalAttendanceCredit: number;
};

export function shiftTransitionLabel(transition: ShiftTransition): string {
  return transition === 'day_to_night' ? 'Day → Night' : 'Night → Day';
}

/**
 * On shift-change days:
 * - day assignment / 13:00→08:00 style = Day → Night
 * - night assignment / 20:00→13:00 style = Night → Day
 */
export function classifyChangeShiftTransition(shift: Pick<ShiftAssignment, 'shiftType'>): ShiftTransition {
  return shift.shiftType === 'night' ? 'night_to_day' : 'day_to_night';
}

export function hasContinuedNextShift(record: AttendanceRecord | null | undefined): boolean {
  return Boolean(record?.continuePunchIn);
}

export function isPresentForReport(record: AttendanceRecord | null | undefined): boolean {
  if (!record) return false;
  if (record.insertedByAdmin) return true;
  return Boolean(record.punchIn);
}

/**
 * Day → Night = 1
 * Night → Day = 2
 * Day → Night + continue next shift = Night → Day credit (2)
 */
export function resolveAttendanceCredit(
  assigned: ShiftTransition,
  continued: boolean
): { effective: ShiftTransition; credit: number } {
  const effective: ShiftTransition =
    assigned === 'day_to_night' && continued ? 'night_to_day' : assigned;
  return {
    effective,
    credit: effective === 'night_to_day' ? 2 : 1,
  };
}

export function buildShiftAttendanceReportRows(input: {
  employees: Employee[];
  shifts: ShiftAssignment[];
  attendance: AttendanceRecord[];
  changeDates: Set<string> | string[];
}): ShiftAttendanceReportRow[] {
  const changeSet =
    input.changeDates instanceof Set ? input.changeDates : new Set(input.changeDates);
  const employeeMap = new Map(input.employees.map((e) => [e.employeeId, e]));
  const attendanceByKey = new Map<string, AttendanceRecord>();

  for (const record of mergeAttendanceByDate(input.attendance)) {
    attendanceByKey.set(`${record.employeeId}|${record.date}`, record);
  }

  const rows: ShiftAttendanceReportRow[] = [];

  for (const shift of input.shifts) {
    if (!changeSet.has(shift.date)) continue;
    const emp = employeeMap.get(shift.employeeId);
    if (!emp || emp.is24HourDuty) continue;

    const record = attendanceByKey.get(`${shift.employeeId}|${shift.date}`) ?? null;
    const continued = hasContinuedNextShift(record);
    const present = isPresentForReport(record);
    const assigned = classifyChangeShiftTransition(shift);
    const { effective, credit } = resolveAttendanceCredit(assigned, continued);

    rows.push({
      employeeId: shift.employeeId,
      staffName: `${emp.firstName} ${emp.lastName}`.trim(),
      clinicId: emp.clinicId,
      clinicName: emp.clinicName?.trim() || emp.clinicId,
      date: shift.date,
      dateLabel: format(parseISO(shift.date), 'MMM d'),
      assignedTransition: assigned,
      effectiveTransition: effective,
      shiftLabel: shiftTransitionLabel(effective),
      timing: `${shift.startTime}–${shift.endTime}`,
      startTime: shift.startTime,
      endTime: shift.endTime,
      continued,
      present,
      attendanceCredit: present ? credit : 0,
    });
  }

  return rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.staffName.localeCompare(b.staffName) ||
      a.employeeId.localeCompare(b.employeeId)
  );
}

export function summarizeShiftAttendanceReport(
  rows: ShiftAttendanceReportRow[]
): ShiftAttendanceReportSummary {
  const credited = rows.filter((r) => r.attendanceCredit > 0);
  const staffIds = new Set(credited.map((r) => r.employeeId));
  const dayToNight = credited.filter((r) => r.effectiveTransition === 'day_to_night');
  const nightToDay = credited.filter((r) => r.effectiveTransition === 'night_to_day');

  return {
    totalStaff: staffIds.size,
    dayToNightCount: dayToNight.length,
    dayToNightDays: dayToNight.reduce((sum, r) => sum + r.attendanceCredit, 0),
    nightToDayCount: nightToDay.length,
    nightToDayDays: nightToDay.reduce((sum, r) => sum + r.attendanceCredit, 0),
    totalAttendanceCredit: credited.reduce((sum, r) => sum + r.attendanceCredit, 0),
  };
}
