import type { AttendanceRecord, ShiftAssignment, ShiftType } from '@/types/employee';

export interface LatecomerRow {
  recordId: string;
  employeeId: string;
  date: string;
  shiftStart: string;
  punchIn: string;
  lateSeconds: number;
  shiftType: ShiftType;
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
  if (totalSeconds <= 0) return '0 sec';
  if (totalSeconds < 60) return `${totalSeconds} sec`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds} sec`;
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
  attendance: AttendanceRecord[]
): LatecomerRow[] {
  const byEmployee = earliestShiftByEmployee(shifts);
  const rows: LatecomerRow[] = [];

  for (const [employeeId, shift] of byEmployee) {
    const record = attendance.find((r) => r.employeeId === employeeId && r.date === date);
    if (!record?.punchIn) continue;

    const lateSeconds = calcLateSeconds(record.punchIn, shift.startTime);
    if (lateSeconds <= 0) continue;

    rows.push({
      recordId: record.id,
      employeeId,
      date,
      shiftStart: shift.startTime,
      punchIn: record.punchIn,
      lateSeconds,
      shiftType: shift.shiftType,
      penaltyAmount: record.penaltyAmount ?? 0,
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
