import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { format, parseISO } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/SelectField';
import { StatusSymbolBadge } from '@/components/ui/StatusSymbolBadge';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { LEAVE_TYPE_LABELS } from '@/constants/config';
import { buildLeaveDateOptions } from '@/constants/leaveOptions';
import { getEmployeeDisplayName } from '@/services/employeeRegistry';
import { useColorScheme } from '@/components/useColorScheme';
import { formatDisplayTime } from '@/utils/formatTime';
import { showAlert, showConfirm } from '@/utils/uiAlert';

export default function AdminLeaveScreen() {
  const {
    pendingApprovals,
    pendingAttendanceApprovals,
    approveLeave,
    rejectLeave,
    approveAttendance,
    rejectAttendance,
    allEmployees,
    insertLeave,
    peopleOnLeaveToday,
  } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const dateOptions = useMemo(() => buildLeaveDateOptions(60), []);
  const [insertEmployeeId, setInsertEmployeeId] = useState('');
  const [insertDate, setInsertDate] = useState(dateOptions[0]?.value ?? '');
  const [insertReason, setInsertReason] = useState('');
  const [inserting, setInserting] = useState(false);

  const employeeOptions = allEmployees.map((e) => ({
    value: e.employeeId,
    label: getEmployeeDisplayName(e),
  }));

  const hasPending = pendingApprovals.length > 0 || pendingAttendanceApprovals.length > 0;

  const handleApproveLeave = async (requestId: string, employeeName: string) => {
    if (processingId) return;
    setProcessingId(`leave:${requestId}`);
    try {
      await approveLeave(requestId);
      showAlert('Approved', `${employeeName}'s leave request has been approved.`);
    } catch (error) {
      showAlert('Could not approve', error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectLeave = async (requestId: string, employeeName: string) => {
    if (processingId) return;
    const confirmed = await showConfirm('Reject leave request', `Reject ${employeeName}'s leave request?`);
    if (!confirmed) return;

    setProcessingId(`leave:${requestId}`);
    try {
      await rejectLeave(requestId);
      showAlert('Rejected', `${employeeName}'s leave request has been rejected.`);
    } catch (error) {
      showAlert('Could not reject', error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveAttendance = async (recordId: string, employeeName: string) => {
    if (processingId) return;
    setProcessingId(`attendance:${recordId}`);
    try {
      await approveAttendance(recordId);
      showAlert('Approved', `${employeeName}'s manual punch has been approved.`);
    } catch (error) {
      showAlert('Could not approve', error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectAttendance = async (recordId: string, employeeName: string) => {
    if (processingId) return;
    const confirmed = await showConfirm('Reject manual punch', `Reject ${employeeName}'s manual punch request?`);
    if (!confirmed) return;

    setProcessingId(`attendance:${recordId}`);
    try {
      await rejectAttendance(recordId);
      showAlert('Rejected', `${employeeName}'s manual punch has been rejected.`);
    } catch (error) {
      showAlert('Could not reject', error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleInsertLeave = async () => {
    if (!insertEmployeeId || !insertDate) {
      showAlert('Missing info', 'Select a person and date.');
      return;
    }
    setInserting(true);
    try {
      await insertLeave(insertEmployeeId, insertDate, insertReason || 'Inserted by admin');
      showAlert('Leave inserted', 'Leave day marked and balance updated.');
      setInsertReason('');
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not insert leave');
    } finally {
      setInserting(false);
    }
  };

  const fieldColors = {
    textColor: colors.text,
    mutedColor: colors.textMuted,
    borderColor: colors.borderLight,
    cardColor: colors.card,
    primaryColor: colors.primary,
    dangerColor: colors.danger,
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Leave management</Text>

      <Text style={[styles.section, { color: colors.text }]}>Insert leave day</Text>
      <Card style={styles.card}>
        <SelectField
          label="Person"
          value={insertEmployeeId}
          options={employeeOptions}
          onChange={setInsertEmployeeId}
          placeholder="Select doctor/staff"
          {...fieldColors}
        />
        <SelectField
          label="Date"
          value={insertDate}
          options={dateOptions}
          onChange={setInsertDate}
          {...fieldColors}
        />
        <Text style={[styles.label, { color: colors.textMuted }]}>REASON</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.borderLight, backgroundColor: colors.card }]}
          value={insertReason}
          onChangeText={setInsertReason}
          placeholder="Optional reason"
          placeholderTextColor={colors.textMuted}
        />
        <Button title={inserting ? 'Saving...' : 'Insert leave day'} onPress={handleInsertLeave} disabled={inserting} />
      </Card>

      <Text style={[styles.section, { color: colors.text }]}>Who's on leave today</Text>
      {peopleOnLeaveToday.length === 0 ? (
        <Card>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No one is on leave today.</Text>
        </Card>
      ) : (
        peopleOnLeaveToday.map((person) => (
          <Card key={`${person.employeeId}-today`} style={styles.card}>
            <Text style={[styles.name, { color: colors.text }]}>{person.employeeName}</Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {LEAVE_TYPE_LABELS[person.leaveType] ?? person.leaveType} · {person.department}
            </Text>
          </Card>
        ))
      )}

      {!hasPending ? (
        <Card>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No pending approvals right now.</Text>
        </Card>
      ) : null}

      {pendingApprovals.length > 0 ? (
        <>
          <Text style={[styles.section, { color: colors.text }]}>Pending leave requests</Text>
          {pendingApprovals.map((item) => {
            const key = `leave:${item.id}`;
            const isProcessing = processingId === key;
            return (
              <Card key={item.id} style={styles.card}>
                <View style={styles.header}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.employeeName}</Text>
                  <StatusSymbolBadge status="pending" compact />
                </View>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  {LEAVE_TYPE_LABELS[item.type] ?? item.type} · {item.days} day(s)
                </Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  {format(parseISO(item.startDate), 'MMM d')} – {format(parseISO(item.endDate), 'MMM d, yyyy')}
                </Text>
                <Text style={[styles.reason, { color: colors.text }]}>{item.reason}</Text>
                <View style={styles.actions}>
                  <Button
                    title="Approve"
                    onPress={() => handleApproveLeave(item.id, item.employeeName)}
                    style={styles.btn}
                    loading={isProcessing}
                    disabled={!!processingId && !isProcessing}
                  />
                  <Button
                    title="Reject"
                    variant="danger"
                    onPress={() => handleRejectLeave(item.id, item.employeeName)}
                    style={styles.btn}
                    loading={isProcessing}
                    disabled={!!processingId && !isProcessing}
                  />
                </View>
              </Card>
            );
          })}
        </>
      ) : null}

      {pendingAttendanceApprovals.length > 0 ? (
        <>
          <Text style={[styles.section, { color: colors.text }]}>Manual punch requests</Text>
          {pendingAttendanceApprovals.map((item) => {
            const key = `attendance:${item.id}`;
            const isProcessing = processingId === key;
            return (
              <Card key={item.id} style={styles.card}>
                <View style={styles.header}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.employeeName}</Text>
                  <StatusSymbolBadge status="pending" compact />
                </View>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  Manual punch · {format(parseISO(item.date), 'MMM d, yyyy')} · {formatDisplayTime(item.punchIn)}
                </Text>
                <View style={styles.actions}>
                  <Button
                    title="Approve"
                    onPress={() => handleApproveAttendance(item.id, item.employeeName)}
                    style={styles.btn}
                    loading={isProcessing}
                    disabled={!!processingId && !isProcessing}
                  />
                  <Button
                    title="Reject"
                    variant="danger"
                    onPress={() => handleRejectAttendance(item.id, item.employeeName)}
                    style={styles.btn}
                    loading={isProcessing}
                    disabled={!!processingId && !isProcessing}
                  />
                </View>
              </Card>
            );
          })}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 12 },
  section: { fontSize: 16, fontWeight: '800', marginBottom: 10, marginTop: 8 },
  card: { marginBottom: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 4, fontWeight: '500' },
  reason: { fontSize: 14, marginTop: 10, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1 },
  empty: { textAlign: 'center', padding: 16 },
  label: { fontSize: 11, fontWeight: '700', marginBottom: 4, letterSpacing: 0.6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 10 },
});
