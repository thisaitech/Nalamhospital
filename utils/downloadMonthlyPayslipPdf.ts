import { APP_NAME } from '@/constants/config';
import { amountInWords } from '@/utils/annualPayslip';
import { buildPayslipPdf } from '@/utils/buildPayslipPdf';
import { computePayslipAmounts } from '@/utils/payslipCalculations';
import type { Employee, SalarySlip } from '@/types/employee';

export interface MonthlyPayslipPdfInput {
  slip: SalarySlip;
  employee: Employee | null;
  employeeName: string;
  companyName?: string;
  companyAddress?: string;
}

function formatPayDate(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/** Build and download a Zoho-style monthly payslip PDF in the browser. */
export function downloadMonthlyPayslipPdf(input: MonthlyPayslipPdfInput): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('PDF download is only available in the browser.');
  }

  const { slip, employee, employeeName } = input;
  const payPeriod = `${slip.month} ${slip.year}`;
  const baseSalary = employee?.baseSalary ?? slip.basic;

  const amounts = computePayslipAmounts({
    baseSalary,
    busFare: employee?.busFare ?? slip.busFare ?? 0,
    otPay: slip.otPay ?? 0,
    compensatoryAllowance: slip.compensatoryAllowance ?? 0,
    absentDays: slip.absentDays ?? 0,
    unpaidLeaveDays: slip.unpaidLeaveDays ?? 0,
    lateFine: slip.lateFine ?? 0,
    unpaidLeaveDeduction: slip.unpaidLeaveDeduction ?? 0,
    year: slip.year,
    month: slip.month,
  });

  const earnings = [
    { label: 'Basic', amount: amounts.basic },
    { label: 'House Rent Allowance', amount: amounts.hra },
    { label: 'Conveyance Allowance', amount: amounts.conveyance },
  ];
  if (amounts.otPay > 0) {
    earnings.push({ label: 'Overtime Allowance', amount: amounts.otPay });
  }
  if (amounts.compensatoryAllowance > 0) {
    earnings.push({ label: 'Compensatory Allowance', amount: amounts.compensatoryAllowance });
  }
  earnings.push({ label: 'Gross Earnings', amount: amounts.grossEarnings });

  const deductions = [
    { label: 'Income Tax', amount: amounts.incomeTax },
    { label: 'Provident Fund', amount: amounts.providentFund },
  ];
  if (amounts.lateDeduction > 0) {
    deductions.push({ label: 'Late Deduction', amount: amounts.lateDeduction });
  }
  if (amounts.unpaidLeaveDeduction > 0) {
    deductions.push({ label: 'Unpaid Leave Deduction', amount: amounts.unpaidLeaveDeduction });
  }
  deductions.push({ label: 'Total Deductions', amount: amounts.totalDeductions });

  const blob = buildPayslipPdf({
    companyName: input.companyName || employee?.clinicName || APP_NAME,
    companyAddress: input.companyAddress || 'Tirunelveli, Tamil Nadu, India',
    title: 'Payslip For the Month',
    subtitle: payPeriod,
    summaryRows: [
      { label: 'Employee Name', value: employeeName },
      { label: 'Employee ID', value: slip.employeeId },
      { label: 'Pay Period', value: payPeriod },
      { label: 'Pay Date', value: formatPayDate(slip.paymentDate) },
      { label: 'Paid Days', value: String(amounts.paidDays) },
      { label: 'LOP Days', value: String(amounts.lopDays) },
    ],
    netPay: amounts.netPay,
    earnings,
    deductions,
    grossEarnings: amounts.grossEarnings,
    totalDeductions: amounts.totalDeductions,
    amountInWords: amountInWords(amounts.netPay),
  });

  const safeMonth = slip.month.replace(/\s+/g, '');
  const filename = `Payslip_${slip.employeeId}_${safeMonth}_${slip.year}.pdf`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
