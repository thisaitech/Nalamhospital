import { findEmployeeById, getEmployeeDisplayName, loadEmployees } from '@/services/employeeRegistry';
import { format, parseISO, subDays } from 'date-fns';
import {
  loadAllAttendance,
  loadLeaveBalancesMap,
  loadLeaveRequests,
  loadNotifications,
  saveAttendanceRecords,
  saveLeaveBalancesMap,
  saveLeaveRequests,
  saveNotifications,
} from '@/services/firestoreRepository';
import { getAttendanceRules } from '@/services/attendanceRulesService';
import { adminInsertLeave } from '@/services/employeeService';
import { loadShiftsForDate } from '@/services/shiftService';
import { normalizeLeaveType } from '@/utils/clinicLeave';
import { calcLateMinutes } from '@/utils/attendanceRules';
import {
  calcPayablePunchHours,
  calculateOtHours,
  get24HourDutyTiming,
  primaryShiftType,
  scheduledHoursFromAssignments,
} from '@/utils/shiftHours';
import type {
  AttendanceRecord,
  Employee,
  LeaveRequest,
  ShiftAssignment,
  ShiftType,
} from '@/types/employee';
import { ADMIN_NOTIFICATION_INBOX_ID, type AdminNotification } from '@/types/notification';
import {
  findShiftChangeHistoryEntry,
  reapplyShiftChange,
  removeShiftChangeHistoryEntry,
  restoreRegularShiftAfterCancel,
} from '@/services/shiftChangeCancelService';

export interface EnrichedAttendanceApproval extends AttendanceRecord {
  employeeName: string;
  department: string;
}

export async function syncLeaveBalancesForEmployee(employeeId: string): Promise<void> {
  const [map, requests] = await Promise.all([
    loadLeaveBalancesMap(),
    loadLeaveRequests(employeeId),
  ]);
  const balances = map[employeeId];
  if (!balances?.length) return;

  const synced = balances.map((balance) => {
    const bucket = balance.type === 'paid' || balance.type === 'annual' ? 'paid' : balance.type === 'unpaid' ? 'unpaid' : balance.type;
    const approvedDays = requests
      .filter((request) => {
        const normalized = normalizeLeaveType(request.type);
        if (bucket === 'paid') return normalized === 'paid' && request.status === 'approved';
        if (bucket === 'unpaid') return normalized === 'unpaid' && request.status === 'approved';
        return request.type === balance.type && request.status === 'approved';
      })
      .reduce((sum, request) => sum + request.days, 0);

    if (balance.type === 'unpaid') {
      return { ...balance, used: approvedDays, remaining: 0, total: 0 };
    }

    return {
      ...balance,
      used: approvedDays,
      remaining: Math.max(0, balance.total - approvedDays),
    };
  });

  await saveLeaveBalancesMap({ [employeeId]: synced });
}

function countDoctors(employees: Employee[]): number {
  return employees.filter((e) => e.staffCategory === 'doctor').length;
}

function countStaff(employees: Employee[]): number {
  return employees.filter((e) => e.staffCategory !== 'doctor').length;
}

export async function getAllLeaveRequests(): Promise<LeaveRequest[]> {
  return loadLeaveRequests();
}

export async function getPendingLeaveApprovals(): Promise<LeaveRequest[]> {
  const all = await getAllLeaveRequests();
  return all.filter((r) => r.status === 'pending');
}

export interface EnrichedShiftChangeCancelRequest {
  notificationId: string;
  employeeId: string;
  employeeName: string;
  relatedDate: string;
  body: string;
  title: string;
  cancelRequestedAt: string;
  previousShift?: string;
  newShift?: string;
}

export async function getPendingShiftChangeCancelRequests(): Promise<AdminNotification[]> {
  const all = await loadNotifications();
  return all.filter(
    (notification) =>
      notification.type === 'shift_change_day' &&
      !!notification.cancelRequestedAt &&
      !notification.cancelled &&
      notification.employeeId !== ADMIN_NOTIFICATION_INBOX_ID
  );
}

export async function getPendingLeaveCancelRequests(): Promise<LeaveRequest[]> {
  const all = await getAllLeaveRequests();
  return all.filter((r) => r.status === 'approved' && !!r.cancelRequestedAt);
}

/** @deprecated Use getPendingLeaveApprovals */
export async function getPendingApprovals(): Promise<LeaveRequest[]> {
  return getPendingLeaveApprovals();
}

export async function getPendingAttendanceApprovals(): Promise<AttendanceRecord[]> {
  const all = await loadAllAttendance();
  return all.filter((record) => record.manualApprovalStatus === 'pending');
}

