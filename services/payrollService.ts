import { MONTH_NAMES } from '@/constants/config';
import {
  loadAllAttendance,
  loadAllSalarySlips,
  loadLeaveRequests,
  saveSalarySlips,
} from '@/services/firestoreRepository';
import { loadEmployees } from '@/services/employeeRegistry';
import { loadShiftsInRange } from '@/services/shiftService';
import { monthDateRange, summarizeAttendanceForPeriod } from '@/utils/attendanceSummary';
import { buildPayslip, countUnpaidLeaveDays } from '@/utils/payrollCalc';
import type { SalarySlip } from '@/types/employee';

export async function generatePayrollForMonth(
  year: number,
  monthIndex: number
): Promise<SalarySlip[]> {
  const month = MONTH_NAMES[monthIndex];
  if (!month) throw new Error('Invalid month');

  const { fromDate, toDate } = monthDateRange(year, monthIndex);
  const [employees, attendance, leaveRequests, shifts] = await Promise.all([
    loadEmployees(),
    loadAllAttendance(),
    loadLeaveRequests(),
    loadShiftsInRange(fromDate, toDate),
  ]);

  const slips: SalarySlip[] = employees.map((employee) => {
    const summary = summarizeAttendanceForPeriod(
      employee,
      attendance,
      leaveRequests,
      shifts,
      fromDate,
      toDate
    );
    const unpaidLeaveDays = countUnpaidLeaveDays(
      employee.employeeId,
      leaveRequests,
      fromDate,
      toDate
    );
    return buildPayslip({
      employee,
      month,
      year,
      summary,
      unpaidLeaveDays,
      status: 'pending',
    });
  });

  await saveSalarySlips(slips);
  return slips;
}

export async function loadPayrollSlips(employeeId?: string): Promise<SalarySlip[]> {
  const all = await loadAllSalarySlips();
  if (!employeeId) {
    return all.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month.localeCompare(a.month);
    });
  }
  return all
    .filter((s) => s.employeeId === employeeId)
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month.localeCompare(a.month);
    });
}

export async function markPayslipPaid(slipId: string): Promise<SalarySlip> {
  const all = await loadAllSalarySlips();
  const target = all.find((s) => s.id === slipId);
  if (!target) throw new Error('Payslip not found');
  const updated = { ...target, status: 'paid' as const };
  await saveSalarySlips([updated]);
  return updated;
}
