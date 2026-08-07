import { format, subDays } from 'date-fns';

import { createTodayAttendance } from '@/data/mockData';
import { getLeaveBalances as getBalances, findEmployeeById } from '@/services/employeeRegistry';
import {
  loadAttendanceForEmployee,
  loadLeaveRequests,
  loadPerformanceReviews,
  loadSalarySlips,
  saveAttendanceRecords,
  saveLeaveRequests,
} from '@/services/firestoreRepository';
import { loadShiftsForDate } from '@/services/shiftService';
import { calculateLeaveDays, validateLeaveDateRange } from '@/utils/leaveValidation';
import { resolveLeaveType, peopleOnLeaveForDate, normalizeLeaveType } from '@/utils/clinicLeave';
import {
  calcPunchHours,
  calculateOtHours,
  primaryShiftType,
  scheduledHoursFromAssignments,
  shiftCrossesMidnight,
} from '@/utils/shiftHours';
import type {
  AttendanceRecord,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  PerformanceReview,
  PersonOnLeave,
  PunchMethod,
  SalarySlip,
} from '@/types/employee';

export { findEmployeeByEmail, findEmployeeById } from '@/services/employeeRegistry';

export async function getLeaveBalances(employeeId: string): Promise<LeaveBalance[]> {
  return getBalances(employeeId);
}

export async function loadAttendance(employeeId: string): Promise<AttendanceRecord[]> {
  const employeeRecords = await loadAttendanceForEmployee(employeeId);
  const today = new Date().toISOString().split('T')[0];
  const hasToday = employeeRecords.some((r) => r.date === today);
  if (!hasToday) {
    const todayRecord = createTodayAttendance(employeeId);
    await saveAttendanceRecords([todayRecord]);
    employeeRecords.unshift(todayRecord);
  }
  return employeeRecords.sort((a, b) => b.date.localeCompare(a.date));
}

function nowTime(): string {
  return format(new Date(), 'HH:mm:ss');
}

function assertSameDayPunchIn(recordDate: string) {
  const today = new Date().toISOString().split('T')[0];
  if (recordDate !== today) {
    throw new Error('Attendance can only be marked for today. Backdating is not allowed.');
  }
}

async function findOpenOvernightRecord(
  employeeId: string,
  records: AttendanceRecord[]
): Promise<AttendanceRecord | null> {
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const open = records.find((r) => r.date === yesterday && r.punchIn && !r.punchOut);
  if (!open) return null;

  const shifts = await loadShiftsForDate(yesterday);
  const myShifts = shifts.filter((s) => s.employeeId === employeeId);
  const overnight = myShifts.some((s) => shiftCrossesMidnight(s.startTime, s.endTime));
  return overnight ? open : null;
}

export async function punchIn(
  employeeId: string,
  method: PunchMethod,
  wifiSsid: string | null = null
): Promise<AttendanceRecord> {
  const records = await loadAttendance(employeeId);
  const openOvernight = await findOpenOvernightRecord(employeeId, records);
  if (openOvernight) {
    throw new Error('Punch out from yesterday\'s overnight shift before punching in today.');
  }

  const today = records[0];
  assertSameDayPunchIn(today.date);
  if (today.punchIn) {
    throw new Error('Already punched in today');
  }

  const shifts = await loadShiftsForDate(today.date);
  const myShifts = shifts.filter((s) => s.employeeId === employeeId);

  const updated: AttendanceRecord = {
    ...today,
    punchIn: nowTime(),
    punchInMethod: method,
    wifiSsid,
    status: method === 'wifi' ? 'present' : 'late',
    manualApprovalStatus: method === 'manual' ? 'pending' : undefined,
    scheduledHours: scheduledHoursFromAssignments(myShifts),
    shiftType: primaryShiftType(myShifts),
    otHours: 0,
  };
  await saveAttendanceRecords([updated]);
  return updated;
}

