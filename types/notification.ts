export interface AdminNotification {
  id: string;
  employeeId: string;
  messageId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}
