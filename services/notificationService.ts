import { getEmployeeDisplayName, loadEmployees, loadUsers } from '@/services/employeeRegistry';
import { loadNotifications, saveNotifications } from '@/services/firestoreRepository';
import type { ChatMessage } from '@/types/chat';
import {
  ADMIN_NOTIFICATION_INBOX_ID,
  type AdminNotification,
  type NotificationType,
} from '@/types/notification';
import type { ShiftType } from '@/types/employee';
import { format, parseISO } from 'date-fns';

export async function getNotificationsForEmployee(employeeId: string): Promise<AdminNotification[]> {
  return loadNotifications(employeeId);
}

export async function getAdminNotifications(): Promise<AdminNotification[]> {
  return loadNotifications(ADMIN_NOTIFICATION_INBOX_ID);
}

async function loadStaffAndDoctors() {
  const [employees, users] = await Promise.all([loadEmployees(), loadUsers()]);
  const adminEmployeeIds = new Set(
    users.filter((u) => u.role === 'admin' && u.employeeId).map((u) => u.employeeId as string)
  );
  return employees.filter((emp) => !adminEmployeeIds.has(emp.employeeId) && !emp.deletedAt);
}

function baseNotification(params: {
  employeeId: string;
  messageId: string;
  title: string;
  body: string;
  type: NotificationType;
  relatedDate?: string;
}): AdminNotification {
  return {
    id: `notif-${params.type}-${params.messageId}-${params.employeeId}`,
    employeeId: params.employeeId,
    messageId: params.messageId,
    title: params.title,
    body: params.body,
    read: false,
    createdAt: new Date().toISOString(),
    type: params.type,
    relatedDate: params.relatedDate,
  };
}

export async function broadcastAdminNotification(message: ChatMessage): Promise<void> {
  const employees = await loadStaffAndDoctors();
  const createdAt = message.createdAt;
  const notifications: AdminNotification[] = employees.map((emp) => ({
    id: `notif-${message.id}-${emp.employeeId}`,
    employeeId: emp.employeeId,
    messageId: message.id,
    title: 'Message from Admin',
    body: message.text,
    read: false,
    createdAt,
    type: 'admin_chat',
  }));
  await saveNotifications(notifications);
}

export async function notifyShiftAssigned(params: {
  employeeId: string;
  date: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
}): Promise<void> {
  const dateLabel = format(parseISO(params.date), 'EEE, MMM d');
  const item = baseNotification({
    employeeId: params.employeeId,
    messageId: `${params.employeeId}-${params.date}-${params.shiftType}`,
    title: 'Shift assigned',
    body: `You are assigned ${params.shiftType.toUpperCase()} shift on ${dateLabel} (${params.startTime}–${params.endTime}).`,
    type: 'shift_assigned',
    relatedDate: params.date,
  });
  await saveNotifications([item]);
}

export async function notifyShiftChangeDay(params: {
  date: string;
  enabled: boolean;
  /** When set, only these staff/doctors are notified (otherwise everyone). */
  employeeIds?: string[];
  title?: string;
  body?: string;
  messageId?: string;
}): Promise<void> {
  if (!params.enabled) return;
  const employees = await loadStaffAndDoctors();
  const targets = (params.employeeIds?.length
    ? employees.filter((emp) => params.employeeIds!.includes(emp.employeeId))
    : employees
  ).filter((emp) => !emp.is24HourDuty);
  if (!targets.length) return;
  const dateLabel = format(parseISO(params.date), 'EEEE, MMM d');
  const body =
    params.body ??
    `${dateLabel} is marked as a shift change day. Check your shift timings.`;
  const notifications = targets.map((emp) =>
    baseNotification({
      employeeId: emp.employeeId,
      messageId: params.messageId ?? `change-day-${params.date}`,
      title: params.title ?? 'Shift change day',
      body,
      type: 'shift_change_day',
      relatedDate: params.date,
    })
  );
  await saveNotifications(notifications);
}

