import {
  DEFAULT_DAY_SHIFT,
  DEFAULT_NIGHT_SHIFT,
} from '@/constants/config';
import {
  createNewHireRecords,
  loadEmployees as loadEmployeesFromFirestore,
  loadLeaveBalancesMap,
  loadUsers as loadUsersFromFirestore,
  saveEmployees as saveEmployeesToFirestore,
  saveUsers as saveUsersToFirestore,
} from '@/services/firestoreRepository';
import { defaultBalancesForCategory } from '@/utils/clinicLeave';
import type {
  AppUser,
  Employee,
  EmployeeProfileUpdate,
  LeaveBalance,
  NewHireInput,
  RegisterInput,
} from '@/types/employee';

export async function loadEmployees(): Promise<Employee[]> {
  return loadEmployeesFromFirestore();
}

export async function saveEmployees(employees: Employee[]): Promise<void> {
  await saveEmployeesToFirestore(employees);
}

export async function loadUsers(): Promise<AppUser[]> {
  return loadUsersFromFirestore();
}

export async function saveUsers(users: AppUser[]): Promise<void> {
  await saveUsersToFirestore(users);
}

export async function findEmployeeByEmail(email: string): Promise<Employee | undefined> {
  const employees = await loadEmployees();
  return employees.find((e) => e.email.toLowerCase() === email.toLowerCase());
}

export async function findEmployeeById(employeeId: string): Promise<Employee | undefined> {
  const employees = await loadEmployees();
  return employees.find((e) => e.employeeId === employeeId);
}

export function getEmployeeDisplayName(employee: Employee): string {
  const prefix = employee.staffCategory === 'doctor' ? 'Dr. ' : '';
  return `${prefix}${employee.firstName} ${employee.lastName}`;
}

export async function getLeaveBalances(employeeId: string): Promise<LeaveBalance[]> {
  const map = await loadLeaveBalancesMap();
  return map[employeeId] ?? [];
}

