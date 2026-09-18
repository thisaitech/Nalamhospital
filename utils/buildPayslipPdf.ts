function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export interface PayslipPdfRow {
  label: string;
  amount: number;
}

export interface PayslipSummaryRow {
  label: string;
  value: string;
}

export interface PayslipPdfLayoutInput {
  companyName: string;
  companyAddress: string;
  title: string;
  subtitle: string;
  summaryRows: PayslipSummaryRow[];
  netPay: number;
  earnings: PayslipPdfRow[];
  deductions: PayslipPdfRow[];
  grossEarnings: number;
  totalDeductions: number;
  amountInWords: string;
}

interface PdfText {
  x: number;
  y: number;
  text: string;
  size?: number;
  bold?: boolean;
}

/** Page layout constants (A4: 595 × 842 pt). */
const PAGE = { w: 595, h: 842 };
const M = 40;
const CONTENT_W = PAGE.w - M * 2;
const MID_X = M + CONTENT_W / 2;
const LEFT = { x: M + 8, amountX: MID_X - 18 };
const RIGHT = { x: MID_X + 10, amountX: PAGE.w - M - 8 };
const ROW_H = 20;
const HEADER_H = 22;
const NET_BOX = { x: 338, y: 606, w: 217, h: 96 };

/** Helvetica Type1 lacks the rupee glyph — use Rs. for clean PDF output. */
export function formatRupeeForPdf(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `Rs. ${safe.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function charWidth(size: number): number {
  return size * 0.52;
}

function amountX(text: string, maxX: number, size = 10): number {
  return Math.max(M + 8, maxX - text.length * charWidth(size));
}

function centerX(text: string, boxX: number, boxW: number, size: number): number {
  return boxX + (boxW - text.length * charWidth(size)) / 2;
}

function textCmd({ x, y, text, size = 10, bold = false }: PdfText): string {
  const font = bold ? 'F2' : 'F1';
  return `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`;
}

function hLine(x1: number, x2: number, y: number, width = 0.6, gray = 0.82): string {
  return `q ${width} w ${gray} ${gray} ${gray} RG ${x1} ${y} m ${x2} ${y} l S Q`;
}

function vLine(x: number, y1: number, y2: number, width = 0.6, gray = 0.82): string {
  return `q ${width} w ${gray} ${gray} ${gray} RG ${x} ${y1} m ${x} ${y2} l S Q`;
}

function fillRect(x: number, y: number, w: number, h: number, r = 0.97, g = 0.98, b = 0.99): string {
  return `q ${r} ${g} ${b} rg ${x} ${y} ${w} ${h} re f Q`;
}

function strokeRect(x: number, y: number, w: number, h: number, width = 0.8, gray = 0.72): string {
  return `q ${width} w ${gray} ${gray} ${gray} RG ${x} ${y} ${w} ${h} re S Q`;
}

function leftRow(label: string, amount: number, y: number): PdfText[] {
  const amt = formatRupeeForPdf(amount);
  return [
    { x: LEFT.x, y, text: label, size: 10 },
    { x: amountX(amt, LEFT.amountX), y, text: amt, size: 10, bold: true },
  ];
}

function rightRow(label: string, amount: number, y: number): PdfText[] {
  const amt = formatRupeeForPdf(amount);
  return [
    { x: RIGHT.x, y, text: label, size: 10 },
    { x: amountX(amt, RIGHT.amountX), y, text: amt, size: 10, bold: true },
  ];
}

function drawNetPayBox(netPay: number): { graphics: string[]; texts: PdfText[] } {
  const netAmt = formatRupeeForPdf(netPay);
  const { x, y, w, h } = NET_BOX;
  const top = y + h;
  return {
    graphics: [
      fillRect(x, y, w, h, 0.93, 0.96, 1),
      strokeRect(x, y, w, h, 1, 0.65),
    ],
    texts: [
      { x: centerX(netAmt, x, w, 16), y: top - 38, text: netAmt, size: 16, bold: true },
      { x: centerX('Total Net Pay', x, w, 9), y: top - 56, text: 'Total Net Pay', size: 9 },
    ],
  };
}

/** Standard Zoho-style payslip PDF (monthly & annual). */
export function buildPayslipPdf(input: PayslipPdfLayoutInput): Blob {
  const earningRows = input.earnings.filter((row) => row.label !== 'Gross Earnings');
  const deductionRows = input.deductions.filter((row) => row.label !== 'Total Deductions');
  const tableRows = Math.max(earningRows.length, deductionRows.length, 3);

  const cmds: string[] = [];
  const push = (...items: PdfText[]) => {
    for (const item of items) cmds.push(textCmd(item));
  };

  push(
    { x: M, y: 800, text: input.companyName, size: 16, bold: true },
    { x: M, y: 782, text: input.companyAddress, size: 10 },
    { x: M, y: 752, text: input.title, size: 12, bold: true },
    { x: M, y: 734, text: input.subtitle, size: 11, bold: true }
  );
  cmds.push(hLine(M, PAGE.w - M, 722, 1, 0.9));

  push({ x: M, y: 706, text: 'EMPLOYEE SUMMARY', size: 10, bold: true });

  let summaryY = 686;
  for (const row of input.summaryRows) {
    push(
      { x: M, y: summaryY, text: row.label, size: 10 },
      { x: M + 160, y: summaryY, text: row.value, size: 10, bold: true }
    );
    summaryY -= 18;
  }

  const netBox = drawNetPayBox(input.netPay);
  cmds.push(...netBox.graphics);
  push(...netBox.texts);

  const tableTop = 518;
  const tableBottom = tableTop - HEADER_H - tableRows * ROW_H - ROW_H - 8;

  cmds.push(fillRect(M, tableTop - HEADER_H, CONTENT_W, HEADER_H));
  cmds.push(hLine(M, PAGE.w - M, tableTop, 0.8, 0.78));
  cmds.push(hLine(M, PAGE.w - M, tableTop - HEADER_H, 0.8, 0.78));
  cmds.push(vLine(MID_X, tableTop, tableBottom, 0.8, 0.78));

  push(
    { x: LEFT.x, y: tableTop - 15, text: 'EARNINGS', size: 10, bold: true },
    { x: amountX('AMOUNT', LEFT.amountX), y: tableTop - 15, text: 'AMOUNT', size: 10, bold: true },
    { x: RIGHT.x, y: tableTop - 15, text: 'DEDUCTIONS', size: 10, bold: true },
    { x: amountX('AMOUNT', RIGHT.amountX), y: tableTop - 15, text: 'AMOUNT', size: 10, bold: true }
  );

  let y = tableTop - HEADER_H - 14;
  for (let i = 0; i < tableRows; i += 1) {
    const earn = earningRows[i];
    const ded = deductionRows[i];
    if (earn) push(...leftRow(earn.label, earn.amount, y));
    if (ded) push(...rightRow(ded.label, ded.amount, y));
    y -= ROW_H;
  }

  y -= 4;
  cmds.push(hLine(M, PAGE.w - M, y + 12, 0.6, 0.85));
  push(
    ...leftRow('Gross Earnings', input.grossEarnings, y),
    ...rightRow('Total Deductions', input.totalDeductions, y)
  );
  cmds.push(hLine(M, PAGE.w - M, tableBottom, 0.8, 0.78));

  const netTop = tableBottom - 20;
  const netBottom = netTop - 50;
  cmds.push(hLine(M, PAGE.w - M, netTop, 2, 0.12));
  push({ x: M, y: netTop - 18, text: 'TOTAL NET PAYABLE', size: 11, bold: true });
  push({
    x: M,
    y: netTop - 36,
    text: `Gross Earnings - Total Deductions  ${formatRupeeForPdf(input.netPay)}`,
    size: 11,
    bold: true,
  });
  cmds.push(hLine(M, PAGE.w - M, netBottom, 2, 0.12));

  push({
    x: M,
    y: netBottom - 24,
    text: `Amount In Words: Indian Rupee ${input.amountInWords}`,
    size: 10,
  });
  push({
    x: 150,
    y: M,
    text: '-- This is a system-generated document. --',
    size: 9,
  });

  const stream = cmds.join('\n');
  const objects: string[] = [];
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj');
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj');
  objects.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R /F2 6 0 R >> >> >>endobj'
  );
  objects.push(`4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream endobj`);
  objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj');
  objects.push('6 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>endobj');

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