/** Admin cancels a shift change — marks prior notices and notifies the staff member. */
export async function notifyShiftChangeCancelledByAdmin(params: {
  employeeId: string;
  date: string;
  body?: string;
}): Promise<void> {
  const all = await loadNotifications(params.employeeId);
  const stale = all.filter(
    (n) =>
      n.type === 'shift_change_day' &&
      n.relatedDate === params.date &&
      !n.cancelled
  );
  if (stale.length) {
    await saveNotifications(stale.map((n) => ({ ...n, read: true, cancelled: true })));
  }

  const dateLabel = format(parseISO(params.date), 'EEEE, MMM d');
  const item = baseNotification({
    employeeId: params.employeeId,
    messageId: `admin-cancel-${params.date}-${Date.now()}`,
    title: 'Normal shift restored',
    body:
      params.body ??
      `Your shift change day (${dateLabel}) is cancelled. You are now on your normal shift.`,
    type: 'shift_change_cancelled',
    relatedDate: params.date,
  });
  await saveNotifications([item]);
}

/** Staff rejects a shift change — restores regular timing and notifies admin inbox. */
export async function cancelShiftChangeNotification(params: {
  notificationId: string;
  employeeId: string;
}): Promise<AdminNotification | null> {
  const all = await loadNotifications(params.employeeId);
  const target = all.find((n) => n.id === params.notificationId);
  if (!target) return null;

  if (target.cancelled || target.cancelRequestedAt) {
    return target;
  }

  if (target.type !== 'shift_change_day') {
    throw new Error('Only shift change requests can be cancelled.');
  }

  const employees = await loadEmployees();
  const emp = employees.find((e) => e.employeeId === params.employeeId);
  if (emp?.is24HourDuty) {
    throw new Error('24-hour doctors are not eligible for shift changes.');
  }

  const date = target.relatedDate;
  if (!date) {
    throw new Error('Shift change date is missing.');
  }

  const { findShiftChangeHistoryEntry, restoreRegularShiftAfterCancel } = await import(
    '@/services/shiftChangeCancelService'
  );
  const historyItem = await findShiftChangeHistoryEntry(params.employeeId, date);
  await restoreRegularShiftAfterCancel({
    employeeId: params.employeeId,
    date,
    historyItem,
  });

  const { markShiftNoticesCancelledForDate } = await import('@/services/notificationService');
  await markShiftNoticesCancelledForDate({ employeeId: params.employeeId, date });

  const now = new Date().toISOString();
  const updated: AdminNotification = {
    ...target,
    read: true,
    cancelRequestedAt: now,
  };
  await saveNotifications([updated]);

  const name = emp ? getEmployeeDisplayName(emp) : params.employeeId;
  const dateLabel = format(parseISO(date), 'EEEE, MMM d');

  const adminNotice = baseNotification({
    employeeId: ADMIN_NOTIFICATION_INBOX_ID,
    messageId: `shift-cancel-req-${params.notificationId}`,
    title: 'Shift change cancellation requested',
    body: `${name} requested to cancel the shift change for ${dateLabel}. Regular shift timing restored — review in Leave approvals.`,
    type: 'shift_change_cancel_requested',
    relatedDate: date,
  });
  await saveNotifications([adminNotice]);
  return updated;
}

export async function notifyEmployeeShiftChangeCancelDecision(params: {
  employeeId: string;
  notificationId: string;
  decision: 'approved' | 'rejected';
  date: string;
  reviewedBy?: string;
}): Promise<void> {
  const dateLabel = format(parseISO(params.date), 'EEEE, MMM d');
  const approved = params.decision === 'approved';
  await saveNotifications([
    baseNotification({
      employeeId: params.employeeId,
      messageId: `shift-cancel-${params.decision}-${params.notificationId}`,
      title: approved ? 'Normal shift restored' : 'Shift change cancel rejected',
      body: approved
        ? `Your shift change day is cancelled. You are now on your normal shift.`
        : `Your request to cancel the shift change on ${dateLabel} was rejected${params.reviewedBy ? ` by ${params.reviewedBy}` : ''}. Continue with the shift change day schedule.`,
      type: approved ? 'shift_change_cancel_approved' : 'shift_change_cancel_rejected',
      relatedDate: params.date,
    }),
  ]);
}

