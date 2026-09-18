import { APP_NAME } from '@/constants/config';
import { amountInWords } from '@/utils/annualPayslip';
import { buildPayslipPdf } from '@/utils/buildPayslipPdf';

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
  companyName?: string;
  companyAddress?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Build and download an annual payslip PDF matching the monthly layout. */
export function downloadAnnualPayslipPdf(input: AnnualPayslipPdfInput): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('PDF download is only available in the browser.');
  }

  const earnings = input.rows.map((row) => ({
    label: row.label,
    amount: round2(row.amount),
  }));
  if (input.reimbursement > 0) {
    earnings.push({ label: 'Reimbursement', amount: round2(input.reimbursement) });
  }
  const grossEarnings = round2(
    earnings.reduce((sum, row) => sum + row.amount, 0)
  );
  earnings.push({ label: 'Gross Earnings', amount: grossEarnings });

  const deductions = [
    { label: 'Income Tax', amount: 0 },
    { label: 'Provident Fund', amount: 0 },
  ];
  if (input.yearDeduction > 0) {
    deductions.push({ label: 'Year Deduction', amount: round2(input.yearDeduction) });
  }
  const totalDeductions = round2(input.yearDeduction);
  deductions.push({ label: 'Total Deductions', amount: totalDeductions });

  const netPay = round2(Math.max(0, grossEarnings - totalDeductions));

  const blob = buildPayslipPdf({
    companyName: input.companyName || APP_NAME,
    companyAddress: input.companyAddress || 'Tirunelveli, Tamil Nadu, India',
    title: 'Annual Payslip',
    subtitle: `Financial Year ${input.financialYear}`,
    summaryRows: [
      { label: 'Employee Name', value: input.employeeName },
      { label: 'Employee ID', value: input.employeeId },
      { label: 'Designation', value: input.designation || '—' },
      { label: 'Location', value: input.location || '—' },
      { label: 'Pay Period', value: input.financialYear },
      { label: 'Pay Date', value: input.payslipDate },
    ],
    netPay,
    earnings,
    deductions,
    grossEarnings,
    totalDeductions,
    amountInWords: amountInWords(netPay),
  });

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
