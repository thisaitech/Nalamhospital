import { INITIAL_USERS } from '@/constants/config';
import { FIRESTORE_SEED_VERSION } from '@/constants/firestoreCollections';
import { INITIAL_TEAM_MESSAGES } from '@/data/mockChat';
import {
  MOCK_EMPLOYEES,
  MOCK_LEAVE_BALANCES,
  MOCK_LEAVE_REQUESTS,
  MOCK_SALARY,
  getInitialAttendance,
  getInitialShifts,
} from '@/data/mockData';
import { MOCK_CLINICS } from '@/data/mockClinics';
import { getItem, setItem } from '@/services/storage';
import { sanitizeEmployeeAvatar } from '@/components/ui/EmployeeAvatar';
import type { ChatMessage } from '@/types/chat';
import type { AdminNotification } from '@/types/notification';
import type {
  AppUser,
  AttendanceRecord,
  CompensatoryCredit,
  Employee,
  LeaveBalance,
  LeaveRequest,
  PerformanceReview,
  SalarySlip,
  NormalShiftTimings,
  ShiftAssignment,
  ShiftChangeTimings,
} from '@/types/employee';
import type { AttendanceRules } from '@/types/attendanceRules';
import type { Clinic } from '@/types/clinic';
import { DEFAULT_CLINIC_ID } from '@/types/clinic';

const LOCAL_KEYS = {
  META: '@hospitalhrm/local_meta',
  USERS: '@hospitalhrm/local_users',
  EMPLOYEES: '@hospitalhrm/local_employees',
  LEAVE_BALANCES: '@hospitalhrm/local_leave_balances',
  ATTENDANCE: '@hospitalhrm/local_attendance',
  LEAVE_REQUESTS: '@hospitalhrm/local_leave_requests',
  CHAT_MESSAGES: '@hospitalhrm/local_chat_messages',
  NOTIFICATIONS: '@hospitalhrm/local_notifications',
  SALARY_SLIPS: '@hospitalhrm/local_salary_slips',
  PERFORMANCE_REVIEWS: '@hospitalhrm/local_performance_reviews',
  SHIFT_ASSIGNMENTS: '@hospitalhrm/local_shift_assignments',
  SHIFT_CHANGE_DATES: '@hospitalhrm/local_shift_change_dates',
  SHIFT_CHANGE_TIMINGS: '@hospitalhrm/local_shift_change_timings',
  NORMAL_SHIFT_TIMINGS: '@hospitalhrm/local_normal_shift_timings',
  ATTENDANCE_RULES: '@hospitalhrm/local_attendance_rules',
  CLINICS: '@hospitalhrm/local_clinics',
  COMPENSATORY_CREDITS: '@hospitalhrm/local_compensatory_credits',
} as const;

async function ensureLocalSeed(): Promise<void> {
  const meta = await getItem<{ seeded?: boolean; seedVersion?: number }>(LOCAL_KEYS.META);
  if (meta?.seeded && (meta.seedVersion ?? 0) >= FIRESTORE_SEED_VERSION) {
    return;
  }

  await setItem(LOCAL_KEYS.USERS, INITIAL_USERS);
  await setItem(LOCAL_KEYS.EMPLOYEES, MOCK_EMPLOYEES);
  await setItem(LOCAL_KEYS.LEAVE_BALANCES, MOCK_LEAVE_BALANCES);
  await setItem(LOCAL_KEYS.ATTENDANCE, getInitialAttendance());
  await setItem(LOCAL_KEYS.LEAVE_REQUESTS, MOCK_LEAVE_REQUESTS);
  await setItem(LOCAL_KEYS.CHAT_MESSAGES, INITIAL_TEAM_MESSAGES);
  await setItem(LOCAL_KEYS.SALARY_SLIPS, MOCK_SALARY);
  await setItem(LOCAL_KEYS.PERFORMANCE_REVIEWS, []);
  await setItem(LOCAL_KEYS.SHIFT_ASSIGNMENTS, getInitialShifts());
  await setItem(LOCAL_KEYS.CLINICS, MOCK_CLINICS);
  await setItem(LOCAL_KEYS.META, {
    seeded: true,
    seedVersion: FIRESTORE_SEED_VERSION,
    seededAt: new Date().toISOString(),
    mode: 'local',
  });
}