/** Mark shift-change and shift-assigned notices as cancelled for a staff member on a date. */
export async function markShiftNoticesCancelledForDate(params: {
  employeeId: string;
  date: string;
}): Promise<void> {
  const all = await loadNotifications(params.employeeId);
  const stale = all.filter(
    (n) =>
      (n.type === 'shift_change_day' || n.type === 'shift_assigned') &&
      n.relatedDate === params.date &&
      !n.cancelled
  );
  if (!stale.length) return;
  await saveNotifications(stale.map((n) => ({ ...n, cancelled: true, read: true })));
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const all = await loadNotifications();
  const target = all.find((n) => n.id === notificationId);
  if (!target || target.read) return;
  await saveNotifications([{ ...target, read: true }]);
}

export async function markAllNotificationsRead(employeeId: string): Promise<void> {
  const items = await loadNotifications(employeeId);
  const unread = items.filter((n) => !n.read);
  if (!unread.length) return;
  await saveNotifications(unread.map((n) => ({ ...n, read: true })));
}

export async function notifyCompensatoryCreditEarned(params: {
  employeeId: string;
  earnedDate: string;
}): Promise<void> {
  const dateLabel = format(parseISO(params.earnedDate), 'EEE, MMM d');
  const item = baseNotification({
    employeeId: params.employeeId,
    messageId: `comp-credit-${params.earnedDate}`,
    title: 'Compensatory leave earned',
    body: `You earned 1 compensatory off for completing an extra continued shift on ${dateLabel}. Use it from the Leave tab when you need a day off.`,
    type: 'compensatory_credit',
    relatedDate: params.earnedDate,
  });
  await saveNotifications([item]);
}

function leaveDateRangeLabel(startDate: string, endDate: string): string {
  if (startDate === endDate) return format(parseISO(startDate), 'EEE, MMM d');
  return `${format(parseISO(startDate), 'MMM d')} – ${format(parseISO(endDate), 'MMM d')}`;
}

export async function notifyAdminLeaveSubmitted(params: {
  employeeId: string;
  requestId: string;
  startDate: string;
  endDate: string;
  leaveTypeLabel: string;
}): Promise<void> {
  const employees = await loadEmployees();
  const emp = employees.find((e) => e.employeeId === params.employeeId);
  const name = emp ? getEmployeeDisplayName(emp) : params.employeeId;
  const range = leaveDateRangeLabel(params.startDate, params.endDate);
  await saveNotifications([
    baseNotification({
      employeeId: ADMIN_NOTIFICATION_INBOX_ID,
      messageId: `leave-submit-${params.requestId}`,
      title: 'New leave request',
      body: `${name} requested ${params.leaveTypeLabel} leave for ${range}. Review in Leave approvals.`,
      type: 'leave_request',
      relatedDate: params.startDate,
    }),
  ]);
}

export async function notifyEmployeeLeaveDecision(params: {
  employeeId: string;
  requestId: string;
  decision: 'approved' | 'rejected';
  startDate: string;
  endDate: string;
  leaveTypeLabel: string;
  reviewedBy?: string;
}): Promise<void> {
  const range = leaveDateRangeLabel(params.startDate, params.endDate);
  const approved = params.decision === 'approved';
  await saveNotifications([
    baseNotification({
      employeeId: params.employeeId,
      messageId: `leave-${params.decision}-${params.requestId}`,
      title: approved ? 'Leave approved' : 'Leave rejected',
      body: approved
        ? `Your ${params.leaveTypeLabel} leave for ${range} was approved${params.reviewedBy ? ` by ${params.reviewedBy}` : ''}.`
        : `Your ${params.leaveTypeLabel} leave for ${range} was rejected${params.reviewedBy ? ` by ${params.reviewedBy}` : ''}.`,
      type: approved ? 'leave_approved' : 'leave_rejected',
      relatedDate: params.startDate,
    }),
  ]);
}

export async function notifyAdminLeaveCancelled(params: {
  employeeId: string;
  requestId: string;
  startDate: string;
  endDate: string;
  leaveTypeLabel: string;
  wasApproved: boolean;
}): Promise<void> {
  const employees = await loadEmployees();
  const emp = employees.find((e) => e.employeeId === params.employeeId);
  const name = emp ? getEmployeeDisplayName(emp) : params.employeeId;
  const range = leaveDateRangeLabel(params.startDate, params.endDate);
  await saveNotifications([
    baseNotification({
      employeeId: ADMIN_NOTIFICATION_INBOX_ID,
      messageId: `leave-cancel-${params.requestId}-${Date.now()}`,
      title: 'Leave cancelled',
      body: `${name} cancelled their ${params.wasApproved ? 'approved ' : ''}${params.leaveTypeLabel} leave for ${range}.`,
      type: 'leave_cancelled',
      relatedDate: params.startDate,
    }),
  ]);
}

