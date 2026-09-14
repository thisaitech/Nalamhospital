import { amountInWords } from '@/utils/annualPayslip';
import { buildSimplePdf } from '@/utils/buildSimplePdf';
import type { Employee, SalarySlip } from '@/types/employee';

function formatAmount(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export interface MonthlyPayslipPdfInput {
  slip: SalarySlip;
  employee: Employee | null;
  employeeName: string;
}

/** Build and download a monthly payslip PDF in the browser. */
export function downloadMonthlyPayslipPdf(input: MonthlyPayslipPdfInput): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('PDF download is only available in the browser.');
  }

  const { slip, employee, employeeName } = input;
  const lines = [
    'MONTHLY PAYSLIP',
    `For ${slip.month} ${slip.year}`,
    '',
    `Name: ${employeeName}`,
    `Employee ID: ${slip.employeeId}`,
    `Designation: ${employee?.position || '-'}`,
    `Location: ${employee?.department || '-'}`,
    `Status: ${slip.status === 'paid' ? 'Paid' : 'Pending'}`,
    `Payment date: ${slip.paymentDate || '-'}`,
    '',
    'Salary Head                    Amount (Rs)',
    '-----------------------------------------------',
    `Basic${' '.repeat(28)}${formatAmount(slip.basic)}`,
    `Allowances (bus + OT)${' '.repeat(12)}+${formatAmount(slip.allowances)}`,
    `Deductions${' '.repeat(23)}-${formatAmount(slip.deductions)}`,
  ];
  if ((slip.otPay ?? 0) > 0) {
    lines.push(`OT pay${' '.repeat(29)}+${formatAmount(slip.otPay ?? 0)}`);
  }

  lines.push(
    '-----------------------------------------------',
    `Net Pay${' '.repeat(27)}${formatAmount(slip.netPay)}`,
    '',
    `Amount in Words: ${amountInWords(slip.netPay)}`,
    '',
    `Attended ${slip.attendedHours ?? 0}h / ${slip.scheduledHours ?? 0}h`,
    `Absent days: ${slip.absentDays ?? 0}`,
    `Unpaid leave: ${slip.unpaidLeaveDays ?? 0}`,
    `OT hours: ${slip.otHours ?? 0}h`,
    ...(slip.lateDays && slip.lateDeductionPerDay
      ? [`Late deduction: ${slip.lateDays} days x Rs ${slip.lateDeductionPerDay}`]
      : [])
  );

  const blob = buildSimplePdf(lines);
  const safeName = employeeName.replace(/[^\w\-]+/g, '_');
  const safeMonth = slip.month.replace(/\s+/g, '');
  const filename = `Monthly_Payslip_${safeName}_${safeMonth}_${slip.year}.pdf`;

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
