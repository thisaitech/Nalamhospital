import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { addMonths, format, startOfMonth } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { loadAllAttendance } from '@/services/firestoreRepository';
import { loadShiftsForDate } from '@/services/shiftService';
import type { AttendanceSummary } from '@/types/employee';
import { useColorScheme } from '@/components/useColorScheme';
import {
  buildLatecomerRows,
  countLateToday,
  formatLateDuration,
  lateSecondsByEmployee,
  lateSeverityTone,
} from '@/utils/lateAttendance';

function buildMonthOptions(count = 12) {
  const base = startOfMonth(new Date());
  return Array.from({ length: count }, (_, i) => {
    const date = addMonths(base, -i);
    return {
      value: `${date.getFullYear()}-${date.getMonth()}`,
      label: format(date, 'MMMM yyyy'),
      year: date.getFullYear(),
      monthIndex: date.getMonth(),
    };
  });
}

export default function AdminAttendanceScreen() {
  const router = useRouter();
  const { getAttendanceSummaries, todayShifts, peopleOnLeaveToday } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const monthOptions = useMemo(() => buildMonthOptions(12), []);
  const now = new Date();
  const [periodKey, setPeriodKey] = useState(`${now.getFullYear()}-${now.getMonth()}`);
  const [summaries, setSummaries] = useState<AttendanceSummary[]>([]);
  const [absentToday, setAbsentToday] = useState(0);
  const [lateToday, setLateToday] = useState(0);
  const [todayLateMap, setTodayLateMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedPeriod = monthOptions.find((o) => o.value === periodKey) ?? monthOptions[0];
  const year = selectedPeriod.year;
  const monthIndex = selectedPeriod.monthIndex;

  const avgAttendance = useMemo(() => {
    const scheduled = summaries.reduce((sum, row) => sum + row.scheduledHours, 0);
    const attended = summaries.reduce((sum, row) => sum + row.attendedHours, 0);
    if (scheduled <= 0) return 0;
    return Math.round((attended / scheduled) * 1000) / 10;
  }, [summaries]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, attendance] = await Promise.all([
        getAttendanceSummaries(year, monthIndex),
        loadAllAttendance(),
      ]);
      setSummaries(data);

      const today = format(new Date(), 'yyyy-MM-dd');
      const onLeave = new Set(peopleOnLeaveToday.map((p) => p.employeeId));
      const scheduledIds = new Set(todayShifts.map((s) => s.employeeId));
      let absent = 0;
      for (const employeeId of scheduledIds) {
        if (onLeave.has(employeeId)) continue;
        const record = attendance.find((r) => r.employeeId === employeeId && r.date === today);
        if (!record?.punchIn) absent += 1;
      }
      setAbsentToday(absent);

      const shifts = await loadShiftsForDate(today);
      const lateRows = buildLatecomerRows(today, shifts, attendance);
      setLateToday(countLateToday(lateRows));
      setTodayLateMap(lateSecondsByEmployee(lateRows));
    } finally {
      setLoading(false);
    }
  }, [getAttendanceSummaries, year, monthIndex, todayShifts, peopleOnLeaveToday]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const selectPeriod = (value: string) => {
    setPeriodKey(value);
    setPickerOpen(false);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text style={[styles.title, { color: colors.text }]}>Attendance overview</Text>

      {Platform.OS === 'web' ? (
        <View
          style={[
            styles.monthBar,
            {
              backgroundColor: colors.card,
              borderColor: colors.borderLight,
              shadowColor: colors.shadow,
            },
          ]}
        >
          <select
            aria-label="Month"
            value={periodKey}
            onChange={(event) => setPeriodKey(event.target.value)}
            style={{
              flex: 1,
              width: '100%',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: colors.text,
              fontSize: 16,
              fontWeight: 700,
              fontFamily: 'inherit',
              padding: '14px 8px',
              appearance: 'none',
              WebkitAppearance: 'none',
              cursor: 'pointer',
            }}
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </View>
      ) : (
        <>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={[
              styles.monthBar,
              {
                backgroundColor: colors.card,
                borderColor: colors.borderLight,
                shadowColor: colors.shadow,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Select month"
          >
            <Text style={[styles.monthLabel, { color: colors.text }]}>{selectedPeriod.label}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </Pressable>

          <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
            <Pressable style={styles.overlay} onPress={() => setPickerOpen(false)} />
            <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
              <View style={[styles.sheetHeader, { borderBottomColor: colors.borderLight }]}>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>Select month</Text>
                <Pressable onPress={() => setPickerOpen(false)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </Pressable>
              </View>
              <ScrollView>
                {monthOptions.map((option) => {
                  const active = option.value === periodKey;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => selectPeriod(option.value)}
                      style={[
                        styles.option,
                        {
                          backgroundColor: active ? `${colors.primary}14` : 'transparent',
                          borderBottomColor: colors.borderLight,
                        },
                      ]}
                    >
                      <Text style={[styles.optionText, { color: active ? colors.primary : colors.text }]}>
                        {option.label}
                      </Text>
                      {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </Modal>
        </>
      )}

      <View style={styles.statsRow}>
        <StatCard label="Avg. Attendance" value={`${avgAttendance}%`} accent="#16A34A" compact centered />
        <StatCard label="Absent Today" value={String(absentToday)} accent="#DC2626" compact centered />
        <Pressable
          onPress={() => router.push('/admin/latecomers' as Href)}
          style={styles.statPressable}
          accessibilityRole="button"
          accessibilityLabel="View latecomers"
        >
          <StatCard label="Late Today" value={String(lateToday)} accent="#B45309" compact centered />
        </Pressable>
      </View>

      {summaries.map((row) => {
        const lateSeconds = todayLateMap.get(row.employeeId);
        return (
        <Card key={row.employeeId} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderText}>
              <Text style={[styles.name, { color: colors.text }]}>{row.employeeName}</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {row.staffCategory === 'doctor' ? 'Doctor' : 'Staff'} · {row.employeeId}
              </Text>
            </View>
            {lateSeconds ? (
              <StatusBadge
                label={`Late ${formatLateDuration(lateSeconds)}`}
                tone={lateSeverityTone(lateSeconds)}
              />
            ) : null}
          </View>
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
        );
      })}

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
  content: { padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: '800' },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    minHeight: 54,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  monthLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statPressable: {
    flex: 1,
    minWidth: 0,
  },
  card: { marginTop: 4 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  cardHeaderText: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  metrics: { flexDirection: 'row', justifyContent: 'space-between' },
  metric: { alignItems: 'center', flex: 1 },
  metricValue: { fontSize: 16, fontWeight: '800' },
  metricLabel: { fontSize: 11, marginTop: 2 },
  empty: { textAlign: 'center', padding: 16 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheet: {
    maxHeight: '55%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
    paddingRight: 12,
  },
});