function withEmployeeDefaults(raw: Employee): Employee {
  const avatar = sanitizeEmployeeAvatar(raw.avatar);
  return {
    ...raw,
    avatar: avatar === raw.avatar ? raw.avatar : avatar,
    staffCategory: raw.staffCategory ?? 'staff',
    baseSalary: raw.baseSalary ?? 30000,
    busFare: raw.busFare ?? 0,
    salaryType: raw.salaryType ?? 'monthly',
    hourlyRate: raw.hourlyRate ?? 0,
    otMultiplier: raw.otMultiplier ?? 1.5,
    dayShiftEnabled: raw.dayShiftEnabled ?? true,
    nightShiftEnabled: raw.nightShiftEnabled ?? false,
    dayShiftStart: raw.dayShiftStart ?? '08:00',
    dayShiftEnd: raw.dayShiftEnd ?? '20:00',
    nightShiftStart: raw.nightShiftStart ?? '20:00',
    nightShiftEnd: raw.nightShiftEnd ?? '08:00',
    clinicId: raw.clinicId ?? DEFAULT_CLINIC_ID,
    clinicName: raw.clinicName,
    deletedAt: raw.deletedAt ?? null,
  };
}

function withAttendanceDefaults(raw: AttendanceRecord): AttendanceRecord {
  return {
    ...raw,
    otHours: raw.otHours ?? 0,
    scheduledHours: raw.scheduledHours ?? 0,
    continuePunchIn: raw.continuePunchIn ?? null,
  };
}

export async function localEnsureSeed(): Promise<void> {
  await ensureLocalSeed();
}

export async function localCreateNewHireRecords(
  employee: Employee,
  user: AppUser,
  leaveBalances: LeaveBalance[]
): Promise<void> {
  await ensureLocalSeed();
  const employees = (await getItem<Employee[]>(LOCAL_KEYS.EMPLOYEES)) ?? [];
  const users = (await getItem<AppUser[]>(LOCAL_KEYS.USERS)) ?? [];
  const balances = (await getItem<Record<string, LeaveBalance[]>>(LOCAL_KEYS.LEAVE_BALANCES)) ?? {};

  employees.push(employee);
  users.push(user);
  balances[employee.employeeId] = leaveBalances;

  await setItem(LOCAL_KEYS.EMPLOYEES, employees);
  await setItem(LOCAL_KEYS.USERS, users);
  await setItem(LOCAL_KEYS.LEAVE_BALANCES, balances);
}

export async function localLoadUsers(): Promise<AppUser[]> {
  await ensureLocalSeed();
  return (await getItem<AppUser[]>(LOCAL_KEYS.USERS)) ?? [];
}

export async function localSaveUsers(users: AppUser[]): Promise<void> {
  await ensureLocalSeed();
  const existing = (await getItem<AppUser[]>(LOCAL_KEYS.USERS)) ?? [];
  const map = new Map(existing.map((u) => [u.email.toLowerCase(), u]));
  users.forEach((u) => map.set(u.email.toLowerCase(), u));
  await setItem(LOCAL_KEYS.USERS, Array.from(map.values()));
}

export async function localLoadEmployees(): Promise<Employee[]> {
  await ensureLocalSeed();
  const employees = (await getItem<Employee[]>(LOCAL_KEYS.EMPLOYEES)) ?? [];
  return employees.map(withEmployeeDefaults);
}

export async function localSaveEmployees(employees: Employee[]): Promise<void> {
  await ensureLocalSeed();
  const existing = (await getItem<Employee[]>(LOCAL_KEYS.EMPLOYEES)) ?? [];
  const map = new Map(existing.map((e) => [e.employeeId, e]));
  employees.forEach((e) => map.set(e.employeeId, e));
  await setItem(LOCAL_KEYS.EMPLOYEES, Array.from(map.values()));
}

export async function localLoadLeaveBalancesMap(): Promise<Record<string, LeaveBalance[]>> {
  await ensureLocalSeed();
  return (await getItem<Record<string, LeaveBalance[]>>(LOCAL_KEYS.LEAVE_BALANCES)) ?? {};
}

export async function localSaveLeaveBalancesMap(map: Record<string, LeaveBalance[]>): Promise<void> {
  await ensureLocalSeed();
  const existing = (await getItem<Record<string, LeaveBalance[]>>(LOCAL_KEYS.LEAVE_BALANCES)) ?? {};
  await setItem(LOCAL_KEYS.LEAVE_BALANCES, { ...existing, ...map });
}

