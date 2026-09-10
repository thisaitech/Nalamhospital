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
import {
  canContinueNextShift,
  canResumeSplitShift,
  getSplitShiftPunchStatus,
  getTodayAttendance,
  hasPunchedOutToday,
  isShiftOpen,
} from '@/utils/punchSessions';
import { showAlert, showPunchOutChoice } from '@/utils/uiAlert';
import { useColorScheme } from '@/components/useColorScheme';

export default function AttendanceScreen() {
  const { employee, attendance, doPunchIn, doPunchOut, doContinueShift, refreshData } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const [wifiValid, setWifiValid] = useState(false);
  const [wifiMessage, setWifiMessage] = useState('Checking network...');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const today = getTodayAttendance(attendance, todayKey);
  const is24HourDoctor = Boolean(employee?.is24HourDuty);
  const splitShiftEnabled = Boolean(employee?.splitShiftEnabled);
  const canResumeSplit = canResumeSplitShift(today);
  const canPunchIn = !is24HourDoctor && Boolean(today && (!today.punchIn || canResumeSplit));
  const canPunchOut = !is24HourDoctor && isShiftOpen(today);
  const canContinue = !is24HourDoctor && canContinueNextShift(attendance, todayKey, splitShiftEnabled);
  const showPunchOutChoiceOnTap = false;
  const punchedOutToday = !is24HourDoctor && hasPunchedOutToday(attendance, todayKey);
  const showContinueButton = false;
  const splitShiftStatus = getSplitShiftPunchStatus(today, splitShiftEnabled);
  const isSplitSecondSession = Boolean(splitShiftEnabled && today?.continuePunchIn && isShiftOpen(today));

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

  const performPunchOut = async () => {
    setLoading(true);
    try {
      const result = await verifyOfficeWifi();
      const method = result.valid ? 'wifi' : 'manual';
      const record = await doPunchOut(method);
      if (record?.splitShiftOnBreak) {
        showAlert(
          'Break started',
          `First shift ended at ${formatDisplayTime(record.punchOut)}. Resume when your second shift starts.`
        );
      } else if (splitShiftEnabled && record?.punchOut && !record.splitShiftOnBreak) {
        showAlert(
          'Day completed',
          `Total attended today: ${record.hoursWorked ?? 0}h.`
        );
      } else {
        showAlert(
          'Punched Out',
          `Total attended today: ${record?.hoursWorked ?? 0}h.`
        );
      }
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Punch out failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePunchOut = () => {
    if (showPunchOutChoiceOnTap) {
      showPunchOutChoice(handleContinue, performPunchOut);
      return;
    }
    void performPunchOut();
  };

  const handleContinue = async () => {
    if (punchedOutToday) {
      showAlert('You already punched out', 'Continue is not available after punch out.');
      return;
    }
    setLoading(true);
    try {
      const result = await verifyOfficeWifi();
      const record = result.valid
        ? await doContinueShift('wifi', result.ssid)
        : await doContinueShift('manual', null);
      if (record) {
        showAlert(
          'Next shift started',
          `Continued at ${formatDisplayTime(record.continuePunchIn)}. Hours so far are saved — continue again for another shift, or punch out when finished.`
        );
      }
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not continue to next shift');
    } finally {
      setLoading(false);
    }
  };

  const historyRecords = attendance.filter((r) => r.punchIn);

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
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.todayPunchBlock}>
            <Text style={[styles.punchLabel, { color: colors.textSecondary }]}>Punch Out</Text>
            <Text style={[styles.todayPunchTime, { color: colors.text }]}>
              {today?.splitShiftOnBreak
                ? formatDisplayTime(today?.punchOut)
                : today?.continuePunchIn && isShiftOpen(today)
                  ? '—'
                  : formatDisplayTime(today?.punchOut)}
            </Text>
            {today?.splitShiftOnBreak ? (
              <StatusBadge label="on break" tone="warning" />
            ) : today?.continuePunchIn ? (
              <StatusBadge label="second shift" tone="primary" />
            ) : today?.punchOutMethod ? (
              <StatusBadge label={today.punchOutMethod} tone="primary" />
            ) : null}
          </View>
        </View>
        {splitShiftStatus ? (
          <Text style={[styles.hours, { color: colors.textSecondary }]}>Status: {splitShiftStatus}</Text>
        ) : null}
        {today?.continuePunchIn ? (
          <Text style={[styles.hours, { color: colors.textSecondary }]}>
            Continued at {formatDisplayTime(today.continuePunchIn)} · prior total {today.hoursWorked || 0}h
          </Text>
        ) : today?.hoursWorked ? (
          <Text style={[styles.hours, { color: colors.primary }]}>
            Hours attended: {today.hoursWorked}h
            {today.otHours > 0 ? ` · OT: ${today.otHours}h` : ''}
          </Text>
        ) : null}
      </Card>

      <View style={styles.actions}>
        {is24HourDoctor ? (
          <Text style={[styles.doneText, { color: colors.textSecondary }]}>
            {today?.status === 'present' || today?.punchIn
              ? 'Present marked for today. Use Home for 24h Present.'
              : today?.status === 'absent'
                ? 'Absent — present window was missed.'
                : '24h doctors mark Present on the Home screen within the admin time window.'}
          </Text>
        ) : null}
        {canPunchIn && (
          <>
            <Button
              title={canResumeSplit ? 'Resume Shift via WiFi' : 'Punch In via WiFi'}
              onPress={handleWifiPunchIn}
              loading={loading}
              disabled={!wifiValid}
            />
            <Button
              title={canResumeSplit ? 'Manual Resume Shift' : 'Manual Punch In'}
              variant="outline"
              onPress={handleManualPunchIn}
              loading={loading}
              style={styles.manualBtn}
            />
          </>
        )}
        {canPunchOut && (
          <Button
            title={
              splitShiftEnabled
                ? isSplitSecondSession
                  ? 'Final Punch Out'
                  : 'Break / First Punch Out'
                : 'Punch Out'
            }
            variant="danger"
            onPress={handlePunchOut}
            loading={loading}
          />
        )}
        {showContinueButton && (
          <Button
            title="Continue"
            variant="outline"
            onPress={handleContinue}
            loading={loading}
          />
        )}
        {!is24HourDoctor && !canPunchIn && !canPunchOut && !canContinue && !punchedOutToday ? (
          <Text style={[styles.doneText, { color: colors.textSecondary }]}>Loading...</Text>
        ) : null}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>History</Text>
      {historyRecords.map((record) => (
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
              {record.hoursWorked}h attended
              {record.otHours > 0 ? ` · OT ${record.otHours}h` : ''}
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
