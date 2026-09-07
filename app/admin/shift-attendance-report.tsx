import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/SelectField';
import Colors from '@/constants/Colors';
import { useApp } from '@/contexts/AppContext';
import { loadAllAttendance } from '@/services/firestoreRepository';
import { getEmployeeDisplayName } from '@/services/employeeRegistry';
import { getShiftChangeDates, loadShiftsInRange } from '@/services/shiftService';
import { useColorScheme } from '@/components/useColorScheme';
import { buildClinicFilterOptions } from '@/utils/clinicScope';
import { monthDateRange } from '@/utils/attendanceSummary';
import {
  buildShiftAttendanceReportRows,
  type ShiftAttendanceReportRow,
  type ShiftTransition,
} from '@/utils/shiftAttendanceReport';

type PeriodFilter = 'today' | 'month';

function buildMonthOptions(count = 18) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${d.getMonth()}`,
      label: format(d, 'MMMM yyyy'),
      year: d.getFullYear(),
      monthIndex: d.getMonth(),
    };
  });
}

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'month', label: 'Month' },
];

const SHIFT_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'day_to_night', label: 'Day → Night' },
  { value: 'night_to_day', label: 'Night → Day' },
];

export default function ShiftAttendanceReportScreen() {
  const { clinicEmployees, allClinics, selectedClinicId } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const monthOptions = useMemo(() => buildMonthOptions(18), []);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('today');
  const [monthKey, setMonthKey] = useState(monthOptions[0]?.value ?? '');
  const [staffId, setStaffId] = useState('all');
  const [shiftFilter, setShiftFilter] = useState<'all' | ShiftTransition>('all');
  const [subcenterId, setSubcenterId] = useState<string>(
    selectedClinicId === 'all' ? 'all' : selectedClinicId
  );

  const [rows, setRows] = useState<ShiftAttendanceReportRow[]>([]);
  const [loading, setLoading] = useState(false);

  const isToday = periodFilter === 'today';
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const selectedMonth = monthOptions.find((m) => m.value === monthKey) ?? monthOptions[0];

  const staffOptions = useMemo(
    () => [
      { value: 'all', label: 'All Staff' },
      ...clinicEmployees.map((e) => ({
        value: e.employeeId,
        label: getEmployeeDisplayName(e),
      })),
    ],
    [clinicEmployees]
  );

  const clinicOptions = useMemo(() => buildClinicFilterOptions(allClinics), [allClinics]);

  const fieldColors = {
    labelColor: colors.textSecondary,
    textColor: colors.text,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    placeholderColor: colors.textMuted,
  };

  const load = useCallback(async () => {
    if (!isToday && !selectedMonth) return;
    setLoading(true);
    try {
      const fromDate = isToday
        ? todayKey
        : monthDateRange(selectedMonth.year, selectedMonth.monthIndex).fromDate;
      const toDate = isToday
        ? todayKey
        : monthDateRange(selectedMonth.year, selectedMonth.monthIndex).toDate;

      const [shifts, attendance, changeDates] = await Promise.all([
        loadShiftsInRange(fromDate, toDate),
        loadAllAttendance(),
        getShiftChangeDates(),
      ]);

      const changeInRange = changeDates.filter((d) => d >= fromDate && d <= toDate);

      const built = buildShiftAttendanceReportRows({
        employees: clinicEmployees,
        shifts,
        attendance: attendance.filter(
          (r) =>
            r.date >= fromDate &&
            r.date <= toDate &&
            clinicEmployees.some((e) => e.employeeId === r.employeeId)
        ),
        changeDates: changeInRange,
      });
      setRows(built);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [clinicEmployees, isToday, todayKey, selectedMonth]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (staffId !== 'all' && row.employeeId !== staffId) return false;
      if (shiftFilter !== 'all' && row.effectiveTransition !== shiftFilter) return false;
      if (subcenterId !== 'all' && row.clinicId !== subcenterId) return false;
      return true;
    });
  }, [rows, staffId, shiftFilter, subcenterId]);

  const emptyLabel = isToday
    ? 'No shift-change assignments for today.'
    : 'No shift-change assignments for this month.';

  return (
    <>
      <Stack.Screen options={{ title: 'Shift Attendance Report', headerShown: true }} />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <Card style={styles.filters}>
          <View style={styles.filterRow}>
            <View style={styles.filterHalf}>
              <SelectField
                label="Period"
                value={periodFilter}
                options={PERIOD_OPTIONS}
                onChange={(v) => setPeriodFilter(v as PeriodFilter)}
                compact
                hideLeadingIcon
                {...fieldColors}
              />
            </View>
            <View style={styles.filterHalf}>
              {isToday ? (
                <SelectField
                  label="Date"
                  value={todayKey}
                  options={[{ value: todayKey, label: format(parseISO(todayKey), 'EEE, MMM d') }]}
                  onChange={() => {}}
                  compact
                  hideLeadingIcon
                  disabled
                  {...fieldColors}
                />
              ) : (
                <SelectField
                  label="Month"
                  value={monthKey}
                  options={monthOptions.map(({ value, label }) => ({ value, label }))}
                  onChange={setMonthKey}
                  compact
                  hideLeadingIcon
                  {...fieldColors}
                />
              )}
            </View>
          </View>
          <View style={styles.filterRow}>
            <View style={styles.filterHalf}>
              <SelectField
                label="Staff"
                value={staffId}
                options={staffOptions}
                onChange={setStaffId}
                compact
                hideLeadingIcon
                {...fieldColors}
              />
            </View>
            <View style={styles.filterHalf}>
              <SelectField
                label="Shift"
                value={shiftFilter}
                options={SHIFT_FILTER_OPTIONS}
                onChange={(v) => setShiftFilter(v as 'all' | ShiftTransition)}
                compact
                hideLeadingIcon
                {...fieldColors}
              />
            </View>
          </View>
          <SelectField
            label="Subcenter"
            value={subcenterId}
            options={clinicOptions.map((o) =>
              o.value === 'all' ? { ...o, label: 'All' } : o
            )}
            onChange={setSubcenterId}
            compact
            hideLeadingIcon
            {...fieldColors}
          />
        </Card>

        {loading && filteredRows.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : filteredRows.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{emptyLabel}</Text>
          </Card>
        ) : (
          filteredRows.map((row) => (
            <Card key={`${row.employeeId}-${row.date}-${row.startTime}`} style={styles.rowCard}>
              <View style={styles.rowTop}>
                <Text style={[styles.staffName, { color: colors.text }]}>{row.staffName}</Text>
                <Text style={[styles.credit, { color: colors.primary }]}>
                  {row.attendanceCredit} Day{row.attendanceCredit === 1 ? '' : 's'}
                </Text>
              </View>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {row.dateLabel} · {row.shiftLabel} · {row.timing}
              </Text>
              {row.continued ? (
                <View style={styles.continuedRow}>
                  <Ionicons name="git-compare-outline" size={14} color={colors.primary} />
                  <Text style={[styles.continuedText, { color: colors.primary }]}>
                    Continued next shift
                  </Text>
                </View>
              ) : null}
              {!row.present ? (
                <Text style={[styles.absent, { color: colors.danger }]}>No punch — credit 0</Text>
              ) : null}
            </Card>
          ))
        )}

        <Pressable onPress={load} style={styles.refreshHint}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Pull to refresh</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  filters: { gap: 8 },
  filterRow: { flexDirection: 'row', gap: 10 },
  filterHalf: { flex: 1, minWidth: 0 },
  emptyCard: { paddingVertical: 28, alignItems: 'center' },
  emptyText: { fontSize: 14, fontWeight: '600' },
  rowCard: { gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  staffName: { fontSize: 16, fontWeight: '800', flex: 1 },
  credit: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 13, fontWeight: '600' },
  continuedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  continuedText: { fontSize: 12, fontWeight: '700' },
  absent: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  refreshHint: { alignItems: 'center', paddingVertical: 8 },
});
