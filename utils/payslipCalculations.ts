import { MONTH_NAMES } from '@/constants/config';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function monthIndexFromName(month: string): number {
  return MONTH_NAMES.indexOf(month);
}

export function daysInCalendarMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export interface PayslipAmountInput {
  baseSalary: number;
  busFare?: number;
  otPay?: number;
  compensatoryAllowance?: number;
  absentDays?: number;
  unpaidLeaveDays?: number;
  lateFine?: number;
  unpaidLeaveDeduction?: number;
  year: number;
  month: string;
}

export interface PayslipAmountBreakdown {
  totalDaysInMonth: number;
  paidDays: number;
  lopDays: number;
  basic: number;
  hra: number;
  conveyance: number;
  otPay: number;
  compensatoryAllowance: number;
  grossEarnings: number;
  incomeTax: number;
  providentFund: number;
  lateDeduction: number;
  unpaidLeaveDeduction: number;
  totalDeductions: number;
  netPay: number;
}

/** Pro-rate monthly salary: (base / total month days) × paid days, capped at base. */
export function computePayslipAmounts(input: PayslipAmountInput): PayslipAmountBreakdown {
  const monthIndex = monthIndexFromName(input.month);
  const totalDaysInMonth =
    monthIndex >= 0 ? daysInCalendarMonth(input.year, monthIndex) : 30;

  const lopDays = Math.min(
    totalDaysInMonth,
    Math.max(0, (input.absentDays ?? 0) + (input.unpaidLeaveDays ?? 0))
  );
  const paidDays = Math.max(0, totalDaysInMonth - lopDays);

  const zero: PayslipAmountBreakdown = {
    totalDaysInMonth,
    paidDays: 0,
    lopDays,
    basic: 0,
    hra: 0,
    conveyance: 0,
    otPay: 0,
    compensatoryAllowance: 0,
    grossEarnings: 0,
    incomeTax: 0,
    providentFund: 0,
    lateDeduction: 0,
    unpaidLeaveDeduction: 0,
    totalDeductions: 0,
    netPay: 0,
  };

  if (paidDays === 0 || lopDays >= totalDaysInMonth) {
    return zero;
  }

  const baseSalary = Math.max(0, input.baseSalary);
  const busFare = Math.max(0, input.busFare ?? 0);

  const dailyBasic = baseSalary / totalDaysInMonth;
  const basic = round2(Math.min(baseSalary, dailyBasic * paidDays));

  const dailyConveyance = busFare / totalDaysInMonth;
  const conveyance = round2(Math.min(busFare, dailyConveyance * paidDays));

  const hra = 0;
  const otPay = round2(Math.max(0, input.otPay ?? 0));
  const compensatoryAllowance = round2(Math.max(0, input.compensatoryAllowance ?? 0));

  const grossEarnings = round2(basic + hra + conveyance + otPay + compensatoryAllowance);

  const incomeTax = 0;
  const providentFund = 0;
  const lateDeduction = round2(Math.max(0, input.lateFine ?? 0));
  const unpaidLeaveDeduction = round2(Math.max(0, input.unpaidLeaveDeduction ?? 0));
  const totalDeductions = round2(
    incomeTax + providentFund + lateDeduction + unpaidLeaveDeduction
  );
  const netPay = round2(Math.max(0, grossEarnings - totalDeductions));

  return {
    totalDaysInMonth,
    paidDays,
    lopDays,
    basic,
    hra,
    conveyance,
    otPay,
    compensatoryAllowance,
    grossEarnings,
    incomeTax,
    providentFund,
    lateDeduction,
    unpaidLeaveDeduction,
    totalDeductions,
    netPay,
  };
}
