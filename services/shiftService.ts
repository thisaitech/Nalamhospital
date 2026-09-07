import { DEFAULT_FULL_DAY_SHIFT } from '@/constants/config';
import {
  loadAllShiftAssignments,
  loadNormalShiftTimings,
  loadShiftChangeDates,
  loadShiftChangeTimings,
  saveNormalShiftTimings as persistNormalShiftTimings,
  saveShiftAssignments,
  saveShiftChangeDates,
  saveShiftChangeTimings as persistShiftChangeTimings,
} from '@/services/firestoreRepository';
import {
  findEmployeeById,
  loadEmployees,
  updateEmployeePayrollFields,
} from '@/services/employeeRegistry';
import { get24HourDutyTiming, getEffectiveShiftTiming } from '@/utils/shiftHours';
import type {
  NormalShiftTimings,
  ShiftAssignment,
  ShiftChangeTimings,
  ShiftType,
} from '@/types/employee';

export async function getShiftChangeTimings(): Promise<ShiftChangeTimings> {
  return loadShiftChangeTimings();
}

export async function saveShiftChangeTimings(timings: ShiftChangeTimings): Promise<void> {
  await persistShiftChangeTimings(timings);
  const dates = await loadShiftChangeDates();
  for (const date of dates) {
    await refreshAssignmentTimingsForDate(date, true);
  }
}

export async function getNormalShiftTimings(): Promise<NormalShiftTimings> {
  return loadNormalShiftTimings();
}

/**
 * Keep 24h doctors on a fixed 24h window and refresh their assignments.
 * Does not change Normal day timings for other staff.
 */
export async function repair24HourDutySchedules(): Promise<number> {
  const employees = await loadEmployees();
  const dutyDoctors = employees.filter((e) => e.is24HourDuty);
  if (!dutyDoctors.length) return 0;

  const duty = get24HourDutyTiming();
  for (const employee of dutyDoctors) {
    const needsProfileFix =
      employee.dayShiftStart !== duty.start ||
      employee.dayShiftEnd !== duty.end ||
      employee.nightShiftEnabled ||
      !employee.dayShiftEnabled;
    if (needsProfileFix) {
      await updateEmployeePayrollFields(employee.employeeId, {
        dayShiftEnabled: true,
        nightShiftEnabled: false,
        dayShiftStart: duty.start,
        dayShiftEnd: duty.end,
        nightShiftStart: DEFAULT_FULL_DAY_SHIFT.start,
        nightShiftEnd: DEFAULT_FULL_DAY_SHIFT.end,
      });
    }
  }

  const changeDates = new Set(await loadShiftChangeDates());
  const all = await loadAllShiftAssignments();
  const dutyIds = new Set(dutyDoctors.map((e) => e.employeeId));
  const dates = Array.from(new Set(all.filter((s) => dutyIds.has(s.employeeId)).map((s) => s.date))).sort();
  for (const date of dates) {
    await refreshAssignmentTimingsForDate(date, changeDates.has(date));
  }
  return dutyDoctors.length;
}

export async function saveNormalShiftTimings(timings: NormalShiftTimings): Promise<void> {
  await persistNormalShiftTimings(timings);

  const employees = await loadEmployees();
  for (const employee of employees) {
    if (employee.is24HourDuty) continue;
    await updateEmployeePayrollFields(employee.employeeId, {
      dayShiftStart: timings.dayStart,
      dayShiftEnd: timings.dayEnd,
      nightShiftStart: timings.nightStart,
      nightShiftEnd: timings.nightEnd,
    });
  }

  const changeDates = new Set(await loadShiftChangeDates());
  const all = await loadAllShiftAssignments();
  const normalDates = Array.from(new Set(all.map((s) => s.date)))
    .filter((date) => !changeDates.has(date))
    .sort();
  for (const date of normalDates) {
    await refreshAssignmentTimingsForDate(date, false);
  }
  // Re-apply 24h windows after normal refresh so they are not left on 12h.
  await repair24HourDutySchedules();
}

