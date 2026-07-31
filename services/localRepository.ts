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
import { getItem, setItem } from '@/services/storage';
import { sanitizeEmployeeAvatar } from '@/components/ui/EmployeeAvatar';
import type { ChatMessage } from '@/types/chat';
import type {
  AppUser,
  AttendanceRecord,
  Employee,
  LeaveBalance,
  LeaveRequest,
  PerformanceReview,
  SalarySlip,
  ShiftAssignment,
} from '@/types/employee';

const LOCAL_KEYS = {
  META: '@hospitalhrm/local_meta',
  USERS: '@hospitalhrm/local_users',
  EMPLOYEES: '@hospitalhrm/local_employees',
  LEAVE_BALANCES: '@hospitalhrm/local_leave_balances',
  ATTENDANCE: '@hospitalhrm/local_attendance',
  LEAVE_REQUESTS: '@hospitalhrm/local_leave_requests',
  CHAT_MESSAGES: '@hospitalhrm/local_chat_messages',
  SALARY_SLIPS: '@hospitalhrm/local_salary_slips',
  PERFORMANCE_REVIEWS: '@hospitalhrm/local_performance_reviews',
  SHIFT_ASSIGNMENTS: '@hospitalhrm/local_shift_assignments',
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
    dayShiftEnabled: raw.dayShiftEnabled ?? true,
    nightShiftEnabled: raw.nightShiftEnabled ?? false,
    dayShiftStart: raw.dayShiftStart ?? '09:00',
    dayShiftEnd: raw.dayShiftEnd ?? '17:00',
    nightShiftStart: raw.nightShiftStart ?? '21:00',
    nightShiftEnd: raw.nightShiftEnd ?? '05:00',
  };
}

function withAttendanceDefaults(raw: AttendanceRecord): AttendanceRecord {
  return {
    ...raw,
    otHours: raw.otHours ?? 0,
    scheduledHours: raw.scheduledHours ?? 0,
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