export async function localLoadAllAttendance(): Promise<AttendanceRecord[]> {
  await ensureLocalSeed();
  const records = (await getItem<AttendanceRecord[]>(LOCAL_KEYS.ATTENDANCE)) ?? [];
  return records.map(withAttendanceDefaults);
}

export async function localLoadAttendanceForEmployee(employeeId: string): Promise<AttendanceRecord[]> {
  const all = await localLoadAllAttendance();
  return all.filter((r) => r.employeeId === employeeId);
}

export async function localSaveAttendanceRecords(records: AttendanceRecord[]): Promise<void> {
  await ensureLocalSeed();
  const existing = (await getItem<AttendanceRecord[]>(LOCAL_KEYS.ATTENDANCE)) ?? [];
  const map = new Map(existing.map((r) => [r.id, r]));
  records.forEach((r) => map.set(r.id, r));
  await setItem(LOCAL_KEYS.ATTENDANCE, Array.from(map.values()));
}

export async function localLoadLeaveRequests(employeeId?: string): Promise<LeaveRequest[]> {
  await ensureLocalSeed();
  const all = (await getItem<LeaveRequest[]>(LOCAL_KEYS.LEAVE_REQUESTS)) ?? [];
  const filtered = employeeId ? all.filter((r) => r.employeeId === employeeId) : all;
  return filtered.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export async function localSaveLeaveRequests(requests: LeaveRequest[]): Promise<void> {
  await ensureLocalSeed();
  const existing = (await getItem<LeaveRequest[]>(LOCAL_KEYS.LEAVE_REQUESTS)) ?? [];
  const map = new Map(existing.map((r) => [r.id, r]));
  requests.forEach((r) => map.set(r.id, r));
  await setItem(LOCAL_KEYS.LEAVE_REQUESTS, Array.from(map.values()));
}

export async function localLoadChatMessages(): Promise<ChatMessage[]> {
  await ensureLocalSeed();
  const messages = (await getItem<ChatMessage[]>(LOCAL_KEYS.CHAT_MESSAGES)) ?? [];
  return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function localSaveChatMessage(message: ChatMessage): Promise<void> {
  await ensureLocalSeed();
  const messages = (await getItem<ChatMessage[]>(LOCAL_KEYS.CHAT_MESSAGES)) ?? [];
  const idx = messages.findIndex((m) => m.id === message.id);
  if (idx >= 0) messages[idx] = message;
  else messages.push(message);
  await setItem(LOCAL_KEYS.CHAT_MESSAGES, messages);
}

export async function localLoadSalarySlips(employeeId: string): Promise<SalarySlip[]> {
  const all = await localLoadAllSalarySlips();
  return all
    .filter((s) => s.employeeId === employeeId)
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month.localeCompare(a.month);
    });
}

export async function localLoadAllSalarySlips(): Promise<SalarySlip[]> {
  await ensureLocalSeed();
  return (await getItem<SalarySlip[]>(LOCAL_KEYS.SALARY_SLIPS)) ?? [];
}

export async function localSaveSalarySlips(slips: SalarySlip[]): Promise<void> {
  await ensureLocalSeed();
  const existing = (await getItem<SalarySlip[]>(LOCAL_KEYS.SALARY_SLIPS)) ?? [];
  const map = new Map(existing.map((s) => [s.id, s]));
  slips.forEach((s) => map.set(s.id, s));
  await setItem(LOCAL_KEYS.SALARY_SLIPS, Array.from(map.values()));
}

export async function localLoadPerformanceReviews(employeeId: string): Promise<PerformanceReview[]> {
  await ensureLocalSeed();
  const all = (await getItem<PerformanceReview[]>(LOCAL_KEYS.PERFORMANCE_REVIEWS)) ?? [];
  return all.filter((r) => r.employeeId === employeeId);
}

export async function localLoadAllShiftAssignments(): Promise<ShiftAssignment[]> {
  await ensureLocalSeed();
  return (await getItem<ShiftAssignment[]>(LOCAL_KEYS.SHIFT_ASSIGNMENTS)) ?? [];
}

export async function localSaveShiftAssignments(assignments: ShiftAssignment[]): Promise<void> {
  await ensureLocalSeed();
  const existing = (await getItem<ShiftAssignment[]>(LOCAL_KEYS.SHIFT_ASSIGNMENTS)) ?? [];
  const map = new Map(existing.map((a) => [a.id, a]));
  assignments.forEach((a) => map.set(a.id, a));
  await setItem(LOCAL_KEYS.SHIFT_ASSIGNMENTS, Array.from(map.values()));
}

