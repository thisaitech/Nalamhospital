import {
  PAID_LEAVE_QUOTA,
} from '@/constants/config';
import type {
  AttendanceRecord,
  Employee,
  LeaveBalance,
  LeaveRequest,
  PerformanceReview,
  SalarySlip,
  ShiftAssignment,
} from '@/types/employee';

/** No seeded employees — admins create real doctors/staff in the app. */
export const MOCK_EMPLOYEES: Employee[] = [];

function paidBalances(category: 'doctor' | 'staff'): LeaveBalance[] {
  const paid = PAID_LEAVE_QUOTA[category];
  return [
    { type: 'paid', total: paid, used: 0, remaining: paid },
    { type: 'unpaid', total: 0, used: 0, remaining: 0 },
  ];
}

export const MOCK_LEAVE_BALANCES: Record<string, LeaveBalance[]> = {};

export const MOCK_LEAVE_REQUESTS: LeaveRequest[] = [];

export function buildDefaultLeaveBalances(category: 'doctor' | 'staff'): LeaveBalance[] {
  return paidBalances(category);
}

export const MOCK_PERFORMANCE: PerformanceReview[] = [];

export const MOCK_SALARY: SalarySlip[] = [];

export function getInitialShifts(): ShiftAssignment[] {
  return [];
}

export function createTodayAttendance(employeeId: string): AttendanceRecord {
  const today = new Date().toISOString().split('T')[0];
  return {
    id: `att-${employeeId}-${today}`,
    employeeId,
    date: today,
    punchIn: null,
    punchOut: null,
    punchInMethod: null,
    punchOutMethod: null,
    wifiSsid: null,
    hoursWorked: 0,
    otHours: 0,
    scheduledHours: 0,
    continuePunchIn: null,
    status: 'absent',
    shiftType: null,
  };
}

export function getInitialAttendance(): AttendanceRecord[] {
  return [];
}
