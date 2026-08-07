import { addDays, format } from 'date-fns';

import {
  DEFAULT_DAY_SHIFT,
  DEFAULT_NIGHT_SHIFT,
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

export const MOCK_EMPLOYEES: Employee[] = [
  {
    id: '1',
    employeeId: 'EMP001',
    firstName: 'Sarah',
    lastName: 'Smith',
    email: 'dr.smith@clinic.com',
    phone: '5551234567',
    department: 'Medical',
    position: 'General Physician',
    manager: 'Admin One',
    joinDate: '2022-01-15',
    address: '12 Clinic Road, City Center',
    emergencyContact: '5559876543',
    staffCategory: 'doctor',
    baseSalary: 80000,
    busFare: 1500,
    dayShiftEnabled: true,
    nightShiftEnabled: true,
    dayShiftStart: DEFAULT_DAY_SHIFT.start,
    dayShiftEnd: DEFAULT_DAY_SHIFT.end,
    nightShiftStart: DEFAULT_NIGHT_SHIFT.start,
    nightShiftEnd: DEFAULT_NIGHT_SHIFT.end,
  },
  {
    id: '2',
    employeeId: 'EMP002',
    firstName: 'Priya',
    lastName: 'Patel',
    email: 'nurse.patel@clinic.com',
    phone: '5552345678',
    department: 'Nursing',
    position: 'Staff Nurse',
    manager: 'Admin One',
    joinDate: '2021-06-01',
    address: '45 Care Lane, City Center',
    emergencyContact: '5558765432',
    staffCategory: 'staff',
    baseSalary: 35000,
    busFare: 800,
    dayShiftEnabled: true,
    nightShiftEnabled: true,
    dayShiftStart: '08:00',
    dayShiftEnd: '20:00',
    nightShiftStart: '20:00',
    nightShiftEnd: '08:00',
  },
];

function paidBalances(category: 'doctor' | 'staff'): LeaveBalance[] {
  const paid = PAID_LEAVE_QUOTA[category];
  return [
    { type: 'paid', total: paid, used: 0, remaining: paid },
    { type: 'unpaid', total: 0, used: 0, remaining: 0 },
  ];
}

export const MOCK_LEAVE_BALANCES: Record<string, LeaveBalance[]> = {
  EMP001: [
    { type: 'paid', total: PAID_LEAVE_QUOTA.doctor, used: 1, remaining: 1 },
    { type: 'unpaid', total: 0, used: 0, remaining: 0 },
  ],
  EMP002: [
    { type: 'paid', total: PAID_LEAVE_QUOTA.staff, used: 0, remaining: PAID_LEAVE_QUOTA.staff },
    { type: 'unpaid', total: 0, used: 0, remaining: 0 },
  ],
};

export const MOCK_LEAVE_REQUESTS: LeaveRequest[] = [
  {
    id: 'lr1',
    employeeId: 'EMP001',
    type: 'paid',
    startDate: '2026-07-10',
    endDate: '2026-07-10',
    days: 1,
    reason: 'Personal appointment',
    status: 'approved',
    submittedAt: '2026-07-08T10:00:00Z',
    reviewedAt: '2026-07-08T14:30:00Z',
    reviewedBy: 'Admin One',
  },
  {
    id: 'lr2',
    employeeId: 'EMP002',
    type: 'paid',
    startDate: '2026-07-30',
    endDate: '2026-07-30',
    days: 1,
    reason: 'Family event',
    status: 'pending',
    submittedAt: '2026-07-28T09:00:00Z',
  },
];

export function buildDefaultLeaveBalances(category: 'doctor' | 'staff'): LeaveBalance[] {
  return paidBalances(category);
}

export const MOCK_PERFORMANCE: PerformanceReview[] = [];

export const MOCK_SALARY: SalarySlip[] = [
  {
    id: 'sal1',
    employeeId: 'EMP001',
    month: 'June',
    year: 2026,
    basic: 80000,
    allowances: 1500,
    deductions: 0,
    netPay: 81500,
    paymentDate: '2026-06-30',
    status: 'paid',
    attendedHours: 176,
    scheduledHours: 176,
    absentDays: 0,
    unpaidLeaveDays: 0,
    otHours: 2,
    otPay: 700,
    busFare: 1500,
    unpaidLeaveDeduction: 0,
    absentDeduction: 0,
  },
  {
    id: 'sal2',
    employeeId: 'EMP002',
    month: 'June',
    year: 2026,
    basic: 35000,
    allowances: 800,
    deductions: 1346,
    netPay: 34454,
    paymentDate: '2026-06-30',
    status: 'paid',
    attendedHours: 160,
    scheduledHours: 168,
    absentDays: 1,
    unpaidLeaveDays: 0,
    otHours: 0,
    otPay: 0,
    busFare: 800,
    unpaidLeaveDeduction: 0,
    absentDeduction: 1346,
  },
];

function todayPlus(days: number): string {
  return format(addDays(new Date(), days), 'yyyy-MM-dd');
}

export function getInitialShifts(): ShiftAssignment[] {
  const today = todayPlus(0);
  const tomorrow = todayPlus(1);
  return [
    {
      id: `shift-EMP001-${today}-day`,
      employeeId: 'EMP001',
      date: today,
      shiftType: 'day',
      startTime: DEFAULT_DAY_SHIFT.start,
      endTime: DEFAULT_DAY_SHIFT.end,
    },
    {
      id: `shift-EMP002-${today}-day`,
      employeeId: 'EMP002',
      date: today,
      shiftType: 'day',
      startTime: '08:00',
      endTime: '20:00',
    },
    {
      id: `shift-EMP001-${tomorrow}-night`,
      employeeId: 'EMP001',
      date: tomorrow,
      shiftType: 'night',
      startTime: DEFAULT_NIGHT_SHIFT.start,
      endTime: DEFAULT_NIGHT_SHIFT.end,
    },
    {
      id: `shift-EMP002-${tomorrow}-day`,
      employeeId: 'EMP002',
      date: tomorrow,
      shiftType: 'day',
      startTime: '08:00',
      endTime: '20:00',
    },
  ];
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
    status: 'absent',
    shiftType: null,
  };
}

export function getInitialAttendance(): AttendanceRecord[] {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yDate = yesterday.toISOString().split('T')[0];

  return [
    {
      id: 'att-EMP001-yesterday',
      employeeId: 'EMP001',
      date: yDate,
      punchIn: '09:02:00',
      punchOut: '18:15:00',
      punchInMethod: 'wifi',
      punchOutMethod: 'wifi',
      wifiSsid: 'THISAI',
      hoursWorked: 9.2,
      otHours: 0.2,
      scheduledHours: 8,
      status: 'present',
      shiftType: 'day',
    },
    {
      id: 'att-EMP002-yesterday',
      employeeId: 'EMP002',
      date: yDate,
      punchIn: '08:05:00',
      punchOut: '16:10:00',
      punchInMethod: 'wifi',
      punchOutMethod: 'wifi',
      wifiSsid: 'THISAI',
      hoursWorked: 8.1,
      otHours: 0,
      scheduledHours: 8,
      status: 'present',
      shiftType: 'day',
    },
  ];
}
