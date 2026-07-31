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

export const DEFAULT_DAY_SHIFT = { start: '09:00', end: '17:00' };
export const DEFAULT_NIGHT_SHIFT = { start: '21:00', end: '05:00' };

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
};

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
