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

export function buildClinicFilterOptions(clinics: Clinic[]) {
  return [
    { value: 'all', label: 'All clinics' },
    ...clinics.map((clinic) => ({ value: clinic.id, label: clinic.name })),
  ];
}

export function clinicStatsForEmployees(employees: Employee[]) {
  return {
    totalEmployees: employees.length,
    totalSupervisors: employees.filter((employee) => employee.staffCategory === 'doctor').length,
    departments: employees.filter((employee) => employee.staffCategory !== 'doctor').length,
  };
}
