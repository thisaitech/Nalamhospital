import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { getItem, setItem } from '@/services/storage';
import {
  getAdminNotifications,
  getNotificationsForEmployee,
} from '@/services/notificationService';
import {
  presentLocalNotification,
  ensureNotificationPermissions,
  subscribeNotificationResponse,
} from '@/services/localPush';
import type { AdminNotification, NotificationType } from '@/types/notification';

const SEEN_KEY_STAFF = '@hospitalhrm/seen_notification_ids';
const SEEN_KEY_ADMIN = '@hospitalhrm/seen_admin_notification_ids';

function seenStorageKey(isAdmin: boolean): string {
  return isAdmin ? SEEN_KEY_ADMIN : SEEN_KEY_STAFF;
}

function bannerIcon(type?: NotificationType): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'shift_assigned':
      return 'calendar';
    case 'shift_change_day':
      return 'swap-horizontal';
    case 'shift_change_cancelled':
    case 'shift_change_cancel_requested':
    case 'shift_change_cancel_rejected':
    case 'leave_cancelled':
    case 'leave_cancel_requested':
      return 'close-circle';
    case 'shift_continue':
      return 'arrow-forward-circle';
    case 'leave_request':
      return 'calendar-outline';
    case 'leave_approved':
    case 'leave_cancel_approved':
      return 'checkmark-circle';
    case 'leave_rejected':
    case 'leave_cancel_rejected':
    case 'shift_change_cancel_rejected':
      return 'close-circle';
    case 'compensatory_credit':
      return 'gift';
    default:
      return 'notifications';
  }
}

function bannerAccent(
  type: NotificationType | undefined,
  colors: (typeof Colors)['light']
): { bg: string; fg: string; border: string } {
  switch (type) {
    case 'leave_cancel_requested':
    case 'shift_change_cancel_requested':
    case 'leave_cancelled':
    case 'leave_rejected':
    case 'leave_cancel_rejected':
    case 'shift_change_cancelled':
    case 'shift_change_cancel_rejected':
      return { bg: colors.dangerLight, fg: colors.danger, border: colors.danger };
    case 'leave_approved':
    case 'leave_cancel_approved':
    case 'shift_change_cancel_approved':
      return { bg: colors.successLight, fg: colors.success, border: colors.success };
    default:
      return { bg: colors.primaryLight, fg: colors.primary, border: colors.primary };
  }
}

function notificationHref(notification: AdminNotification, isAdmin: boolean): Href {
  if (!isAdmin) {
    return `/notifications?id=${encodeURIComponent(notification.id)}` as Href;
  }
  switch (notification.type) {
    case 'leave_request':
      return '/admin/approvals?tab=approve' as Href;
    case 'leave_cancel_requested':
    case 'leave_cancelled':
    case 'shift_change_cancel_requested':
    case 'shift_change_cancelled':
      return '/admin/approvals?tab=cancel' as Href;
    default:
      return `/notifications?id=${encodeURIComponent(notification.id)}` as Href;
  }
}

/**
 * Top floating in-app banner + APK system notifications for newly arrived alerts.
 * Works for staff and admin inboxes.
 */
export function FloatingNotificationHost() {
  const { isAuthenticated, isAdmin, employee, notifications, refreshData } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [banner, setBanner] = useState<AdminNotification | null>(null);
  const [ready, setReady] = useState(false);
  const slide = useRef(new Animated.Value(-120)).current;
  const seenRef = useRef<Set<string>>(new Set());
  const bootstrappedRef = useRef(false);
  const employeeId = employee?.employeeId;
  const storageKey = seenStorageKey(isAdmin);

  useEffect(() => {
    if (!isAuthenticated || (!isAdmin && !employeeId)) {
      bootstrappedRef.current = false;
      setReady(false);
      setBanner(null);
      return;
    }
    let cancelled = false;
    ensureNotificationPermissions().catch(() => {});
    (async () => {
      const [storedIds, existing] = await Promise.all([
        getItem<string[]>(storageKey),
        isAdmin ? getAdminNotifications() : getNotificationsForEmployee(employeeId!),
      ]);
      if (cancelled) return;
      seenRef.current = new Set(storedIds ?? []);
      existing.forEach((n) => seenRef.current.add(n.id));
      bootstrappedRef.current = true;
      await setItem(storageKey, Array.from(seenRef.current));
      try {
        await refreshData();
      } catch {
        // still allow live tracking
      }
      if (cancelled) return;
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isAdmin, employeeId, refreshData, storageKey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (Platform.OS === 'web') return;
    const sub = subscribeNotificationResponse((notificationId) => {
      if (notificationId) {
        router.push(`/notifications?id=${encodeURIComponent(notificationId)}` as Href);
      } else {
        router.push('/notifications' as Href);
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setInterval(() => {
      refreshData().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [isAuthenticated, refreshData]);

  useEffect(() => {
    if (!isAuthenticated || !ready || !bootstrappedRef.current) return;
    if (!isAdmin && !employeeId) return;

    const unreadNew = notifications
      .filter((n) => !n.read && !seenRef.current.has(n.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (!unreadNew.length) return;

    const newest = unreadNew[0];
    unreadNew.forEach((n) => seenRef.current.add(n.id));
    void setItem(storageKey, Array.from(seenRef.current));

    void presentLocalNotification(newest);
    setBanner(newest);
    Animated.spring(slide, {
      toValue: 0,
      useNativeDriver: Platform.OS !== 'web',
      friction: 8,
    }).start();

    const hide = setTimeout(() => {
      Animated.timing(slide, {
        toValue: -120,
        duration: 220,
        useNativeDriver: Platform.OS !== 'web',
      }).start(() => setBanner(null));
    }, 5000);

    return () => clearTimeout(hide);
  }, [notifications, isAuthenticated, isAdmin, employeeId, ready, slide, storageKey]);

  if (!isAuthenticated || !banner) return null;

  const accent = bannerAccent(banner.type, colors);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          paddingTop: Math.max(insets.top, 12),
          transform: [{ translateY: slide }],
        },
      ]}
    >
      <Pressable
        onPress={() => {
          setBanner(null);
          router.push(notificationHref(banner, isAdmin));
        }}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: accent.border,
            borderWidth: 1.5,
          },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: accent.bg }]}>
          <Ionicons name={bannerIcon(banner.type)} size={18} color={accent.fg} />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {banner.title}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={2}>
            {banner.body}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: { fontSize: 14, fontWeight: '800' },
  body: { fontSize: 12, marginTop: 2, fontWeight: '500' },
});
