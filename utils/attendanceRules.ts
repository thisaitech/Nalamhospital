import { timeToMinutes } from '@/utils/shiftHours';
import type { AttendanceRules, LateFineSlab } from '@/types/attendanceRules';
import { DEFAULT_ATTENDANCE_RULES, DEFAULT_LATE_FINE_SLABS } from '@/types/attendanceRules';

export function normalizeAttendanceRules(raw?: Partial<AttendanceRules> | null): AttendanceRules {
  const slabs =
    Array.isArray(raw?.lateFineSlabs) && raw!.lateFineSlabs!.length > 0
      ? raw!.lateFineSlabs!.map((s) => ({
          minMinutes: Number(s.minMinutes) || 0,
          maxMinutes: s.maxMinutes == null ? null : Number(s.maxMinutes),
          amount: Math.max(0, Number(s.amount) || 0),
        }))
      : DEFAULT_LATE_FINE_SLABS;

  return {
    dayStart: raw?.dayStart || DEFAULT_ATTENDANCE_RULES.dayStart,
    dayEnd: raw?.dayEnd || DEFAULT_ATTENDANCE_RULES.dayEnd,
    breakStart: raw?.breakStart || DEFAULT_ATTENDANCE_RULES.breakStart,
    breakEnd: raw?.breakEnd || DEFAULT_ATTENDANCE_RULES.breakEnd,
    gracePeriodMinutes:
      raw?.gracePeriodMinutes != null
        ? Math.max(0, Number(raw.gracePeriodMinutes) || 0)
        : DEFAULT_ATTENDANCE_RULES.gracePeriodMinutes,
    otStartsAfterHours:
      raw?.otStartsAfterHours != null
        ? Math.max(0, Number(raw.otStartsAfterHours) || 0)
        : DEFAULT_ATTENDANCE_RULES.otStartsAfterHours,
    otMultiplier:
      raw?.otMultiplier != null
        ? Math.max(1, Number(raw.otMultiplier) || 1.5)
        : DEFAULT_ATTENDANCE_RULES.otMultiplier,
    lateFineSlabs: slabs,
  };
}

/** Late minutes: any punch-in after scheduled shift start counts as late. */
export function calcLateMinutes(punchIn: string, shiftStart: string): number {
  const lateRaw = timeToMinutes(punchIn) - timeToMinutes(shiftStart);
  return lateRaw > 0 ? lateRaw : 0;
}

/**
 * Late minutes after optional grace.
 * Prefer {@link calcLateMinutes} for attendance status (after schedule = late).
 * Grace is mainly for fine slabs (e.g. 0–10 min → ₹0).
 */
export function calcLateMinutesWithGrace(
  punchIn: string,
  shiftStart: string,
  gracePeriodMinutes: number
): number {
  const lateRaw = calcLateMinutes(punchIn, shiftStart);
  if (lateRaw <= 0) return 0;
  return Math.max(0, lateRaw - Math.max(0, gracePeriodMinutes));
}

export function fineFromLateMinutes(
  lateMinutes: number,
  slabs: LateFineSlab[] = DEFAULT_LATE_FINE_SLABS
): number {
  if (lateMinutes <= 0) return 0;
  const sorted = [...slabs].sort((a, b) => a.minMinutes - b.minMinutes);
  for (const slab of sorted) {
    const max = slab.maxMinutes;
    if (lateMinutes >= slab.minMinutes && (max == null || lateMinutes <= max)) {
      return slab.amount;
    }
  }
  return sorted[sorted.length - 1]?.amount ?? 0;
}

/** Format decimal hours as "8h 53m". */
export function formatHoursMinutes(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0h';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatMinutesLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return formatHoursMinutes(minutes / 60);
}

export function formatRupee(amount: number): string {
  const n = Math.round(amount);
  return `₹${n.toLocaleString('en-IN')}`;
}
