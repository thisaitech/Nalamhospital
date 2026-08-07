import { amountInWords } from '@/utils/annualPayslip';

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

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Minimal single-page PDF (no external deps — Metro-safe). */
function buildSimplePdf(lines: string[]): Blob {
  const contentLines = lines.map((line, index) => {
    const y = 800 - index * 18;
    return `BT /F1 11 Tf 40 ${y} Td (${escapePdfText(line)}) Tj ET`;
  });

  const stream = contentLines.join('\n');
  const objects: string[] = [];
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj');
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj');
  objects.push('3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj');
  objects.push(`4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream endobj`);
  objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
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
