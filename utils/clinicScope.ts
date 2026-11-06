import type { Clinic } from '@/types/clinic';
import type { Employee } from '@/types/employee';

export type ClinicFilterId = 'all' | string;

export const ADMIN_CLINIC_FILTER_KEY = '@hospitalhrm/admin_clinic_filter';

export function filterEmployeesByClinic(employees: Employee[], clinicId: ClinicFilterId): Employee[] {
  if (clinicId === 'all') return employees;
  return employees.filter((employee) => employee.clinicId === clinicId);
}

export function filterByEmployeeIds<T>(
  items: T[],
  employeeIds: Set<string>,
  getEmployeeId: (item: T) => string
): T[] {
  return items.filter((item) => employeeIds.has(getEmployeeId(item)));
}

/**
 * Existing Jeyam Clinic (clinics/CLN002). Hidden for every account.
 * The Firestore document stays in place so historical records are preserved.
 */
export const RETIRED_CLINIC_IDS = new Set(['CLN002']);

const RETIRED_CLINIC_NAMES = new Set(['jeyam clinic']);

export function isRetiredClinic(clinic: { id?: string; name?: string }): boolean {
  if (clinic.id && RETIRED_CLINIC_IDS.has(clinic.id)) return true;
  const name = clinic.name?.trim().toLowerCase() ?? '';
  return RETIRED_CLINIC_NAMES.has(name);
}

export function clinicsForDropdown(clinics: Clinic[]): Clinic[] {
  return clinics.filter((clinic) => !isRetiredClinic(clinic));
}

export function buildClinicFilterOptions(clinics: Clinic[]) {
  return [
    { value: 'all', label: 'All clinics' },
    ...clinicsForDropdown(clinics).map((clinic) => ({ value: clinic.id, label: clinic.name })),
  ];
}

export function clinicStatsForEmployees(employees: Employee[]) {
  return {
    totalEmployees: employees.length,
    totalSupervisors: employees.filter((employee) => employee.staffCategory === 'doctor').length,
    departments: employees.filter((employee) => employee.staffCategory !== 'doctor').length,
  };
}