export async function getPendingInClinicPunchApprovals(): Promise<AttendanceRecord[]> {
  const all = await loadAllAttendance();
  return all.filter(
    (record) =>
      record.locationApprovalStatus === 'pending' && record.punchInLocationStatus === 'in_clinic'
  );
}

export async function getPendingOutOfClinicPunchApprovals(): Promise<AttendanceRecord[]> {
  const all = await loadAllAttendance();
  return all.filter(
    (record) =>
      record.locationApprovalStatus === 'pending' &&
      (record.punchInLocationStatus === 'out_of_clinic' || record.punchInLocationStatus === 'unknown')
  );
}

export async function getRecentInClinicPunches(days = 7): Promise<AttendanceRecord[]> {
  const all = await loadAllAttendance();
  const cutoff = format(subDays(new Date(), days), 'yyyy-MM-dd');
  return all
    .filter(
      (record) =>
        Boolean(record.punchIn) &&
        record.punchInLocationStatus === 'in_clinic' &&
        record.locationApprovalStatus === 'approved' &&
        record.date >= cutoff
    )
    .sort((a, b) => `${b.date}${b.punchIn}`.localeCompare(`${a.date}${a.punchIn}`));
}

export async function reviewLeaveRequest(
  requestId: string,
  status: 'approved' | 'rejected',
  reviewedBy: string
): Promise<LeaveRequest> {
  const all = await getAllLeaveRequests();
  const target = all.find((r) => r.id === requestId);
  if (!target) {
    throw new Error('Leave request not found');
  }
  if (target.status !== 'pending') {
    throw new Error('Request already reviewed');
  }
  const updated: LeaveRequest = {
    ...target,
    status,
    reviewedAt: new Date().toISOString(),
    reviewedBy,
  };
  await saveLeaveRequests([updated]);
  if (status === 'approved') {
    await syncLeaveBalancesForEmployee(target.employeeId);
  }

  try {
    const { notifyEmployeeLeaveDecision } = await import('@/services/notificationService');
    const { LEAVE_TYPE_LABELS } = await import('@/constants/config');
    await notifyEmployeeLeaveDecision({
      employeeId: target.employeeId,
      requestId: target.id,
      decision: status,
      startDate: target.startDate,
      endDate: target.endDate,
      leaveTypeLabel: LEAVE_TYPE_LABELS[target.type] ?? target.type,
      reviewedBy,
    });
  } catch (error) {
    console.warn('[leave] Could not notify employee of leave decision', error);
  }

  return updated;
}

export async function reviewLeaveCancelRequest(
  requestId: string,
  approved: boolean,
  reviewedBy: string
): Promise<LeaveRequest> {
  const all = await getAllLeaveRequests();
  const target = all.find((r) => r.id === requestId);
  if (!target) {
    throw new Error('Leave request not found');
  }
  if (target.status !== 'approved' || !target.cancelRequestedAt) {
    throw new Error('No pending cancellation request for this leave');
  }

  const { LEAVE_TYPE_LABELS } = await import('@/constants/config');
  const leaveTypeLabel = LEAVE_TYPE_LABELS[target.type] ?? target.type;

  if (approved) {
    const updated: LeaveRequest = {
      ...target,
      status: 'cancelled',
      cancelRequestedAt: null,
      reviewedAt: new Date().toISOString(),
      reviewedBy,
    };
    await saveLeaveRequests([updated]);
    await syncLeaveBalancesForEmployee(target.employeeId);

    if (target.compensatoryCreditId) {
      const { restoreCompensatoryCreditForLeave } = await import('@/services/compensatoryService');
      await restoreCompensatoryCreditForLeave(
        target.employeeId,
        target.compensatoryCreditId,
        requestId
      );
    }

    try {
      const { notifyEmployeeLeaveCancelDecision } = await import('@/services/notificationService');
      await notifyEmployeeLeaveCancelDecision({
        employeeId: target.employeeId,
        requestId: target.id,
        decision: 'approved',
        startDate: target.startDate,
        endDate: target.endDate,
        leaveTypeLabel,
        reviewedBy,
      });
    } catch (error) {
      console.warn('[leave] Could not notify employee of cancel approval', error);
    }

    return updated;
  }

  const updated: LeaveRequest = {
    ...target,
    cancelRequestedAt: null,
    reviewedAt: new Date().toISOString(),
    reviewedBy,
  };
  await saveLeaveRequests([updated]);

  const today = new Date().toISOString().split('T')[0];
  if (today >= target.startDate) {
    const attendance = await loadAllAttendance();
    const existing = attendance.find(
      (r) => r.employeeId === target.employeeId && r.date === target.startDate
    );
    const absentRecord: AttendanceRecord = {
      id: existing?.id ?? `att-${target.employeeId}-${target.startDate}`,
      employeeId: target.employeeId,
      date: target.startDate,
      punchIn: null,
      punchOut: null,
      punchInMethod: null,
      punchOutMethod: null,
      wifiSsid: null,
      hoursWorked: 0,
      otHours: 0,
      scheduledHours: existing?.scheduledHours ?? 0,
      continuePunchIn: null,
      status: 'absent',
      shiftType: existing?.shiftType ?? null,
      adminNote: existing?.adminNote ?? `Absent — leave cancellation rejected (by ${reviewedBy})`,
    };
    await saveAttendanceRecords([absentRecord]);
  }

  try {
    const { notifyEmployeeLeaveCancelDecision } = await import('@/services/notificationService');
    await notifyEmployeeLeaveCancelDecision({
      employeeId: target.employeeId,
      requestId: target.id,
      decision: 'rejected',
      startDate: target.startDate,
      endDate: target.endDate,
      leaveTypeLabel,
      reviewedBy,
    });
  } catch (error) {
    console.warn('[leave] Could not notify employee of cancel rejection', error);
  }

  return updated;
}

