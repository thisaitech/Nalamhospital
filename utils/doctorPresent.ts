import type { AttendanceRecord, Employee } from '@/types/employee';
import { timeToMinutes } from '@/utils/shiftHours';

/** Admin Start/End on 24h duty profile = present-marking window. */
export function get24HourPresentWindow(employee: Employee): { start: string; end: string } {
  const start = (employee.dayShiftStart || '08:00').slice(0, 5);
  let end = (employee.dayShiftEnd || start).slice(0, 5);
  // Same-clock duty (e.g. 08:00–08:00) → default 2-hour present window from start.
  if (end === start) {
    const endMin = (timeToMinutes(start) + 120) % (24 * 60);
    const hh = String(Math.floor(endMin / 60)).padStart(2, '0');
    const mm = String(endMin % 60).padStart(2, '0');
    end = `${hh}:${mm}`;
  }
  return { start, end };
}

function nowMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** True when current clock is inside the present window (same calendar day, no overnight window). */
export function isInsidePresentWindow(
  employee: Employee,
  now: Date = new Date()
): boolean {
  const { start, end } = get24HourPresentWindow(employee);
  const n = nowMinutes(now);
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (e > s) return n >= s && n <= e;
  // Overnight window (rare): e.g. 22:00–02:00
  return n >= s || n <= e;
}

export function hasMissedPresentWindow(
  employee: Employee,
  now: Date = new Date()
): boolean {
  const { start, end } = get24HourPresentWindow(employee);
  const n = nowMinutes(now);
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (e > s) return n > e;
  // Overnight: missed only after end, before start of next cycle
  return n > e && n < s;
}

export function is24HourDoctorPresentMarked(today: AttendanceRecord | null | undefined): boolean {
  if (!today?.punchIn) return false;
  return today.status === 'present' || today.status === 'late' || Boolean(today.punchOut);
}

/**
 * Home Present button visibility for 24h doctors only.
 * - available: inside window, not marked → show button
 * - marked: already present → hide punch UI, show done state
 * - missed: past window, not marked → show button; tap alerts admin contact
 * - before: before window → button invisible
 * - none: not a 24h doctor
 */
export type DoctorPresentUi =
  | { mode: 'none' }
  | { mode: 'available'; start: string; end: string }
  | { mode: 'marked'; start: string; end: string }
  | { mode: 'missed'; start: string; end: string }
  | { mode: 'before'; start: string; end: string };

export function getDoctorPresentUi(params: {
  employee: Employee | null | undefined;
  today: AttendanceRecord | null | undefined;
  now?: Date;
}): DoctorPresentUi {
  const { employee, today, now = new Date() } = params;
  if (!employee?.is24HourDuty) return { mode: 'none' };

  const window = get24HourPresentWindow(employee);
  if (is24HourDoctorPresentMarked(today)) {
    return { mode: 'marked', ...window };
  }
  if (isInsidePresentWindow(employee, now)) {
    return { mode: 'available', ...window };
  }
  if (hasMissedPresentWindow(employee, now)) {
    return { mode: 'missed', ...window };
  }
  return { mode: 'before', ...window };
}
