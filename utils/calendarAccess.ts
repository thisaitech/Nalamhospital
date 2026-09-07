import type { Clinic } from '@/types/clinic';
import type { Employee, StaffCategory } from '@/types/employee';
import { getEmployeeDisplayName } from '@/services/employeeRegistry';

export type CalendarViewType = 'doctor' | 'staff';

/** Select value for group overview (all people in current filter). */
export const CALENDAR_ALL_PEOPLE = 'all';

/** Admin: all doctors, or staff filtered by clinic (all clinics when clinicId is "all"). */
export function getAdminCalendarPeople(
  employees: Employee[],
  viewType: CalendarViewType,
  clinicId: string
): Employee[] {
  if (viewType === 'doctor') {
    return employees
      .filter((e) => e.staffCategory === 'doctor')
      .sort((a, b) => getEmployeeDisplayName(a).localeCompare(getEmployeeDisplayName(b)));
  }

  return employees
    .filter((e) => e.staffCategory === 'staff')
    .filter((e) => clinicId === 'all' || e.clinicId === clinicId)
    .sort((a, b) => getEmployeeDisplayName(a).localeCompare(getEmployeeDisplayName(b)));
}

/**
 * Doctor: all doctors from all clinics + staff from the doctor's own clinic only.
 * Read-only calendar people list.
 */
export function getDoctorCalendarPeople(
  employees: Employee[],
  doctorClinicId: string
): Employee[] {
  const doctors = employees.filter((e) => e.staffCategory === 'doctor');
  const clinicStaff = employees.filter(
    (e) => e.staffCategory === 'staff' && e.clinicId === doctorClinicId
  );

  const merged = [...doctors, ...clinicStaff];
  const unique = [...new Map(merged.map((e) => [e.employeeId, e])).values()];
  return unique.sort((a, b) => {
    if (a.staffCategory !== b.staffCategory) {
      return a.staffCategory === 'doctor' ? -1 : 1;
    }
    return getEmployeeDisplayName(a).localeCompare(getEmployeeDisplayName(b));
  });
}

/** Doctors only — for doctor-page “all doctors” overview. */
export function getAllDoctors(employees: Employee[]): Employee[] {
  return employees
    .filter((e) => e.staffCategory === 'doctor')
    .sort((a, b) => getEmployeeDisplayName(a).localeCompare(getEmployeeDisplayName(b)));
}

export function toPersonSelectOptions(
  people: Employee[],
  allLabel = 'All'
): { value: string; label: string }[] {
  return [
    { value: CALENDAR_ALL_PEOPLE, label: allLabel },
    ...people.map((e) => ({
      value: e.employeeId,
      label: `${getEmployeeDisplayName(e)} (${e.employeeId})`,
    })),
  ];
}

export function clinicSelectOptions(clinics: Clinic[]) {
  return [
    { value: 'all', label: 'All clinics' },
    ...clinics.map((c) => ({ value: c.id, label: c.name })),
  ];
}

export function categoryLabel(category: StaffCategory): string {
  return category === 'doctor' ? 'Doctor' : 'Staff';
}

export function isCalendarAllPeople(personId: string): boolean {
  return personId === CALENDAR_ALL_PEOPLE || personId === '';
}
