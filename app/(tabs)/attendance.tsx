import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { format, parseISO } from 'date-fns';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { getCurrentWifiInfo, verifyOfficeWifi } from '@/services/wifiService';
import { formatDisplayTime } from '@/utils/formatTime';
import { showAlert } from '@/utils/uiAlert';
import { useColorScheme } from '@/components/useColorScheme';

export default function AttendanceScreen() {
  const { attendance, doPunchIn, doPunchOut, refreshData } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const [wifiValid, setWifiValid] = useState(false);
  const [wifiMessage, setWifiMessage] = useState('Checking network...');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const today = attendance[0];
  const canPunchIn = today && !today.punchIn;
  const canPunchOut = today && today.punchIn && !today.punchOut;

  const checkWifi = useCallback(async () => {
    await getCurrentWifiInfo();
    const result = await verifyOfficeWifi();
    setWifiValid(result.valid);
    setWifiMessage(result.message);
  }, []);

  useEffect(() => {
    checkWifi();
    const interval = setInterval(checkWifi, 10000);
    return () => clearInterval(interval);
  }, [checkWifi]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshData(), checkWifi()]);
    setRefreshing(false);
  };

  const handleWifiPunchIn = async () => {
    setLoading(true);
    try {
      const result = await verifyOfficeWifi();
      if (!result.valid) {
        showAlert('WiFi Verification Failed', result.message);
        return;
      }
      await doPunchIn('wifi', result.ssid);
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Punch in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleManualPunchIn = async () => {
    setLoading(true);
    try {
      await doPunchIn('manual', null);
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Punch in failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePunchOut = async () => {
    setLoading(true);
    try {
      const result = await verifyOfficeWifi();
      const method = result.valid ? 'wifi' : 'manual';
      await doPunchOut(method);
      showAlert('Punched Out', `Recorded at ${format(new Date(), 'h:mm a')}`);
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Punch out failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <ScreenHeader title="Attendance" />

      <Card style={[styles.wifiCard, { borderColor: wifiValid ? colors.success : colors.border }]}>
        <View style={styles.wifiHeader}>
          <Text style={styles.wifiIcon}>{wifiValid ? '✅' : '📶'}</Text>
          <View style={styles.wifiInfo}>
            <Text style={[styles.wifiTitle, { color: colors.text }]}>Office WiFi</Text>
            <Text style={[styles.wifiMsg, { color: colors.textSecondary }]}>{wifiMessage}</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.todayCard}>
        <Text style={[styles.todayLabel, { color: colors.textSecondary }]}>Today</Text>
        <Text style={[styles.todayDate, { color: colors.text }]}>
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </Text>
        <View style={styles.punchTimes}>
          <View style={styles.todayPunchBlock}>
            <Text style={[styles.punchLabel, { color: colors.textSecondary }]}>Punch In</Text>
            <Text style={[styles.todayPunchTime, { color: colors.text }]}>
              {formatDisplayTime(today?.punchIn)}
            </Text>
            {today?.punchInMethod ? (
              <StatusBadge label={today.punchInMethod} tone={today.punchInMethod === 'wifi' ? 'success' : 'warning'} />
            ) : null}
            {today?.manualApprovalStatus === 'pending' ? (
              <StatusBadge label="pending approval" tone="warning" />
            ) : null}
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.todayPunchBlock}>
            <Text style={[styles.punchLabel, { color: colors.textSecondary }]}>Punch Out</Text>
            <Text style={[styles.todayPunchTime, { color: colors.text }]}>
              {formatDisplayTime(today?.punchOut)}
            </Text>
            {today?.punchOutMethod ? (
              <StatusBadge label={today.punchOutMethod} tone="primary" />
            ) : null}
          </View>
        </View>
        {today?.hoursWorked ? (
          <Text style={[styles.hours, { color: colors.primary }]}>
            Hours worked: {today.hoursWorked}h
            {today.otHours > 0 ? ` · OT (payable): ${today.otHours}h` : ''}
            {today.scheduledHours > 0 ? ` · Scheduled: ${today.scheduledHours}h` : ''}
          </Text>
        ) : null}
      </Card>

      <Card style={styles.todayCard}>
        <Text style={[styles.todayLabel, { color: colors.textSecondary }]}>This period (your records)</Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {Math.round(attendance.reduce((s, r) => s + (r.scheduledHours || 0), 0) * 10) / 10}h
            </Text>
            <Text style={[styles.punchLabel, { color: colors.textMuted }]}>Scheduled</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#0F766E' }]}>
              {Math.round(attendance.reduce((s, r) => s + (r.hoursWorked || 0), 0) * 10) / 10}h
            </Text>
            <Text style={[styles.punchLabel, { color: colors.textMuted }]}>Attended</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: colors.danger }]}>
              {attendance.filter((r) => !r.punchIn && r.status === 'absent').length}
            </Text>
            <Text style={[styles.punchLabel, { color: colors.textMuted }]}>Absent days</Text>
          </View>
        </View>
      </Card>

      <View style={styles.actions}>
        {canPunchIn && (
          <>
            <Button
              title="Punch In via WiFi"
              onPress={handleWifiPunchIn}
              loading={loading}
              disabled={!wifiValid}
            />
            <Button
              title="Manual Punch In"
              variant="outline"
              onPress={handleManualPunchIn}
              loading={loading}
              style={styles.manualBtn}
            />
          </>
        )}
        {canPunchOut && (
          <Button title="Punch Out" variant="danger" onPress={handlePunchOut} loading={loading} />
        )}
        {!canPunchIn && !canPunchOut && (
          <Text style={[styles.doneText, { color: colors.textSecondary }]}>
            {today?.punchOut ? 'You have completed attendance for today.' : 'Loading...'}
          </Text>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>History</Text>
      {attendance.slice(1).map((record) => (
        <Card key={record.id} style={styles.historyCard}>
          <Text style={[styles.historyDate, { color: colors.text }]}>
            {format(parseISO(record.date), 'MMM d, yyyy')}
          </Text>
          <View style={styles.historyPunchRow}>
            <View style={styles.punchBlock}>
              <Text style={[styles.punchLabel, { color: colors.textSecondary }]}>Punch In</Text>
              <Text style={[styles.punchTime, { color: colors.text }]}>
                {formatDisplayTime(record.punchIn)}
              </Text>
            </View>
            <Text style={[styles.punchArrow, { color: colors.textMuted }]}>→</Text>
            <View style={styles.punchBlock}>
              <Text style={[styles.punchLabel, { color: colors.textSecondary }]}>Punch Out</Text>
              <Text style={[styles.punchTime, { color: colors.text }]}>
                {formatDisplayTime(record.punchOut)}
              </Text>
            </View>
          </View>
          {(record.hoursWorked > 0 || record.otHours > 0) && (
            <Text style={[styles.punchLabel, { color: colors.textSecondary, marginTop: 8 }]}>
              {record.hoursWorked}h worked
              {record.otHours > 0 ? ` · OT ${record.otHours}h` : ''}
              {record.shiftType ? ` · ${record.shiftType}` : ''}
            </Text>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  wifiCard: { marginBottom: 16, borderWidth: 2 },
  wifiHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  wifiIcon: { fontSize: 28 },
  wifiInfo: { flex: 1 },
  wifiTitle: { fontSize: 16, fontWeight: '700' },
  wifiMsg: { fontSize: 13, marginTop: 4 },
  todayCard: { marginBottom: 20 },
  todayLabel: { fontSize: 12, fontWeight: '500' },
  todayDate: { fontSize: 18, fontWeight: '700', marginTop: 4, marginBottom: 16 },
  punchTimes: { flexDirection: 'row', alignItems: 'center' },
  todayPunchBlock: { flex: 1, alignItems: 'center', gap: 6 },
  punchLabel: { fontSize: 12, fontWeight: '500', marginBottom: 4 },
  todayPunchTime: { fontSize: 28, fontWeight: '700' },
  divider: { width: 1, height: 60, marginHorizontal: 12 },
  hours: { textAlign: 'center', marginTop: 16, fontSize: 15, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 18, fontWeight: '800' },
  actions: { gap: 10, marginBottom: 24 },
  manualBtn: { marginTop: 0 },
  doneText: { textAlign: 'center', fontSize: 14, padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  historyCard: { marginBottom: 10 },
  historyDate: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  historyPunchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  punchBlock: { flex: 1 },
  punchTime: { fontSize: 20, fontWeight: '700' },
  punchArrow: { fontSize: 18, fontWeight: '600', marginHorizontal: 12 },
});
