export type NotificationType =
  | 'admin_chat'
  | 'shift_assigned'
  | 'shift_change_day'
  | 'shift_change_cancelled'
  | 'shift_change_cancel_requested'
  | 'shift_change_cancel_approved'
  | 'shift_change_cancel_rejected'
  | 'compensatory_credit'
  | 'leave_request'
  | 'leave_approved'
  | 'leave_rejected'
  | 'leave_cancelled'
  | 'leave_cancel_requested'
  | 'leave_cancel_approved'
  | 'leave_cancel_rejected'
  | 'shift_continue';

/** Inbox id used for admin-targeted notifications. */
export const ADMIN_NOTIFICATION_INBOX_ID = 'ADMIN';

export interface AdminNotification {
  id: string;
  employeeId: string;
  /** Related entity id (chat message, shift id, or change-day date key). */
  messageId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  type?: NotificationType;
  /** Shift date related to this notice (yyyy-MM-dd), when applicable. */
  relatedDate?: string;
  /** Staff cancelled this shift-change notice. */
  cancelled?: boolean;
  /** Staff requested to cancel a shift change (pending admin review). */
  cancelRequestedAt?: string | null;
}
