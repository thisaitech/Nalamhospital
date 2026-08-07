import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { DateInputField } from '@/components/ui/DateInputField';
import { SelectField } from '@/components/ui/SelectField';
import { StatusBadge } from '@/components/ui/StatusBadge';
import Colors from '@/constants/Colors';
import { DEPARTMENT_OPTIONS } from '@/constants/hrOptions';
import { useApp } from '@/contexts/AppContext';
import { getEmployeeDisplayName, loadEmployees } from '@/services/employeeRegistry';
import { loadAllAttendance, saveAttendanceRecords } from '@/services/firestoreRepository';
import { loadShiftsForDate } from '@/services/shiftService';
import type { AttendanceRecord, Employee } from '@/types/employee';
import { useColorScheme } from '@/components/useColorScheme';
import { formatDisplayTime } from '@/utils/formatTime';
import {
  buildLatecomerRows,
  formatLateDuration,
  lateSeverityTone,
  type LatecomerRow,
} from '@/utils/lateAttendance';

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

type PenaltyDraft = Record<string, string>;

export default function LatecomersScreen() {
  const { allEmployees } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(today);
  const [shiftFilter, setShiftFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [rows, setRows] = useState<LatecomerRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>(allEmployees);
  const [attendanceMap, setAttendanceMap] = useState<Map<string, AttendanceRecord>>(new Map());
  const [penaltyDraft, setPenaltyDraft] = useState<PenaltyDraft>({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [staff, attendance, shifts] = await Promise.all([
        employees.length ? Promise.resolve(employees) : loadEmployees(),
        loadAllAttendance(),
        loadShiftsForDate(selectedDate),
      ]);
      if (!employees.length) setEmployees(staff);

      const lateRows = buildLatecomerRows(selectedDate, shifts, attendance);
      setRows(lateRows);

      const map = new Map<string, AttendanceRecord>();
      attendance.forEach((record) => {
        if (record.date === selectedDate) map.set(record.id, record);
      });
      setAttendanceMap(map);

      const draft: PenaltyDraft = {};
      lateRows.forEach((row) => {
        draft[row.recordId] = row.penaltyAmount > 0 ? String(row.penaltyAmount) : '';
      });
      setPenaltyDraft(draft);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, employees.length]);

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

  const totalPenalty = useMemo(() => {
    return filteredRows.reduce((sum, row) => {
      const draft = penaltyDraft[row.recordId];
      const amount = draft !== undefined && draft !== '' ? Number(draft) : row.penaltyAmount;
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }, [filteredRows, penaltyDraft]);

  const handleSave = async (row: LatecomerRow) => {
    const record = attendanceMap.get(row.recordId);
    if (!record) {
      showAlert('Error', 'Attendance record not found.');
      return;
    }

    const raw = penaltyDraft[row.recordId] ?? '';
    const penaltyAmount = raw === '' ? 0 : Math.max(0, Number(raw));
    if (!Number.isFinite(penaltyAmount)) {
      showAlert('Invalid amount', 'Enter a valid penalty amount.');
      return;
    }

    setSavingId(row.recordId);
    try {
      const updated: AttendanceRecord = {
        ...record,
        lateSeconds: row.lateSeconds,
        lateMinutes: Math.ceil(row.lateSeconds / 60),
        penaltyAmount,
      };
      await saveAttendanceRecords([updated]);
      setAttendanceMap((prev) => new Map(prev).set(row.recordId, updated));
      setRows((prev) =>
        prev.map((item) => (item.recordId === row.recordId ? { ...item, penaltyAmount } : item))
      );
    } catch {
      showAlert('Error', 'Could not save penalty. Try again.');
    } finally {
      setSavingId(null);
    }
  };

  const dateLabel = selectedDate
    ? format(parseISO(selectedDate), 'dd MMM yyyy')
    : format(new Date(), 'dd MMM yyyy');

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
                <DateInputField
                  label="Date"
                  value={selectedDate}
                  onChange={setSelectedDate}
                  textColor={colors.text}
                  mutedColor={colors.textMuted}
                  borderColor={colors.borderLight}
                  cardColor={colors.card}
                  dangerColor={colors.danger}
                  primaryColor={colors.primary}
                  compact
                />
              </View>
              <View style={styles.filterCell}>
                <SelectField
                  label="Shift"
                  value={shiftFilter}
                  onChange={setShiftFilter}
                  options={shiftOptions}
                  textColor={colors.text}
                  mutedColor={colors.textMuted}
                  borderColor={colors.borderLight}
                  cardColor={colors.card}
                  dangerColor={colors.danger}
                  primaryColor={colors.primary}
                  compact
                  hideLeadingIcon
                />
              </View>
            </View>
            <View style={styles.filterRow}>
              <View style={styles.filterCell}>
                <SelectField
                  label="Department"
                  value={departmentFilter}
                  onChange={setDepartmentFilter}
                  options={departmentOptions}
                  textColor={colors.text}
                  mutedColor={colors.textMuted}
                  borderColor={colors.borderLight}
                  cardColor={colors.card}
                  dangerColor={colors.danger}
                  primaryColor={colors.primary}
                  compact
                  hideLeadingIcon
                />
              </View>
              <View style={styles.filterCell}>
                <SelectField
                  label="Employee"
                  value={employeeFilter}
                  onChange={setEmployeeFilter}
                  options={employeeOptions}
                  textColor={colors.text}
                  mutedColor={colors.textMuted}
                  borderColor={colors.borderLight}
                  cardColor={colors.card}
                  dangerColor={colors.danger}
                  primaryColor={colors.primary}
                  compact
                  hideLeadingIcon
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
                No latecomers for {dateLabel}.
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
                <Card key={row.recordId} style={styles.lateCard}>
                  <View style={styles.lateHeader}>
                    <View style={[styles.avatar, { backgroundColor: avatarColor(row.employeeId) }]}>
                      <Text style={styles.avatarText}>{initials(emp)}</Text>
                    </View>
                    <View style={styles.lateHeaderInfo}>
                      <Text style={[styles.lateName, { color: colors.text }]}>
                        {getEmployeeDisplayName(emp)}
                      </Text>
                      <Text style={[styles.lateMeta, { color: colors.textSecondary }]}>
                        {emp.staffCategory === 'doctor' ? 'Doctor' : 'Staff'} · {emp.employeeId}
                      </Text>
                    </View>
                    <StatusBadge label={lateLabel} tone={tone} />
                  </View>

                  <View style={styles.lateMetrics}>
                    <View style={styles.lateMetric}>
                      <Text style={[styles.lateMetricLabel, { color: colors.textMuted }]}>Shift Start</Text>
                      <Text style={[styles.lateMetricValue, { color: colors.text }]}>
                        {formatDisplayTime(row.shiftStart)}
                      </Text>
                    </View>
                    <View style={styles.lateMetric}>
                      <Text style={[styles.lateMetricLabel, { color: colors.textMuted }]}>Punch In</Text>
                      <Text style={[styles.lateMetricValue, { color: colors.text }]}>
                        {formatDisplayTime(row.punchIn)}
                      </Text>
                    </View>
                    <View style={styles.lateMetric}>
                      <Text style={[styles.lateMetricLabel, { color: colors.textMuted }]}>Late By</Text>
                      <Text style={[styles.lateMetricValue, { color: toneColor, fontWeight: '800' }]}>
                        {lateLabel}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.penaltyRow}>
                    <View style={styles.penaltyInputWrap}>
                      <Text style={[styles.penaltyLabel, { color: colors.textMuted }]}>Penalty (₹)</Text>
                      <TextInput
                        style={[
                          styles.penaltyInput,
                          {
                            color: colors.text,
                            borderColor: colors.borderLight,
                            backgroundColor: colors.background,
                          },
                        ]}
                        value={penaltyDraft[row.recordId] ?? ''}
                        onChangeText={(text) =>
                          setPenaltyDraft((prev) => ({ ...prev, [row.recordId]: text.replace(/[^\d.]/g, '') }))
                        }
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                    <Pressable
                      onPress={() => handleSave(row)}
                      disabled={savingId === row.recordId}
                      style={[
                        styles.saveBtn,
                        { backgroundColor: colors.primary, opacity: savingId === row.recordId ? 0.6 : 1 },
                      ]}
                    >
                      {savingId === row.recordId ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <>
                          <Ionicons name="save-outline" size={16} color="#FFF" />
                          <Text style={styles.saveBtnText}>Save</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </Card>
              );
            })
          )}

          {rows.length > 0 ? (
            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                Showing {filteredRows.length} of {rows.length} latecomer{rows.length === 1 ? '' : 's'}
              </Text>
              <Text style={[styles.footerTotal, { color: colors.primary }]}>
                Total Penalty: ₹{Math.round(totalPenalty)}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingTop: 4,
  },
  lateMetric: { flex: 1, alignItems: 'center' },
  lateMetricLabel: { fontSize: 11, marginBottom: 4 },
  lateMetricValue: { fontSize: 14, fontWeight: '600' },
  penaltyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  penaltyInputWrap: { flex: 1 },
  penaltyLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  penaltyInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 88,
    justifyContent: 'center',
  },
  saveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  footerText: { fontSize: 13 },
  footerTotal: { fontSize: 14, fontWeight: '800' },
});
