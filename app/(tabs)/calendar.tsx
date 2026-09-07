import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AttendanceCalendarPanel } from '@/components/attendance/AttendanceCalendarPanel';
import { ClinicStaffLeavePanel } from '@/components/leave/ClinicStaffLeavePanel';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

type DoctorCalendarMode = 'leave' | 'calendar';

/**
 * Doctor-only: toggle between clinic Leaves (view only) and Calendar View.
 */
export default function DoctorCalendarScreen() {
  const { isAuthenticated, isAdmin, employee } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [screenMode, setScreenMode] = useState<DoctorCalendarMode>('leave');

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }
  if (isAdmin) {
    return <Redirect href="/admin/attendance" />;
  }
  if (employee?.staffCategory !== 'doctor') {
    return <Redirect href="/(tabs)/attendance" />;
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.modeRow}>
        {(
          [
            { id: 'leave', label: 'Leaves' },
            { id: 'calendar', label: 'Calendar View' },
          ] as const
        ).map((mode) => {
          const active = screenMode === mode.id;
          return (
            <Pressable
              key={mode.id}
              onPress={() => setScreenMode(mode.id)}
              style={[
                styles.modeChip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.borderLight,
                },
              ]}
            >
              <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700', fontSize: 12 }}>
                {mode.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {screenMode === 'calendar' ? (
        <>
          <Text style={[styles.title, { color: colors.text }]}>Calendar</Text>
          <AttendanceCalendarPanel mode="doctor" doctorClinicId={employee.clinicId} />
        </>
      ) : (
        <ClinicStaffLeavePanel clinicId={employee.clinicId} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 12 },
});
