import {
  DEFAULT_DAY_SHIFT,
  DEFAULT_NIGHT_SHIFT,
} from '@/constants/config';
import {
  loadAllShiftAssignments,
  loadShiftChangeDates,
  loadShiftChangeTimings,
  saveShiftAssignments,
  saveShiftChangeDates,
  saveShiftChangeTimings as persistShiftChangeTimings,
} from '@/services/firestoreRepository';
import { findEmployeeById, updateEmployeePayrollFields } from '@/services/employeeRegistry';
import { getEffectiveShiftTiming } from '@/utils/shiftHours';
import type { ShiftAssignment, ShiftChangeTimings, ShiftType } from '@/types/employee';

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

  const changeTimings = isChangeDay ? await loadShiftChangeTimings() : undefined;
  const updated: ShiftAssignment[] = [];
  for (const shift of dayShifts) {
    const employee = await findEmployeeById(shift.employeeId);
    if (!employee) continue;
    const timing = getEffectiveShiftTiming(employee, shift.shiftType, isChangeDay, changeTimings);
    updated.push({
      ...shift,
      startTime: timing.start,
      endTime: timing.end,
      notes: isChangeDay ? 'Shift change day' : undefined,
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
}

export async function upsertShiftAssignment(input: {
  employeeId: string;
  date: string;
  shiftType: ShiftType;
  notes?: string;
}): Promise<ShiftAssignment> {
  const employee = await findEmployeeById(input.employeeId);
  if (!employee) throw new Error('Employee not found');

  if (input.shiftType === 'day' && !employee.dayShiftEnabled) {
    throw new Error('This person is not enabled for day shifts.');
  }
  if (input.shiftType === 'night' && !employee.nightShiftEnabled) {
    throw new Error('This person is not enabled for night shifts.');
  }

  const changeDay = await isShiftChangeDay(input.date);
  const changeTimings = changeDay ? await loadShiftChangeTimings() : undefined;
  const timing = getEffectiveShiftTiming(employee, input.shiftType, changeDay, changeTimings);
  const id = `shift-${input.employeeId}-${input.date}-${input.shiftType}`;
  const assignment: ShiftAssignment = {
    id,
    employeeId: input.employeeId,
    date: input.date,
    shiftType: input.shiftType,
    startTime: timing.start,
    endTime: timing.end,
    notes: changeDay ? 'Shift change day' : input.notes,
  };

  await saveShiftAssignments([assignment]);
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
 * After a shift-change day: night-assigned people become day workers (8–8),
 * day-assigned people become night workers (8–8).
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

  let updatedCount = 0;
  for (const shift of dayShifts) {
    if (shift.shiftType === 'night') {
      // Old night team → day shift going forward
      await updateEmployeePayrollFields(shift.employeeId, {
        dayShiftEnabled: true,
        nightShiftEnabled: false,
        dayShiftStart: DEFAULT_DAY_SHIFT.start,
        dayShiftEnd: DEFAULT_DAY_SHIFT.end,
        nightShiftStart: DEFAULT_NIGHT_SHIFT.start,
        nightShiftEnd: DEFAULT_NIGHT_SHIFT.end,
      });
    } else {
      // Old day team → night shift going forward
      await updateEmployeePayrollFields(shift.employeeId, {
        dayShiftEnabled: false,
        nightShiftEnabled: true,
        dayShiftStart: DEFAULT_DAY_SHIFT.start,
        dayShiftEnd: DEFAULT_DAY_SHIFT.end,
        nightShiftStart: DEFAULT_NIGHT_SHIFT.start,
        nightShiftEnd: DEFAULT_NIGHT_SHIFT.end,
      });
    }
    updatedCount += 1;
  }
  return updatedCount;
}