export async function localDeleteShiftAssignment(id: string): Promise<void> {
  await ensureLocalSeed();
  const existing = (await getItem<ShiftAssignment[]>(LOCAL_KEYS.SHIFT_ASSIGNMENTS)) ?? [];
  await setItem(
    LOCAL_KEYS.SHIFT_ASSIGNMENTS,
    existing.filter((a) => a.id !== id)
  );
}

export async function localLoadShiftChangeDates(): Promise<string[]> {
  await ensureLocalSeed();
  return (await getItem<string[]>(LOCAL_KEYS.SHIFT_CHANGE_DATES)) ?? [];
}

export async function localSaveShiftChangeDates(dates: string[]): Promise<void> {
  await ensureLocalSeed();
  const unique = Array.from(new Set(dates)).sort();
  await setItem(LOCAL_KEYS.SHIFT_CHANGE_DATES, unique);
}

export async function localLoadShiftChangeTimings(): Promise<ShiftChangeTimings | null> {
  await ensureLocalSeed();
  return (await getItem<ShiftChangeTimings>(LOCAL_KEYS.SHIFT_CHANGE_TIMINGS)) ?? null;
}

export async function localSaveShiftChangeTimings(timings: ShiftChangeTimings): Promise<void> {
  await ensureLocalSeed();
  await setItem(LOCAL_KEYS.SHIFT_CHANGE_TIMINGS, timings);
}

export async function localLoadNormalShiftTimings(): Promise<NormalShiftTimings | null> {
  await ensureLocalSeed();
  return (await getItem<NormalShiftTimings>(LOCAL_KEYS.NORMAL_SHIFT_TIMINGS)) ?? null;
}

export async function localSaveNormalShiftTimings(timings: NormalShiftTimings): Promise<void> {
  await ensureLocalSeed();
  await setItem(LOCAL_KEYS.NORMAL_SHIFT_TIMINGS, timings);
}

export async function localLoadAttendanceRules(): Promise<AttendanceRules | null> {
  await ensureLocalSeed();
  return (await getItem<AttendanceRules>(LOCAL_KEYS.ATTENDANCE_RULES)) ?? null;
}

export async function localSaveAttendanceRules(rules: AttendanceRules): Promise<void> {
  await ensureLocalSeed();
  await setItem(LOCAL_KEYS.ATTENDANCE_RULES, rules);
}

export async function localLoadNotifications(employeeId?: string): Promise<AdminNotification[]> {
  await ensureLocalSeed();
  const all = (await getItem<AdminNotification[]>(LOCAL_KEYS.NOTIFICATIONS)) ?? [];
  const filtered = employeeId ? all.filter((n) => n.employeeId === employeeId) : all;
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function localSaveNotifications(notifications: AdminNotification[]): Promise<void> {
  await ensureLocalSeed();
  const existing = (await getItem<AdminNotification[]>(LOCAL_KEYS.NOTIFICATIONS)) ?? [];
  const map = new Map(existing.map((n) => [n.id, n]));
  notifications.forEach((n) => map.set(n.id, n));
  await setItem(LOCAL_KEYS.NOTIFICATIONS, Array.from(map.values()));
}

export async function localLoadClinics(): Promise<Clinic[]> {
  await ensureLocalSeed();
  const clinics = (await getItem<Clinic[]>(LOCAL_KEYS.CLINICS)) ?? [];
  return clinics.filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name));
}

export async function localSaveClinics(clinics: Clinic[]): Promise<void> {
  await ensureLocalSeed();
  await setItem(LOCAL_KEYS.CLINICS, clinics);
}

export async function localLoadCompensatoryCredits(employeeId?: string): Promise<CompensatoryCredit[]> {
  await ensureLocalSeed();
  const all = (await getItem<CompensatoryCredit[]>(LOCAL_KEYS.COMPENSATORY_CREDITS)) ?? [];
  const filtered = employeeId ? all.filter((c) => c.employeeId === employeeId) : all;
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function localSaveCompensatoryCredits(credits: CompensatoryCredit[]): Promise<void> {
  await ensureLocalSeed();
  const existing = (await getItem<CompensatoryCredit[]>(LOCAL_KEYS.COMPENSATORY_CREDITS)) ?? [];
  const map = new Map(existing.map((c) => [c.id, c]));
  credits.forEach((c) => map.set(c.id, c));
  await setItem(LOCAL_KEYS.COMPENSATORY_CREDITS, Array.from(map.values()));
}
