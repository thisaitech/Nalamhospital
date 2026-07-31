import { PAYROLL_WORKING_DAYS } from '@/constants/config';
import type { Employee, LeaveRequest, SalarySlip } from '@/types/employee';
import type { AttendanceSummary } from '@/types/employee';

export function dailyRate(employee: Employee): number {
  return Math.round((employee.baseSalary / PAYROLL_WORKING_DAYS) * 100) / 100;
}

export function hourlyRate(employee: Employee, shiftHoursPerDay = 8): number {
  return Math.round((dailyRate(employee) / shiftHoursPerDay) * 100) / 100;
}

export function countUnpaidLeaveDays(
  employeeId: string,
  leaveRequests: LeaveRequest[],
  fromDate: string,
  toDate: string
): number {
  return leaveRequests
    .filter(
      (r) =>
        r.employeeId === employeeId &&
        r.status === 'approved' &&
        (r.type === 'unpaid' || r.type === 'personal') &&
        r.startDate <= toDate &&
        r.endDate >= fromDate
    )
    .reduce((sum, r) => {
      // Count only days overlapping the period
      const start = r.startDate < fromDate ? fromDate : r.startDate;
      const end = r.endDate > toDate ? toDate : r.endDate;
      const days =
        Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return sum + Math.max(0, days);
    }, 0);
}

export function buildPayslip(params: {
  employee: Employee;
  month: string;
  year: number;
  summary: AttendanceSummary;
  unpaidLeaveDays: number;
  status?: 'paid' | 'pending';
}): SalarySlip {
  const { employee, month, year, summary, unpaidLeaveDays, status = 'pending' } = params;
  const rate = dailyRate(employee);
  const hr = hourlyRate(employee);

  const unpaidLeaveDeduction = Math.round(unpaidLeaveDays * rate * 100) / 100;
  // Absent days beyond unpaid leave already counted separately
  const absentDeduction = Math.round(summary.absentDays * rate * 100) / 100;
  const otPay = Math.round(summary.otHours * hr * 100) / 100;
  const busFare = employee.busFare || 0;

  const basic = employee.baseSalary;
  const allowances = Math.round((busFare + otPay) * 100) / 100;
  const deductions = Math.round((unpaidLeaveDeduction + absentDeduction) * 100) / 100;
  const netPay = Math.round((basic + allowances - deductions) * 100) / 100;

  const lastDay = new Date(year, ['January','February','March','April','May','June','July','August','September','October','November','December'].indexOf(month) + 1, 0);
  const paymentDate = lastDay.toISOString().split('T')[0];

  return {
    id: `sal-${employee.employeeId}-${year}-${month}`,
    employeeId: employee.employeeId,
    month,
    year,
    basic,
    allowances,
    deductions,
    netPay,
    paymentDate,
    status,
    attendedHours: summary.attendedHours,
    scheduledHours: summary.scheduledHours,
    absentDays: summary.absentDays,
    unpaidLeaveDays,
    otHours: summary.otHours,
    otPay,
    busFare,
    unpaidLeaveDeduction,
    absentDeduction,
  };
}
