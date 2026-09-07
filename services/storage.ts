import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  SESSION: '@workpulse/session',
  ATTENDANCE: '@workpulse/attendance',
  LEAVE_REQUESTS: '@workpulse/leave_requests',
  CHAT_MESSAGES: '@workpulse/chat_messages',
  EMPLOYEES: '@workpulse/employees',
  USERS: '@workpulse/users',
  LEAVE_BALANCES: '@workpulse/leave_balances',
  ADMIN_CLINIC_FILTER: '@hospitalhrm/admin_clinic_filter',
} as const;

export async function getItem<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function removeItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

export const storageKeys = KEYS;
