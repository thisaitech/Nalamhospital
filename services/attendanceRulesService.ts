import {
  loadAttendanceRules as loadRules,
  saveAttendanceRules as persistRules,
} from '@/services/firestoreRepository';
import type { AttendanceRules } from '@/types/attendanceRules';
import { normalizeAttendanceRules } from '@/utils/attendanceRules';

export async function getAttendanceRules(): Promise<AttendanceRules> {
  return loadRules();
}

export async function saveAttendanceRules(rules: AttendanceRules): Promise<AttendanceRules> {
  const normalized = normalizeAttendanceRules(rules);
  await persistRules(normalized);
  return normalized;
}
