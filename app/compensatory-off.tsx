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

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/SelectField';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { buildLeaveDateOptions } from '@/constants/leaveOptions';
import { useColorScheme } from '@/components/useColorScheme';
import { formatLeaveDayLabel } from '@/utils/clinicLeave';

function showAlert(title: string, message: string, onOk?: () => void) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    onOk?.();
    return;
  }
  Alert.alert(title, message, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
}

export default function CompensatoryOffModal() {
  const router = useRouter();
  const { useCompensatoryLeave, availableCompensatoryCredits, upcomingShifts } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const [leaveDate, setLeaveDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const dateOptions = useMemo(() => {
    const scheduledDates = new Set(upcomingShifts.map((shift) => shift.date));
    return buildLeaveDateOptions(60).filter((option) => scheduledDates.has(option.value));
  }, [upcomingShifts]);

  const fieldColors = {
    textColor: colors.text,
    mutedColor: colors.textSecondary,
    borderColor: colors.border,
    cardColor: colors.card,
    dangerColor: colors.danger,
    primaryColor: colors.primary,
  };

  const handleSubmit = async () => {
    if (!leaveDate) {
      showAlert('Select a date', 'Choose a scheduled shift date for your compensatory off.');
      return;
    }

    setSubmitting(true);
    try {
      await useCompensatoryLeave(leaveDate);
      showAlert(
        'Compensatory leave applied',
        `Your shift on ${formatLeaveDayLabel(leaveDate)} is marked as Compensatory Leave. No paid leave will be used and there is no salary deduction.`,
        () => router.back()
      );
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not apply compensatory leave');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={[styles.infoCard, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
          <Text style={[styles.infoTitle, { color: colors.primary }]}>Compensatory off</Text>
          <Text style={[styles.infoBody, { color: colors.text }]}>
            You have {availableCompensatoryCredits} credit{availableCompensatoryCredits === 1 ? '' : 's'}{' '}
            from completing an extra continued shift. Use 1 credit to skip a scheduled shift without absent
            marking or paid leave deduction.
          </Text>
          <Text style={[styles.infoHint, { color: colors.textSecondary }]}>
            If you prefer to work that day instead, just punch in normally — your credit stays saved.
          </Text>
        </Card>

        <SelectField
          label="Scheduled shift date"
          value={leaveDate}
          onChange={setLeaveDate}
          options={dateOptions}
          placeholder={dateOptions.length ? 'Select date' : 'No upcoming scheduled shifts'}
          {...fieldColors}
        />

        <Button
          title="Use Compensatory Off"
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitting || availableCompensatoryCredits <= 0 || dateOptions.length === 0}
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
  infoCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 16, gap: 8 },
  infoTitle: { fontSize: 16, fontWeight: '800' },
  infoBody: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  infoHint: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
  submit: { marginTop: 20, marginBottom: 10 },
});
