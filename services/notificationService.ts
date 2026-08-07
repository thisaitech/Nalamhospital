import { loadEmployees } from '@/services/employeeRegistry';
import { loadNotifications, saveNotifications } from '@/services/firestoreRepository';
import type { ChatMessage } from '@/types/chat';
import type { AdminNotification } from '@/types/notification';

export async function getNotificationsForEmployee(employeeId: string): Promise<AdminNotification[]> {
  return loadNotifications(employeeId);
}

export async function broadcastAdminNotification(message: ChatMessage): Promise<void> {
  const employees = await loadEmployees();
  const createdAt = message.createdAt;
  const notifications: AdminNotification[] = employees.map((emp) => ({
    id: `notif-${message.id}-${emp.employeeId}`,
    employeeId: emp.employeeId,
    messageId: message.id,
    title: 'Message from Admin',
    body: message.text,
    read: false,
    createdAt,
  }));
  await saveNotifications(notifications);
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

export function countUnreadNotifications(notifications: AdminNotification[]): number {
  return notifications.filter((n) => !n.read).length;
}