export async function punchOut(employeeId: string, method: PunchMethod): Promise<AttendanceRecord> {
  const records = await loadAttendance(employeeId);
  const today = records.find((r) => r.date === new Date().toISOString().split('T')[0]) ?? records[0];

  let target: AttendanceRecord | null = null;
  if (today.punchIn && !today.punchOut) {
    target = today;
  } else {
    target = await findOpenOvernightRecord(employeeId, records);
  }

  if (!target) {
    throw new Error('You must punch in first');
  }
  if (target.punchOut) {
    throw new Error('Already punched out');
  }
  if (!target.punchIn) {
    throw new Error('You must punch in first');
  }

  const punchOutTime = nowTime();
  const shifts = await loadShiftsForDate(target.date);
  const myShifts = shifts.filter((s) => s.employeeId === employeeId);
  const hoursWorked = calcPunchHours(target.punchIn, punchOutTime);
  const otHours = calculateOtHours(punchOutTime, myShifts);

  const updated: AttendanceRecord = {
    ...target,
    punchOut: punchOutTime,
    punchOutMethod: method,
    hoursWorked,
    otHours,
    scheduledHours: scheduledHoursFromAssignments(myShifts),
    shiftType: primaryShiftType(myShifts),
    status: 'present',
  };
  await saveAttendanceRecords([updated]);
  return updated;
}

export async function getLeaveRequests(employeeId: string): Promise<LeaveRequest[]> {
  return loadLeaveRequests(employeeId);
}

/**
 * Submit leave with date + reason. Type (paid/unpaid) is resolved automatically
 * from remaining paid leave balance.
 */
export async function submitLeaveRequest(
  employeeId: string,
  _type: LeaveType | null,
  startDate: string,
  endDate: string,
  reason: string
): Promise<LeaveRequest> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error('Please enter a reason for your leave.');
  }

  const validation = validateLeaveDateRange(startDate, endDate);
  if (!validation.valid) {
    throw new Error(validation.errors.end ?? validation.errors.start ?? 'Please enter valid dates.');
  }

  const days = calculateLeaveDays(startDate, endDate);
  const balances = await getBalances(employeeId);
  const existingRequests = await loadLeaveRequests(employeeId);
  const resolved = resolveLeaveType(balances, existingRequests, days);

  const request: LeaveRequest = {
    id: `lr-${Date.now()}`,
    employeeId,
    type: resolved.type,
    startDate,
    endDate,
    days,
    reason: trimmedReason,
    status: 'pending',
    submittedAt: new Date().toISOString(),
  };
  await saveLeaveRequests([request]);
  return request;
}

/** Admin inserts an already-approved leave day on behalf of a person. */
export async function adminInsertLeave(params: {
  employeeId: string;
  date: string;
  reason: string;
  reviewedBy: string;
}): Promise<LeaveRequest> {
  const employee = await findEmployeeById(params.employeeId);
  if (!employee) throw new Error('Person not found');

  const balances = await getBalances(params.employeeId);
  const existingRequests = await loadLeaveRequests(params.employeeId);
  const resolved = resolveLeaveType(balances, existingRequests, 1);

  const request: LeaveRequest = {
    id: `lr-admin-${Date.now()}`,
    employeeId: params.employeeId,
    type: resolved.type,
    startDate: params.date,
    endDate: params.date,
    days: 1,
    reason: params.reason.trim() || 'Inserted by admin',
    status: 'approved',
    submittedAt: new Date().toISOString(),
    reviewedAt: new Date().toISOString(),
    reviewedBy: params.reviewedBy,
    insertedByAdmin: true,
  };
  await saveLeaveRequests([request]);
  return request;
}

export async function getPeopleOnLeaveToday(date?: string): Promise<PersonOnLeave[]> {
  const day = date ?? new Date().toISOString().split('T')[0];
  const all = await loadLeaveRequests();
  return peopleOnLeaveForDate(day, all);
}

export async function getPerformanceReviews(employeeId: string): Promise<PerformanceReview[]> {
  return loadPerformanceReviews(employeeId);
}

export async function getSalarySlips(employeeId: string): Promise<SalarySlip[]> {
  return loadSalarySlips(employeeId);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    amount
  );
}

export { normalizeLeaveType };
