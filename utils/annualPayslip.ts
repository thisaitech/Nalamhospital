/** Convert a whole-rupee amount to Indian-style words (e.g. Ninety Four Thousand Seventy Seven Only). */
export function amountInWords(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return 'Zero Only';

  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigits = (num: number): string => {
    if (num < 20) return ones[num];
    const t = Math.floor(num / 10);
    const o = num % 10;
    return `${tens[t]}${o ? ` ${ones[o]}` : ''}`.trim();
  };

  const threeDigits = (num: number): string => {
    const h = Math.floor(num / 100);
    const rest = num % 100;
    if (h && rest) return `${ones[h]} Hundred ${twoDigits(rest)}`;
    if (h) return `${ones[h]} Hundred`;
    return twoDigits(rest);
  };

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = n % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  return `${parts.join(' ')} Only`;
}

export function formatPayslipDate(date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Indian FY label: Apr–Mar (e.g. 2025 - 2026). */
export function currentFinancialYearLabel(date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based
  const start = month >= 3 ? year : year - 1;
  return `${start} - ${start + 1}`;
}

const ANNUAL_MONTHS = 12;

/** Annual salary heads derived from monthly employee profile (monthly × 12). */
export function buildAnnualEarningsFromEmployee(employee: {
  baseSalary?: number;
  busFare?: number;
}): {
  basic: string;
  dearness: string;
  onCall: string;
  conveyance: string;
  medical: string;
  special: string;
} {
  const monthlyBasic = Math.max(0, Number(employee.baseSalary) || 0);
  const monthlyConveyance = Math.max(0, Number(employee.busFare) || 0);
  return {
    basic: monthlyBasic > 0 ? String(monthlyBasic * ANNUAL_MONTHS) : '',
    dearness: '',
    onCall: '',
    conveyance: monthlyConveyance > 0 ? String(monthlyConveyance * ANNUAL_MONTHS) : '',
    medical: '',
    special: '',
  };
}

/** Recent financial year options for the annual payslip year picker. */
export function buildFinancialYearOptions(count = 6, date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const currentStart = month >= 3 ? year : year - 1;
  return Array.from({ length: count }, (_, i) => {
    const start = currentStart - i;
    const label = `${start} - ${start + 1}`;
    return { value: label, label };
  });
}
