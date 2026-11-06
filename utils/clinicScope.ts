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

/** Dropdown-only hide list. Clinic documents and historical records stay unchanged. */
const HIDDEN_CLINIC_DROPDOWN_NAMES = new Set(['jeyam clinic']);

export function isHiddenClinicDropdownOption(clinic: { name?: string }): boolean {
  const name = clinic.name?.trim().toLowerCase() ?? '';
  return HIDDEN_CLINIC_DROPDOWN_NAMES.has(name);
}

export function clinicsForDropdown(clinics: Clinic[]): Clinic[] {
  return clinics.filter((clinic) => !isHiddenClinicDropdownOption(clinic));
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
