import { Platform } from 'react-native';
import type * as NotificationsType from 'expo-notifications';

import type { AdminNotification } from '@/types/notification';

type NotificationsModule = typeof NotificationsType;

let Notifications: NotificationsModule | null = null;
let handlerReady = false;
let permissionsReady: Promise<boolean> | null = null;
let channelReady = false;

async function getNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') return null;
  if (!Notifications) {
    try {
      Notifications = await import('expo-notifications');
    } catch (error) {
      console.warn('[notifications] Module unavailable', error);
      return null;
    }
  }
  if (!handlerReady && Notifications) {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
      handlerReady = true;
    } catch (error) {
      console.warn('[notifications] Could not register notification handler', error);
    }
  }
  return Notifications;
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!permissionsReady) {
    permissionsReady = (async () => {
      try {
        const mod = await getNotifications();
        if (!mod) return false;
        const current = await mod.getPermissionsAsync();
        if (current.granted || current.ios?.status === mod.IosAuthorizationStatus.PROVISIONAL) {
          return true;
        }
        const requested = await mod.requestPermissionsAsync();
        return Boolean(
          requested.granted || requested.ios?.status === mod.IosAuthorizationStatus.PROVISIONAL
        );
      } catch {
        return false;
      }
    })();
  }
  return permissionsReady;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelReady) return;
  const mod = await getNotifications();
  if (!mod) return;
  await mod.setNotificationChannelAsync('nalam-alerts', {
    name: 'Clinic alerts',
    importance: mod.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0D9488',
    lockscreenVisibility: mod.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });
  channelReady = true;
}

/** Shows a top-floating system notification (works in APK / native builds). */
export async function presentLocalNotification(
  notification: Pick<AdminNotification, 'id' | 'title' | 'body' | 'type'>
): Promise<void> {
  if (Platform.OS === 'web') return;
  const ok = await ensureNotificationPermissions();
  if (!ok) return;

  try {
    const mod = await getNotifications();
    if (!mod) return;
    await ensureAndroidChannel();

    await mod.scheduleNotificationAsync({
      content: {
        title: notification.title,
        body: notification.body,
        data: {
          notificationId: notification.id,
          type: notification.type ?? 'admin_chat',
        },
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: 'nalam-alerts' } : null),
      },
      trigger: null,
    });
  } catch (error) {
    console.warn('[notifications] Could not present local notification', error);
  }
}

/** Opens the in-app notifications screen when the user taps a system tray alert. */
export function subscribeNotificationResponse(
  onOpen: (notificationId?: string) => void
): { remove: () => void } {
  let subscription: { remove: () => void } | null = null;
  let cancelled = false;

  void (async () => {
    const mod = await getNotifications();
    if (!mod || cancelled) return;
    subscription = mod.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { notificationId?: string }
        | undefined;
      onOpen(typeof data?.notificationId === 'string' ? data.notificationId : undefined);
    });
  })();

  return {
    remove: () => {
      cancelled = true;
      subscription?.remove();
    },
  };
}
