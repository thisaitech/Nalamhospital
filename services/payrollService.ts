import { MONTH_NAMES } from '@/constants/config';
import {
  loadAllAttendance,
  loadAllSalarySlips,
  loadLeaveRequests,
  saveSalarySlips,
} from '@/services/firestoreRepository';
import { getAttendanceRules } from '@/services/attendanceRulesService';
import { loadEmployees } from '@/services/employeeRegistry';
import { loadShiftsInRange } from '@/services/shiftService';
import { monthDateRange, summarizeAttendanceForPeriod } from '@/utils/attendanceSummary';
import { buildPayslip, countUnpaidLeaveDays } from '@/utils/payrollCalc';
import { countCompensatoryLeaveDays } from '@/utils/compensatoryLeave';
import {
  calcManualLateDeduction,
  calcMonthlyLateStats,
  type MonthlyLateStats,
} from '@/utils/monthlyLateStats';
import type { SalarySlip } from '@/types/employee';

export async function getEmployeeLateStatsForMonth(
  employeeId: string,
  year: number,
  monthIndex: number
): Promise<MonthlyLateStats> {
  const { fromDate, toDate } = monthDateRange(year, monthIndex);
  const [attendance, shifts] = await Promise.all([
    loadAllAttendance(),
    loadShiftsInRange(fromDate, toDate),
  ]);
  return calcMonthlyLateStats(employeeId, attendance, shifts, fromDate, toDate);
}

export async function generatePayrollForMonth(
  year: number,
  monthIndex: number,
  employeeId?: string,
  lateDeductionPerDay = 0
): Promise<SalarySlip[]> {
  const month = MONTH_NAMES[monthIndex];
  if (!month) throw new Error('Invalid month');

  const { fromDate, toDate } = monthDateRange(year, monthIndex);
  const [allEmployees, attendance, leaveRequests, shifts, rules] = await Promise.all([
    loadEmployees(),
    loadAllAttendance(),
    loadLeaveRequests(),
    loadShiftsInRange(fromDate, toDate),
    getAttendanceRules(),
  ]);

  const employees = employeeId
    ? allEmployees.filter((e) => e.employeeId === employeeId)
    : allEmployees;

  if (employeeId && employees.length === 0) {
    throw new Error('Selected employee was not found.');
  }

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
    const compensatoryLeaveDays = countCompensatoryLeaveDays(
      employee.employeeId,
      leaveRequests,
      fromDate,
      toDate
    );

    const lateStats = calcMonthlyLateStats(
      employee.employeeId,
      attendance,
      shifts,
      fromDate,
      toDate
    );
    const perDay = Math.max(0, Number(lateDeductionPerDay) || 0);
    const lateFine = calcManualLateDeduction(lateStats.lateDays, perDay);

    return buildPayslip({
      employee,
      month,
      year,
      summary,
      unpaidLeaveDays,
      compensatoryLeaveDays,
      lateFine,
      lateDays: lateStats.lateDays,
      lateMinutes: lateStats.lateMinutes,
      latePercentage: lateStats.latePercentage,
      lateDeductionPerDay: perDay,
      clinicOtMultiplier: rules.otMultiplier,
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
  const [updated] = await markPayslipsPaid([slipId]);
  if (!updated) throw new Error('Payslip not found');
  return updated;
}

export async function markPayslipsPaid(slipIds: string[]): Promise<SalarySlip[]> {
  const uniqueIds = Array.from(new Set(slipIds.filter(Boolean)));
  if (!uniqueIds.length) return [];

  const all = await loadAllSalarySlips();
  const idSet = new Set(uniqueIds);
  const updated = all
    .filter((slip) => idSet.has(slip.id))
    .map((slip) => ({ ...slip, status: 'paid' as const }));

  if (!updated.length) {
    throw new Error('No matching payslips found.');
  }

  await saveSalarySlips(updated);
  return updated;
}