export async function loadShifts(employeeId?: string): Promise<ShiftAssignment[]> {
  const all = await loadAllShiftAssignments();
  if (!employeeId) return all.sort((a, b) => a.date.localeCompare(b.date));
  return all
    .filter((s) => s.employeeId === employeeId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function loadShiftsForDate(date: string): Promise<ShiftAssignment[]> {
  const all = await loadAllShiftAssignments();
  return all.filter((s) => s.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export async function loadShiftsInRange(
  fromDate: string,
  toDate: string,
  employeeId?: string
): Promise<ShiftAssignment[]> {
  const all = await loadAllShiftAssignments();
  return all
    .filter(
      (s) =>
        s.date >= fromDate &&
        s.date <= toDate &&
        (!employeeId || s.employeeId === employeeId)
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

export async function isShiftChangeDay(date: string): Promise<boolean> {
  const dates = await loadShiftChangeDates();
  return dates.includes(date);
}

export async function getShiftChangeDates(): Promise<string[]> {
  return loadShiftChangeDates();
}

/** Refresh assignment start/end for a date after change-day flag or timings change. */
async function refreshAssignmentTimingsForDate(date: string, isChangeDay: boolean): Promise<void> {
  const dayShifts = await loadShiftsForDate(date);
  if (!dayShifts.length) return;

  const [changeTimings, normalTimings] = await Promise.all([
    isChangeDay ? loadShiftChangeTimings() : Promise.resolve(undefined),
    isChangeDay ? Promise.resolve(undefined) : loadNormalShiftTimings(),
  ]);
  const updated: ShiftAssignment[] = [];
  for (const shift of dayShifts) {
    const employee = await findEmployeeById(shift.employeeId);
    if (!employee) continue;
    const timing = getEffectiveShiftTiming(
      employee,
      shift.shiftType,
      isChangeDay,
      changeTimings,
      normalTimings
    );
    updated.push({
      ...shift,
      shiftType: employee.is24HourDuty ? 'day' : shift.shiftType,
      startTime: timing.start,
      endTime: timing.end,
      notes: employee.is24HourDuty
        ? '24 hour duty'
        : isChangeDay
          ? 'Shift change day'
          : undefined,
    });
  }
  if (updated.length) await saveShiftAssignments(updated);
}

export async function setShiftChangeDay(date: string, enabled: boolean): Promise<void> {
  const dates = await loadShiftChangeDates();
  const next = enabled
    ? Array.from(new Set([...dates, date])).sort()
    : dates.filter((d) => d !== date);
  await saveShiftChangeDates(next);
  await refreshAssignmentTimingsForDate(date, enabled);
  // Notifications are sent by the admin Assign / Change flows for the affected staff only.
}

export async function upsertShiftAssignment(input: {
  employeeId: string;
  date: string;
  shiftType: ShiftType;
  notes?: string;
  /** Optional per-person override (skips clinic default timings). */
  startTime?: string;
  endTime?: string;
  force24Hour?: boolean;
  /** Skip staff "Shift assigned" notification (internal restore/reapply flows). */
  skipNotification?: boolean;
}): Promise<ShiftAssignment> {
  let employee = await findEmployeeById(input.employeeId);
  if (!employee) throw new Error('Employee not found');

  const as24h = Boolean(input.force24Hour || employee.is24HourDuty);
  if (as24h) {
    const duty = get24HourDutyTiming();
    await updateEmployeePayrollFields(employee.employeeId, {
      is24HourDuty: true,
      dayShiftEnabled: true,
      nightShiftEnabled: false,
      dayShiftStart: duty.start,
      dayShiftEnd: duty.end,
      nightShiftStart: duty.start,
      nightShiftEnd: duty.end,
    });
    employee = (await findEmployeeById(input.employeeId)) ?? employee;
  }

  const shiftType: ShiftType = as24h ? 'day' : input.shiftType;

  if (shiftType === 'day' && !employee.dayShiftEnabled && !as24h) {
    throw new Error('This person is not enabled for day shifts.');
  }
  if (shiftType === 'night' && (!employee.nightShiftEnabled || as24h)) {
    throw new Error('This person is not enabled for night shifts.');
  }

  const changeDay = await isShiftChangeDay(input.date);
  const [changeTimings, normalTimings] = await Promise.all([
    changeDay ? loadShiftChangeTimings() : Promise.resolve(undefined),
    changeDay ? Promise.resolve(undefined) : loadNormalShiftTimings(),
  ]);
  const computed = getEffectiveShiftTiming(
    employee,
    shiftType,
    changeDay,
    changeTimings,
    normalTimings
  );
  const timing =
    input.startTime && input.endTime
      ? { start: input.startTime, end: input.endTime }
      : as24h
        ? get24HourDutyTiming()
        : computed;

  const id = `shift-${input.employeeId}-${input.date}-${shiftType}`;
  const assignment: ShiftAssignment = {
    id,
    employeeId: input.employeeId,
    date: input.date,
    shiftType,
    startTime: timing.start,
    endTime: timing.end,
    notes: as24h
      ? '24 hour duty'
      : input.notes ?? (changeDay ? 'Shift change day' : undefined),
  };

  await saveShiftAssignments([assignment]);
  if (!as24h && !input.skipNotification) {
    try {
      const { notifyShiftAssigned } = await import('@/services/notificationService');
      await notifyShiftAssigned({
        employeeId: assignment.employeeId,
        date: assignment.date,
        shiftType: assignment.shiftType,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
      });
    } catch (error) {
      console.warn('[shifts] Could not send shift notification', error);
    }
  }
  return assignment;
}

export async function removeShiftAssignment(id: string): Promise<void> {
  const { deleteShiftAssignment } = await import('@/services/firestoreRepository');
  await deleteShiftAssignment(id);
}

export async function getUpcomingShifts(employeeId: string, days = 14): Promise<ShiftAssignment[]> {
  const today = new Date().toISOString().split('T')[0];
  const end = new Date();
  end.setDate(end.getDate() + days);
  const toDate = end.toISOString().split('T')[0];
  return loadShiftsInRange(today, toDate, employeeId);
}

/**
 * After a shift-change day: night-assigned people become day workers,
 * day-assigned people become night workers (using clinic normal timings).
 */
export async function swapRolesAfterChangeDay(date: string): Promise<number> {
  const changeDay = await isShiftChangeDay(date);
  if (!changeDay) {
    throw new Error('Mark this date as a shift change day first.');
  }

  const dayShifts = await loadShiftsForDate(date);
  if (!dayShifts.length) {
    throw new Error('Assign people on this change day before swapping roles.');
  }

  const normalTimings = await loadNormalShiftTimings();
  let updatedCount = 0;
  for (const shift of dayShifts) {
    const emp = await findEmployeeById(shift.employeeId);
    if (emp?.is24HourDuty) continue;
    if (shift.shiftType === 'night') {
      await updateEmployeePayrollFields(shift.employeeId, {
        dayShiftEnabled: true,
        nightShiftEnabled: false,
        dayShiftStart: normalTimings.dayStart,
        dayShiftEnd: normalTimings.dayEnd,
        nightShiftStart: normalTimings.nightStart,
        nightShiftEnd: normalTimings.nightEnd,
      });
    } else {
      await updateEmployeePayrollFields(shift.employeeId, {
        dayShiftEnabled: false,
        nightShiftEnabled: true,
        dayShiftStart: normalTimings.dayStart,
        dayShiftEnd: normalTimings.dayEnd,
        nightShiftStart: normalTimings.nightStart,
        nightShiftEnd: normalTimings.nightEnd,
      });
    }
    updatedCount += 1;
  }
  return updatedCount;
}
