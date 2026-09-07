import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { addDays, addMonths, endOfMonth, format, startOfDay, startOfMonth } from 'date-fns';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AttendanceCalendarPanel } from '@/components/attendance/AttendanceCalendarPanel';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/SelectField';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { buildTimeOptions } from '@/constants/hrOptions';
import { loadAllAttendance } from '@/services/firestoreRepository';
import { getAttendanceRules } from '@/services/attendanceRulesService';
import { getEmployeeDisplayName } from '@/services/employeeRegistry';
import { loadShiftsForDate, loadShiftsInRange } from '@/services/shiftService';
import type { AttendanceSummary, StaffCategory } from '@/types/employee';
import { useColorScheme } from '@/components/useColorScheme';
import { calcLateMinutes } from '@/utils/attendanceRules';
import {
  buildLatecomerRows,
  lateSecondsByEmployee,
} from '@/utils/lateAttendance';
import { showAlert } from '@/utils/uiAlert';

type ScreenMode = 'overview' | 'calendar';

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

function buildPastDateOptions(days = 21) {
  const today = startOfDay(new Date());
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, -i);
    return {
      value: format(date, 'yyyy-MM-dd'),
      label: format(date, 'EEE, MMM d'),
    };
  });
}

const MARK_PRESENT_REASONS = [
  { value: 'Forgot to punch', label: 'Forgot to punch' },
  { value: 'Device / WiFi issue', label: 'Device / WiFi issue' },
  { value: 'Worked but missed punch', label: 'Worked but missed punch' },
  { value: 'Other (admin correction)', label: 'Other (admin correction)' },
];

type CategoryFilter = 'all' | StaffCategory;
type PeriodFilter = 'today' | 'month';

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'staff', label: 'Staff' },
];

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'month', label: 'Month' },
];

function matchesCategory(category: StaffCategory, filter: CategoryFilter): boolean {
  return filter === 'all' || category === filter;
}

