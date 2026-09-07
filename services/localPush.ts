import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { AdminNotification } from '@/types/notification';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let permissionsReady: Promise<boolean> | null = null;
let channelReady = false;

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!permissionsReady) {
    permissionsReady = (async () => {
      try {
        const current = await Notifications.getPermissionsAsync();
        if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
          return true;
        }
        const requested = await Notifications.requestPermissionsAsync();
        return Boolean(
          requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
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
  await Notifications.setNotificationChannelAsync('nalam-alerts', {
    name: 'Clinic alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0D9488',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
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
    await ensureAndroidChannel();

    await Notifications.scheduleNotificationAsync({
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
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as
      | { notificationId?: string }
      | undefined;
    onOpen(typeof data?.notificationId === 'string' ? data.notificationId : undefined);
  });
}
