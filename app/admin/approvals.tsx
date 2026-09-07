import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { format, parseISO } from 'date-fns';
import { useLocalSearchParams } from 'expo-router';
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

type LeaveTab = 'insert' | 'approve' | 'cancel' | 'manual' | 'punch';

const VALID_TABS = new Set<LeaveTab>(['insert', 'approve', 'cancel', 'manual', 'punch']);

function parseLeaveTab(value: string | string[] | undefined): LeaveTab | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !VALID_TABS.has(raw as LeaveTab)) return null;
  return raw as LeaveTab;
}

const LEAVE_TABS: { id: LeaveTab; label: string; accent?: 'danger' }[] = [
  { id: 'insert', label: 'Insert' },
  { id: 'approve', label: 'Approve' },
  { id: 'cancel', label: 'Cancel', accent: 'danger' },
  { id: 'manual', label: 'Manual' },
  { id: 'punch', label: 'Punch' },
];

export default function AdminLeaveScreen() {
  const {
    clinicPendingApprovals: pendingApprovals,
    clinicPendingLeaveCancelRequests: pendingCancelRequests,
    clinicPendingShiftChangeCancelRequests: pendingShiftCancelRequests,
    clinicPendingAttendanceApprovals: pendingAttendanceApprovals,
    clinicPendingOutOfClinicPunchApprovals: pendingOutOfClinicPunches,
    clinicRecentInClinicPunches: recentInClinicPunches,
    approveLeave,
    rejectLeave,
    approveLeaveCancel,
    rejectLeaveCancel,
    approveShiftChangeCancel,
    rejectShiftChangeCancel,
    approveAttendance,
    rejectAttendance,
    approveLocationPunch,
    rejectLocationPunch,
    clinicEmployees,
    insertLeave,
    clinicPeopleOnLeaveToday: peopleOnLeaveToday,
  } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string | string[] }>();
  const initialTab = useMemo(() => parseLeaveTab(tabParam) ?? 'insert', [tabParam]);
  const [tab, setTab] = useState<LeaveTab>(initialTab);

  useEffect(() => {
    const parsed = parseLeaveTab(tabParam);
    if (parsed) setTab(parsed);
  }, [tabParam]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const dateOptions = useMemo(() => buildLeaveDateOptions(60), []);
  const [insertEmployeeId, setInsertEmployeeId] = useState('');
  const [insertDate, setInsertDate] = useState(dateOptions[0]?.value ?? '');
  const [insertReason, setInsertReason] = useState('');
  const [inserting, setInserting] = useState(false);

  const employeeOptions = clinicEmployees.map((e) => ({
    value: e.employeeId,
    label: getEmployeeDisplayName(e),
  }));

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

  const handleApproveLeaveCancel = async (requestId: string, employeeName: string) => {
    if (processingId) return;
    setProcessingId(`cancel:${requestId}`);
    try {
      await approveLeaveCancel(requestId);
      showAlert('Approved', `${employeeName}'s leave cancellation has been approved.`);
    } catch (error) {
      showAlert('Could not approve', error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectLeaveCancel = async (requestId: string, employeeName: string) => {
    if (processingId) return;
    const confirmed = await showConfirm(
      'Reject cancellation',
      `Reject ${employeeName}'s leave cancellation? They will be marked absent for the leave day.`
    );
    if (!confirmed) return;

    setProcessingId(`cancel:${requestId}`);
    try {
      await rejectLeaveCancel(requestId);
      showAlert('Rejected', `${employeeName}'s cancellation was rejected. Staff will be notified.`);
    } catch (error) {
      showAlert('Could not reject', error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveShiftChangeCancel = async (notificationId: string, employeeName: string) => {
    if (processingId) return;
    setProcessingId(`shift-cancel:${notificationId}`);
    try {
      await approveShiftChangeCancel(notificationId);
      showAlert('Approved', `${employeeName}'s shift change cancellation has been approved.`);
    } catch (error) {
      showAlert('Could not approve', error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectShiftChangeCancel = async (notificationId: string, employeeName: string) => {
    if (processingId) return;
    const confirmed = await showConfirm(
      'Reject cancellation',
      `Reject ${employeeName}'s shift change cancellation? Their shift change will be active again.`
    );
    if (!confirmed) return;

    setProcessingId(`shift-cancel:${notificationId}`);
    try {
      await rejectShiftChangeCancel(notificationId);
      showAlert('Rejected', `${employeeName}'s shift change cancellation was rejected. Staff will be notified.`);
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

  const handleApproveLocationPunch = async (recordId: string, employeeName: string) => {
    if (processingId) return;
    setProcessingId(`location:${recordId}`);
    try {
      await approveLocationPunch(recordId);
      showAlert('Approved', `${employeeName}'s out-of-clinic punch has been approved.`);
    } catch (error) {
      showAlert('Could not approve', error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectLocationPunch = async (recordId: string, employeeName: string) => {
    if (processingId) return;
    const confirmed = await showConfirm(
      'Reject location punch',
      `Reject ${employeeName}'s out-of-clinic punch? Their punch-in will be removed.`
    );
    if (!confirmed) return;

    setProcessingId(`location:${recordId}`);
    try {
      await rejectLocationPunch(recordId);
      showAlert('Rejected', `${employeeName}'s out-of-clinic punch has been rejected.`);
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
      <View style={[styles.tabRow, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
        {LEAVE_TABS.map((item) => {
          const active = tab === item.id;
          const accentColor = item.accent === 'danger' ? colors.danger : colors.primary;
          return (
            <Pressable
              key={item.id}
              onPress={() => setTab(item.id)}
              style={[
                styles.tabBtn,
                {
                  backgroundColor: active ? accentColor : 'transparent',
                  borderColor: active ? accentColor : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: active ? '#FFFFFF' : colors.text },
                ]}
                numberOfLines={2}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'insert' ? (
        <>
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
        </>
      ) : null}

      {tab === 'approve' ? (
        <>
      {pendingApprovals.length === 0 ? (
        <Card>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No pending leave requests.</Text>
        </Card>
      ) : (
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
                  Leave type: {LEAVE_TYPE_LABELS[item.type] ?? item.type} · {item.days} day(s)
                </Text>
                <Text style={[styles.meta, { color: colors.primary }]}>
                  {(item.type === 'unpaid' || item.type === 'personal')
                    ? 'Unpaid leave — affects payroll deduction'
                    : 'Paid leave — no salary deduction when approved'}
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
      )}
        </>
      ) : null}

      {tab === 'cancel' ? (
        <>
      {pendingCancelRequests.length === 0 && pendingShiftCancelRequests.length === 0 ? (
        <Card>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No cancellation requests.</Text>
        </Card>
      ) : null}
      {pendingCancelRequests.length > 0 ? (
        <>
          <Text style={[styles.section, { color: colors.danger }]}>Leave cancellation requests</Text>
          {pendingCancelRequests.map((item) => {
            const key = `cancel:${item.id}`;
            const isProcessing = processingId === key;
            const leaveLabel = LEAVE_TYPE_LABELS[item.type] ?? item.type;
            return (
              <Card
                key={`cancel-${item.id}`}
                style={[styles.card, styles.cancelCard, { borderColor: colors.dangerLight, backgroundColor: colors.dangerLight }]}
              >
                <View style={styles.header}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.employeeName}</Text>
                  <StatusSymbolBadge status="cancelled" compact />
                </View>
                <Text style={[styles.cancelMeta, { color: colors.danger }]}>
                  Approved leave cancellation request
                </Text>
                <Text style={[styles.cancelDetail, { color: colors.danger }]}>
                  Cancel approved {leaveLabel} · {item.days} day{item.days > 1 ? 's' : ''}
                </Text>
                <Text style={[styles.meta, { color: colors.danger }]}>
                  {format(parseISO(item.startDate), 'MMM d')} – {format(parseISO(item.endDate), 'MMM d, yyyy')}
                </Text>
                <Text style={[styles.reason, { color: colors.text }]}>{item.reason}</Text>
                <View style={styles.actions}>
                  <Button
                    title="Approve cancel"
                    onPress={() => handleApproveLeaveCancel(item.id, item.employeeName)}
                    style={styles.btn}
                    loading={isProcessing}
                    disabled={!!processingId && !isProcessing}
                  />
                  <Button
                    title="Reject cancel"
                    variant="danger"
                    onPress={() => handleRejectLeaveCancel(item.id, item.employeeName)}
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
      {pendingShiftCancelRequests.length > 0 ? (
        <>
          <Text style={[styles.section, { color: colors.danger }]}>Shift change cancellation requests</Text>
          {pendingShiftCancelRequests.map((item) => {
            const key = `shift-cancel:${item.notificationId}`;
            const isProcessing = processingId === key;
            const shiftDetail =
              item.previousShift && item.newShift
                ? `${item.previousShift} → ${item.newShift}`
                : item.body;
            return (
              <Card
                key={`shift-cancel-${item.notificationId}`}
                style={[styles.card, styles.cancelCard, { borderColor: colors.dangerLight, backgroundColor: colors.dangerLight }]}
              >
                <View style={styles.header}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.employeeName}</Text>
                  <StatusSymbolBadge status="cancelled" compact />
                </View>
                <Text style={[styles.cancelMeta, { color: colors.danger }]}>
                  Shift change cancellation request
                </Text>
                <Text style={[styles.cancelDetail, { color: colors.danger }]}>
                  Regular shift timing restored pending review
                </Text>
                <Text style={[styles.meta, { color: colors.danger }]}>
                  {item.relatedDate ? format(parseISO(item.relatedDate), 'EEE, MMM d, yyyy') : '—'}
                </Text>
                <Text style={[styles.reason, { color: colors.text }]}>{shiftDetail}</Text>
                <View style={styles.actions}>
                  <Button
                    title="Approve cancel"
                    onPress={() => handleApproveShiftChangeCancel(item.notificationId, item.employeeName)}
                    style={styles.btn}
                    loading={isProcessing}
                    disabled={!!processingId && !isProcessing}
                  />
                  <Button
                    title="Reject cancel"
                    variant="danger"
                    onPress={() => handleRejectShiftChangeCancel(item.notificationId, item.employeeName)}
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
        </>
      ) : null}

      {tab === 'manual' ? (
        <>
      {pendingAttendanceApprovals.length === 0 ? (
        <Card>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No manual punch requests.</Text>
        </Card>
      ) : (
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
      )}
        </>
      ) : null}

      {tab === 'punch' ? (
        <>
          <Text style={[styles.section, { color: colors.text }]}>In punch</Text>
          <Text style={[styles.punchHint, { color: colors.textSecondary }]}>
            Auto-approved when staff punch inside the clinic radius.
          </Text>
          {recentInClinicPunches.length === 0 ? (
            <Card>
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                No recent in-clinic punches.
              </Text>
            </Card>
          ) : (
            recentInClinicPunches.map((item) => (
              <Card key={item.id} style={[styles.inClinicCard, { borderColor: '#BBF7D0' }]}>
                <View style={styles.header}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.employeeName}</Text>
                  <StatusSymbolBadge status="approved" compact />
                </View>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  In clinic · {format(parseISO(item.date), 'MMM d, yyyy')} ·{' '}
                  {formatDisplayTime(item.punchIn)}
                </Text>
                {item.punchInDistanceMeters != null ? (
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    {item.punchInDistanceMeters} m from clinic center
                  </Text>
                ) : null}
              </Card>
            ))
          )}

          <Text style={[styles.section, { color: colors.text }]}>Out punch</Text>
          {pendingOutOfClinicPunches.length === 0 ? (
            <Card>
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                No out-of-clinic punch requests.
              </Text>
            </Card>
          ) : (
            pendingOutOfClinicPunches.map((item) => {
              const isProcessing = processingId === `location:${item.id}`;
              const locationLabel =
                item.punchInLocationStatus === 'unknown' ? 'Unknown location' : 'Out of clinic';
              return (
                <Card key={item.id} style={[styles.cancelCard, { borderColor: '#FECACA' }]}>
                  <View style={styles.header}>
                    <Text style={[styles.name, { color: colors.text }]}>{item.employeeName}</Text>
                    <StatusSymbolBadge status="pending" compact />
                  </View>
                  <Text style={[styles.cancelMeta, { color: '#DC2626' }]}>{locationLabel}</Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    {format(parseISO(item.date), 'MMM d, yyyy')} · {formatDisplayTime(item.punchIn)}
                  </Text>
                  {item.punchInDistanceMeters != null ? (
                    <Text style={[styles.cancelDetail, { color: colors.textSecondary }]}>
                      {item.punchInDistanceMeters} m from clinic center
                    </Text>
                  ) : null}
                  <View style={styles.actions}>
                    <Button
                      title="Approve"
                      onPress={() => handleApproveLocationPunch(item.id, item.employeeName)}
                      style={styles.btn}
                      loading={isProcessing}
                      disabled={!!processingId && !isProcessing}
                    />
                    <Button
                      title="Reject"
                      variant="danger"
                      onPress={() => handleRejectLocationPunch(item.id, item.employeeName)}
                      style={styles.btn}
                      loading={isProcessing}
                      disabled={!!processingId && !isProcessing}
                    />
                  </View>
                </Card>
              );
            })
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  tabRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 12,
  },
  section: { fontSize: 16, fontWeight: '800', marginBottom: 10, marginTop: 8 },
  card: { marginBottom: 12 },
  cancelCard: { borderWidth: 1 },
  cancelMeta: { fontSize: 12, marginTop: 4, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  cancelDetail: { fontSize: 13, marginTop: 4, fontWeight: '700' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 4, fontWeight: '500' },
  reason: { fontSize: 14, marginTop: 10, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1 },
  empty: { textAlign: 'center', padding: 16 },
  punchHint: { fontSize: 12, marginBottom: 8, fontWeight: '500' },
  inClinicCard: { marginBottom: 12, borderWidth: 1 },
  label: { fontSize: 11, fontWeight: '700', marginBottom: 4, letterSpacing: 0.6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 10 },
});
