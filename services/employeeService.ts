import { format, subDays } from 'date-fns';

import { createTodayAttendance } from '@/data/mockData';
import { tryAwardCompensatoryCredit } from '@/services/compensatoryService';
import { loadClinics } from '@/services/clinicService';
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
import { getAttendanceRules } from '@/services/attendanceRulesService';
import { calculateLeaveDays, findOverlappingLeaveRequest, validateLeaveDateRange } from '@/utils/leaveValidation';
import { resolveLeaveType, peopleOnLeaveForDate, normalizeLeaveType } from '@/utils/clinicLeave';
import {
  calcPayablePunchHours,
  calculateOtHours,
  get24HourDutyTiming,
  primaryShiftType,
  scheduledHoursFromAssignments,
  shiftCrossesMidnight,
} from '@/utils/shiftHours';
import { calcLateMinutes } from '@/utils/attendanceRules';
import {
  get24HourPresentWindow,
  hasMissedPresentWindow,
  is24HourDoctorPresentMarked,
  isInsidePresentWindow,
} from '@/utils/doctorPresent';
import { mergeAttendanceByDate } from '@/utils/punchSessions';
import { assertWithinClinicGeofence, getActiveClinicGeofence, resolvePunchLocationStatus } from '@/utils/geofence';
import type { PunchGpsReading } from '@/services/locationService';
import type { Clinic } from '@/types/clinic';
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

const POOR_GPS_ACCURACY_M = 100;

function buildPunchLocationFields(
  gps: PunchGpsReading | null,
  clinicId: string | undefined,
  clinics: Clinic[]
): Pick<
  AttendanceRecord,
  | 'punchInLatitude'
  | 'punchInLongitude'
  | 'punchInAccuracyMeters'
  | 'punchInDistanceMeters'
  | 'punchInLocationStatus'
  | 'locationApprovalStatus'
> {
  if (!gps) {
    return {
      punchInLatitude: null,
      punchInLongitude: null,
      punchInAccuracyMeters: null,
      punchInDistanceMeters: null,
      punchInLocationStatus: null,
      locationApprovalStatus: null,
    };
  }

  const clinic = clinics.find((item) => item.id === clinicId);
  const fence = getActiveClinicGeofence(clinic);
  const poorAccuracy = gps.accuracyMeters != null && gps.accuracyMeters > POOR_GPS_ACCURACY_M;
  const { status, distanceMeters } = resolvePunchLocationStatus({
    userLat: gps.latitude,
    userLng: gps.longitude,
    clinicLat: fence?.lat,
    clinicLng: fence?.lng,
    radiusMeters: fence?.radiusMeters,
  });
  const finalStatus = poorAccuracy ? 'unknown' : status;
  const clinicHasGps = fence != null;

  if (!clinicHasGps) {
    return {
      punchInLatitude: gps.latitude,
      punchInLongitude: gps.longitude,
      punchInAccuracyMeters: gps.accuracyMeters,
      punchInDistanceMeters: distanceMeters,
      punchInLocationStatus: 'unknown',
      locationApprovalStatus: null,
    };
  }

  return {
    punchInLatitude: gps.latitude,
    punchInLongitude: gps.longitude,
    punchInAccuracyMeters: gps.accuracyMeters,
    punchInDistanceMeters: distanceMeters,
    punchInLocationStatus: finalStatus,
    locationApprovalStatus: finalStatus === 'in_clinic' ? 'approved' : null,
  };
}

export async function getLeaveBalances(employeeId: string): Promise<LeaveBalance[]> {
  return getBalances(employeeId);
}

