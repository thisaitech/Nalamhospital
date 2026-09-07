export const PAID_SYMBOL = '✓';
export const PENDING_WRONG_SYMBOL = '✕';

export type SymbolStatus = 'paid' | 'pending' | 'approved' | 'rejected' | 'cancelled';

export const STATUS_SYMBOLS: Record<SymbolStatus, { label: string; symbol: string; tone: 'success' | 'warning' | 'danger' }> = {
  paid: { label: 'Paid', symbol: PAID_SYMBOL, tone: 'success' },
  approved: { label: 'Approved', symbol: PAID_SYMBOL, tone: 'success' },
  pending: { label: 'Pending', symbol: PENDING_WRONG_SYMBOL, tone: 'warning' },
  rejected: { label: 'Rejected', symbol: PENDING_WRONG_SYMBOL, tone: 'danger' },
  cancelled: { label: 'Cancelled', symbol: PENDING_WRONG_SYMBOL, tone: 'danger' },
};