export async function insertLeaveForEmployee(params: {
  employeeId: string;
  date: string;
  reason: string;
  reviewedBy: string;
}): Promise<LeaveRequest> {
  const request = await adminInsertLeave(params);
  await syncLeaveBalancesForEmployee(params.employeeId);
  return request;
}

function normalizePunchTime(time: string): string {
  const trimmed = time.trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) {
    const [h, m, s] = trimmed.split(':');
    return `${h.padStart(2, '0')}:${m}:${s}`;
  }
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [h, m] = trimmed.split(':');
    return `${h.padStart(2, '0')}:${m}:00`;
  }
  throw new Error('Enter punch times as HH:mm (e.g. 09:00).');
}

/**
 * Admin marks an employee present for a date when they forgot to punch.
 * Creates or updates the attendance row with approved manual times.
 */
export async function adminMarkPresent(params: {
  employeeId: string;
  date: string;
  punchIn: string;
  punchOut: string;
  reason?: string;
  reviewedBy: string;
}): Promise<AttendanceRecord> {
  const employee = await findEmployeeById(params.employeeId);
  if (!employee) throw new Error('Employee not found');

  const punchIn = normalizePunchTime(params.punchIn);
  const punchOut = normalizePunchTime(params.punchOut);

  const [all, shifts, rules] = await Promise.all([
    loadAllAttendance(),
    loadShiftsForDate(params.date),
    getAttendanceRules(),
  ]);
  let myShifts = shifts.filter((s) => s.employeeId === params.employeeId);

  // 24h doctors work continuously — no daily shift assignment required.
  if (!myShifts.length && employee.is24HourDuty) {
    const duty = get24HourDutyTiming();
    const synthetic: ShiftAssignment = {
      id: `shift-${params.employeeId}-${params.date}-24h`,
      employeeId: params.employeeId,
      date: params.date,
      shiftType: 'day',
      startTime: duty.start,
      endTime: duty.end,
      notes: '24 hour duty',
    };
    myShifts = [synthetic];
  }

  if (!myShifts.length) {
    throw new Error('This person has no shift assigned on that date. Assign a shift first.');
  }

  // Same clock time (e.g. 08:00 → 08:00) means a full 24h window for 24h doctors.
  const sameClock = punchIn.slice(0, 5) === punchOut.slice(0, 5);
  const allowsFullDay =
    !!employee.is24HourDuty ||
    myShifts.some((s) => s.startTime.slice(0, 5) === s.endTime.slice(0, 5));
  if (sameClock && !allowsFullDay) {
    throw new Error('Punch out must be different from punch in.');
  }

  const existing = all.find((r) => r.employeeId === params.employeeId && r.date === params.date);
  if (existing?.punchIn && existing.punchInMethod === 'wifi' && !existing.insertedByAdmin) {
    throw new Error('This day already has a WiFi punch. Do not overwrite it.');
  }
  if (existing?.punchIn && existing.punchOut && !existing.insertedByAdmin && existing.punchInMethod !== 'manual') {
    throw new Error('This day already has attendance recorded.');
  }

  const earliestShift = myShifts
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
  const lateMinutes = earliestShift ? calcLateMinutes(punchIn, earliestShift.startTime) : 0;
  const hoursWorked = calcPayablePunchHours(punchIn, punchOut, myShifts);
  const otHours = calculateOtHours(punchOut, myShifts, rules.otStartsAfterHours);
  const note = (params.reason ?? '').trim() || 'Forgot to punch — marked present by admin';

  const updated: AttendanceRecord = {
    id: existing?.id ?? `att-${params.employeeId}-${params.date}`,
    employeeId: params.employeeId,
    date: params.date,
    punchIn,
    punchOut,
    punchInMethod: 'manual',
    punchOutMethod: 'manual',
    wifiSsid: null,
    hoursWorked,
    otHours,
    scheduledHours: scheduledHoursFromAssignments(myShifts),
    continuePunchIn: null,
    status: lateMinutes > 0 ? 'late' : 'present',
    manualApprovalStatus: 'approved',
    shiftType: primaryShiftType(myShifts),
    lateMinutes,
    lateSeconds: lateMinutes * 60,
    insertedByAdmin: true,
    adminNote: `${note} (by ${params.reviewedBy})`,
  };
  if (existing?.penaltyAmount != null) updated.penaltyAmount = existing.penaltyAmount;
  if (existing?.fineTiming != null) updated.fineTiming = existing.fineTiming;
  if (existing?.fineMultiplier != null) updated.fineMultiplier = existing.fineMultiplier;

  await saveAttendanceRecords([updated]);
  return updated;
}