export async function loadAttendance(employeeId: string): Promise<AttendanceRecord[]> {
  const employeeRecords = await loadAttendanceForEmployee(employeeId);
  const merged = mergeAttendanceByDate(employeeRecords);
  const today = new Date().toISOString().split('T')[0];
  const hasToday = merged.some((r) => r.date === today);
  if (!hasToday) {
    const todayRecord = createTodayAttendance(employeeId);
    await saveAttendanceRecords([todayRecord]);
    merged.unshift(todayRecord);
  }
  return merged.sort((a, b) => b.date.localeCompare(a.date));
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

function isOpen(record: AttendanceRecord): boolean {
  if (!record.punchIn) return false;
  if (record.continuePunchIn) return true;
  return !record.punchOut;
}

async function findOpenOvernightRecord(
  employeeId: string,
  records: AttendanceRecord[]
): Promise<AttendanceRecord | null> {
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const open = records.find((r) => r.date === yesterday && isOpen(r));
  if (!open) return null;

  const shifts = await loadShiftsForDate(yesterday);
  const myShifts = shifts.filter((s) => s.employeeId === employeeId);
  const overnight = myShifts.some((s) => shiftCrossesMidnight(s.startTime, s.endTime));
  return overnight ? open : null;
}

export async function punchIn(
  employeeId: string,
  method: PunchMethod,
  wifiSsid: string | null = null,
  gps: PunchGpsReading | null = null
): Promise<AttendanceRecord> {
  const records = await loadAttendance(employeeId);
  const openOvernight = await findOpenOvernightRecord(employeeId, records);
  if (openOvernight) {
    throw new Error('Punch out from yesterday\'s overnight shift before punching in today.');
  }

  const today = records.find((r) => r.date === new Date().toISOString().split('T')[0]) ?? records[0];
  assertSameDayPunchIn(today.date);

  const [employee, clinics] = await Promise.all([findEmployeeById(employeeId), loadClinics()]);
  const splitShiftEnabled = Boolean(employee?.splitShiftEnabled);
  const clinic = clinics.find((item) => item.id === employee?.clinicId);
  assertWithinClinicGeofence({ gps, clinic, action: 'punch in' });

  if (splitShiftEnabled && today.splitShiftOnBreak && today.punchIn) {
    const resumeAt = nowTime();
    const updated: AttendanceRecord = {
      ...today,
      continuePunchIn: resumeAt,
      splitShiftOnBreak: false,
      splitShiftBreakAt: today.splitShiftBreakAt ?? today.punchOut,
      punchInMethod: method,
      wifiSsid: wifiSsid ?? today.wifiSsid,
      manualApprovalStatus: method === 'manual' ? 'pending' : today.manualApprovalStatus,
      ...buildPunchLocationFields(gps, employee?.clinicId, clinics),
    };
    await saveAttendanceRecords([updated]);
    return updated;
  }

  if (today.punchIn && isOpen(today)) {
    throw new Error(
      splitShiftEnabled
        ? 'Already punched in — use Break / Punch Out to start your break, or Final Punch Out after the second shift.'
        : 'Already punched in — use Punch Out to finish the day.'
    );
  }
  if (today.punchIn && today.punchOut && !isOpen(today)) {
    throw new Error('You already punched out for today. Attendance is complete.');
  }

  const shifts = await loadShiftsForDate(today.date);
  const myShifts = shifts.filter((s) => s.employeeId === employeeId);
  const punchInTime = nowTime();
  const earliestShift = myShifts
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
  // Punch-in after scheduled start = late (minutes past shift start).
  const lateMinutes = earliestShift ? calcLateMinutes(punchInTime, earliestShift.startTime) : 0;

  const locationFields = buildPunchLocationFields(gps, employee?.clinicId, clinics);

  const updated: AttendanceRecord = {
    ...today,
    punchIn: punchInTime,
    punchInMethod: method,
    wifiSsid,
    punchOut: null,
    punchOutMethod: null,
    continuePunchIn: null,
    splitShiftOnBreak: false,
    splitShiftBreakAt: null,
    hoursWorked: 0,
    lateMinutes,
    lateSeconds: lateMinutes * 60,
    status: lateMinutes > 0 ? 'late' : method === 'manual' ? 'late' : 'present',
    manualApprovalStatus: method === 'manual' ? 'pending' : undefined,
    scheduledHours: scheduledHoursFromAssignments(myShifts),
    shiftType: primaryShiftType(myShifts),
    otHours: 0,
    ...locationFields,
  };
  await saveAttendanceRecords([updated]);
  return updated;
}

/**
 * 24-hour doctor only: mark Present for today inside the admin present window.
 * Completes the day (no punch-out) using the fixed 24h duty clock.
 */
export async function mark24HourDoctorPresent(employeeId: string): Promise<AttendanceRecord> {
  const employee = await findEmployeeById(employeeId);
  if (!employee?.is24HourDuty) {
    throw new Error('Present marking is only for 24-hour doctors.');
  }
  if (!isInsidePresentWindow(employee)) {
    const { start, end } = get24HourPresentWindow(employee);
    throw new Error(`Present can only be marked between ${start} and ${end}.`);
  }

  const records = await loadAttendance(employeeId);
  const todayKey = new Date().toISOString().split('T')[0];
  const today = records.find((r) => r.date === todayKey) ?? records[0];
  assertSameDayPunchIn(today.date);

  if (is24HourDoctorPresentMarked(today)) {
    throw new Error('You already marked Present for today.');
  }

  const duty = get24HourDutyTiming();
  const markedAt = nowTime();
  const shifts = await loadShiftsForDate(today.date);
  const myShifts = shifts.filter((s) => s.employeeId === employeeId);
  const hoursWorked = calcPayablePunchHours(duty.start, duty.end, myShifts);

  const updated: AttendanceRecord = {
    ...today,
    punchIn: markedAt,
    punchOut: duty.end.length === 5 ? `${duty.end}:00` : duty.end,
    punchInMethod: 'manual',
    punchOutMethod: 'manual',
    wifiSsid: null,
    continuePunchIn: null,
    hoursWorked: hoursWorked || 24,
    otHours: 0,
    scheduledHours: scheduledHoursFromAssignments(myShifts) || 24,
    lateMinutes: 0,
    lateSeconds: 0,
    status: 'present',
    manualApprovalStatus: 'approved',
    shiftType: primaryShiftType(myShifts) ?? 'day',
    adminNote: today.adminNote ?? 'Marked present by 24h doctor',
  };
  await saveAttendanceRecords([updated]);
  return updated;
}

/** If 24h doctor missed the present window and has no mark, set today to absent. */
export async function ensure24HourDoctorAbsentIfMissed(
  employeeId: string
): Promise<AttendanceRecord | null> {
  const employee = await findEmployeeById(employeeId);
  if (!employee?.is24HourDuty) return null;
  if (!hasMissedPresentWindow(employee)) return null;

  const records = await loadAttendance(employeeId);
  const todayKey = new Date().toISOString().split('T')[0];
  const today = records.find((r) => r.date === todayKey);
  if (!today) return null;
  if (is24HourDoctorPresentMarked(today)) return null;
  if (today.status === 'absent' && !today.punchIn) return today;

  const updated: AttendanceRecord = {
    ...today,
    punchIn: null,
    punchOut: null,
    punchInMethod: null,
    punchOutMethod: null,
    continuePunchIn: null,
    hoursWorked: 0,
    otHours: 0,
    lateMinutes: 0,
    lateSeconds: 0,
    status: 'absent',
    adminNote: today.adminNote ?? 'Auto-absent: missed 24h present window',
  };
  await saveAttendanceRecords([updated]);
  return updated;
}

/**
 * Move into the next shift on the SAME day record (no separate Punch Out required).
 * Works for multiple continues: closes the current open segment, saves hours, then
 * starts a new continuePunchIn window. Not allowed after a final Punch Out.
 */
export async function continueNextShift(
  employeeId: string,
  method: PunchMethod,
  wifiSsid: string | null = null
): Promise<AttendanceRecord> {
  const employee = await findEmployeeById(employeeId);
  if (employee?.splitShiftEnabled) {
    throw new Error('Split-shift employees must use Break / Punch Out and Resume Shift instead of Continue.');
  }

  const records = await loadAttendance(employeeId);
  const openOvernight = await findOpenOvernightRecord(employeeId, records);
  if (openOvernight) {
    throw new Error('Punch out from yesterday\'s overnight shift before continuing.');
  }

  const todayKey = new Date().toISOString().split('T')[0];
  const today = records.find((r) => r.date === todayKey);
  if (!today?.punchIn) {
    throw new Error('Punch in first before using Continue.');
  }
  if (!isOpen(today)) {
    throw new Error('You already punched out for today. Continue is not available.');
  }

  const shifts = await loadShiftsForDate(todayKey);
  const myShifts = shifts.filter((s) => s.employeeId === employeeId);
  const continueAt = nowTime();
  const rules = await getAttendanceRules();
  const earliestShift = myShifts
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
  const lateMinutes = earliestShift
    ? calcLateMinutes(today.punchIn, earliestShift.startTime)
    : today.lateMinutes ?? 0;

  // Already on a continued shift: close that segment, then open another.
  if (today.continuePunchIn) {
    const segmentHours = calcPayablePunchHours(today.continuePunchIn, continueAt, myShifts);
    const segmentOt = calculateOtHours(continueAt, myShifts, rules.otStartsAfterHours);
    const updated: AttendanceRecord = {
      ...today,
      punchOut: continueAt,
      punchOutMethod: method,
      continuePunchIn: continueAt,
      hoursWorked: Math.round(((today.hoursWorked || 0) + segmentHours) * 10) / 10,
      otHours: Math.round(((today.otHours || 0) + segmentOt) * 10) / 10,
      wifiSsid: wifiSsid ?? today.wifiSsid,
      lateMinutes,
      lateSeconds: lateMinutes * 60,
      status: lateMinutes > 0 ? 'late' : method === 'wifi' ? 'present' : 'late',
      manualApprovalStatus: method === 'manual' ? 'pending' : today.manualApprovalStatus,
      scheduledHours: scheduledHoursFromAssignments(myShifts) || today.scheduledHours,
      shiftType: primaryShiftType(myShifts) ?? today.shiftType,
    };
    await saveAttendanceRecords([updated]);
    await notifyContinueToAdmin(employeeId, todayKey, continueAt);
    return updated;
  }

  // Still on first shift: close that segment, then open the next on the same row.
  const hoursWorked = calcPayablePunchHours(today.punchIn, continueAt, myShifts);
  const otHours = calculateOtHours(continueAt, myShifts, rules.otStartsAfterHours);
  const updated: AttendanceRecord = {
    ...today,
    punchOut: continueAt,
    punchOutMethod: method,
    continuePunchIn: continueAt,
    hoursWorked,
    otHours,
    lateMinutes,
    lateSeconds: lateMinutes * 60,
    wifiSsid: wifiSsid ?? today.wifiSsid,
    status: lateMinutes > 0 ? 'late' : method === 'wifi' ? 'present' : 'late',
    manualApprovalStatus: method === 'manual' ? 'pending' : today.manualApprovalStatus,
    scheduledHours: scheduledHoursFromAssignments(myShifts) || today.scheduledHours,
    shiftType: primaryShiftType(myShifts) ?? today.shiftType,
  };
  await saveAttendanceRecords([updated]);
  await notifyContinueToAdmin(employeeId, todayKey, continueAt);
  return updated;
}

async function notifyContinueToAdmin(employeeId: string, date: string, continueAt: string) {
  try {
    const { notifyAdminShiftContinue } = await import('@/services/notificationService');
    await notifyAdminShiftContinue({ employeeId, date, continueAt });
  } catch (error) {
    console.warn('[attendance] Could not notify admin of continue shift', error);
  }
}

export async function punchOut(
  employeeId: string,
  method: PunchMethod,
  gps: PunchGpsReading | null = null
): Promise<AttendanceRecord> {
  const records = await loadAttendance(employeeId);
  const todayKey = new Date().toISOString().split('T')[0];
  const today = records.find((r) => r.date === todayKey) ?? records[0];
  const [employee, clinics] = await Promise.all([findEmployeeById(employeeId), loadClinics()]);
  const clinic = clinics.find((item) => item.id === employee?.clinicId);
  assertWithinClinicGeofence({ gps, clinic, action: 'punch out' });
  const splitShiftEnabled = Boolean(employee?.splitShiftEnabled);

  let target: AttendanceRecord | null = today && isOpen(today) ? today : null;
  if (!target) {
    target = await findOpenOvernightRecord(employeeId, records);
  }

  if (!target) {
    if (splitShiftEnabled && today?.splitShiftOnBreak) {
      throw new Error('You are on break — tap Punch In to resume your second shift.');
    }
    throw new Error('You must punch in first');
  }
  if (!target.punchIn) {
    throw new Error('You must punch in first');
  }

  const punchOutTime = nowTime();
  const shifts = await loadShiftsForDate(target.date);
  const myShifts = shifts.filter((s) => s.employeeId === employeeId);
  const rules = await getAttendanceRules();
  const earliestShift = myShifts
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
  const lateMinutes = earliestShift
    ? calcLateMinutes(target.punchIn, earliestShift.startTime)
    : target.lateMinutes ?? 0;
  const status: AttendanceRecord['status'] = lateMinutes > 0 ? 'late' : 'present';

  if (
    splitShiftEnabled &&
    target.date === todayKey &&
    !target.continuePunchIn &&
    !target.splitShiftOnBreak &&
    isOpen(target)
  ) {
    const segmentStart = target.punchIn;
    const segmentHours = calcPayablePunchHours(segmentStart, punchOutTime, myShifts);
    const updated: AttendanceRecord = {
      ...target,
      punchOut: punchOutTime,
      punchOutMethod: method,
      splitShiftOnBreak: true,
      splitShiftBreakAt: punchOutTime,
      continuePunchIn: null,
      hoursWorked: segmentHours,
      otHours: 0,
      lateMinutes,
      lateSeconds: lateMinutes * 60,
      status,
      wifiSsid: target.wifiSsid,
    };
    await saveAttendanceRecords([updated]);
    return updated;
  }

  if (splitShiftEnabled && target.continuePunchIn && isOpen(target)) {
    const segmentHours = calcPayablePunchHours(target.continuePunchIn, punchOutTime, myShifts);
    const segmentOt = calculateOtHours(punchOutTime, myShifts, rules.otStartsAfterHours);
    const updated: AttendanceRecord = {
      ...target,
      punchOut: punchOutTime,
      punchOutMethod: method,
      continuePunchIn: null,
      splitShiftOnBreak: false,
      hoursWorked: Math.round(((target.hoursWorked || 0) + segmentHours) * 10) / 10,
      otHours: Math.round(((target.otHours || 0) + segmentOt) * 10) / 10,
      scheduledHours: scheduledHoursFromAssignments(myShifts) || target.scheduledHours,
      shiftType: primaryShiftType(myShifts) ?? target.shiftType,
      lateMinutes,
      lateSeconds: lateMinutes * 60,
      status,
    };
    await saveAttendanceRecords([updated]);
    return updated;
  }

  // Continued shift: add this segment's hours onto the same day's totals.
  if (target.continuePunchIn) {
    const segmentHours = calcPayablePunchHours(target.continuePunchIn, punchOutTime, myShifts);
    const segmentOt = calculateOtHours(punchOutTime, myShifts, rules.otStartsAfterHours);
    const updated: AttendanceRecord = {
      ...target,
      punchOut: punchOutTime,
      punchOutMethod: method,
      continuePunchIn: null,
      hoursWorked: Math.round(((target.hoursWorked || 0) + segmentHours) * 10) / 10,
      otHours: Math.round(((target.otHours || 0) + segmentOt) * 10) / 10,
      scheduledHours: scheduledHoursFromAssignments(myShifts) || target.scheduledHours,
      shiftType: primaryShiftType(myShifts) ?? target.shiftType,
      lateMinutes,
      lateSeconds: lateMinutes * 60,
      status,
    };
    await saveAttendanceRecords([updated]);
    const credit = await tryAwardCompensatoryCredit({
      employeeId,
      attendanceId: updated.id,
      earnedDate: target.date,
      segmentHours,
    });
    if (credit) {
      try {
        const { notifyCompensatoryCreditEarned } = await import('@/services/notificationService');
        await notifyCompensatoryCreditEarned({ employeeId, earnedDate: target.date });
      } catch (error) {
        console.warn('[attendance] Could not send compensatory credit notification', error);
      }
    }
    return updated;
  }

  if (target.punchOut) {
    throw new Error('Already punched out');
  }

  const hoursWorked = calcPayablePunchHours(target.punchIn, punchOutTime, myShifts);
  // OT = time after scheduled end + 1 hour (or configured threshold).
  const otHours = calculateOtHours(punchOutTime, myShifts, rules.otStartsAfterHours);

  const updated: AttendanceRecord = {
    ...target,
    punchOut: punchOutTime,
    punchOutMethod: method,
    continuePunchIn: null,
    hoursWorked,
    otHours,
    scheduledHours: scheduledHoursFromAssignments(myShifts),
    shiftType: primaryShiftType(myShifts),
    lateMinutes,
    lateSeconds: lateMinutes * 60,
    status,
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
  const overlap = findOverlappingLeaveRequest(existingRequests, startDate, endDate);
  if (overlap) {
    throw new Error(
      overlap.startDate === overlap.endDate
        ? `You already have a leave request for ${overlap.startDate}. Only one request is allowed per day.`
        : `You already have a leave request covering ${overlap.startDate} to ${overlap.endDate}. Only one request is allowed for those dates.`
    );
  }
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
  try {
    const { notifyAdminLeaveSubmitted } = await import('@/services/notificationService');
    const { LEAVE_TYPE_LABELS } = await import('@/constants/config');
    await notifyAdminLeaveSubmitted({
      employeeId,
      requestId: request.id,
      startDate,
      endDate,
      leaveTypeLabel: LEAVE_TYPE_LABELS[request.type] ?? request.type,
    });
  } catch (error) {
    console.warn('[leave] Could not notify admin of leave request', error);
  }
  return request;
}

/** Employee cancels a pending leave, or requests cancellation of approved leave (before leave day). */
export async function cancelLeaveRequest(
  employeeId: string,
  requestId: string
): Promise<LeaveRequest> {
  const requests = await loadLeaveRequests(employeeId);
  const target = requests.find((r) => r.id === requestId);
  if (!target) {
    throw new Error('Leave request not found');
  }
  if (target.employeeId !== employeeId) {
    throw new Error('You can only cancel your own leave requests.');
  }
  if (target.status === 'cancelled') {
    throw new Error('This leave request is already cancelled.');
  }
  if (target.status === 'rejected') {
    throw new Error('Rejected leave requests cannot be cancelled.');
  }
  if (target.status !== 'pending' && target.status !== 'approved') {
    throw new Error('This leave request cannot be cancelled.');
  }

  const { LEAVE_TYPE_LABELS } = await import('@/constants/config');

  if (target.status === 'approved') {
    const today = format(new Date(), 'yyyy-MM-dd');
    if (today >= target.startDate) {
      throw new Error('Approved leave can only be cancelled before the leave day.');
    }
    if (target.cancelRequestedAt) {
      throw new Error('A cancellation request is already pending admin approval.');
    }

    const updated: LeaveRequest = {
      ...target,
      cancelRequestedAt: new Date().toISOString(),
    };
    await saveLeaveRequests([updated]);

    try {
      const { notifyAdminLeaveCancelRequested } = await import('@/services/notificationService');
      await notifyAdminLeaveCancelRequested({
        employeeId,
        requestId: target.id,
        startDate: target.startDate,
        endDate: target.endDate,
        leaveTypeLabel: LEAVE_TYPE_LABELS[target.type] ?? target.type,
      });
    } catch (error) {
      console.warn('[leave] Could not notify admin of leave cancellation request', error);
    }

    return updated;
  }

  const updated: LeaveRequest = {
    ...target,
    status: 'cancelled',
    reviewedAt: new Date().toISOString(),
    reviewedBy: 'Employee',
  };
  await saveLeaveRequests([updated]);

  if (target.compensatoryCreditId) {
    const { syncLeaveBalancesForEmployee } = await import('@/services/adminService');
    await syncLeaveBalancesForEmployee(employeeId);
  }

  if (target.compensatoryCreditId) {
    const { restoreCompensatoryCreditForLeave } = await import('@/services/compensatoryService');
    await restoreCompensatoryCreditForLeave(employeeId, target.compensatoryCreditId, requestId);
  }

  try {
    const { notifyAdminLeaveCancelled } = await import('@/services/notificationService');
    await notifyAdminLeaveCancelled({
      employeeId,
      requestId: target.id,
      startDate: target.startDate,
      endDate: target.endDate,
      leaveTypeLabel: LEAVE_TYPE_LABELS[target.type] ?? target.type,
      wasApproved: false,
    });
  } catch (error) {
    console.warn('[leave] Could not notify admin of leave cancellation', error);
  }

  return updated;
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
  const overlap = findOverlappingLeaveRequest(existingRequests, params.date, params.date);
  if (overlap) {
    throw new Error(
      `This person already has a leave request for ${params.date}. Only one request is allowed per day.`
    );
  }
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
