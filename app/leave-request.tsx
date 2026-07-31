import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { parseISO } from 'date-fns';

import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import {
  buildLeaveDateOptions,
  getLeaveReasonLabel,
  LEAVE_REASON_OPTIONS,
} from '@/constants/leaveOptions';
import { useColorScheme } from '@/components/useColorScheme';

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

  const dateOptions = useMemo(() => buildLeaveDateOptions(90), []);

  const paidBalance = leaveBalances.find((b) => b.type === 'paid' || b.type === 'annual');
  const paidRemaining = paidBalance?.remaining ?? 0;

  const dateError = touched.date && !leaveDate ? 'Date is required' : undefined;
  const reasonError = touched.reason && !reason ? 'Reason is required' : undefined;
  const formComplete = Boolean(leaveDate && reason);

  const leaveDays = useMemo(() => {
    if (!leaveDate) return 0;
    try {
      parseISO(leaveDate);
      return 1;
    } catch {
      return 0;
    }
  }, [leaveDate]);

  const autoTypeHint =
    paidRemaining > 0
      ? `Will be marked as Paid Leave (${paidRemaining} paid day(s) remaining)`
      : 'Paid quota used up — will be marked as Unpaid Leave';

  const approverName = employee?.manager ?? 'Clinic Admin';

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

        <View style={[styles.balanceHint, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
          <Text style={[styles.hintText, { color: colors.text }]}>{autoTypeHint}</Text>
          {leaveDays > 0 ? (
            <Text style={[styles.hintSub, { color: colors.textSecondary }]}>{leaveDays} day requested</Text>
          ) : null}
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
  balanceHint: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  hintText: { fontSize: 13, fontWeight: '600' },
  hintSub: { fontSize: 12, marginTop: 4 },
  submit: { marginTop: 24, marginBottom: 10 },
});
