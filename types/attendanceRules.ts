export interface LateFineSlab {
  /** Inclusive lower bound in minutes. */
  minMinutes: number;
  /** Inclusive upper bound; null means no upper limit. */
  maxMinutes: number | null;
  amount: number;
}

/** Clinic-wide attendance / OT / late-fine rules (edited on Shifts). */
export interface AttendanceRules {
  dayStart: string;
  dayEnd: string;
  breakStart: string;
  breakEnd: string;
  gracePeriodMinutes: number;
  /** Hours after scheduled shift end before OT starts. */
  otStartsAfterHours: number;
  /** Pay multiplier for OT hours (e.g. 1.5). */
  otMultiplier: number;
  lateFineSlabs: LateFineSlab[];
}

export const DEFAULT_LATE_FINE_SLABS: LateFineSlab[] = [
  { minMinutes: 0, maxMinutes: 10, amount: 0 },
  { minMinutes: 11, maxMinutes: 20, amount: 50 },
  { minMinutes: 21, maxMinutes: 30, amount: 100 },
  { minMinutes: 31, maxMinutes: 60, amount: 150 },
  { minMinutes: 61, maxMinutes: null, amount: 200 },
];

export const DEFAULT_ATTENDANCE_RULES: AttendanceRules = {
  dayStart: '09:00',
  dayEnd: '18:00',
  breakStart: '13:00',
  breakEnd: '14:00',
  gracePeriodMinutes: 10,
  otStartsAfterHours: 1,
  otMultiplier: 1.5,
  lateFineSlabs: DEFAULT_LATE_FINE_SLABS,
};
