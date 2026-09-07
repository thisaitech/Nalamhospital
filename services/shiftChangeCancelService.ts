import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_NORMAL_SHIFT_TIMINGS } from '@/constants/config';
import { updateEmployeePayrollFields } from '@/services/employeeRegistry';
import {
  getShiftChangeTimings,
  loadShiftsInRange,
  removeShiftAssignment,
  setShiftChangeDay,
  upsertShiftAssignment,
} from '@/services/shiftService';
import type { ShiftType } from '@/types/employee';

export const SHIFT_CHANGE_HISTORY_KEY = '@hospitalhrm/individual_shift_changes';
const MAX_HISTORY = 40;

type ShiftChoice = 'day' | 'night';

export type ShiftChangeHistoryItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  clinicId: string;
  previousShift: string;
  newShift: string;
  date: string;
  reason?: string;
  changedAt: string;
};

function parseHistoryShift(label: string): ShiftChoice | null {
  const lower = label.toLowerCase();
  if (lower.includes('night')) return 'night';
  if (lower.includes('day')) return 'day';
  return null;
}

function shiftLabel(type: ShiftChoice): string {
  return type === 'night' ? 'Night Shift' : 'Day Shift';
}

export async function loadShiftChangeHistory(): Promise<ShiftChangeHistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(SHIFT_CHANGE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ShiftChangeHistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveShiftChangeHistory(items: ShiftChangeHistoryItem[]): Promise<void> {
  await AsyncStorage.setItem(SHIFT_CHANGE_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
}

export async function findShiftChangeHistoryEntry(
  employeeId: string,
  date: string
): Promise<ShiftChangeHistoryItem | null> {
  const all = await loadShiftChangeHistory();
  return all.find((item) => item.employeeId === employeeId && item.date === date) ?? null;
}

export async function restoreRegularShiftAfterCancel(params: {
  employeeId: string;
  date: string;
  historyItem?: ShiftChangeHistoryItem | null;
}): Promise<void> {
  const item =
    params.historyItem ?? (await findShiftChangeHistoryEntry(params.employeeId, params.date));
  const previous = item ? parseHistoryShift(item.previousShift) : null;
  if (!previous) {
    throw new Error('Shift change history not found. Ask admin to cancel from Shifts.');
  }

  await updateEmployeePayrollFields(params.employeeId, {
    is24HourDuty: false,
    dayShiftEnabled: previous === 'day',
    nightShiftEnabled: previous === 'night',
    dayShiftStart: DEFAULT_NORMAL_SHIFT_TIMINGS.dayStart,
    dayShiftEnd: DEFAULT_NORMAL_SHIFT_TIMINGS.dayEnd,
    nightShiftStart: DEFAULT_NORMAL_SHIFT_TIMINGS.nightStart,
    nightShiftEnd: DEFAULT_NORMAL_SHIFT_TIMINGS.nightEnd,
  });

  const existing = (await loadShiftsInRange(params.date, params.date)).filter(
    (shift) => shift.employeeId === params.employeeId
  );
  for (const shift of existing) {
    try {
      await removeShiftAssignment(shift.id);
    } catch {
      // continue
    }
  }

  await upsertShiftAssignment({
    employeeId: params.employeeId,
    date: params.date,
    shiftType: previous,
    startTime:
      previous === 'night'
        ? DEFAULT_NORMAL_SHIFT_TIMINGS.nightStart
        : DEFAULT_NORMAL_SHIFT_TIMINGS.dayStart,
    endTime:
      previous === 'night'
        ? DEFAULT_NORMAL_SHIFT_TIMINGS.nightEnd
        : DEFAULT_NORMAL_SHIFT_TIMINGS.dayEnd,
    notes: 'Shift change cancelled — restored previous shift',
    skipNotification: true,
  });
}

export async function reapplyShiftChange(params: {
  employeeId: string;
  date: string;
  historyItem: ShiftChangeHistoryItem;
}): Promise<void> {
  const fromShift = parseHistoryShift(params.historyItem.previousShift);
  const toShift = parseHistoryShift(params.historyItem.newShift);
  if (!fromShift || !toShift) {
    throw new Error('Invalid shift change history');
  }

  const timings = await getShiftChangeTimings();
  const startTime = fromShift === 'night' ? timings.nightStart : timings.dayStart;
  const endTime = fromShift === 'night' ? timings.nightEnd : timings.dayEnd;

  const existing = (await loadShiftsInRange(params.date, params.date)).filter(
    (shift) => shift.employeeId === params.employeeId
  );
  for (const shift of existing) {
    try {
      await removeShiftAssignment(shift.id);
    } catch {
      // continue
    }
  }

  await upsertShiftAssignment({
    employeeId: params.employeeId,
    date: params.date,
    shiftType: fromShift as ShiftType,
    startTime,
    endTime,
    notes: `Changed: ${shiftLabel(fromShift)} → ${shiftLabel(toShift)}`,
    skipNotification: true,
  });

  await updateEmployeePayrollFields(params.employeeId, {
    is24HourDuty: false,
    dayShiftEnabled: toShift === 'day',
    nightShiftEnabled: toShift === 'night',
    dayShiftStart: DEFAULT_NORMAL_SHIFT_TIMINGS.dayStart,
    dayShiftEnd: DEFAULT_NORMAL_SHIFT_TIMINGS.dayEnd,
    nightShiftStart: DEFAULT_NORMAL_SHIFT_TIMINGS.nightStart,
    nightShiftEnd: DEFAULT_NORMAL_SHIFT_TIMINGS.nightEnd,
  });

  await setShiftChangeDay(params.date, true);
}

export async function removeShiftChangeHistoryEntry(id: string): Promise<void> {
  const all = await loadShiftChangeHistory();
  const item = all.find((entry) => entry.id === id);
  const next = all.filter((entry) => entry.id !== id);
  await saveShiftChangeHistory(next);
  if (item) {
    const stillChangeDayForDate = next.some((entry) => entry.date === item.date);
    if (!stillChangeDayForDate) {
      await setShiftChangeDay(item.date, false);
    }
  }
}