function nextEmployeeId(employees: Employee[]): string {
  const nums = employees
    .map((e) => parseInt(e.employeeId.replace('EMP', ''), 10))
    .filter((n) => !Number.isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `EMP${String(next).padStart(3, '0')}`;
}

export async function createNewHire(input: NewHireInput): Promise<Employee> {
  const employees = await loadEmployees();
  const users = await loadUsers();

  const supervisor = employees.find((e) => e.employeeId === input.supervisorId);
  const managerName = supervisor ? getEmployeeDisplayName(supervisor) : 'Clinic Admin';

  const normalizedEmail = input.email.trim().toLowerCase();
  if (users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
    throw new Error('An account with this email already exists.');
  }

  const dayShiftEnabled = input.dayShiftEnabled || (!input.dayShiftEnabled && !input.nightShiftEnabled);
  const nightShiftEnabled = input.nightShiftEnabled;
  const password = input.tempPassword?.trim() || 'welcome123';
  const employeeId = nextEmployeeId(employees);
  const staffCategory = input.staffCategory ?? 'staff';
  const employee: Employee = {
    id: String(Date.now()),
    employeeId,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: normalizedEmail,
    phone: input.phone.trim(),
    department: input.department.trim() || 'General',
    position: input.position.trim() || (staffCategory === 'doctor' ? 'Doctor' : 'Staff'),
    manager: managerName,
    joinDate: input.joinDate || new Date().toISOString().split('T')[0],
    address: input.address.trim(),
    emergencyContact: input.emergencyContact.trim(),
    staffCategory,
    baseSalary: Number(input.baseSalary) || 0,
    busFare: Number(input.busFare) || 0,
    dayShiftEnabled,
    nightShiftEnabled,
    dayShiftStart: input.dayShiftStart || DEFAULT_DAY_SHIFT.start,
    dayShiftEnd: input.dayShiftEnd || DEFAULT_DAY_SHIFT.end,
    nightShiftStart: input.nightShiftStart || DEFAULT_NIGHT_SHIFT.start,
    nightShiftEnd: input.nightShiftEnd || DEFAULT_NIGHT_SHIFT.end,
  };

  const user: AppUser = {
    email: employee.email,
    password,
    role: 'employee',
    employeeId,
    name: getEmployeeDisplayName(employee),
  };

  const defaultBalances = defaultBalancesForCategory(staffCategory);

  await createNewHireRecords(employee, user, defaultBalances);
  return employee;
}

export async function registerEmployee(input: RegisterInput): Promise<Employee> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const password = input.password;

  if (!firstName || !lastName) {
    throw new Error('Please enter your first and last name.');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const supervisors = await getSupervisorOptions();
  const supervisor = supervisors[0];
  const today = new Date().toISOString().split('T')[0];

  return createNewHire({
    firstName,
    lastName,
    email: input.email,
    phone: input.phone?.trim() ?? '',
    department: 'Support',
    position: 'Staff',
    supervisorId: supervisor?.employeeId ?? '',
    address: '',
    emergencyContact: '',
    joinDate: today,
    tempPassword: password,
    staffCategory: 'staff',
    baseSalary: 25000,
    busFare: 500,
    dayShiftEnabled: true,
    nightShiftEnabled: false,
    dayShiftStart: DEFAULT_DAY_SHIFT.start,
    dayShiftEnd: DEFAULT_DAY_SHIFT.end,
    nightShiftStart: DEFAULT_NIGHT_SHIFT.start,
    nightShiftEnd: DEFAULT_NIGHT_SHIFT.end,
  });
}

export async function updateEmployeeProfile(
  employeeId: string,
  input: EmployeeProfileUpdate
): Promise<Employee> {
  const employees = await loadEmployees();
  const employee = employees.find((item) => item.employeeId === employeeId);
  if (!employee) {
    throw new Error('Employee profile not found');
  }

  const phone = input.phone.trim();
  const emergencyContact = input.emergencyContact.trim();

  if (phone && phone.length !== 10) {
    throw new Error('Phone number must be exactly 10 digits.');
  }
  if (emergencyContact && emergencyContact.length !== 10) {
    throw new Error('Emergency contact number must be exactly 10 digits.');
  }

  const updated: Employee = {
    ...employee,
    phone,
    address: input.address.trim(),
    emergencyContact,
    ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
  };

  await saveEmployees([updated]);
  return updated;
}

export async function updateEmployeePayrollFields(
  employeeId: string,
  fields: Partial<Pick<Employee, 'baseSalary' | 'busFare' | 'dayShiftEnabled' | 'nightShiftEnabled' | 'dayShiftStart' | 'dayShiftEnd' | 'nightShiftStart' | 'nightShiftEnd' | 'staffCategory'>>
): Promise<Employee> {
  const employees = await loadEmployees();
  const employee = employees.find((e) => e.employeeId === employeeId);
  if (!employee) throw new Error('Employee not found');
  const updated = { ...employee, ...fields };
  await saveEmployees([updated]);
  return updated;
}

export async function assignSupervisor(employeeId: string, supervisorId: string): Promise<Employee> {
  const employees = await loadEmployees();
  const employee = employees.find((e) => e.employeeId === employeeId);
  const supervisor = employees.find((e) => e.employeeId === supervisorId);
  if (!employee || !supervisor) {
    throw new Error('Employee or supervisor not found');
  }
  const updated = { ...employee, manager: getEmployeeDisplayName(supervisor) };
  await saveEmployees(employees.map((e) => (e.employeeId === employeeId ? updated : e)));
  return updated;
}

export async function getSupervisorOptions(): Promise<Employee[]> {
  const employees = await loadEmployees();
  const managers = employees.filter((employee) =>
    /manager|supervisor|lead|director|head|consultant/i.test(employee.position)
  );
  const withReports = employees.filter((employee) =>
    employees.some(
      (other) =>
        other.employeeId !== employee.employeeId &&
        other.manager === getEmployeeDisplayName(employee)
    )
  );
  const combined = [...new Map([...managers, ...withReports].map((e) => [e.employeeId, e])).values()];
  return combined.length > 0 ? combined : employees;
}
