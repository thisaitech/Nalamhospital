import type { LeaveRequest } from '@/types/employee';

export function isCompensatoryLeaveType(type: string): boolean {
  return type === 'compensatory';
}

export function countCompensatoryLeaveDays(
  employeeId: string,
  leaveRequests: LeaveRequest[],
  fromDate: string,
  toDate: string
): number {
  return leaveRequests
    .filter(
      (r) =>
        r.employeeId === employeeId &&
        r.status === 'approved' &&
        r.type === 'compensatory' &&
        r.startDate <= toDate &&
        r.endDate >= fromDate
    )
    .reduce((sum, r) => {
      const start = r.startDate < fromDate ? fromDate : r.startDate;
      const end = r.endDate > toDate ? toDate : r.endDate;
      const days =
        Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return sum + Math.max(0, days);
    }, 0);
}
