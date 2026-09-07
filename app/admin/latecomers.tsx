import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { addMonths, endOfMonth, format, parseISO, startOfMonth, subDays, subMonths } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/SelectField';
import { StatusBadge } from '@/components/ui/StatusBadge';
import Colors from '@/constants/Colors';
import { DEPARTMENT_OPTIONS } from '@/constants/hrOptions';
import { useApp } from '@/contexts/AppContext';
import { getEmployeeDisplayName } from '@/services/employeeRegistry';
import { getAttendanceRules } from '@/services/attendanceRulesService';
import { loadAllAttendance, saveAttendanceRecords } from '@/services/firestoreRepository';
import { loadShiftsForDate, loadShiftsInRange } from '@/services/shiftService';
import type { AttendanceRecord, Employee } from '@/types/employee';
import { useColorScheme } from '@/components/useColorScheme';
import { formatDisplayTime } from '@/utils/formatTime';
import { formatHoursMinutes, formatRupee } from '@/utils/attendanceRules';
import {
  buildLatecomerRows,
  formatLateDuration,
  lateSeverityTone,
  type LatecomerRow,
} from '@/utils/lateAttendance';

type PeriodFilter = 'today' | 'month';

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function initials(employee: Employee): string {
  return `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();
}

function avatarColor(employeeId: string): string {
  const palette = ['#0F766E', '#0369A1', '#7C3AED', '#B45309', '#DB2777', '#0891B2'];
  let hash = 0;
  for (let i = 0; i < employeeId.length; i += 1) {
    hash = employeeId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

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

/** Summarize from latecomer rows (same late minutes as the list, not only stored fields). */
function summarizeLateRows(lateRows: LatecomerRow[]) {
  const totalMinutes = lateRows.reduce((sum, r) => sum + Math.max(0, Number(r.lateMinutes) || 0), 0);
  const count = lateRows.length;
  return {
    totalHours: totalMinutes / 60,
    avgHours: count > 0 ? totalMinutes / 60 / count : 0,
    lateDays: count,
  };
}

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'month', label: 'Month' },
];

export default function LatecomersScreen() {
  const { clinicEmployees } = useApp();
  const params = useLocalSearchParams<{ period?: string; month?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/admin/attendance' as never);
  }, [router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Latecomers',
      headerShown: true,
      headerLeft: () => (
        <Pressable
          onPress={goBack}
          hitSlop={10}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Platform.OS === 'web' ? 8 : 0,
            gap: 2,
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Back</Text>
        </Pressable>
      ),
    });
  }, [navigation, goBack, colors.primary]);

  const now = new Date();
  const monthOptions = useMemo(() => buildMonthOptions(12), []);
  const monthSelectOptions = useMemo(
    () => monthOptions.map((o) => ({ value: o.value, label: o.label })),
    [monthOptions]
  );

  const initialPeriod: PeriodFilter =
    params.period === 'month' || params.period === 'today' ? params.period : 'today';
  const initialMonth =
    typeof params.month === 'string' && monthOptions.some((o) => o.value === params.month)
      ? params.month
      : `${now.getFullYear()}-${now.getMonth()}`;

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(initialPeriod);
  const [periodKey, setPeriodKey] = useState(initialMonth);
  const [shiftFilter, setShiftFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [rows, setRows] = useState<LatecomerRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>(clinicEmployees);
  const [attendanceById, setAttendanceById] = useState<Map<string, AttendanceRecord>>(new Map());
  const [previousRows, setPreviousRows] = useState<LatecomerRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<LatecomerRow | null>(null);
  const [timingDraft, setTimingDraft] = useState('');
  const [multiplierDraft, setMultiplierDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEmployees(clinicEmployees);
  }, [clinicEmployees]);

  useEffect(() => {
    if (params.period === 'month' || params.period === 'today') {
      setPeriodFilter(params.period);
    }
    if (typeof params.month === 'string' && monthOptions.some((o) => o.value === params.month)) {
      setPeriodKey(params.month);
    }
  }, [params.period, params.month, monthOptions]);

  const selectedPeriod = monthOptions.find((o) => o.value === periodKey) ?? monthOptions[0];
  const isToday = periodFilter === 'today';
  const todayKey = format(new Date(), 'yyyy-MM-dd');

  const shiftOptions = useMemo(
    () => [
      { value: 'all', label: 'All Shifts' },
      { value: 'day', label: 'Day Shift' },
      { value: 'night', label: 'Night Shift' },
    ],
    []
  );

  const departmentOptions = useMemo(
    () => [{ value: 'all', label: 'All Departments' }, ...DEPARTMENT_OPTIONS],
    []
  );

  const employeeOptions = useMemo(
    () => [
      { value: 'all', label: 'All Employees' },
      ...employees.map((emp) => ({
        value: emp.employeeId,
        label: getEmployeeDisplayName(emp),
      })),
    ],
    [employees]
  );

  const fieldColors = {
    textColor: colors.text,
    mutedColor: colors.textMuted,
    borderColor: colors.borderLight,
    cardColor: colors.card,
    dangerColor: colors.danger,
    primaryColor: colors.primary,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [attendance, rules] = await Promise.all([loadAllAttendance(), getAttendanceRules()]);
      const staff = clinicEmployees;
      setEmployees(staff);
      const clinicIds = new Set(staff.map((emp) => emp.employeeId));
      const attMap = new Map<string, AttendanceRecord>();
      attendance.forEach((r) => attMap.set(r.id, r));
      setAttendanceById(attMap);

      const buildRangeRows = async (fromDate: string, toDate: string) => {
        if (fromDate === toDate) {
          const shifts = await loadShiftsForDate(fromDate);
          return buildLatecomerRows(fromDate, shifts, attendance, rules).filter((row) =>
            clinicIds.has(row.employeeId)
          );
        }

        const rangeShifts = await loadShiftsInRange(fromDate, toDate);
        const dates = Array.from(
          new Set([
            ...rangeShifts.map((s) => s.date),
            ...attendance
              .filter((r) => r.date >= fromDate && r.date <= toDate && clinicIds.has(r.employeeId))
              .map((r) => r.date),
          ])
        ).sort();

        const built: LatecomerRow[] = [];
        for (const date of dates) {
          const dayShifts = rangeShifts.filter((s) => s.date === date);
          built.push(
            ...buildLatecomerRows(date, dayShifts, attendance, rules).filter((row) =>
              clinicIds.has(row.employeeId)
            )
          );
        }
        built.sort((a, b) => {
          const byDate = b.date.localeCompare(a.date);
          if (byDate !== 0) return byDate;
          return b.lateSeconds - a.lateSeconds;
        });
        return built;
      };

      let fromDate: string;
      let toDate: string;
      let prevFrom: string;
      let prevTo: string;

      if (isToday) {
        fromDate = todayKey;
        toDate = todayKey;
        const prev = subDays(parseISO(todayKey), 1);
        prevFrom = format(prev, 'yyyy-MM-dd');
        prevTo = prevFrom;
      } else {
        const monthStart = new Date(selectedPeriod.year, selectedPeriod.monthIndex, 1);
        fromDate = format(startOfMonth(monthStart), 'yyyy-MM-dd');
        toDate = format(endOfMonth(monthStart), 'yyyy-MM-dd');
        const prevMonth = subMonths(monthStart, 1);
        prevFrom = format(startOfMonth(prevMonth), 'yyyy-MM-dd');
        prevTo = format(endOfMonth(prevMonth), 'yyyy-MM-dd');
      }

      const [lateRows, prevLateRows] = await Promise.all([
        buildRangeRows(fromDate, toDate),
        buildRangeRows(prevFrom, prevTo),
      ]);

      setRows(lateRows);
      setPreviousRows(prevLateRows);
    } finally {
      setLoading(false);
    }
  }, [clinicEmployees, isToday, todayKey, selectedPeriod.year, selectedPeriod.monthIndex]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach((emp) => map.set(emp.employeeId, emp));
    return map;
  }, [employees]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const emp = employeeById.get(row.employeeId);
      if (!emp) return false;
      if (shiftFilter !== 'all' && row.shiftType !== shiftFilter) return false;
      if (departmentFilter !== 'all' && emp.department !== departmentFilter) return false;
      if (employeeFilter !== 'all' && row.employeeId !== employeeFilter) return false;
      return true;
    });
  }, [rows, shiftFilter, departmentFilter, employeeFilter, employeeById]);

  const personStats = useMemo(() => {
    if (!selectedRow) {
      return { totalHours: 0, avgHours: 0, lastAvgHours: 0 };
    }

    // Same late rows as the list (punch vs shift), not only stored lateMinutes.
    const current = rows.filter((r) => r.employeeId === selectedRow.employeeId);
    const previous = previousRows.filter((r) => r.employeeId === selectedRow.employeeId);
    const currentSummary = summarizeLateRows(current);
    const previousSummary = summarizeLateRows(previous);

    return {
      totalHours: currentSummary.totalHours,
      avgHours: currentSummary.avgHours,
      lastAvgHours: previousSummary.avgHours,
    };
  }, [selectedRow, rows, previousRows]);

  const computedFine = useMemo(() => {
    const timing = timingDraft === '' ? NaN : Number(timingDraft);
    const multiplier = multiplierDraft === '' ? NaN : Number(multiplierDraft);
    if (!Number.isFinite(timing) || !Number.isFinite(multiplier)) return null;
    return Math.max(0, timing * multiplier);
  }, [timingDraft, multiplierDraft]);

  const openPersonDetail = (row: LatecomerRow) => {
    setSelectedRow(row);
    // Always start empty so admin can type fresh values.
    setTimingDraft('');
    setMultiplierDraft('');
  };

  const closePersonDetail = () => {
    if (saving) return;
    setSelectedRow(null);
    setTimingDraft('');
    setMultiplierDraft('');
  };

  const handleSaveFine = async () => {
    if (!selectedRow) return;
    const record = attendanceById.get(selectedRow.recordId);
    if (!record) {
      showAlert('Error', 'Attendance record not found.');
      return;
    }

    const timing = timingDraft === '' ? NaN : Number(timingDraft);
    const multiplier = multiplierDraft === '' ? NaN : Number(multiplierDraft);
    if (!Number.isFinite(timing) || timing < 0) {
      showAlert('Invalid timing', 'Enter a valid timing number.');
      return;
    }
    if (!Number.isFinite(multiplier) || multiplier < 0) {
      showAlert('Invalid multiplication', 'Enter a valid multiplication number.');
      return;
    }

    const penaltyAmount = Math.max(0, timing * multiplier);

    setSaving(true);
    try {
      const updated: AttendanceRecord = {
        ...record,
        lateMinutes: selectedRow.lateMinutes,
        lateSeconds: selectedRow.lateSeconds,
        fineTiming: timing,
        fineMultiplier: multiplier,
        penaltyAmount,
      };
      await saveAttendanceRecords([updated]);
      setAttendanceById((prev) => new Map(prev).set(selectedRow.recordId, updated));
      setRows((prev) =>
        prev.map((item) =>
          item.recordId === selectedRow.recordId ? { ...item, penaltyAmount } : item
        )
      );
      setSelectedRow(null);
      setTimingDraft('');
      setMultiplierDraft('');
    } catch {
      showAlert('Error', 'Could not save fine. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const rangeLabel = isToday
    ? format(parseISO(todayKey), 'dd MMM yyyy')
    : selectedPeriod.label;

  const selectedEmployee = selectedRow ? employeeById.get(selectedRow.employeeId) : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Latecomers',
          headerShown: true,
          headerBackTitle: 'Back',
          presentation: 'card',
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.filters}>
            <View style={styles.filterRow}>
              <View style={styles.filterCell}>
                <SelectField
                  label="Period"
                  value={periodFilter}
                  onChange={(v) => setPeriodFilter(v as PeriodFilter)}
                  options={PERIOD_OPTIONS}
                  compact
                  hideLeadingIcon
                  {...fieldColors}
                />
              </View>
              <View style={styles.filterCell}>
                {isToday ? (
                  <SelectField
                    label="Date"
                    value={todayKey}
                    onChange={() => {}}
                    options={[{ value: todayKey, label: format(parseISO(todayKey), 'EEE, MMM d') }]}
                    compact
                    hideLeadingIcon
                    disabled
                    {...fieldColors}
                  />
                ) : (
                  <SelectField
                    label="Month"
                    value={periodKey}
                    onChange={setPeriodKey}
                    options={monthSelectOptions}
                    compact
                    hideLeadingIcon
                    {...fieldColors}
                  />
                )}
              </View>
            </View>
            <View style={styles.filterRow}>
              <View style={styles.filterCell}>
                <SelectField
                  label="Shift"
                  value={shiftFilter}
                  onChange={setShiftFilter}
                  options={shiftOptions}
                  compact
                  hideLeadingIcon
                  {...fieldColors}
                />
              </View>
              <View style={styles.filterCell}>
                <SelectField
                  label="Department"
                  value={departmentFilter}
                  onChange={setDepartmentFilter}
                  options={departmentOptions}
                  compact
                  hideLeadingIcon
                  {...fieldColors}
                />
              </View>
            </View>
            <View style={styles.filterRow}>
              <View style={styles.filterCell}>
                <SelectField
                  label="Employee"
                  value={employeeFilter}
                  onChange={setEmployeeFilter}
                  options={employeeOptions}
                  compact
                  hideLeadingIcon
                  {...fieldColors}
                />
              </View>
            </View>
          </View>

          {loading && filteredRows.length === 0 ? (
            <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
          ) : null}

          {!loading && filteredRows.length === 0 ? (
            <Card>
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                No latecomers for {rangeLabel}.
              </Text>
            </Card>
          ) : (
            filteredRows.map((row) => {
              const emp = employeeById.get(row.employeeId);
              if (!emp) return null;
              const tone = lateSeverityTone(row.lateSeconds);
              const toneColor = tone === 'warning' ? '#B45309' : colors.danger;
              const lateLabel = formatLateDuration(row.lateSeconds);

              return (
                <Pressable
                  key={`${row.recordId}-${row.date}`}
                  onPress={() => openPersonDetail(row)}
                >
                  <Card style={styles.lateCard}>
                    <View style={styles.lateHeader}>
                      <View style={[styles.avatar, { backgroundColor: avatarColor(row.employeeId) }]}>
                        <Text style={styles.avatarText}>{initials(emp)}</Text>
                      </View>
                      <View style={styles.lateHeaderInfo}>
                        <Text style={[styles.lateName, { color: colors.text }]}>
                          {getEmployeeDisplayName(emp)}
                        </Text>
                        <Text style={[styles.lateMeta, { color: colors.textSecondary }]}>
                          {format(parseISO(row.date), 'EEE, MMM d')} ·{' '}
                          {emp.staffCategory === 'doctor' ? 'Doctor' : 'Staff'} · {emp.employeeId}
                        </Text>
                      </View>
                      <StatusBadge label={lateLabel} tone={tone} />
                    </View>

                    <View style={styles.lateMetrics}>
                      <View style={styles.lateMetric}>
                        <Text style={[styles.lateMetricLabel, { color: colors.textMuted }]}>Shift</Text>
                        <Text style={[styles.lateMetricValue, { color: colors.text }]}>
                          {formatDisplayTime(row.shiftStart)}
                        </Text>
                      </View>
                      <View style={styles.lateMetric}>
                        <Text style={[styles.lateMetricLabel, { color: colors.textMuted }]}>
                          Check-in
                        </Text>
                        <Text style={[styles.lateMetricValue, { color: colors.text }]}>
                          {formatDisplayTime(row.punchIn)}
                        </Text>
                      </View>
                      <View style={styles.lateMetric}>
                        <Text style={[styles.lateMetricLabel, { color: colors.textMuted }]}>Late</Text>
                        <Text
                          style={[styles.lateMetricValue, { color: toneColor, fontWeight: '800' }]}
                        >
                          {lateLabel}
                        </Text>
                      </View>
                      {row.penaltyAmount > 0 ? (
                        <View style={styles.lateMetric}>
                          <Text style={[styles.lateMetricLabel, { color: colors.textMuted }]}>Fine</Text>
                          <Text
                            style={[
                              styles.lateMetricValue,
                              { color: colors.primary, fontWeight: '800' },
                            ]}
                          >
                            {formatRupee(row.penaltyAmount)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </Card>
                </Pressable>
              );
            })
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={!!selectedRow && !!selectedEmployee}
        animationType="slide"
        transparent
        onRequestClose={closePersonDetail}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKeyboard}
          >
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
              {selectedRow && selectedEmployee ? (
                <>
                  <View style={styles.modalHeader}>
                    <View
                      style={[
                        styles.avatarLarge,
                        { backgroundColor: avatarColor(selectedRow.employeeId) },
                      ]}
                    >
                      <Text style={styles.avatarLargeText}>{initials(selectedEmployee)}</Text>
                    </View>
                    <View style={styles.modalHeaderInfo}>
                      <Text style={[styles.modalName, { color: colors.text }]}>
                        {getEmployeeDisplayName(selectedEmployee)}
                      </Text>
                      <Text style={[styles.modalMeta, { color: colors.textSecondary }]}>
                        {format(parseISO(selectedRow.date), 'EEE, MMM d yyyy')} · Late{' '}
                        {formatLateDuration(selectedRow.lateSeconds)}
                      </Text>
                    </View>
                    <Pressable onPress={closePersonDetail} hitSlop={10} disabled={saving}>
                      <Ionicons name="close" size={22} color={colors.textMuted} />
                    </Pressable>
                  </View>

                  <View style={styles.statsGrid}>
                    <View style={[styles.statCard, { backgroundColor: colors.background }]}>
                      <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                        Total hours late
                      </Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        {formatHoursMinutes(personStats.totalHours)}
                      </Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: colors.background }]}>
                      <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                        Average late hours
                      </Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        {formatHoursMinutes(personStats.avgHours)}
                      </Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: colors.background }]}>
                      <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                        Last average late hours
                      </Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        {formatHoursMinutes(personStats.lastAvgHours)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.inputBlock}>
                    <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Timing</Text>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          color: colors.text,
                          borderColor: colors.borderLight,
                          backgroundColor: colors.background,
                        },
                      ]}
                      value={timingDraft}
                      onChangeText={(text) => setTimingDraft(text.replace(/[^\d.]/g, ''))}
                      keyboardType="decimal-pad"
                      placeholder="Enter timing"
                      placeholderTextColor={colors.textMuted}
                      editable={!saving}
                    />
                  </View>

                  <View style={styles.inputBlock}>
                    <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                      Multiplication
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          color: colors.text,
                          borderColor: colors.borderLight,
                          backgroundColor: colors.background,
                        },
                      ]}
                      value={multiplierDraft}
                      onChangeText={(text) => setMultiplierDraft(text.replace(/[^\d.]/g, ''))}
                      keyboardType="decimal-pad"
                      placeholder="Enter multiplication"
                      placeholderTextColor={colors.textMuted}
                      editable={!saving}
                    />
                  </View>

                  <Text style={[styles.finePreview, { color: colors.primary }]}>
                    Fine:{' '}
                    {computedFine == null ? '—' : formatRupee(computedFine)}
                    {computedFine != null ? ' (Timing × Multiplication)' : ''}
                  </Text>

                  <Pressable
                    onPress={handleSaveFine}
                    disabled={saving}
                    style={[
                      styles.saveBtn,
                      {
                        backgroundColor: colors.primary,
                        opacity: saving ? 0.6 : 1,
                      },
                    ]}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Ionicons name="save-outline" size={16} color="#FFF" />
                        <Text style={styles.saveBtnText}>Save fine</Text>
                      </>
                    )}
                  </Pressable>
                </>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 12 },
  filters: {
    gap: 10,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  filterCell: {
    flex: 1,
    minWidth: 0,
  },
  loader: { marginTop: 24 },
  empty: { textAlign: 'center', padding: 16 },
  lateCard: { gap: 12 },
  lateHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  lateHeaderInfo: { flex: 1 },
  lateName: { fontSize: 15, fontWeight: '700' },
  lateMeta: { fontSize: 12, marginTop: 2 },
  lateMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  lateMetric: { flex: 1, alignItems: 'center' },
  lateMetricLabel: { fontSize: 10, fontWeight: '600' },
  lateMetricValue: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalKeyboard: { width: '100%' },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 14,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarLarge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLargeText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  modalHeaderInfo: { flex: 1 },
  modalName: { fontSize: 17, fontWeight: '800' },
  modalMeta: { fontSize: 12, marginTop: 2 },
  statsGrid: { gap: 8 },
  statCard: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  statValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  inputBlock: { gap: 6 },
  inputLabel: { fontSize: 12, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
  },
  finePreview: { fontSize: 14, fontWeight: '800' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  saveBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
});
