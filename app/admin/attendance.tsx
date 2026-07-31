import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/SelectField';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { MONTH_NAMES } from '@/constants/config';
import type { AttendanceSummary } from '@/types/employee';
import { useColorScheme } from '@/components/useColorScheme';

export default function AdminAttendanceScreen() {
  const { getAttendanceSummaries } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [summaries, setSummaries] = useState<AttendanceSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const monthOptions = MONTH_NAMES.map((label, index) => ({
    value: String(index),
    label,
  }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAttendanceSummaries(year, monthIndex);
      setSummaries(data);
    } finally {
      setLoading(false);
    }
  }, [getAttendanceSummaries, year, monthIndex]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text style={[styles.title, { color: colors.text }]}>Attendance overview</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Scheduled hours, attended hours, and absent days per person
      </Text>

      <SelectField
        label="Month"
        value={String(monthIndex)}
        options={monthOptions}
        onChange={(v) => setMonthIndex(Number(v))}
        textColor={colors.text}
        mutedColor={colors.textMuted}
        borderColor={colors.borderLight}
        cardColor={colors.card}
        primaryColor={colors.primary}
        dangerColor={colors.danger}
      />

      {summaries.map((row) => (
        <Card key={row.employeeId} style={styles.card}>
          <Text style={[styles.name, { color: colors.text }]}>{row.employeeName}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {row.staffCategory === 'doctor' ? 'Doctor' : 'Staff'} · {row.employeeId}
          </Text>
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, { color: colors.text }]}>{row.scheduledHours}h</Text>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Scheduled</Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, { color: '#0F766E' }]}>{row.attendedHours}h</Text>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Attended</Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, { color: colors.danger }]}>{row.absentDays}</Text>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Absent</Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.metricValue, { color: '#B45309' }]}>{row.otHours}h</Text>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>OT</Text>
            </View>
          </View>
        </Card>
      ))}

      {!loading && summaries.length === 0 ? (
        <Card>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No attendance data for this period.</Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 10 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 13, marginBottom: 8 },
  card: { marginTop: 4 },
  name: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2, marginBottom: 10 },
  metrics: { flexDirection: 'row', justifyContent: 'space-between' },
  metric: { alignItems: 'center', flex: 1 },
  metricValue: { fontSize: 16, fontWeight: '800' },
  metricLabel: { fontSize: 11, marginTop: 2 },
  empty: { textAlign: 'center', padding: 16 },
});
