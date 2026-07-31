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

/** Normalize legacy leave types to paid/unpaid buckets. */
export function normalizeLeaveType(type: LeaveType): 'paid' | 'unpaid' {
  if (type === 'unpaid' || type === 'personal') return 'unpaid';
  return 'paid';
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
    .filter((r) => normalizeLeaveType(r.type) === 'paid' && r.status === 'pending')
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
      leaveType: normalizeLeaveType(request.type),
      reason: request.reason,
    });
  }
  return results;
}

export function formatLeaveDayLabel(date: string): string {
  try {
    return format(parseISO(date), 'EEE, MMM d');
  } catch {
    return date;
  }
}
