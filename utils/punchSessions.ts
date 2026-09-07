import type { AttendanceRecord } from '@/types/employee';

/** One row per date — continued shifts add into the same record. */
export function getTodayAttendance(
  attendance: AttendanceRecord[],
  todayKey = new Date().toISOString().split('T')[0]
): AttendanceRecord | null {
  return attendance.find((r) => r.date === todayKey) ?? null;
}

export function isShiftOpen(record: AttendanceRecord | null | undefined): boolean {
  if (!record?.punchIn) return false;
  if (record.continuePunchIn) return true;
  return !record.punchOut;
}

/** Continue is only allowed while a shift is still open — never after a final punch-out. */
export function canContinueNextShift(
  attendance: AttendanceRecord[],
  todayKey = new Date().toISOString().split('T')[0]
): boolean {
  const today = getTodayAttendance(attendance, todayKey);
  return isShiftOpen(today);
}

/** True when today's attendance was ended with Punch Out (not mid-continue). */
export function hasPunchedOutToday(
  attendance: AttendanceRecord[],
  todayKey = new Date().toISOString().split('T')[0]
): boolean {
  const today = getTodayAttendance(attendance, todayKey);
  if (!today?.punchIn || !today.punchOut) return false;
  return !isShiftOpen(today);
}

/** Merge same-day duplicate session rows into one (hours added). */
export function mergeAttendanceByDate(records: AttendanceRecord[]): AttendanceRecord[] {
  const byDate = new Map<string, AttendanceRecord>();

  const sorted = [...records].sort((a, b) => {
    const byDateCmp = a.date.localeCompare(b.date);
    if (byDateCmp !== 0) return byDateCmp;
    return a.id.localeCompare(b.id);
  });

  for (const record of sorted) {
    const key = `${record.employeeId}:${record.date}`;
    const existing = byDate.get(key);
    if (!existing) {
      byDate.set(key, {
        ...record,
        continuePunchIn: record.continuePunchIn ?? null,
      });
      continue;
    }

    const punchIn =
      existing.punchIn && record.punchIn
        ? existing.punchIn <= record.punchIn
          ? existing.punchIn
          : record.punchIn
        : existing.punchIn ?? record.punchIn;
    const punchOut =
      existing.punchOut && record.punchOut
        ? existing.punchOut >= record.punchOut
          ? existing.punchOut
          : record.punchOut
        : existing.punchOut ?? record.punchOut;

    byDate.set(key, {
      ...existing,
      id: existing.id.includes('-s') ? record.id.replace(/-s\d+$/, '') || existing.id : existing.id,
      punchIn,
      punchOut,
      punchInMethod: existing.punchInMethod ?? record.punchInMethod,
      punchOutMethod: record.punchOutMethod ?? existing.punchOutMethod,
      wifiSsid: record.wifiSsid ?? existing.wifiSsid,
      hoursWorked: Math.round(((existing.hoursWorked || 0) + (record.hoursWorked || 0)) * 10) / 10,
      otHours: Math.round(((existing.otHours || 0) + (record.otHours || 0)) * 10) / 10,
      scheduledHours: Math.max(existing.scheduledHours || 0, record.scheduledHours || 0),
      continuePunchIn: record.continuePunchIn ?? existing.continuePunchIn ?? null,
      status:
        existing.status === 'present' || record.status === 'present'
          ? 'present'
          : existing.status === 'late' || record.status === 'late'
            ? 'late'
            : existing.status,
    });
  }

  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
}
