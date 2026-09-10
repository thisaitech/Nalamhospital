import type { Employee } from '@/types/employee';

function timeToMinutes(value: string): number {
  const [h, m] = value.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

export function validateSplitShiftTimings(input: {
  firstStart: string;
  firstEnd: string;
  secondStart: string;
  secondEnd: string;
}): string | null {
  const firstStart = timeToMinutes(input.firstStart);
  const firstEnd = timeToMinutes(input.firstEnd);
  const secondStart = timeToMinutes(input.secondStart);
  const secondEnd = timeToMinutes(input.secondEnd);

  if (firstStart >= firstEnd) {
    return 'First shift end must be after first shift start.';
  }
  if (secondStart >= secondEnd) {
    return 'Second shift end must be after second shift start.';
  }
  if (secondStart <= firstEnd) {
    return 'Second shift must start after the first shift ends.';
  }
  return null;
}

export function formatSplitShiftTimingLabel(employee: Employee): string | null {
  if (!employee.splitShiftEnabled) return null;
  const firstStart = employee.dayShiftStart?.slice(0, 5) ?? '08:00';
  const firstEnd = employee.dayShiftEnd?.slice(0, 5) ?? '12:00';
  const secondStart = employee.splitSecondShiftStart?.slice(0, 5) ?? '17:00';
  const secondEnd = employee.splitSecondShiftEnd?.slice(0, 5) ?? '22:00';
  return `${firstStart}–${firstEnd} · ${secondStart}–${secondEnd}`;
}
