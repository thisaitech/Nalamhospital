import { format, parseISO } from 'date-fns';

import type {
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  PersonOnLeave,
  StaffCategory,
} from '@/types/employee';
import { findEmployeeById, getEmployeeDisplayName } from '@/services/employeeRegistry';
import { PAID_LEAVE_QUOTA } from '@/constants/config';

/** Normalize legacy leave types to paid/unpaid buckets (excludes compensatory). */
export function normalizeLeaveType(type: LeaveType): 'paid' | 'unpaid' {
  if (type === 'unpaid' || type === 'personal') return 'unpaid';
  return 'paid';
}

export function isCompensatoryLeaveType(type: LeaveType): boolean {
  return type === 'compensatory';
}

export function getPaidBalance(balances: LeaveBalance[]): LeaveBalance | undefined {
  return (
    balances.find((b) => b.type === 'paid') ??
    balances.find((b) => b.type === 'annual')
  );
}

export function getUnpaidUsed(balances: LeaveBalance[], requests: LeaveRequest[]): number {
  const unpaidApproved = requests
    .filter((r) => normalizeLeaveType(r.type) === 'unpaid' && r.status === 'approved')
    .reduce((sum, r) => sum + r.days, 0);
  return unpaidApproved;
}

/**
 * Decide paid vs unpaid for a new leave request of `days` based on remaining paid quota.
 * Returns the type to store (single type — if partial paid, caller should split or use unpaid for overflow).
 */
export function resolveLeaveType(
  balances: LeaveBalance[],
  requests: LeaveRequest[],
  days: number
): { type: 'paid' | 'unpaid'; paidDays: number; unpaidDays: number } {
  const paid = getPaidBalance(balances);
  const pendingPaid = requests
    .filter(
      (r) =>
        !isCompensatoryLeaveType(r.type) &&
        normalizeLeaveType(r.type) === 'paid' &&
        r.status === 'pending'
    )
    .reduce((sum, r) => sum + r.days, 0);
  const remaining = Math.max(0, (paid?.remaining ?? paid?.total ?? 0) - pendingPaid);

  if (remaining <= 0) {
    return { type: 'unpaid', paidDays: 0, unpaidDays: days };
  }
  if (days <= remaining) {
    return { type: 'paid', paidDays: days, unpaidDays: 0 };
  }
  // Prefer marking as unpaid when quota insufficient for full request (simple clinic rule)
  return { type: 'unpaid', paidDays: remaining, unpaidDays: days - remaining };
}

export function defaultBalancesForCategory(category: StaffCategory): LeaveBalance[] {
  const paid = PAID_LEAVE_QUOTA[category];
  return [
    { type: 'paid', total: paid, used: 0, remaining: paid },
    { type: 'unpaid', total: 0, used: 0, remaining: 0 },
  ];
}

export async function peopleOnLeaveForDate(
  date: string,
  requests: LeaveRequest[]
): Promise<PersonOnLeave[]> {
  const onLeave = requests.filter(
    (r) => r.status === 'approved' && date >= r.startDate && date <= r.endDate
  );

  const results: PersonOnLeave[] = [];
  for (const request of onLeave) {
    const employee = await findEmployeeById(request.employeeId);
    results.push({
      employeeId: request.employeeId,
      employeeName: employee ? getEmployeeDisplayName(employee) : request.employeeId,
      staffCategory: employee?.staffCategory ?? 'staff',
      department: employee?.department ?? '—',
      leaveType: isCompensatoryLeaveType(request.type) ? request.type : normalizeLeaveType(request.type),
      reason: request.reason,
    });
  }
  return results;
}

