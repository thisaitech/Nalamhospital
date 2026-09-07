import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { getCurrentWifiInfo, verifyOfficeWifi } from '@/services/wifiService';
import {
  formatPunchAlertMessage,
  formatPunchAlertTitle,
  formatPunchPreviewLines,
} from '@/utils/punchDetails';
import {
  canContinueNextShift,
  getTodayAttendance,
  hasPunchedOutToday,
  isShiftOpen,
} from '@/utils/punchSessions';
import { showPunchOutChoice } from '@/utils/uiAlert';
import { useColorScheme } from '@/components/useColorScheme';

function showAlert(title: string, message: string, onOk?: () => void) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    onOk?.();
    return;
  }
  Alert.alert(title, message, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
}

interface PunchDetailPanelProps {
  onClose: () => void;
}

export function PunchDetailPanel({ onClose }: PunchDetailPanelProps) {
  const { employee, attendance, doPunchIn, doPunchOut, doContinueShift } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const [wifiValid, setWifiValid] = useState(false);
  const [wifiMessage, setWifiMessage] = useState('Checking network...');
  const [loading, setLoading] = useState(false);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const today = getTodayAttendance(attendance, todayKey) ?? attendance[0];
  const canPunchIn = Boolean(today && !today.punchIn);
  const canPunchOut = isShiftOpen(today);
  const canContinue = canContinueNextShift(attendance, todayKey);
  const showPunchOutChoiceOnTap = canPunchOut && canContinue;
  const punchedOutToday = hasPunchedOutToday(attendance, todayKey);
  const showContinueButton = canContinue || punchedOutToday;
  const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : undefined;
  const detailLines = formatPunchPreviewLines(today, employee);

  const checkWifi = useCallback(async () => {
    await getCurrentWifiInfo();
    const result = await verifyOfficeWifi();
    setWifiValid(result.valid);
    setWifiMessage(result.message);
  }, []);

  useEffect(() => {
    checkWifi();
  }, [checkWifi]);

  const showPunchResult = (record: typeof today) => {
    if (!record) return;
    showAlert(formatPunchAlertTitle(record), formatPunchAlertMessage(record, employeeName));
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
      if (record) showPunchResult(record);
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
      if (record) showPunchResult(record);
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not continue to next shift');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Punch Details</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Your attendance information for today
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close punch details">
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={[styles.previewCard, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.previewTitle, { color: colors.primary }]}>Attendance summary</Text>
          {detailLines.map((line) => (
            <Text key={line} style={[styles.detailLine, { color: colors.text }]}>
              {line}
            </Text>
          ))}
        </Card>

        <Card style={[styles.wifiCard, { borderColor: wifiValid ? colors.success : colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Office WiFi</Text>
          <Text style={[styles.wifiMsg, { color: colors.text }]}>{wifiMessage}</Text>
        </Card>

        <Card style={styles.todayCard}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Today</Text>
          <Text style={[styles.todayDate, { color: colors.text }]}>
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </Text>

          <View style={styles.punchRow}>
            <View style={styles.punchBlock}>
              <Text style={[styles.punchLabel, { color: colors.textSecondary }]}>Punch In</Text>
              <Text style={[styles.punchTime, { color: colors.text }]}>
                {today?.punchIn?.slice(0, 5) ?? '—'}
              </Text>
              {today?.punchInMethod ? (
                <StatusBadge
                  label={today.punchInMethod === 'wifi' ? 'WiFi' : 'Manual'}
                  tone={today.punchInMethod === 'wifi' ? 'success' : 'warning'}
                />
              ) : null}
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.punchBlock}>
              <Text style={[styles.punchLabel, { color: colors.textSecondary }]}>Punch Out</Text>
              <Text style={[styles.punchTime, { color: colors.text }]}>
                {today?.punchOut?.slice(0, 5) ?? '—'}
              </Text>
              {today?.punchOutMethod ? (
                <StatusBadge label={today.punchOutMethod === 'wifi' ? 'WiFi' : 'Manual'} tone="primary" />
              ) : null}
            </View>
          </View>

          {today?.wifiSsid ? (
            <Text style={[styles.detailLine, { color: colors.textSecondary }]}>
              WiFi network: {today.wifiSsid}
            </Text>
          ) : null}
          {today?.hoursWorked ? (
            <Text style={[styles.hours, { color: colors.primary }]}>Hours worked: {today.hoursWorked}h</Text>
          ) : null}
          {today?.status ? (
            <View style={styles.statusRow}>
              <Text style={[styles.detailLine, { color: colors.textSecondary }]}>Status:</Text>
              <StatusBadge
                label={today.status}
                tone={today.status === 'present' ? 'success' : today.status === 'late' ? 'warning' : 'neutral'}
              />
            </View>
          ) : null}
        </Card>

        <View style={styles.actions}>
          {canPunchIn ? (
            <>
              <Button
                title="Punch In via WiFi"
                onPress={handleWifiPunchIn}
                loading={loading}
                disabled={!wifiValid}
              />
              <Button title="Manual Punch In" variant="outline" onPress={handleManualPunchIn} loading={loading} />
            </>
          ) : null}
          {canPunchOut ? (
            <Button title="Punch Out" variant="danger" onPress={handlePunchOut} loading={loading} />
          ) : null}
          {showContinueButton ? (
            <Button title="Continue" variant="outline" onPress={handleContinue} loading={loading} />
          ) : null}
          {!canPunchIn && !canPunchOut && !canContinue && !punchedOutToday && today?.punchOut ? (
            <Text style={[styles.doneText, { color: colors.textSecondary }]}>
              Attendance completed for today.
            </Text>
          ) : null}
        </View>

        <Button title="Close" variant="outline" onPress={onClose} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  content: { padding: 20, paddingBottom: 40 },
  previewCard: { marginBottom: 14, borderWidth: 1, gap: 4 },
  previewTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  wifiCard: { marginBottom: 14, borderWidth: 2, gap: 8 },
  wifiMsg: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  todayCard: { marginBottom: 14, gap: 8 },
  todayDate: { fontSize: 18, fontWeight: '700' },
  punchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  punchBlock: { flex: 1, alignItems: 'center', gap: 6 },
  punchLabel: { fontSize: 12 },
  punchTime: { fontSize: 28, fontWeight: '800' },
  divider: { width: 1, height: 60, marginHorizontal: 12 },
  hours: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  detailLine: { fontSize: 13, fontWeight: '500', lineHeight: 20 },
  actions: { gap: 10, marginBottom: 16, marginTop: 4 },
  doneText: { textAlign: 'center', fontSize: 14, paddingVertical: 8 },
});