export default function AdminAttendanceScreen() {
  const router = useRouter();
  const {
    getAttendanceSummaries,
    clinicTodayShifts,
    clinicPeopleOnLeaveToday,
    clinicEmployeeIds,
    clinicEmployees,
    allEmployees,
    allClinics,
    selectedClinicId,
    markPresent,
  } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const [screenMode, setScreenMode] = useState<ScreenMode>('overview');
  const monthOptions = useMemo(() => buildMonthOptions(12), []);
  const monthSelectOptions = useMemo(
    () => monthOptions.map((option) => ({ value: option.value, label: option.label })),
    [monthOptions]
  );

  const now = new Date();
  const [periodKey, setPeriodKey] = useState(`${now.getFullYear()}-${now.getMonth()}`);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('today');
  const [summaries, setSummaries] = useState<AttendanceSummary[]>([]);
  const [todayAbsentIds, setTodayAbsentIds] = useState<Set<string>>(new Set());
  const [todayPresentIds, setTodayPresentIds] = useState<Set<string>>(new Set());
  const [todayScheduledIds, setTodayScheduledIds] = useState<Set<string>>(new Set());
  const [todayLateMap, setTodayLateMap] = useState<Map<string, number>>(new Map());
  /** Late day counts per employee in the selected month. */
  const [monthLateByEmployee, setMonthLateByEmployee] = useState<Map<string, number>>(new Map());
  /** Total late minutes per employee in the selected month. */
  const [monthLateMinutesByEmployee, setMonthLateMinutesByEmployee] = useState<Map<string, number>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const [markPresentOpen, setMarkPresentOpen] = useState(false);
  const [markEmployeeId, setMarkEmployeeId] = useState('');
  const [markDate, setMarkDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [markPunchIn, setMarkPunchIn] = useState('08:00');
  const [markPunchOut, setMarkPunchOut] = useState('20:00');
  const [markReason, setMarkReason] = useState('Forgot to punch');
  const [markSaving, setMarkSaving] = useState(false);

  const dateOptions = useMemo(() => buildPastDateOptions(21), []);
  const timeOptions = useMemo(() => buildTimeOptions(30), []);
  const employeeOptions = useMemo(
    () =>
      clinicEmployees.map((emp) => ({
        value: emp.employeeId,
        label: getEmployeeDisplayName(emp),
      })),
    [clinicEmployees]
  );

  const selectedPeriod = monthOptions.find((o) => o.value === periodKey) ?? monthOptions[0];
  const year = selectedPeriod.year;
  const monthIndex = selectedPeriod.monthIndex;

  const fieldColors = {
    textColor: colors.text,
    mutedColor: colors.textMuted,
    borderColor: colors.borderLight,
    cardColor: colors.card,
    dangerColor: colors.danger,
    primaryColor: colors.primary,
  };

  const categoryByEmployeeId = useMemo(() => {
    const map = new Map<string, StaffCategory>();
    allEmployees.forEach((emp) => map.set(emp.employeeId, emp.staffCategory ?? 'staff'));
    summaries.forEach((row) => map.set(row.employeeId, row.staffCategory));
    return map;
  }, [allEmployees, summaries]);

  const filteredSummaries = useMemo(
    () => summaries.filter((row) => matchesCategory(row.staffCategory, categoryFilter)),
    [summaries, categoryFilter]
  );

  const avgAttendanceMonth = useMemo(() => {
    const scheduled = filteredSummaries.reduce((sum, row) => sum + row.scheduledHours, 0);
    const attended = filteredSummaries.reduce((sum, row) => sum + row.attendedHours, 0);
    if (scheduled <= 0) return 0;
    return Math.round((attended / scheduled) * 1000) / 10;
  }, [filteredSummaries]);

  const avgAttendanceToday = useMemo(() => {
    let scheduled = 0;
    let present = 0;
    for (const employeeId of todayScheduledIds) {
      const category = categoryByEmployeeId.get(employeeId);
      if (!category || !matchesCategory(category, categoryFilter)) continue;
      scheduled += 1;
      if (todayPresentIds.has(employeeId)) present += 1;
    }
    if (scheduled <= 0) return 0;
    return Math.round((present / scheduled) * 1000) / 10;
  }, [todayScheduledIds, todayPresentIds, categoryByEmployeeId, categoryFilter]);

  const monthlyAbsent = useMemo(
    () => filteredSummaries.reduce((sum, row) => sum + row.absentDays, 0),
    [filteredSummaries]
  );

  const absentToday = useMemo(() => {
    let count = 0;
    for (const employeeId of todayAbsentIds) {
      const category = categoryByEmployeeId.get(employeeId);
      if (category && matchesCategory(category, categoryFilter)) count += 1;
    }
    return count;
  }, [todayAbsentIds, categoryByEmployeeId, categoryFilter]);

  const lateTodayFiltered = useMemo(() => {
    let count = 0;
    for (const [employeeId, seconds] of todayLateMap) {
      if (seconds <= 0) continue;
      const category = categoryByEmployeeId.get(employeeId);
      if (category && matchesCategory(category, categoryFilter)) count += 1;
    }
    return count;
  }, [todayLateMap, categoryByEmployeeId, categoryFilter]);

  const lateMonthFiltered = useMemo(() => {
    let count = 0;
    for (const [employeeId, lateDays] of monthLateByEmployee) {
      if (lateDays <= 0) continue;
      const category = categoryByEmployeeId.get(employeeId);
      if (category && matchesCategory(category, categoryFilter)) count += lateDays;
    }
    return count;
  }, [monthLateByEmployee, categoryByEmployeeId, categoryFilter]);

  const isToday = periodFilter === 'today';
  const avgLabel = isToday ? 'Avg. Today' : 'Avg. (Month)';
  const avgValue = isToday ? avgAttendanceToday : avgAttendanceMonth;
  const absentLabel = isToday ? 'Absent Today' : 'Absent (Month)';
  const absentValue = isToday ? absentToday : monthlyAbsent;
  const lateLabel = isToday ? 'Late Today' : 'Late (Month)';
  const lateValue = isToday ? lateTodayFiltered : lateMonthFiltered;
  const absentAccent = isToday ? '#DC2626' : '#BE123C';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, attendance, rules] = await Promise.all([
        getAttendanceSummaries(year, monthIndex),
        loadAllAttendance(),
        getAttendanceRules(),
      ]);
      setSummaries(data);

      const today = format(new Date(), 'yyyy-MM-dd');
      const onLeave = new Set(clinicPeopleOnLeaveToday.map((p) => p.employeeId));
      const scheduledIds = new Set(clinicTodayShifts.map((s) => s.employeeId));
      setTodayScheduledIds(scheduledIds);

      const absentIds = new Set<string>();
      const presentIds = new Set<string>();
      for (const employeeId of scheduledIds) {
        if (onLeave.has(employeeId)) continue;
        const record = attendance.find((r) => r.employeeId === employeeId && r.date === today);
        if (record?.punchIn) {
          presentIds.add(employeeId);
        } else {
          absentIds.add(employeeId);
        }
      }
      setTodayAbsentIds(absentIds);
      setTodayPresentIds(presentIds);

      const shifts = await loadShiftsForDate(today);
      const lateRows = buildLatecomerRows(today, shifts, attendance, rules).filter((row) =>
        clinicEmployeeIds.has(row.employeeId)
      );
      setTodayLateMap(lateSecondsByEmployee(lateRows));

      const monthStart = format(startOfMonth(new Date(year, monthIndex, 1)), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(new Date(year, monthIndex, 1)), 'yyyy-MM-dd');
      const monthShifts = await loadShiftsInRange(monthStart, monthEnd);
      const lateMonthDays = new Map<string, number>();
      const lateMonthMinutes = new Map<string, number>();

      for (const record of attendance) {
        if (!clinicEmployeeIds.has(record.employeeId)) continue;
        if (record.date < monthStart || record.date > monthEnd) continue;
        if (!record.punchIn) continue;

        let mins =
          record.lateMinutes != null && record.lateMinutes > 0
            ? record.lateMinutes
            : record.lateSeconds != null && record.lateSeconds > 0
              ? Math.ceil(record.lateSeconds / 60)
              : 0;

        // Older records may not have lateMinutes — derive from earliest shift that day.
        if (mins <= 0) {
          const dayShifts = monthShifts
            .filter((s) => s.employeeId === record.employeeId && s.date === record.date)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
          if (dayShifts[0]) {
            mins = calcLateMinutes(record.punchIn, dayShifts[0].startTime);
          }
        }

        if (mins <= 0) continue;
        lateMonthDays.set(record.employeeId, (lateMonthDays.get(record.employeeId) ?? 0) + 1);
        lateMonthMinutes.set(
          record.employeeId,
          (lateMonthMinutes.get(record.employeeId) ?? 0) + mins
        );
      }
      setMonthLateByEmployee(lateMonthDays);
      setMonthLateMinutesByEmployee(lateMonthMinutes);
    } finally {
      setLoading(false);
    }
  }, [
    getAttendanceSummaries,
    year,
    monthIndex,
    clinicTodayShifts,
    clinicPeopleOnLeaveToday,
    clinicEmployeeIds,
  ]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openMarkPresent = (employeeId?: string) => {
    const emp = clinicEmployees.find((e) => e.employeeId === employeeId);
    const is24h = !!emp?.is24HourDuty;
    setMarkEmployeeId(employeeId ?? '');
    setMarkDate(format(new Date(), 'yyyy-MM-dd'));
    setMarkPunchIn('08:00');
    setMarkPunchOut(is24h ? '08:00' : '20:00');
    setMarkReason('Forgot to punch');
    setMarkPresentOpen(true);
  };

  const closeMarkPresent = () => {
    if (markSaving) return;
    setMarkPresentOpen(false);
  };

  const handleMarkPresent = async () => {
    if (!markEmployeeId) {
      showAlert('Select employee', 'Choose the staff member to mark present.');
      return;
    }
    if (!markDate || !markPunchIn || !markPunchOut) {
      showAlert('Missing details', 'Select date, punch in, and punch out times.');
      return;
    }
    setMarkSaving(true);
    try {
      await markPresent({
        employeeId: markEmployeeId,
        date: markDate,
        punchIn: markPunchIn,
        punchOut: markPunchOut,
        reason: markReason,
      });
      setMarkPresentOpen(false);
      await load();
      showAlert('Marked present', 'Attendance was saved. This day will not count as absent.');
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not mark present');
    } finally {
      setMarkSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={
        screenMode === 'overview' ? (
          <RefreshControl refreshing={loading} onRefresh={load} />
        ) : undefined
      }
    >
      <View style={styles.modeRow}>
        {([
          { id: 'overview', label: 'Attendance Overview' },
          { id: 'calendar', label: 'Calendar View' },
        ] as const).map((mode) => {
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
        <AttendanceCalendarPanel
          mode="admin"
          clinics={allClinics}
          defaultClinicId="all"
          employees={allEmployees}
        />
      ) : (
        <>
          <View style={styles.markPresentRow}>
            <Button
              title="Mark Present"
              variant="outline"
              onPress={() => openMarkPresent()}
              style={styles.markPresentBtn}
            />
          </View>

          <View style={styles.filterRow}>
            <View style={styles.filterCell}>
              <SelectField
                label=""
                value={periodKey}
                onChange={setPeriodKey}
                options={monthSelectOptions}
                compact
                hideLeadingIcon
                {...fieldColors}
              />
            </View>
            <View style={styles.filterCellNarrow}>
              <SelectField
                label=""
                value={categoryFilter}
                onChange={(value) => setCategoryFilter(value as CategoryFilter)}
                options={CATEGORY_OPTIONS}
                compact
                hideLeadingIcon
                {...fieldColors}
              />
            </View>
            <View style={styles.filterCellNarrow}>
              <SelectField
                label=""
                value={periodFilter}
                onChange={(value) => setPeriodFilter(value as PeriodFilter)}
                options={PERIOD_OPTIONS}
                compact
                hideLeadingIcon
                {...fieldColors}
              />
            </View>
          </View>

          <View style={styles.statsRow}>
            <StatCard label={avgLabel} value={`${avgValue}%`} accent="#16A34A" compact centered />
            <StatCard label={absentLabel} value={String(absentValue)} accent={absentAccent} compact centered />
            <Pressable
              onPress={() =>
                router.push(
                  `/admin/latecomers?period=${periodFilter}&month=${encodeURIComponent(periodKey)}` as Href
                )
              }
              style={styles.statPressable}
              accessibilityRole="button"
              accessibilityLabel="View latecomers"
            >
              <StatCard label={lateLabel} value={String(lateValue)} accent="#B45309" compact centered />
            </Pressable>
          </View>

          {filteredSummaries.map((row) => {
            const todayLateSeconds = todayLateMap.get(row.employeeId) ?? 0;
            const todayLateMinutes = Math.ceil(todayLateSeconds / 60);
            const monthLateMinutes = monthLateMinutesByEmployee.get(row.employeeId) ?? 0;
            const monthLateDays = monthLateByEmployee.get(row.employeeId) ?? 0;
            const lateMinutes = isToday ? todayLateMinutes : monthLateMinutes;
            const statusLabel = isToday
              ? todayLateMinutes > 0
                ? 'Late'
                : todayAbsentIds.has(row.employeeId)
                  ? 'Absent'
                  : 'Present'
              : monthLateDays > 0
                ? 'Late'
                : row.absentDays > 0 && row.attendedHours <= 0
                  ? 'Absent'
                  : 'Present';
            const statusTone =
              statusLabel === 'Late' ? 'warning' : statusLabel === 'Absent' ? 'danger' : 'success';
            return (
              <Card key={row.employeeId} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderText}>
                    <Text style={[styles.name, { color: colors.text }]}>{row.employeeName}</Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>
                      {row.staffCategory === 'doctor' ? 'Doctor' : 'Staff'} · {row.employeeId}
                    </Text>
                  </View>
                  <StatusBadge label={statusLabel} tone={statusTone} />
                </View>
                <View style={styles.metrics}>
                  <View style={styles.metric}>
                    <Text style={[styles.metricValue, { color: colors.text }]}>{row.scheduledHours}h</Text>
                    <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Scheduled</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={[styles.metricValue, { color: '#0F766E' }]}>{row.attendedHours}h</Text>
                    <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Worked</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={[styles.metricValue, { color: colors.warning }]}>
                      {lateMinutes > 0 ? `${lateMinutes}m` : '0m'}
                    </Text>
                    <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                      {isToday ? 'Late' : 'Late (mo.)'}
                    </Text>
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

          {!loading && filteredSummaries.length === 0 ? (
            <Card>
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                {summaries.length === 0
                  ? 'No attendance data for this period.'
                  : `No ${categoryFilter === 'doctor' ? 'doctor' : 'staff'} attendance for this period.`}
              </Text>
            </Card>
          ) : null}
        </>
      )}
    </ScrollView>

      <Modal
        visible={markPresentOpen}
        animationType="slide"
        transparent
        onRequestClose={closeMarkPresent}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.card,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Mark Present</Text>
              <Pressable onPress={closeMarkPresent} hitSlop={10} disabled={markSaving}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <SelectField
              label="Employee"
              value={markEmployeeId}
              options={employeeOptions}
              onChange={(id) => {
                setMarkEmployeeId(id);
                const emp = clinicEmployees.find((e) => e.employeeId === id);
                if (emp?.is24HourDuty) {
                  setMarkPunchIn('08:00');
                  setMarkPunchOut('08:00');
                }
              }}
              placeholder="Select employee"
              hideLeadingIcon
              textColor={colors.text}
              mutedColor={colors.textMuted}
              borderColor={colors.borderLight}
              cardColor={colors.card}
              primaryColor={colors.primary}
              dangerColor={colors.danger}
            />
            <SelectField
              label="Date"
              value={markDate}
              options={dateOptions}
              onChange={setMarkDate}
              hideLeadingIcon
              textColor={colors.text}
              mutedColor={colors.textMuted}
              borderColor={colors.borderLight}
              cardColor={colors.card}
              primaryColor={colors.primary}
              dangerColor={colors.danger}
            />
            <View style={styles.timingRow}>
              <View style={styles.timingHalf}>
                <SelectField
                  label="Punch In"
                  value={markPunchIn}
                  options={timeOptions}
                  onChange={setMarkPunchIn}
                  compact
                  hideLeadingIcon
                  textColor={colors.text}
                  mutedColor={colors.textMuted}
                  borderColor={colors.borderLight}
                  cardColor={colors.card}
                  primaryColor={colors.primary}
                  dangerColor={colors.danger}
                />
              </View>
              <View style={styles.timingHalf}>
                <SelectField
                  label="Punch Out"
                  value={markPunchOut}
                  options={timeOptions}
                  onChange={setMarkPunchOut}
                  compact
                  hideLeadingIcon
                  textColor={colors.text}
                  mutedColor={colors.textMuted}
                  borderColor={colors.borderLight}
                  cardColor={colors.card}
                  primaryColor={colors.primary}
                  dangerColor={colors.danger}
                />
              </View>
            </View>
            <SelectField
              label="Reason"
              value={markReason}
              options={MARK_PRESENT_REASONS}
              onChange={setMarkReason}
              hideLeadingIcon
              textColor={colors.text}
              mutedColor={colors.textMuted}
              borderColor={colors.borderLight}
              cardColor={colors.card}
              primaryColor={colors.primary}
              dangerColor={colors.danger}
            />

            <Button
              title={markSaving ? 'Saving...' : 'Save Present'}
              onPress={handleMarkPresent}
              loading={markSaving}
              disabled={markSaving}
              style={styles.modalSaveBtn}
            />
            <Button title="Cancel" variant="outline" onPress={closeMarkPresent} disabled={markSaving} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 12 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  filterCell: {
    flex: 1.4,
    minWidth: 0,
  },
  filterCellNarrow: {
    flex: 1,
    minWidth: 0,
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
  metricValue: { fontSize: 14, fontWeight: '800' },
  metricLabel: { fontSize: 10, marginTop: 2 },
  empty: { textAlign: 'center', padding: 16 },
  markPresentRow: { gap: 6, marginBottom: 4 },
  markPresentBtn: { alignSelf: 'stretch' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '92%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  timingRow: { flexDirection: 'row', gap: 10 },
  timingHalf: { flex: 1, minWidth: 0 },
  modalSaveBtn: { marginTop: 8, marginBottom: 8 },
});