/** Pending or approved leave overlapping a date (for leave request picker). */
export async function peopleWithLeaveOnDate(
  date: string,
  requests: LeaveRequest[],
  excludeEmployeeId?: string
): Promise<PersonOnLeave[]> {
  const active = requests.filter(
    (r) =>
      (r.status === 'approved' || r.status === 'pending') &&
      date >= r.startDate &&
      date <= r.endDate &&
      r.employeeId !== excludeEmployeeId
  );

  const results: PersonOnLeave[] = [];
  for (const request of active) {
    const employee = await findEmployeeById(request.employeeId);
    results.push({
      employeeId: request.employeeId,
      employeeName: employee ? getEmployeeDisplayName(employee) : request.employeeId,
      staffCategory: employee?.staffCategory ?? 'staff',
      department: employee?.department ?? '—',
      leaveType: isCompensatoryLeaveType(request.type) ? request.type : normalizeLeaveType(request.type),
      reason: request.reason,
      leaveStatus: request.status === 'pending' ? 'pending' : 'approved',
    });
  }
  return results.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

/** Doctors see all leave; staff see staff leave only; admin sees all (pass isAdmin). */
export function filterVisibleLeave(
  people: PersonOnLeave[],
  viewerCategory: StaffCategory | null | undefined,
  isAdmin = false
): PersonOnLeave[] {
  if (isAdmin || viewerCategory === 'doctor') return people;
  return people.filter((person) => person.staffCategory === 'staff');
}

export function formatLeaveDayLabel(date: string): string {
  try {
    return format(parseISO(date), 'EEE, MMM d');
  } catch {
    return date;
  }
}

export type ClinicStaffLeaveItem = {
  requestId: string;
  employeeId: string;
  employeeName: string;
  position: string;
  leaveType: LeaveType;
  reason: string;
  startDate: string;
  endDate: string;
  days: number;
  status: 'pending' | 'approved';
};

function clinicStaffIds(employees: { employeeId: string; clinicId: string; staffCategory: StaffCategory; deletedAt?: string | null }[], clinicId: string) {
  return new Set(
    employees
      .filter(
        (e) =>
          e.clinicId === clinicId &&
          e.staffCategory === 'staff' &&
          !e.deletedAt
      )
      .map((e) => e.employeeId)
  );
}

/** Approved leave for clinic staff covering today (doctor view-only). */
export function getClinicStaffLeaveToday(params: {
  clinicId: string;
  today: string;
  employees: { employeeId: string; clinicId: string; staffCategory: StaffCategory; deletedAt?: string | null; firstName: string; lastName: string; position: string }[];
  requests: LeaveRequest[];
}): ClinicStaffLeaveItem[] {
  const staffIds = clinicStaffIds(params.employees, params.clinicId);
  const byId = new Map(params.employees.map((e) => [e.employeeId, e]));

  return params.requests
    .filter(
      (r) =>
        staffIds.has(r.employeeId) &&
        r.status === 'approved' &&
        params.today >= r.startDate &&
        params.today <= r.endDate
    )
    .map((r) => {
      const emp = byId.get(r.employeeId);
      return {
        requestId: r.id,
        employeeId: r.employeeId,
        employeeName: emp ? getEmployeeDisplayName(emp) : r.employeeId,
        position: emp?.position ?? '—',
        leaveType: r.type,
        reason: r.reason,
        startDate: r.startDate,
        endDate: r.endDate,
        days: r.days,
        status: 'approved' as const,
      };
    })
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

/** Pending/approved clinic staff leave starting from tomorrow through the next N days. */
export function getClinicStaffLeaveUpcoming(params: {
  clinicId: string;
  today: string;
  daysAhead?: number;
  employees: { employeeId: string; clinicId: string; staffCategory: StaffCategory; deletedAt?: string | null; firstName: string; lastName: string; position: string }[];
  requests: LeaveRequest[];
}): ClinicStaffLeaveItem[] {
  const daysAhead = params.daysAhead ?? 14;
  const end = new Date(`${params.today}T12:00:00`);
  end.setDate(end.getDate() + daysAhead);
  const rangeEnd = format(end, 'yyyy-MM-dd');
  const tomorrowDate = new Date(`${params.today}T12:00:00`);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = format(tomorrowDate, 'yyyy-MM-dd');

  const staffIds = clinicStaffIds(params.employees, params.clinicId);
  const byId = new Map(params.employees.map((e) => [e.employeeId, e]));

  return params.requests
    .filter((r) => {
      if (!staffIds.has(r.employeeId)) return false;
      if (r.status !== 'pending' && r.status !== 'approved') return false;
      // Overlaps [tomorrow, rangeEnd]
      return r.startDate <= rangeEnd && r.endDate >= tomorrow;
    })
    .map((r) => {
      const emp = byId.get(r.employeeId);
      return {
        requestId: r.id,
        employeeId: r.employeeId,
        employeeName: emp ? getEmployeeDisplayName(emp) : r.employeeId,
        position: emp?.position ?? '—',
        leaveType: r.type,
        reason: r.reason,
        startDate: r.startDate,
        endDate: r.endDate,
        days: r.days,
        status: (r.status === 'pending' ? 'pending' : 'approved') as 'pending' | 'approved',
      };
    })
    .sort((a, b) => {
      const byDate = a.startDate.localeCompare(b.startDate);
      if (byDate !== 0) return byDate;
      return a.employeeName.localeCompare(b.employeeName);
    });
}