export async function reviewAttendanceApproval(
  recordId: string,
  approved: boolean,
  _reviewedBy: string
): Promise<AttendanceRecord> {
  const all = await loadAllAttendance();
  const target = all.find((record) => record.id === recordId);
  if (!target) {
    throw new Error('Attendance record not found');
  }
  if (target.manualApprovalStatus !== 'pending') {
    throw new Error('Attendance already reviewed');
  }

  const updated: AttendanceRecord = {
    ...target,
    manualApprovalStatus: approved ? 'approved' : 'rejected',
    status: approved ? 'present' : 'absent',
    punchIn: approved ? target.punchIn : null,
    punchInMethod: approved ? target.punchInMethod : null,
  };
  await saveAttendanceRecords([updated]);
  return updated;
}

export async function reviewLocationPunchApproval(
  recordId: string,
  approved: boolean,
  _reviewedBy: string
): Promise<AttendanceRecord> {
  const all = await loadAllAttendance();
  const target = all.find((record) => record.id === recordId);
  if (!target) {
    throw new Error('Attendance record not found');
  }
  if (target.locationApprovalStatus !== 'pending') {
    throw new Error('Location punch already reviewed');
  }

  if (approved) {
    const status: AttendanceRecord['status'] =
      target.manualApprovalStatus === 'pending'
        ? target.lateMinutes && target.lateMinutes > 0
          ? 'late'
          : 'present'
        : target.lateMinutes && target.lateMinutes > 0
          ? 'late'
          : 'present';
    const updated: AttendanceRecord = {
      ...target,
      locationApprovalStatus: 'approved',
      status,
    };
    await saveAttendanceRecords([updated]);
    return updated;
  }

  const updated: AttendanceRecord = {
    ...target,
    locationApprovalStatus: 'rejected',
    status: 'absent',
    punchIn: null,
    punchInMethod: null,
    punchOut: null,
    punchOutMethod: null,
    hoursWorked: 0,
    manualApprovalStatus: target.manualApprovalStatus === 'pending' ? 'rejected' : target.manualApprovalStatus,
  };
  await saveAttendanceRecords([updated]);
  return updated;
}

export async function enrichShiftChangeCancelRequest(
  notification: AdminNotification
): Promise<EnrichedShiftChangeCancelRequest> {
  const employee = await findEmployeeById(notification.employeeId);
  const history = notification.relatedDate
    ? await findShiftChangeHistoryEntry(notification.employeeId, notification.relatedDate)
    : null;
  return {
    notificationId: notification.id,
    employeeId: notification.employeeId,
    employeeName: employee ? getEmployeeDisplayName(employee) : notification.employeeId,
    relatedDate: notification.relatedDate ?? '',
    body: notification.body,
    title: notification.title,
    cancelRequestedAt: notification.cancelRequestedAt ?? '',
    previousShift: history?.previousShift,
    newShift: history?.newShift,
  };
}

