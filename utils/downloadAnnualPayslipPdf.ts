import { amountInWords } from '@/utils/annualPayslip';
import { buildSimplePdf } from '@/utils/buildSimplePdf';

export interface AnnualPayslipPdfInput {
  financialYear: string;
  payslipDate: string;
  employeeName: string;
  employeeId: string;
  designation: string;
  location: string;
  rows: { sno: number; label: string; amount: number }[];
  gross: number;
  reimbursement: number;
  yearDeduction: number;
  net: number;
}

function formatAmount(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/** Build and download an annual payslip PDF in the browser. */
export function downloadAnnualPayslipPdf(input: AnnualPayslipPdfInput): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('PDF download is only available in the browser.');
  }

  const lines = [
    'ANNUAL PAYSLIP',
    `For the Financial Year ${input.financialYear}`,
    '',
    `Name: ${input.employeeName}`,
    `Employee ID: ${input.employeeId}`,
    `Designation: ${input.designation || '-'}`,
    `Location: ${input.location || '-'}`,
    `Date: ${input.payslipDate}`,
    '',
    'S.No  Salary Head                    Amount (Rs)',
    '-----------------------------------------------',
    ...input.rows.map(
      (row) =>
        `${String(row.sno).padEnd(5)} ${row.label.padEnd(28)} ${formatAmount(row.amount)}`
    ),
    '-----------------------------------------------',
    `Gross Salary${' '.repeat(22)}${formatAmount(input.gross)}`,
    `Reimbursement${' '.repeat(20)}${formatAmount(input.reimbursement)}`,
    `Year Deduction${' '.repeat(18)}-${formatAmount(input.yearDeduction)}`,
    `Net Salary${' '.repeat(24)}${formatAmount(input.net)}`,
    '',
    `Amount in Words: ${amountInWords(input.net)}`,
  ];

  const blob = buildSimplePdf(lines);
  const safeName = input.employeeName.replace(/[^\w\-]+/g, '_');
  const safeFy = input.financialYear.replace(/\s+/g, '');
  const filename = `Annual_Payslip_${safeName}_${safeFy}.pdf`;

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
