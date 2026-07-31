export const FIRESTORE_COLLECTIONS = {
  META: 'meta',
  USERS: 'users',
  EMPLOYEES: 'employees',
  LEAVE_BALANCES: 'leaveBalances',
  ATTENDANCE: 'attendance',
  LEAVE_REQUESTS: 'leaveRequests',
  CHAT_MESSAGES: 'chatMessages',
  SALARY_SLIPS: 'salarySlips',
  PERFORMANCE_REVIEWS: 'performanceReviews',
  SHIFT_ASSIGNMENTS: 'shiftAssignments',
} as const;

/** Bump to force clinic HR seed on next app start when prior seed exists. */
export const FIRESTORE_SEED_VERSION = 2;