export async function reviewShiftChangeCancelRequest(
  notificationId: string,
  approved: boolean,
  reviewedBy: string
): Promise<void> {
  const all = await loadNotifications();
  const target = all.find((notification) => notification.id === notificationId);
  if (
    !target ||
    target.type !== 'shift_change_day' ||
    !target.cancelRequestedAt ||
    target.cancelled
  ) {
    throw new Error('No pending shift change cancellation request');
  }

  const date = target.relatedDate;
  if (!date) {
    throw new Error('Shift change date is missing');
  }

  const historyItem = await findShiftChangeHistoryEntry(target.employeeId, date);

  if (approved) {
    if (historyItem) {
      await restoreRegularShiftAfterCancel({
        employeeId: target.employeeId,
        date,
        historyItem,
      });
    }
    const { markShiftNoticesCancelledForDate } = await import('@/services/notificationService');
    await markShiftNoticesCancelledForDate({ employeeId: target.employeeId, date });
    await saveNotifications([
      { ...target, cancelled: true, cancelRequestedAt: null, read: true },
    ]);
    if (historyItem) {
      await removeShiftChangeHistoryEntry(historyItem.id);
    }
  } else {
    if (!historyItem) {
      throw new Error('Cannot restore shift change — history missing');
    }
    await reapplyShiftChange({
      employeeId: target.employeeId,
      date,
      historyItem,
    });
    const fromShift = historyItem.previousShift.toLowerCase().includes('night') ? 'night' : 'day';
    const toShift = historyItem.newShift.toLowerCase().includes('night') ? 'night' : 'day';
    const timings = await import('@/services/shiftService').then((m) => m.getShiftChangeTimings());
    const startTime = fromShift === 'night' ? timings.nightStart : timings.dayStart;
    const endTime = fromShift === 'night' ? timings.nightEnd : timings.dayEnd;
    const dateLabel = format(parseISO(date), 'EEEE, MMM d');
    await saveNotifications([
      { ...target, cancelRequestedAt: null, read: false, cancelled: false },
    ]);
    const { notifyShiftAssigned, notifyShiftChangeDay } = await import('@/services/notificationService');
    await notifyShiftChangeDay({
      date,
      enabled: true,
      employeeIds: [target.employeeId],
      title: 'Shift change day',
      body: `Your cancellation was rejected. Shift change on ${dateLabel}: ${historyItem.previousShift} → ${historyItem.newShift} (${startTime}–${endTime}).`,
      messageId: `shift-change-rejected-${target.id}-${Date.now()}`,
    });
    await notifyShiftAssigned({
      employeeId: target.employeeId,
      date,
      shiftType: fromShift as ShiftType,
      startTime,
      endTime,
    });
  }

  try {
    const { notifyEmployeeShiftChangeCancelDecision } = await import('@/services/notificationService');
    await notifyEmployeeShiftChangeCancelDecision({
      employeeId: target.employeeId,
      notificationId: target.id,
      decision: approved ? 'approved' : 'rejected',
      date,
      reviewedBy,
    });
  } catch (error) {
    console.warn('[shifts] Could not notify shift-change cancel decision', error);
  }
}

export async function getAdminStats() {
  const [employees, pendingLeave, pendingCancel, pendingShiftCancel, pendingAttendance, pendingOutLocation] =
    await Promise.all([
      loadEmployees(),
      getPendingLeaveApprovals(),
      getPendingLeaveCancelRequests(),
      getPendingShiftChangeCancelRequests(),
      getPendingAttendanceApprovals(),
      getPendingOutOfClinicPunchApprovals(),
    ]);
  return {
    totalEmployees: employees.length,
    totalSupervisors: countDoctors(employees),
    pendingApprovals:
      pendingLeave.length +
      pendingCancel.length +
      pendingShiftCancel.length +
      pendingAttendance.length +
      pendingOutLocation.length,
    departments: countStaff(employees),
  };
}

export async function enrichLeaveRequest(request: LeaveRequest) {
  const employee = await findEmployeeById(request.employeeId);
  return {
    ...request,
    employeeName: employee ? getEmployeeDisplayName(employee) : request.employeeId,
    department: employee?.department ?? '—',
    supervisor: employee?.manager ?? '—',
    staffCategory: employee?.staffCategory ?? 'staff',
  };
}

export async function enrichAttendanceApproval(record: AttendanceRecord): Promise<EnrichedAttendanceApproval> {
  const employee = await findEmployeeById(record.employeeId);
  return {
    ...record,
    employeeName: employee ? getEmployeeDisplayName(employee) : record.employeeId,
    department: employee?.department ?? '—',
  };
}
