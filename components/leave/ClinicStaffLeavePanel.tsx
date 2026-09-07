import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { format, parseISO } from 'date-fns';
import { useFocusEffect } from 'expo-router';

import { Card } from '@/components/ui/Card';
import { StatusSymbolBadge } from '@/components/ui/StatusSymbolBadge';
import Colors from '@/constants/Colors';
import { LEAVE_TYPE_LABELS } from '@/constants/config';
import { loadEmployees } from '@/services/employeeRegistry';
import { loadLeaveRequests } from '@/services/firestoreRepository';
import {
  getClinicStaffLeaveToday,
  getClinicStaffLeaveUpcoming,
  type ClinicStaffLeaveItem,
} from '@/utils/clinicLeave';
import { useColorScheme } from '@/components/useColorScheme';

function ClinicLeaveCard({
  item,
  colors,
}: {
  item: ClinicStaffLeaveItem;
  colors: (typeof Colors)['light'];
}) {
  const dateLabel =
    item.startDate === item.endDate
      ? format(parseISO(item.startDate), 'EEE, MMM d')
      : `${format(parseISO(item.startDate), 'MMM d')} – ${format(parseISO(item.endDate), 'MMM d')}`;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.name, { color: colors.text }]}>{item.employeeName}</Text>
        <StatusSymbolBadge status={item.status} compact />
      </View>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>
        {item.position} · {LEAVE_TYPE_LABELS[item.leaveType] ?? item.leaveType}
      </Text>
      <Text style={[styles.dateLine, { color: colors.text }]}>
        {dateLabel}
        {item.days > 1 ? ` · ${item.days} days` : ''}
      </Text>
      {item.reason ? (
        <Text style={[styles.reason, { color: colors.textSecondary }]} numberOfLines={2}>
          {item.reason}
        </Text>
      ) : null}
    </Card>
  );
}

interface ClinicStaffLeavePanelProps {
  clinicId: string;
}

/** Doctor view-only: clinic staff leave today + upcoming (no approve/reject). */
export function ClinicStaffLeavePanel({ clinicId }: ClinicStaffLeavePanelProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const [todayItems, setTodayItems] = useState<ClinicStaffLeaveItem[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<ClinicStaffLeaveItem[]>([]);

  const load = useCallback(async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [employees, requests] = await Promise.all([loadEmployees(), loadLeaveRequests()]);
    setTodayItems(
      getClinicStaffLeaveToday({
        clinicId,
        today,
        employees,
        requests,
      })
    );
    setUpcomingItems(
      getClinicStaffLeaveUpcoming({
        clinicId,
        today,
        daysAhead: 14,
        employees,
        requests,
      })
    );
  }, [clinicId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const upcomingByDate = useMemo(() => {
    const groups = new Map<string, ClinicStaffLeaveItem[]>();
    for (const item of upcomingItems) {
      const list = groups.get(item.startDate) ?? [];
      list.push(item);
      groups.set(item.startDate, list);
    }
    return Array.from(groups.entries());
  }, [upcomingItems]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.panelTitle, { color: colors.text }]}>Leaves</Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>On leave today</Text>
      {todayItems.length === 0 ? (
        <Card style={styles.card}>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No clinic staff on leave today.
          </Text>
        </Card>
      ) : (
        todayItems.map((item) => <ClinicLeaveCard key={item.requestId} item={item} colors={colors} />)
      )}

      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>Upcoming leave</Text>
      {upcomingByDate.length === 0 ? (
        <Card style={styles.card}>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No upcoming clinic staff leave.
          </Text>
        </Card>
      ) : (
        upcomingByDate.map(([date, items]) => (
          <View key={date} style={styles.group}>
            <Text style={[styles.groupDate, { color: colors.primary }]}>
              {format(parseISO(date), 'EEEE, MMM d')}
            </Text>
            {items.map((item) => (
              <ClinicLeaveCard key={item.requestId} item={item} colors={colors} />
            ))}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  panelTitle: { fontSize: 22, fontWeight: '800', marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  card: { marginBottom: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '800', flex: 1 },
  meta: { fontSize: 12, marginTop: 6, fontWeight: '500' },
  dateLine: { fontSize: 14, marginTop: 6, fontWeight: '600' },
  reason: { fontSize: 12, marginTop: 6, fontWeight: '500' },
  empty: { textAlign: 'center', paddingVertical: 14, fontSize: 13 },
  group: { marginBottom: 6 },
  groupDate: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
});
