import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { AdminClinicBar } from '@/components/admin/AdminClinicBar';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { LEAVE_TYPE_LABELS } from '@/constants/config';
import { getEmployeeDisplayName } from '@/services/employeeRegistry';
import { useColorScheme } from '@/components/useColorScheme';

const MESSAGE_BLUE = '#1A73E8';
const LINE_BLUE = '#8AB4F8';

function MessagesAppIcon({ size = 48 }: { size?: number }) {
  const bubbleWidth = size * 0.52;
  const bubbleHeight = size * 0.44;
  const lineWidth = bubbleWidth * 0.62;
  const shortLineWidth = bubbleWidth * 0.38;

  return (
    <View style={[iconStyles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <View
        style={[
          iconStyles.bubble,
          { width: bubbleWidth, height: bubbleHeight, borderRadius: bubbleHeight * 0.28 },
        ]}
      >
        <View
          style={[iconStyles.tail, { borderTopWidth: bubbleHeight * 0.18, borderRightWidth: bubbleHeight * 0.14 }]}
        />
        <View style={[iconStyles.line, { width: lineWidth, height: size * 0.045, borderRadius: size * 0.025 }]} />
        <View style={[iconStyles.line, { width: lineWidth, height: size * 0.045, borderRadius: size * 0.025 }]} />
        <View
          style={[iconStyles.line, { width: shortLineWidth, height: size * 0.045, borderRadius: size * 0.025 }]}
        />
      </View>
    </View>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const {
    clinicAdminStats,
    clinicPendingApprovals,
    clinicTodayShifts,
    clinicPeopleOnLeaveToday,
    clinicEmployees,
  } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const shiftRows = clinicTodayShifts.map((shift) => {
    const emp = clinicEmployees.find((e) => e.employeeId === shift.employeeId);
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
      <View style={styles.topRow}>
        <AdminClinicBar hideLabel />
        <Pressable
          onPress={() => router.push('/admin/chat' as Href)}
          style={styles.messageBtn}
          accessibilityRole="button"
          accessibilityLabel="Broadcast message"
        >
          <MessagesAppIcon size={44} />
        </Pressable>
      </View>

      <View style={styles.stats}>
        <StatCard label="Doctors" value={String(clinicAdminStats.totalSupervisors)} accent="#0F766E" compact centered />
        <StatCard label="Staff" value={String(clinicAdminStats.departments)} accent="#0369A1" compact centered />
      </View>
      <View style={styles.stats}>
        <StatCard
          label="Pending"
          value={String(clinicAdminStats.pendingApprovals)}
          accent={colors.warning}
          compact
          centered
          statusSymbol="pending"
        />
        <StatCard
          label="On leave"
          value={String(clinicPeopleOnLeaveToday.length)}
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
              {row.notes ? ` · ${row.notes}` : ''}
            </Text>
          </Card>
        ))
      )}

      <Text style={[styles.section, { color: colors.text }]}>Who's on leave today</Text>
      {clinicPeopleOnLeaveToday.length === 0 ? (
        <Card>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>Everyone is available today.</Text>
        </Card>
      ) : (
        clinicPeopleOnLeaveToday.map((person) => (
          <Card key={`${person.employeeId}-${person.reason}`} style={styles.card}>
            <Text style={[styles.name, { color: colors.text }]}>{person.employeeName}</Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {LEAVE_TYPE_LABELS[person.leaveType] ?? person.leaveType} · {person.department}
            </Text>
          </Card>
        ))
      )}

      <Text style={[styles.section, { color: colors.text }]}>Pending leave</Text>
      {clinicPendingApprovals.length === 0 ? (
        <Card>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No pending leave requests.</Text>
        </Card>
      ) : (
        clinicPendingApprovals.slice(0, 3).map((item) => (
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  messageBtn: {
    flexShrink: 0,
  },
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

const iconStyles = StyleSheet.create({
  circle: {
    backgroundColor: MESSAGE_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: MESSAGE_BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  bubble: {
    backgroundColor: '#FFFFFF',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 5,
    position: 'relative',
  },
  tail: {
    position: 'absolute',
    left: -4,
    bottom: 4,
    width: 0,
    height: 0,
    borderTopColor: 'transparent',
    borderRightColor: '#FFFFFF',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    borderStyle: 'solid',
    transform: [{ rotate: '-18deg' }],
  },
  line: {
    backgroundColor: LINE_BLUE,
  },
});
