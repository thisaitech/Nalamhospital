import { format, parseISO } from 'date-fns';

import type { LeaveActionEntry, LeaveRequest } from '@/types/employee';

export interface LeaveDecisionInfo {
  action: 'approved' | 'rejected';
  by: string;
  at: string | null;
}

export interface LeaveCancelDecisionInfo {
  action: 'cancel_approved' | 'cancel_rejected';
  by: string;
  at: string;
}

const NON_ADMIN_REVIEWERS = new Set(['Employee', 'System']);

export function formatAdminIdentity(name?: string | null, email?: string | null): string {
  const cleanName = name?.trim() ?? '';
  const cleanEmail = email?.trim() ?? '';
  if (cleanEmail && cleanName && cleanName.toLowerCase() !== cleanEmail.toLowerCase()) {
    return `${cleanName} (${cleanEmail})`;
  }
  return cleanEmail || cleanName;
}

/** e.g. 03-Oct-2026 06:30 PM */
export function formatLeaveActionTime(iso: string): string {
  try {
    return format(parseISO(iso), 'dd-MMM-yyyy hh:mm a');
  } catch {
    return iso;
  }
}

function lastEntry(
  request: LeaveRequest,
  actions: LeaveActionEntry['action'][]
): LeaveActionEntry | undefined {
  const history = request.actionHistory ?? [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (actions.includes(history[i].action)) return history[i];
  }
  return undefined;
}

/** Who approved/rejected the request. Falls back to legacy `reviewedBy` for older records. */
export function getLeaveDecision(request: LeaveRequest): LeaveDecisionInfo | null {
  const entry = lastEntry(request, ['approved', 'rejected']);
  if (entry) {
    return {
      action: entry.action as 'approved' | 'rejected',
      by: formatAdminIdentity(entry.adminName, entry.adminEmail),
      at: entry.at,
    };
  }
  if (
    (request.status === 'approved' || request.status === 'rejected') &&
    request.reviewedBy &&
    !NON_ADMIN_REVIEWERS.has(request.reviewedBy)
  ) {
    return {
      action: request.status,
      by: formatAdminIdentity(request.reviewedBy, request.reviewedByEmail),
      at: request.reviewedAt ?? null,
    };
  }
  return null;
}

/** Who approved/rejected the staff member's cancellation request, if any. */
export function getLeaveCancelDecision(request: LeaveRequest): LeaveCancelDecisionInfo | null {
  const entry = lastEntry(request, ['cancel_approved', 'cancel_rejected']);
  if (!entry) return null;
  return {
    action: entry.action as 'cancel_approved' | 'cancel_rejected',
    by: formatAdminIdentity(entry.adminName, entry.adminEmail),
    at: entry.at,
  };
}
