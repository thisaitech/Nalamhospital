import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import type { NotificationType } from '@/types/notification';

function typeIcon(type?: NotificationType): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'shift_assigned':
      return 'calendar';
    case 'shift_change_day':
      return 'swap-horizontal';
    case 'shift_change_cancelled':
    case 'shift_change_cancel_requested':
    case 'shift_change_cancel_approved':
    case 'shift_change_cancel_rejected':
    case 'leave_cancelled':
    case 'leave_cancel_requested':
      return 'close-circle';
    case 'shift_continue':
      return 'arrow-forward-circle';
    case 'leave_request':
      return 'calendar-outline';
    case 'leave_approved':
      return 'checkmark-circle';
    case 'leave_rejected':
      return 'close-circle';
    case 'compensatory_credit':
      return 'gift';
    default:
      return 'chatbubble-ellipses';
  }
}

function typeLabel(type?: NotificationType): string {
  switch (type) {
    case 'shift_assigned':
      return 'Shift';
    case 'shift_change_day':
      return 'Change day';
    case 'shift_change_cancelled':
      return 'Cancelled';
    case 'shift_change_cancel_requested':
      return 'Cancel request';
    case 'shift_change_cancel_approved':
      return 'Cancel approved';
    case 'shift_change_cancel_rejected':
      return 'Cancel rejected';
    case 'shift_continue':
      return 'Shift continued';
    case 'leave_request':
      return 'Leave request';
    case 'leave_approved':
      return 'Approved';
    case 'leave_rejected':
      return 'Rejected';
    case 'leave_cancelled':
      return 'Leave cancelled';
    case 'leave_cancel_requested':
      return 'Cancel request';
    case 'leave_cancel_approved':
      return 'Cancel approved';
    case 'leave_cancel_rejected':
      return 'Cancel rejected';
    case 'compensatory_credit':
      return 'Comp off';
    default:
      return 'Admin chat';
  }
}

export default function NotificationsScreen() {
  const {
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    unreadNotificationCount,
    refreshData,
    isAdmin,
  } = useApp();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData])
  );

  const sorted = useMemo(
    () => [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notifications]
  );

  const focusId = typeof id === 'string' ? id : undefined;

  const onOpen = useCallback(
    async (notificationId: string) => {
      await markNotificationAsRead(notificationId);
    },
    [markNotificationAsRead]
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Requests', headerBackTitle: 'Back' }} />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.text }]}>Requests</Text>
          {unreadNotificationCount > 0 ? (
            <Button title="Mark all read" size="sm" variant="outline" onPress={() => markAllNotificationsAsRead()} />
          ) : null}
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {isAdmin
            ? 'Shift continue updates, leave requests, cancellations, and staff alerts'
            : 'Leave decisions, shift changes, and admin messages'}
        </Text>

        {sorted.length === 0 ? (
          <Card>
            <Text style={[styles.empty, { color: colors.textSecondary }]}>No requests yet.</Text>
          </Card>
        ) : (
          sorted.map((item) => {
            const focused = focusId === item.id;
            const isDanger =
              item.type === 'shift_change_cancelled' ||
              item.type === 'shift_change_cancel_rejected' ||
              item.type === 'leave_cancelled' ||
              item.type === 'leave_rejected' ||
              item.type === 'leave_cancel_rejected';
            const isSuccess =
              item.type === 'leave_approved' ||
              item.type === 'leave_cancel_approved' ||
              item.type === 'shift_change_cancel_approved';
            const accent = isDanger
              ? colors.danger
              : isSuccess
                ? colors.success
                : colors.primary;
            const accentLight = isDanger
              ? colors.dangerLight
              : isSuccess
                ? colors.successLight
                : colors.primaryLight;
            return (
              <Pressable key={item.id} onPress={() => onOpen(item.id)}>
                <Card
                  style={[
                    styles.card,
                    {
                      borderColor: focused || !item.read ? accent : colors.borderLight,
                      backgroundColor: item.read ? colors.card : accentLight,
                    },
                  ]}
                >
                  <View style={styles.row}>
                    <View style={[styles.iconWrap, { backgroundColor: colors.card }]}>
                      <Ionicons name={typeIcon(item.type)} size={18} color={accent} />
                    </View>
                    <View style={styles.body}>
                      <View style={styles.titleRow}>
                        <Text style={[styles.itemTitle, { color: colors.text }]}>{item.title}</Text>
                        {!item.read ? <View style={[styles.dot, { backgroundColor: accent }]} /> : null}
                      </View>
                      <Text style={[styles.meta, { color: colors.textMuted }]}>
                        {typeLabel(item.type)} · {format(parseISO(item.createdAt), 'MMM d · h:mm a')}
                      </Text>
                      <Text style={[styles.text, { color: colors.textSecondary }]}>{item.body}</Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}

        <Button title="Close" variant="outline" onPress={() => router.back()} style={styles.close} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  title: { fontSize: 24, fontWeight: '800' },
  hint: { fontSize: 13, marginBottom: 14, fontWeight: '500' },
  empty: { textAlign: 'center', padding: 16 },
  card: { marginBottom: 10, borderWidth: 1.5, padding: 12 },
  row: { flexDirection: 'row', gap: 10 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  text: { fontSize: 13, marginTop: 6, lineHeight: 18, fontWeight: '500' },
  close: { marginTop: 8 },
});
