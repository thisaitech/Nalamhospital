import type { AttendanceRecord, ShiftAssignment, ShiftType } from '@/types/employee';
import type { AttendanceRules } from '@/types/attendanceRules';
import { DEFAULT_ATTENDANCE_RULES } from '@/types/attendanceRules';
import { calcLateMinutes } from '@/utils/attendanceRules';

export interface LatecomerRow {
  recordId: string;
  employeeId: string;
  date: string;
  shiftStart: string;
  punchIn: string;
  lateSeconds: number;
  lateMinutes: number;
  shiftType: ShiftType;
  /** Admin-entered fine (₹). Not auto-calculated. */
  penaltyAmount: number;
}

/** Parse HH:mm or HH:mm:ss into seconds from midnight. */
export function timeToSeconds(time: string): number {
  const parts = time.split(':').map((part) => parseInt(part, 10) || 0);
  const [hours, minutes, seconds = 0] = parts;
  return hours * 3600 + minutes * 60 + seconds;
}

/** Strict lateness: any punch-in after assigned shift start counts (no grace). */
export function calcLateSeconds(punchIn: string, shiftStart: string): number {
  const diff = timeToSeconds(punchIn) - timeToSeconds(shiftStart);
  return diff > 0 ? diff : 0;
}

export function formatLateDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0m';
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export function lateSeverityTone(lateSeconds: number): 'warning' | 'danger' {
  if (lateSeconds <= 30 * 60) return 'warning';
  return 'danger';
}

/** Earliest shift start per employee for the given date. */
function earliestShiftByEmployee(shifts: ShiftAssignment[]): Map<string, ShiftAssignment> {
  const byEmployee = new Map<string, ShiftAssignment>();
  for (const shift of shifts) {
    const existing = byEmployee.get(shift.employeeId);
    if (!existing || timeToSeconds(shift.startTime) < timeToSeconds(existing.startTime)) {
      byEmployee.set(shift.employeeId, shift);
    }
  }
  return byEmployee;
}

export function buildLatecomerRows(
  date: string,
  shifts: ShiftAssignment[],
  attendance: AttendanceRecord[],
  _rules: AttendanceRules = DEFAULT_ATTENDANCE_RULES
): LatecomerRow[] {
  const byEmployee = earliestShiftByEmployee(shifts);
  const rows: LatecomerRow[] = [];
  const included = new Set<string>();

  for (const [employeeId, shift] of byEmployee) {
    const record = attendance.find((r) => r.employeeId === employeeId && r.date === date);
    if (!record?.punchIn) continue;

    const lateMinutes =
      record.lateMinutes != null && record.lateMinutes > 0
        ? record.lateMinutes
        : calcLateMinutes(record.punchIn, shift.startTime);
    if (lateMinutes <= 0) continue;

    included.add(employeeId);
    const lateSeconds = lateMinutes * 60;
    const penaltyAmount = Math.max(0, Number(record.penaltyAmount) || 0);

    rows.push({
      recordId: record.id,
      employeeId,
      date,
      shiftStart: shift.startTime,
      punchIn: record.punchIn,
      lateSeconds,
      lateMinutes,
      shiftType: shift.shiftType,
      penaltyAmount,
    });
  }

  // Match attendance overview: include stored late minutes even without a shift row that day.
  for (const record of attendance) {
    if (record.date !== date || !record.punchIn || included.has(record.employeeId)) continue;

    const lateMinutes =
      record.lateMinutes != null && record.lateMinutes > 0
        ? record.lateMinutes
        : record.lateSeconds != null && record.lateSeconds > 0
          ? Math.ceil(record.lateSeconds / 60)
          : 0;
    if (lateMinutes <= 0) continue;

    rows.push({
      recordId: record.id,
      employeeId: record.employeeId,
      date,
      shiftStart: '—',
      punchIn: record.punchIn,
      lateSeconds: lateMinutes * 60,
      lateMinutes,
      shiftType: 'day',
      penaltyAmount: Math.max(0, Number(record.penaltyAmount) || 0),
    });
  }

  return rows.sort((a, b) => b.lateSeconds - a.lateSeconds);
}

export function countLateToday(rows: LatecomerRow[]): number {
  return rows.filter((row) => row.lateSeconds > 0).length;
}

export function lateSecondsByEmployee(rows: LatecomerRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.employeeId, row.lateSeconds]));
}
