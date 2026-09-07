import { format, parseISO } from 'date-fns';

import { COMPENSATORY_MIN_SEGMENT_HOURS } from '@/constants/config';
import {
  loadAttendanceForEmployee,
  loadCompensatoryCredits,
  loadLeaveRequests,
  saveCompensatoryCredits,
  saveLeaveRequests,
} from '@/services/firestoreRepository';
import { loadShiftsForDate } from '@/services/shiftService';
import type { CompensatoryCredit, LeaveRequest } from '@/types/employee';
import { findOverlappingLeaveRequest, validateLeaveDateRange } from '@/utils/leaveValidation';

export function countAvailableCompensatoryCredits(credits: CompensatoryCredit[]): number {
  return credits.filter((c) => c.status === 'available').length;
}

export async function getCompensatoryCredits(employeeId: string): Promise<CompensatoryCredit[]> {
  return loadCompensatoryCredits(employeeId);
}

export async function tryAwardCompensatoryCredit(params: {
  employeeId: string;
  attendanceId: string;
  earnedDate: string;
  segmentHours: number;
}): Promise<CompensatoryCredit | null> {
  if (segmentHours < COMPENSATORY_MIN_SEGMENT_HOURS) return null;

  const existing = await loadCompensatoryCredits(params.employeeId);
  if (existing.some((c) => c.earnedFromAttendanceId === params.attendanceId)) {
    return null;
  }

  const credit: CompensatoryCredit = {
    id: `comp-${params.employeeId}-${params.attendanceId}`,
    employeeId: params.employeeId,
    earnedDate: params.earnedDate,
    earnedFromAttendanceId: params.attendanceId,
    status: 'available',
    createdAt: new Date().toISOString(),
    redeemedOnDate: null,
    redeemedLeaveRequestId: null,
  };
  await saveCompensatoryCredits([credit]);
  return credit;
}

export async function submitCompensatoryLeave(
  employeeId: string,
  leaveDate: string
): Promise<LeaveRequest> {
  const validation = validateLeaveDateRange(leaveDate, leaveDate);
  if (!validation.valid) {
    throw new Error(validation.errors.end ?? validation.errors.start ?? 'Please enter a valid date.');
  }

  const [credits, requests, attendance, shifts] = await Promise.all([
    loadCompensatoryCredits(employeeId),
    loadLeaveRequests(employeeId),
    loadAttendanceForEmployee(employeeId),
    loadShiftsForDate(leaveDate),
  ]);

  const available = credits
    .filter((c) => c.status === 'available')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (available.length === 0) {
    throw new Error('No compensatory leave credits available. Complete an extra continued shift first.');
  }

  const overlapping = findOverlappingLeaveRequest(requests, leaveDate, leaveDate);
  if (overlapping) {
    throw new Error('You already have leave on this date.');
  }

  const punched = attendance.some((r) => r.date === leaveDate && r.punchIn);
  if (punched) {
    throw new Error('You have already punched in on this date.');
  }

  const scheduled = shifts.some((s) => s.employeeId === employeeId);
  if (!scheduled) {
    throw new Error('You are not scheduled on this date.');
  }

  const credit = available[0];
  const earnedLabel = format(parseISO(credit.earnedDate), 'MMM d, yyyy');
  const request: LeaveRequest = {
    id: `lr-comp-${Date.now()}`,
    employeeId,
    type: 'compensatory',
    startDate: leaveDate,
    endDate: leaveDate,
    days: 1,
    reason: `Compensatory off for extra shift on ${earnedLabel}`,
    status: 'approved',
    submittedAt: new Date().toISOString(),
    reviewedAt: new Date().toISOString(),
    reviewedBy: 'System',
    compensatoryCreditId: credit.id,
  };

  const redeemed: CompensatoryCredit = {
    ...credit,
    status: 'used',
    redeemedOnDate: leaveDate,
    redeemedLeaveRequestId: request.id,
  };

  await Promise.all([saveLeaveRequests([request]), saveCompensatoryCredits([redeemed])]);
  return request;
}

/** Restore a compensatory credit when the linked leave request is cancelled. */
export async function restoreCompensatoryCreditForLeave(
  employeeId: string,
  creditId: string,
  leaveRequestId: string
): Promise<void> {
  const credits = await loadCompensatoryCredits(employeeId);
  const credit = credits.find((c) => c.id === creditId);
  if (!credit) return;
  if (credit.redeemedLeaveRequestId && credit.redeemedLeaveRequestId !== leaveRequestId) {
    return;
  }
  await saveCompensatoryCredits([
    {
      ...credit,
      status: 'available',
      redeemedOnDate: null,
      redeemedLeaveRequestId: null,
    },
  ]);
}