export async function notifyAdminLeaveCancelRequested(params: {
  employeeId: string;
  requestId: string;
  startDate: string;
  endDate: string;
  leaveTypeLabel: string;
}): Promise<void> {
  const employees = await loadEmployees();
  const emp = employees.find((e) => e.employeeId === params.employeeId);
  const name = emp ? getEmployeeDisplayName(emp) : params.employeeId;
  const range = leaveDateRangeLabel(params.startDate, params.endDate);
  await saveNotifications([
    baseNotification({
      employeeId: ADMIN_NOTIFICATION_INBOX_ID,
      messageId: `leave-cancel-req-${params.requestId}`,
      title: 'Leave cancellation requested',
      body: `${name} requested to cancel approved ${params.leaveTypeLabel} leave for ${range}. Review in Leave approvals.`,
      type: 'leave_cancel_requested',
      relatedDate: params.startDate,
    }),
  ]);
}

export async function notifyEmployeeLeaveCancelDecision(params: {
  employeeId: string;
  requestId: string;
  decision: 'approved' | 'rejected';
  startDate: string;
  endDate: string;
  leaveTypeLabel: string;
  reviewedBy?: string;
}): Promise<void> {
  const range = leaveDateRangeLabel(params.startDate, params.endDate);
  const approved = params.decision === 'approved';
  await saveNotifications([
    baseNotification({
      employeeId: params.employeeId,
      messageId: `leave-cancel-${params.decision}-${params.requestId}`,
      title: approved ? 'Leave cancellation approved' : 'Leave cancellation rejected',
      body: approved
        ? `Your request to cancel ${params.leaveTypeLabel} leave for ${range} was approved${params.reviewedBy ? ` by ${params.reviewedBy}` : ''}.`
        : `Your request to cancel ${params.leaveTypeLabel} leave for ${range} was rejected${params.reviewedBy ? ` by ${params.reviewedBy}` : ''}. You are marked absent for ${range}.`,
      type: approved ? 'leave_cancel_approved' : 'leave_cancel_rejected',
      relatedDate: params.startDate,
    }),
  ]);
}

export async function notifyAdminShiftContinue(params: {
  employeeId: string;
  date: string;
  continueAt: string;
}): Promise<void> {
  const employees = await loadEmployees();
  const emp = employees.find((e) => e.employeeId === params.employeeId);
  const name = emp ? getEmployeeDisplayName(emp) : params.employeeId;

  const { loadShiftsInRange } = await import('@/services/shiftService');
  const { formatDisplayTime } = await import('@/utils/formatTime');
  const shifts = await loadShiftsInRange(params.date, params.date, params.employeeId);
  let shiftLabel = 'Shift';
  if (shifts[0]?.shiftType === 'night') {
    shiftLabel = 'Night shift';
  } else if (shifts[0]?.shiftType === 'day') {
    shiftLabel = 'Day shift';
  } else if (emp?.is24HourDuty) {
    shiftLabel = '24 hour duty';
  } else if (emp?.nightShiftEnabled && !emp.dayShiftEnabled) {
    shiftLabel = 'Night shift';
  } else if (emp?.dayShiftEnabled) {
    shiftLabel = 'Day shift';
  }

  const dateLabel = format(parseISO(params.date), 'EEEE, MMM d');
  const timeLabel = formatDisplayTime(params.continueAt);

  await saveNotifications([
    baseNotification({
      employeeId: ADMIN_NOTIFICATION_INBOX_ID,
      messageId: `shift-continue-${params.employeeId}-${params.date}-${params.continueAt}`,
      title: 'Shift continued',
      body: `${name} (${shiftLabel}) continued the shift on ${dateLabel} at ${timeLabel}.`,
      type: 'shift_continue',
      relatedDate: params.date,
    }),
  ]);
}

export function countUnreadNotifications(notifications: AdminNotification[]): number {
  return notifications.filter((n) => !n.read).length;
}
