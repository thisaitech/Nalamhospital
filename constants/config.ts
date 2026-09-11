import type { AppUser, UserRole } from '@/types/employee';

export const APP_NAME = 'Nalam Clinic';

/** Office WiFi SSID — staff must connect to clinic WiFi. */
export const OFFICE_WIFI_SSID = 'THISAI';

/** Office LAN uses 192.168.100.x addresses (e.g. 192.168.100.15). */
export const OFFICE_IP_PREFIX = '192.168.100.';

/** Approved office WiFi SSIDs for attendance punch-in/out. */
export const ALLOWED_WIFI_SSIDS = [OFFICE_WIFI_SSID];

/** OT is payable only after this many hours past shift end. */
export const OT_GRACE_HOURS = 1;

/** Working days assumed per month for per-day rate. */
export const PAYROLL_WORKING_DAYS = 26;

/** Paid leave quota per monthly cycle. */
export const PAID_LEAVE_QUOTA = {
  doctor: 2,
  staff: 4,
} as const;

/** Clinic standard shifts: 8 AM–8 PM and 8 PM–8 AM. */
export const DEFAULT_DAY_SHIFT = { start: '08:00', end: '20:00' };
export const DEFAULT_NIGHT_SHIFT = { start: '20:00', end: '08:00' };
/** Default second session when Split Shift / Break Required is enabled. */
export const DEFAULT_SPLIT_SECOND_SHIFT = { start: '17:00', end: '22:00' };
/** 24-hour duty window (same start/end time = full day). */
export const DEFAULT_FULL_DAY_SHIFT = { start: '08:00', end: '08:00' };

/** Admin-editable Normal Day clinic timings (default 8–8). */
export const DEFAULT_NORMAL_SHIFT_TIMINGS = {
  dayStart: DEFAULT_DAY_SHIFT.start,
  dayEnd: DEFAULT_DAY_SHIFT.end,
  nightStart: DEFAULT_NIGHT_SHIFT.start,
  nightEnd: DEFAULT_NIGHT_SHIFT.end,
} as const;

/**
 * On admin-selected shift-change days:
 * - Night team works a temporary morning window: 8 PM → 1 PM
 * - Day team works a temporary night window: 1 PM → 8 AM
 */
export const SHIFT_CHANGE_DAY_TIMING = { start: '20:00', end: '13:00' };
export const SHIFT_CHANGE_NIGHT_TIMING = { start: '13:00', end: '08:00' };

export const DEFAULT_SHIFT_CHANGE_TIMINGS = {
  nightStart: SHIFT_CHANGE_DAY_TIMING.start,
  nightEnd: SHIFT_CHANGE_DAY_TIMING.end,
  dayStart: SHIFT_CHANGE_NIGHT_TIMING.start,
  dayEnd: SHIFT_CHANGE_NIGHT_TIMING.end,
} as const;

export const INITIAL_USERS: AppUser[] = [
  {
    email: 'dr.smith@clinic.com',
    password: 'password123',
    role: 'employee',
    employeeId: 'EMP001',
    name: 'Dr. Sarah Smith',
  },
  {
    email: 'nurse.patel@clinic.com',
    password: 'password123',
    role: 'employee',
    employeeId: 'EMP002',
    name: 'Priya Patel',
  },
  {
    email: 'admin1@clinic.com',
    password: 'admin123',
    role: 'admin',
    name: 'Admin One',
  },
  {
    email: 'admin2@clinic.com',
    password: 'admin123',
    role: 'admin',
    name: 'Admin Two',
  },
];

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  paid: 'Paid Leave',
  unpaid: 'Unpaid Leave',
  annual: 'Paid Leave',
  sick: 'Sick Leave',
  personal: 'Personal Leave',
  compensatory: 'Compensatory Leave',
};

/** Minimum hours on the continued segment before earning a compensatory credit. */
export const COMPENSATORY_MIN_SEGMENT_HOURS = 1;

export const DEMO_LOGINS: Record<UserRole, { email: string; password: string }> = {
  employee: { email: 'dr.smith@clinic.com', password: 'password123' },
  admin: { email: 'admin1@clinic.com', password: 'admin123' },
};

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
