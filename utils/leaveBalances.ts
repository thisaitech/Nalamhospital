import type { LeaveBalance, LeaveRequest, LeaveType } from '@/types/employee';
import { normalizeLeaveType, isCompensatoryLeaveType } from '@/utils/clinicLeave';

export function computeLeaveBalances(
  balances: LeaveBalance[],
  requests: LeaveRequest[]
): LeaveBalance[] {
  return balances.map((balance) => {
    const bucket =
      balance.type === 'paid' || balance.type === 'annual'
        ? 'paid'
        : balance.type === 'unpaid'
          ? 'unpaid'
          : balance.type;

    const matching = (status: 'approved' | 'pending') =>
      requests.filter((request) => {
        if (request.status !== status) return false;
        if (isCompensatoryLeaveType(request.type)) return false;
        const normalized = normalizeLeaveType(request.type);
        if (bucket === 'paid') return normalized === 'paid';
        if (bucket === 'unpaid') return normalized === 'unpaid';
        return request.type === balance.type;
      });

    const approvedDays = matching('approved').reduce((sum, request) => sum + request.days, 0);
    const pendingDays = matching('pending').reduce((sum, request) => sum + request.days, 0);
    const used = approvedDays;

    if (balance.type === 'unpaid') {
      return { ...balance, used, remaining: 0 };
    }

    const remaining = Math.max(0, balance.total - used - pendingDays);
    return { ...balance, used, remaining };
  });
}

export function getAvailableLeaveDays(
  balances: LeaveBalance[],
  requests: LeaveRequest[],
  type: LeaveType
): number {
  const computed = computeLeaveBalances(balances, requests);
  const normalized = normalizeLeaveType(type);
  if (normalized === 'unpaid') return Number.MAX_SAFE_INTEGER;
  const paid =
    computed.find((balance) => balance.type === 'paid') ??
    computed.find((balance) => balance.type === 'annual');
  return paid?.remaining ?? 0;
}

export function getPendingLeaveDays(
  balances: LeaveBalance[],
  requests: LeaveRequest[],
  type: LeaveType
): number {
  const normalized = normalizeLeaveType(type);
  return requests
    .filter((request) => normalizeLeaveType(request.type) === normalized && request.status === 'pending')
    .reduce((sum, request) => sum + request.days, 0);
}
