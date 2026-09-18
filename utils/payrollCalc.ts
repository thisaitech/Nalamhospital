import { PAYROLL_WORKING_DAYS } from '@/constants/config';
import { countCompensatoryLeaveDays } from '@/utils/compensatoryLeave';
import { computePayslipAmounts } from '@/utils/payslipCalculations';
import type { Employee, LeaveRequest, SalarySlip } from '@/types/employee';
import type { AttendanceSummary } from '@/types/employee';

export function dailyRate(employee: Employee): number {
  if (employee.salaryType === 'hourly') {
    const hourly = employee.hourlyRate || 0;
    return Math.round(hourly * 8 * 100) / 100;
  }
  return Math.round((employee.baseSalary / PAYROLL_WORKING_DAYS) * 100) / 100;
}

export function hourlyRate(employee: Employee, shiftHoursPerDay = 8): number {
  if (employee.salaryType === 'hourly' && (employee.hourlyRate || 0) > 0) {
    return employee.hourlyRate || 0;
  }
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
  compensatoryLeaveDays?: number;
  lateFine?: number;
  lateDays?: number;
  lateMinutes?: number;
  latePercentage?: number;
  lateDeductionPerDay?: number;
  clinicOtMultiplier?: number;
  status?: 'paid' | 'pending';
}): SalarySlip {
  const {
    employee,
    month,
    year,
    summary,
    unpaidLeaveDays,
    compensatoryLeaveDays = 0,
    lateFine = 0,
    lateDays = 0,
    lateMinutes = 0,
    latePercentage = 0,
    lateDeductionPerDay = 0,
    clinicOtMultiplier = 1.5,
    status = 'pending',
  } = params;

  const otMult = employee.otMultiplier || clinicOtMultiplier || 1.5;
  const hr = hourlyRate(employee);
  const rate = dailyRate(employee);
  const busFare = employee.busFare || 0;
  const otPay = Math.round(summary.otHours * hr * otMult * 100) / 100;
  const lateFineAmount = Math.max(0, Math.round(lateFine * 100) / 100);
  const compensatoryAllowance = Math.round(compensatoryLeaveDays * rate * 100) / 100;
  const absentDeduction = 0;

  let basic: number;
  let allowances: number;
  let deductions: number;
  let netPay: number;
  let unpaidLeaveDeduction: number;

  if (employee.salaryType === 'hourly') {
    basic = Math.round(summary.attendedHours * hr * 100) / 100;
    unpaidLeaveDeduction = Math.round(unpaidLeaveDays * rate * 100) / 100;
    allowances = Math.round((busFare + otPay + compensatoryAllowance) * 100) / 100;
    deductions = Math.round((unpaidLeaveDeduction + lateFineAmount) * 100) / 100;
    netPay = Math.max(0, Math.round((basic + allowances - deductions) * 100) / 100);
  } else {
    const amounts = computePayslipAmounts({
      baseSalary: employee.baseSalary,
      busFare,
      otPay,
      compensatoryAllowance,
      absentDays: summary.absentDays,
      unpaidLeaveDays,
      lateFine: lateFineAmount,
      unpaidLeaveDeduction: 0,
      year,
      month,
    });
    basic = amounts.basic;
    unpaidLeaveDeduction = amounts.unpaidLeaveDeduction;
    allowances = Math.round(
      (amounts.conveyance + amounts.otPay + amounts.compensatoryAllowance) * 100
    ) / 100;
    deductions = amounts.totalDeductions;
    netPay = amounts.netPay;
  }

  const lastDay = new Date(
    year,
    [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ].indexOf(month) + 1,
    0
  );
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
    lateFine: lateFineAmount,
    lateDays,
    lateMinutes,
    latePercentage,
    lateDeductionPerDay,
    compensatoryLeaveDays,
    compensatoryAllowance,
  };
}
