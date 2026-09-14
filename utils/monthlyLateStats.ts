import type { AttendanceRecord, ShiftAssignment } from '@/types/employee';
import { calcLateMinutes } from '@/utils/attendanceRules';

export interface MonthlyLateStats {
  lateDays: number;
  lateMinutes: number;
  scheduledDays: number;
  /** Rounded whole-number percentage of scheduled days that were late. */
  latePercentage: number;
}

function lateMinutesForRecord(
  record: AttendanceRecord,
  shifts: ShiftAssignment[]
): number {
  if (record.lateMinutes != null && record.lateMinutes > 0) {
    return record.lateMinutes;
  }
  if (record.lateSeconds != null && record.lateSeconds > 0) {
    return Math.ceil(record.lateSeconds / 60);
  }

  const dayShifts = shifts
    .filter((s) => s.employeeId === record.employeeId && s.date === record.date)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (!record.punchIn || !dayShifts[0]) return 0;
  return calcLateMinutes(record.punchIn, dayShifts[0].startTime);
}

/** Monthly lateness for admin tracking (display only — not used for auto deduction). */
export function calcMonthlyLateStats(
  employeeId: string,
  attendance: AttendanceRecord[],
  shifts: ShiftAssignment[],
  fromDate: string,
  toDate: string
): MonthlyLateStats {
  const empShifts = shifts.filter(
    (s) => s.employeeId === employeeId && s.date >= fromDate && s.date <= toDate
  );
  const scheduledDays = new Set(empShifts.map((s) => s.date)).size;

  const records = attendance.filter(
    (r) =>
      r.employeeId === employeeId &&
      r.date >= fromDate &&
      r.date <= toDate &&
      !!r.punchIn
  );

  let lateDays = 0;
  let lateMinutes = 0;

  for (const record of records) {
    const mins = lateMinutesForRecord(record, empShifts);
    if (mins <= 0) continue;

    lateDays += 1;
    lateMinutes += mins;
  }

  const latePercentage =
    scheduledDays > 0 ? Math.round((lateDays / scheduledDays) * 100) : 0;

  return {
    lateDays,
    lateMinutes,
    scheduledDays,
    latePercentage,
  };
}

/** Manual late deduction: late days × admin-entered amount per day. */
export function calcManualLateDeduction(lateDays: number, amountPerDay: number): number {
  const rate = Math.max(0, Number(amountPerDay) || 0);
  return Math.round(Math.max(0, lateDays) * rate * 100) / 100;
}
