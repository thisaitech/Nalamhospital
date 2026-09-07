import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { format, parseISO, subMonths } from 'date-fns';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useApp } from '@/contexts/AppContext';
import { findEmployeeById, getEmployeeDisplayName } from '@/services/employeeRegistry';
import { loadAttendanceForEmployee } from '@/services/firestoreRepository';
import type { AttendanceRecord, Employee } from '@/types/employee';
import {
  formatHoursMinutes,
  formatMinutesLabel,
  formatRupee,
} from '@/utils/attendanceRules';
import { monthDateRange } from '@/utils/attendanceSummary';
import { formatDisplayTime } from '@/utils/formatTime';
import { showAlert, showConfirm } from '@/utils/uiAlert';

type TabId = 'profile' | 'attendance';

const TABS: { id: TabId; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'attendance', label: 'Attendance History' },
];

export default function AdminEmployeeDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { deleteEmployee, restoreDeletedEmployee } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<TabId>('profile');
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const now = new Date();
  const currentRange = monthDateRange(now.getFullYear(), now.getMonth());
  const prevMonth = subMonths(now, 1);
  const prevRange = monthDateRange(prevMonth.getFullYear(), prevMonth.getMonth());

  const load = useCallback(async () => {
    if (!id) return;
    const [emp, att] = await Promise.all([findEmployeeById(id), loadAttendanceForEmployee(id)]);
    setEmployee(emp ?? null);
    setRecords(att.sort((a, b) => b.date.localeCompare(a.date)));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const historyStats = useMemo(() => {
    const punched = records.filter((r) => r.punchIn);
    const totalHours = punched.reduce((sum, r) => sum + (r.hoursWorked || 0), 0);
    const totalOt = punched.reduce((sum, r) => sum + (r.otHours || 0), 0);
    const lateDays = punched.filter((r) => (r.lateMinutes ?? 0) > 0 || r.status === 'late').length;
    const lateFine = punched.reduce(
      (sum, r) => sum + Math.max(0, Number(r.penaltyAmount) || 0),
      0
    );

    const avgDaily = punched.length ? totalHours / punched.length : 0;

    const currentLate = punched.filter(
      (r) => r.date >= currentRange.fromDate && r.date <= currentRange.toDate && (r.lateMinutes ?? 0) > 0
    );
    const prevLate = punched.filter(
      (r) => r.date >= prevRange.fromDate && r.date <= prevRange.toDate && (r.lateMinutes ?? 0) > 0
    );
    const avg = (list: AttendanceRecord[]) =>
      list.length
        ? Math.round(list.reduce((s, r) => s + (r.lateMinutes ?? 0), 0) / list.length)
        : 0;

    const absentDays = records.filter((r) => r.status === 'absent').length;

    return {
      totalHours,
      avgDaily,
      currentAvgLate: avg(currentLate),
      previousAvgLate: avg(prevLate),
      totalOt,
      lateDays,
      absentDays,
      lateFine,
    };
  }, [records, currentRange, prevRange]);

  if (!employee) {
    return (
      <>
        <Stack.Screen options={{ title: 'Employee', headerBackTitle: 'Back' }} />
        <View style={[styles.container, { backgroundColor: colors.background, padding: 20 }]}>
          <Text style={{ color: colors.textSecondary }}>Employee not found.</Text>
          <Button title="Back" variant="outline" onPress={() => router.back()} style={{ marginTop: 12 }} />
        </View>
      </>
    );
  }

  const isDeleted = Boolean(employee.deletedAt);

  const handleDelete = async () => {
    if (busy) return;
    const ok = await showConfirm(
      'Delete staff',
      `Move ${getEmployeeDisplayName(employee)} to Deleted staff? Details stay saved.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deleteEmployee(employee.employeeId);
      showAlert('Moved', 'This person is now in Deleted staff.');
      await load();
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not delete');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (busy) return;
    const ok = await showConfirm(
      'Restore staff',
      `Restore ${getEmployeeDisplayName(employee)} to the active Staff list?`
    );
    if (!ok) return;
    setBusy(true);
    try {
      await restoreDeletedEmployee(employee.employeeId);
      showAlert('Restored', 'This person is active again.');
      await load();
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not restore');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: getEmployeeDisplayName(employee),
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {employee.staffCategory === 'doctor' ? 'Doctor' : 'Staff'} · {employee.employeeId}
          {isDeleted ? ' · Deleted' : ''}
        </Text>
        {isDeleted ? (
          <View style={{ marginBottom: 12 }}>
            <StatusBadge label="Deleted staff" tone="danger" />
          </View>
        ) : null}

        <View style={styles.tabRow}>
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setTab(item.id)}
                style={[
                  styles.tabChip,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.borderLight,
                  },
                ]}
              >
                <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700', fontSize: 11 }}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'profile' ? (
          <Card>
            <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Name</Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>{getEmployeeDisplayName(employee)}</Text>
            <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Email</Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>{employee.email}</Text>
            <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Phone</Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>{employee.phone || '—'}</Text>
            <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Department</Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>{employee.department}</Text>
            <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Position</Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>{employee.position}</Text>
            <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Clinic</Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>
              {employee.clinicName || employee.clinicId}
            </Text>
            <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Supervisor</Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>{employee.manager || '—'}</Text>
            {isDeleted && employee.deletedAt ? (
              <>
                <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Deleted on</Text>
                <Text style={[styles.rowValue, { color: colors.text }]}>
                  {format(parseISO(employee.deletedAt), 'MMM d, yyyy · h:mm a')}
                </Text>
              </>
            ) : null}
          </Card>
        ) : null}

        {tab === 'attendance' ? (
          <>
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Summary</Text>
              <View style={styles.metricsGrid}>
                <Metric label="Total Hours" value={formatHoursMinutes(historyStats.totalHours)} colors={colors} />
                <Metric label="Avg Daily" value={formatHoursMinutes(historyStats.avgDaily)} colors={colors} />
                <Metric label="Curr. Avg Late" value={formatMinutesLabel(historyStats.currentAvgLate)} colors={colors} />
                <Metric label="Prev. Avg Late" value={formatMinutesLabel(historyStats.previousAvgLate)} colors={colors} />
                <Metric label="Total OT" value={formatHoursMinutes(historyStats.totalOt)} colors={colors} />
                <Metric label="Late Days" value={String(historyStats.lateDays)} colors={colors} />
                <Metric label="Absent Days" value={String(historyStats.absentDays)} colors={colors} />
                <Metric label="Late Fine" value={formatRupee(historyStats.lateFine)} colors={colors} />
              </View>
            </Card>

            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>Attendance History</Text>
            {records.filter((r) => r.punchIn).length === 0 ? (
              <Card>
                <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>No punch history yet.</Text>
              </Card>
            ) : (
              records
                .filter((r) => r.punchIn)
                .slice(0, 40)
                .map((r) => (
                  <Card key={r.id} style={styles.historyCard}>
                    <View style={styles.historyHeader}>
                      <Text style={[styles.historyDate, { color: colors.text }]}>
                        {format(parseISO(r.date), 'MMM d')}
                      </Text>
                      <StatusBadge
                        label={r.status === 'late' || (r.lateMinutes ?? 0) > 0 ? 'Late' : 'Present'}
                        tone={r.status === 'late' || (r.lateMinutes ?? 0) > 0 ? 'warning' : 'success'}
                      />
                    </View>
                    <Text style={[styles.historyMeta, { color: colors.textSecondary }]}>
                      In {formatDisplayTime(r.punchIn)} · Out {formatDisplayTime(r.punchOut)} ·{' '}
                      {formatHoursMinutes(r.hoursWorked || 0)} · Late {formatMinutesLabel(r.lateMinutes ?? 0)} · OT{' '}
                      {formatHoursMinutes(r.otHours || 0)}
                    </Text>
                  </Card>
                ))
            )}
          </>
        ) : null}

        {isDeleted ? (
          <Button title="Restore to Staff" onPress={handleRestore} loading={busy} disabled={busy} />
        ) : (
          <Button title="Delete staff" variant="outline" onPress={handleDelete} loading={busy} disabled={busy} />
        )}
      </ScrollView>
    </>
  );
}

function Metric({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: (typeof Colors)['light'];
}) {
  return (
    <View style={styles.metricCell}>
      <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 12 },
  subtitle: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  tabRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tabChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  rowLabel: { fontSize: 11, fontWeight: '700', marginTop: 10, textTransform: 'uppercase' },
  rowValue: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  metricCell: { width: '50%', paddingVertical: 8 },
  metricValue: { fontSize: 16, fontWeight: '800' },
  metricLabel: { fontSize: 11, marginTop: 2 },
  historyCard: { marginBottom: 2 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyDate: { fontSize: 14, fontWeight: '800' },
  historyMeta: { fontSize: 12, marginTop: 6, lineHeight: 18 },
});
