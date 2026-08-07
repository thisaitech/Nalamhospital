import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/SelectField';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { LEAVE_TYPE_LABELS } from '@/constants/config';
import {
  buildLeaveDateOptions,
  getLeaveReasonLabel,
  LEAVE_REASON_OPTIONS,
} from '@/constants/leaveOptions';
import { loadLeaveRequests } from '@/services/firestoreRepository';
import { useColorScheme } from '@/components/useColorScheme';
import { filterVisibleLeave, formatLeaveDayLabel, peopleWithLeaveOnDate } from '@/utils/clinicLeave';
import type { PersonOnLeave } from '@/types/employee';

function showAlert(title: string, message: string, onOk?: () => void) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    onOk?.();
    return;
  }
  Alert.alert(title, message, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
}

export default function LeaveRequestModal() {
  const router = useRouter();
  const { requestLeave, employee, leaveBalances } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const [leaveDate, setLeaveDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState({ date: false, reason: false });
  const [leaveOnDate, setLeaveOnDate] = useState<PersonOnLeave[]>([]);
  const [loadingLeaveOnDate, setLoadingLeaveOnDate] = useState(false);

  const dateOptions = useMemo(() => buildLeaveDateOptions(90), []);

  const paidBalance = leaveBalances.find((b) => b.type === 'paid' || b.type === 'annual');
  const paidRemaining = paidBalance?.remaining ?? 0;

  const dateError = touched.date && !leaveDate ? 'Date is required' : undefined;
  const reasonError = touched.reason && !reason ? 'Reason is required' : undefined;
  const formComplete = Boolean(leaveDate && reason);

  const autoTypeHint =
    paidRemaining > 0
      ? `Will be marked as Paid Leave (${paidRemaining} paid day(s) remaining)`
      : 'Paid quota used up — will be marked as Unpaid Leave';

  const approverName = employee?.manager ?? 'Clinic Admin';

  useEffect(() => {
    if (!leaveDate) {
      setLeaveOnDate([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingLeaveOnDate(true);
      try {
        const requests = await loadLeaveRequests();
        const people = await peopleWithLeaveOnDate(leaveDate, requests, employee?.employeeId);
        const visible = filterVisibleLeave(people, employee?.staffCategory ?? 'staff');
        if (!cancelled) setLeaveOnDate(visible);
      } finally {
        if (!cancelled) setLoadingLeaveOnDate(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [leaveDate, employee?.employeeId, employee?.staffCategory]);

  const handleSubmit = async () => {
    setTouched({ date: true, reason: true });

    if (!leaveDate || !reason) {
      showAlert('Please fix the form', 'Select a date and reason.');
      return;
    }

    if (!employee) {
      showAlert('Not signed in', 'Please log in to submit a leave request.');
      return;
    }

    setSubmitting(true);
    try {
      await requestLeave(null, leaveDate, leaveDate, getLeaveReasonLabel(reason));
      showAlert(
        'Submitted',
        `Your leave request has been sent to ${approverName} for approval.\n${autoTypeHint}`,
        () => router.back()
      );
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldColors = {
    textColor: colors.text,
    mutedColor: colors.textSecondary,
    borderColor: colors.border,
    cardColor: colors.card,
    dangerColor: colors.danger,
    primaryColor: colors.primary,
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.approverCard, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
          <Text style={[styles.approverLabel, { color: colors.primary }]}>Approver</Text>
          <Text style={[styles.approverName, { color: colors.text }]}>{approverName}</Text>
          <Text style={[styles.approverHint, { color: colors.textSecondary }]}>
            Just pick a date and reason — paid vs unpaid is decided automatically from your balance.
          </Text>
        </View>

        <SelectField
          label="Leave date"
          value={leaveDate}
          onChange={(value) => {
            setLeaveDate(value);
            setTouched((prev) => ({ ...prev, date: true }));
          }}
          options={dateOptions}
          placeholder="Select date"
          error={dateError}
          {...fieldColors}
        />

        <SelectField
          label="Reason (optional categories)"
          value={reason}
          onChange={(value) => {
            setReason(value);
            setTouched((prev) => ({ ...prev, reason: true }));
          }}
          options={LEAVE_REASON_OPTIONS}
          placeholder="Select a reason"
          error={reasonError}
          {...fieldColors}
        />

        <Button
          title="Submit Request"
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitting || !formComplete}
          style={styles.submit}
        />
        <Button title="Cancel" variant="outline" onPress={() => router.back()} />

        {leaveDate ? (
          <View style={styles.leaveOnDaySection}>
            <Text style={[styles.leaveOnDayTitle, { color: colors.text }]}>
              On leave {formatLeaveDayLabel(leaveDate)}
            </Text>
            {loadingLeaveOnDate ? (
              <ActivityIndicator size="small" color={colors.primary} style={styles.leaveOnDayLoader} />
            ) : leaveOnDate.length === 0 ? (
              <Card style={styles.leaveOnDayCard}>
                <Text style={[styles.leaveOnDayEmpty, { color: colors.textSecondary }]}>
                  No one else has applied for leave on this day.
                </Text>
              </Card>
            ) : (
              leaveOnDate.map((person) => (
                <Card key={`${person.employeeId}-${person.leaveStatus}`} style={styles.leaveOnDayCard}>
                  <View style={styles.leaveOnDayRow}>
                    <View style={styles.leaveOnDayInfo}>
                      <Text style={[styles.leaveOnDayName, { color: colors.text }]}>{person.employeeName}</Text>
                      <Text style={[styles.leaveOnDayMeta, { color: colors.textSecondary }]}>
                        {person.staffCategory === 'doctor' ? 'Doctor' : 'Staff'} · {person.department}
                      </Text>
                    </View>
                    <StatusBadge
                      label={person.leaveStatus === 'pending' ? 'Pending' : 'Approved'}
                      tone={person.leaveStatus === 'pending' ? 'warning' : 'success'}
                    />
                  </View>
                  <Text style={[styles.leaveOnDayReason, { color: colors.textMuted }]}>
                    {LEAVE_TYPE_LABELS[person.leaveType] ?? person.leaveType}
                    {person.reason ? ` · ${person.reason}` : ''}
                  </Text>
                </Card>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  approverCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  approverLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  approverName: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 6,
  },
  approverHint: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  leaveOnDaySection: { marginTop: 20, gap: 8 },
  leaveOnDayTitle: { fontSize: 15, fontWeight: '700' },
  leaveOnDayLoader: { marginVertical: 8 },
  leaveOnDayCard: { paddingVertical: 12 },
  leaveOnDayEmpty: { textAlign: 'center', fontSize: 13 },
  leaveOnDayRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  leaveOnDayInfo: { flex: 1 },
  leaveOnDayName: { fontSize: 15, fontWeight: '700' },
  leaveOnDayMeta: { fontSize: 12, marginTop: 2 },
  leaveOnDayReason: { fontSize: 12, marginTop: 8 },
  submit: { marginTop: 24, marginBottom: 10 },
});
