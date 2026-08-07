import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { useMemo } from 'react';

import { Button } from '@/components/ui/Button';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function AnnouncementModal() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { notifications, markNotificationAsRead } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const notification = useMemo(
    () => notifications.find((n) => n.id === id) ?? notifications.find((n) => !n.read) ?? notifications[0],
    [notifications, id]
  );

  const handleDismiss = async () => {
    if (notification && !notification.read) {
      await markNotificationAsRead(notification.id);
    }
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Admin Message', presentation: 'modal' }} />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
      >
        {notification ? (
          <>
            <Text style={[styles.title, { color: colors.text }]}>{notification.title}</Text>
            <Text style={[styles.date, { color: colors.textMuted }]}>
              {format(parseISO(notification.createdAt), 'EEEE, MMM d, yyyy · h:mm a')}
            </Text>
            <View style={[styles.bodyCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
              <Text style={[styles.body, { color: colors.text }]}>{notification.body}</Text>
            </View>
          </>
        ) : (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No announcement found.</Text>
        )}
        <Button title="Got it" onPress={handleDismiss} style={styles.btn} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  date: { fontSize: 13, marginBottom: 16 },
  bodyCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 20 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  empty: { textAlign: 'center', padding: 24, marginBottom: 20 },
  btn: { marginTop: 8 },
});
