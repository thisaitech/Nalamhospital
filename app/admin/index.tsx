import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { format } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { LEAVE_TYPE_LABELS } from '@/constants/config';
import { getEmployeeDisplayName } from '@/services/employeeRegistry';
import { useColorScheme } from '@/components/useColorScheme';

export default function AdminDashboard() {
  const { adminStats, pendingApprovals, todayShifts, peopleOnLeaveToday, allEmployees } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const todayLabel = format(new Date(), 'EEE, MMM d');

  const shiftRows = todayShifts.map((shift) => {
    const emp = allEmployees.find((e) => e.employeeId === shift.employeeId);
    return {
      ...shift,
      name: emp ? getEmployeeDisplayName(emp) : shift.employeeId,
      category: emp?.staffCategory ?? 'staff',
    };
  });

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Clinic Dashboard</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{todayLabel}</Text>

      <View style={styles.stats}>
        <StatCard label="Doctors" value={String(adminStats.totalSupervisors)} accent="#0F766E" compact centered />
        <StatCard label="Staff" value={String(adminStats.departments)} accent="#0369A1" compact centered />
      </View>
      <View style={styles.stats}>
        <StatCard
          label="Pending"
          value={String(adminStats.pendingApprovals)}
          accent={colors.warning}
          compact
          centered
          statusSymbol="pending"
        />
        <StatCard
          label="On leave"
          value={String(peopleOnLeaveToday.length)}
          accent="#B45309"
          compact
          centered
        />
      </View>

      <View style={styles.actions}>
        <Link href="/admin/approvals" asChild>
          <Button title="Review leave & punches" style={styles.actionBtn} />
        </Link>
        <Link href="/admin/shifts" asChild>
          <Button title="Open shift chart" variant="outline" style={styles.actionBtn} />
        </Link>
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Today's shift chart</Text>
      {shiftRows.length === 0 ? (
        <Card>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No shifts scheduled for today.</Text>
        </Card>
      ) : (
        shiftRows.map((row) => (
          <Card key={row.id} style={styles.card}>
            <Text style={[styles.name, { color: colors.text }]}>{row.name}</Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {row.shiftType.toUpperCase()} · {row.startTime}–{row.endTime} · {row.category}
            </Text>
          </Card>
        ))
      )}

      <Text style={[styles.section, { color: colors.text }]}>Who's on leave today</Text>
      {peopleOnLeaveToday.length === 0 ? (
        <Card>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>Everyone is available today.</Text>
        </Card>
      ) : (
        peopleOnLeaveToday.map((person) => (
          <Card key={`${person.employeeId}-${person.reason}`} style={styles.card}>
            <Text style={[styles.name, { color: colors.text }]}>{person.employeeName}</Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {LEAVE_TYPE_LABELS[person.leaveType] ?? person.leaveType} · {person.department}
            </Text>
          </Card>
        ))
      )}

      <Text style={[styles.section, { color: colors.text }]}>Pending leave</Text>
      {pendingApprovals.length === 0 ? (
        <Card>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No pending leave requests.</Text>
        </Card>
      ) : (
        pendingApprovals.slice(0, 3).map((item) => (
          <Card key={item.id} style={styles.card}>
            <Text style={[styles.name, { color: colors.text }]}>{item.employeeName}</Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {LEAVE_TYPE_LABELS[item.type] ?? item.type} · {item.days} day(s)
            </Text>
            <Text style={[styles.reason, { color: colors.text }]}>{item.reason}</Text>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginBottom: 16, marginTop: 2 },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  actions: { gap: 10, marginVertical: 16 },
  actionBtn: { width: '100%' },
  section: { fontSize: 17, fontWeight: '800', marginBottom: 10, marginTop: 8 },
  card: { marginBottom: 8 },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 4 },
  reason: { fontSize: 13, marginTop: 6 },
  empty: { textAlign: 'center', padding: 12 },
});
