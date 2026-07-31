import {
  loadAllShiftAssignments,
  saveShiftAssignments,
} from '@/services/firestoreRepository';
import { findEmployeeById } from '@/services/employeeRegistry';
import { getShiftTiming } from '@/utils/shiftHours';
import type { ShiftAssignment, ShiftType } from '@/types/employee';

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

  const timing = getShiftTiming(employee, input.shiftType);
  const id = `shift-${input.employeeId}-${input.date}-${input.shiftType}`;
  const assignment: ShiftAssignment = {
    id,
    employeeId: input.employeeId,
    date: input.date,
    shiftType: input.shiftType,
    startTime: timing.start,
    endTime: timing.end,
    notes: input.notes,
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
