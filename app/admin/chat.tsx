import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { format, parseISO } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { CHAT_CATEGORY_LABELS } from '@/constants/tabPictures';
import type { ChatCategory, ChatMessage } from '@/types/chat';
import { useColorScheme } from '@/components/useColorScheme';

const QUICK_MESSAGES: { label: string; text: string; category: ChatCategory }[] = [
  { label: 'Holiday notice', text: 'Clinic will remain closed tomorrow for the holiday.', category: 'general' },
  { label: 'Shift update', text: 'Please check the shift chart for schedule changes this week.', category: 'update' },
  { label: 'Meeting', text: 'Team meeting today at 4 PM in the admin office.', category: 'general' },
];

const CATEGORY_COLORS: Record<ChatCategory, string> = {
  general: '#64748B',
  update: '#4F46E5',
  'sick-leave': '#DC2626',
  leave: '#D97706',
};

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export default function AdminChatScreen() {
  const { chatMessages, sendMessage, adminName } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(
    async (messageText?: string, messageCategory: ChatCategory = 'general') => {
      const body = (messageText ?? text).trim();
      if (!body || sending) return;
      setSending(true);
      try {
        await sendMessage(body, messageCategory);
        setText('');
        showAlert('Sent', 'All doctors and staff have been notified.');
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      } catch (e) {
        showAlert('Error', e instanceof Error ? e.message : 'Could not send message.');
      } finally {
        setSending(false);
      }
    },
    [text, sending, sendMessage]
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
        <View style={[styles.infoBar, { backgroundColor: `${colors.primary}14` }]}>
          <Text style={[styles.infoText, { color: colors.primary }]}>
            Messages here are sent to all doctors and staff as notifications.
          </Text>
        </View>

        <FlatList
          ref={listRef}
          data={chatMessages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }: { item: ChatMessage }) => (
            <View style={styles.messageRow}>
              <View style={[styles.bubble, { backgroundColor: colors.primary }]}>
                <Text style={styles.sender}>{adminName ?? 'Admin'}</Text>
                <View style={[styles.categoryTag, { backgroundColor: `${CATEGORY_COLORS[item.category]}33` }]}>
                  <Text style={[styles.categoryText, { color: '#FFF' }]}>
                    {CHAT_CATEGORY_LABELS[item.category]}
                  </Text>
                </View>
                <Text style={styles.messageText}>{item.text}</Text>
                <Text style={styles.time}>{format(parseISO(item.createdAt), 'MMM d, h:mm a')}</Text>
              </View>
            </View>
          )}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No broadcasts yet. Send your first message below.
            </Text>
          }
        />

        <View
          style={[
            styles.composer,
            { backgroundColor: colors.card, borderTopColor: colors.borderLight, paddingBottom: insets.bottom + 4 },
          ]}
        >
          <View style={styles.quickRow}>
            {QUICK_MESSAGES.map((quick) => (
              <Pressable
                key={quick.label}
                style={[styles.quickChip, { backgroundColor: colors.background, borderColor: colors.borderLight }]}
                onPress={() => handleSend(quick.text, quick.category)}
                disabled={sending}
              >
                <Text style={[styles.quickText, { color: colors.primary }]}>{quick.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, backgroundColor: colors.background, borderColor: colors.borderLight },
              ]}
              value={text}
              onChangeText={setText}
              placeholder="Type a broadcast message..."
              placeholderTextColor={colors.textMuted}
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={() => handleSend()}
              blurOnSubmit={false}
            />
            <Pressable
              style={[
                styles.sendBtn,
                {
                  backgroundColor: text.trim() ? colors.primary : colors.borderLight,
                },
              ]}
              onPress={() => handleSend()}
              disabled={!text.trim() || sending}
            >
              <Text style={[styles.sendText, { color: text.trim() ? '#FFF' : colors.textMuted }]}>
                {sending ? '...' : 'Send'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  infoBar: { paddingHorizontal: 16, paddingVertical: 10, marginHorizontal: 16, marginTop: 8, borderRadius: 12 },
  infoText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  messageList: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  messageRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 14 },
  bubble: { maxWidth: '88%', borderRadius: 18, padding: 12 },
  sender: { fontSize: 12, fontWeight: '700', marginBottom: 4, color: 'rgba(255,255,255,0.9)' },
  categoryTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 6 },
  categoryText: { fontSize: 10, fontWeight: '700' },
  messageText: { fontSize: 15, lineHeight: 21, fontWeight: '500', color: '#FFF' },
  time: { fontSize: 10, marginTop: 6, alignSelf: 'flex-end', color: 'rgba(255,255,255,0.75)' },
  empty: { textAlign: 'center', padding: 24, fontSize: 14 },
  composer: { borderTopWidth: 1, paddingTop: 8, paddingHorizontal: 12 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  quickChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  quickText: { fontSize: 11, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    fontSize: 15,
    minHeight: 44,
  },
  sendBtn: {
    minWidth: 64,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  sendText: { fontSize: 14, fontWeight: '700' },
});
