import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { format, parseISO } from 'date-fns';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StatusOptionChip, StatusSymbolBadge } from '@/components/ui/StatusSymbolBadge';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { LEAVE_TYPE_LABELS } from '@/constants/config';
import { useColorScheme } from '@/components/useColorScheme';
import { computeLeaveBalances } from '@/utils/leaveBalances';
import { showAlert, showConfirm } from '@/utils/uiAlert';

const statusMap = {
  approved: 'approved',
  pending: 'pending',
  rejected: 'rejected',
  cancelled: 'cancelled',
} as const;

const DISPLAYED_LEAVE_TYPES = new Set(['paid', 'unpaid', 'annual']);

const LEAVE_ACCENT: Record<string, string> = {
  paid: '#0F766E',
  unpaid: '#64748B',
  annual: '#0F766E',
  sick: '#DC2626',
  personal: '#7C3AED',
  compensatory: '#2563EB',
};

const LEAVE_EMOJI: Record<string, string> = {
  paid: '✅',
  unpaid: '📋',
  annual: '✅',
  sick: '🤒',
  personal: '🧘',
  compensatory: '🔄',
};

function LeaveBalanceBox({
  label,
  remaining,
  total,
  used,
  accent,
  emoji,
  pendingDays,
  colors,
}: {
  label: string;
  remaining: number;
  total: number;
  used: number;
  pendingDays: number;
  accent: string;
  emoji: string;
  colors: (typeof Colors)['light'];
}) {
  const usedPercent = total > 0 ? Math.min((used / total) * 100, 100) : 0;

  return (
    <View
      style={[
        styles.balanceBox,
        {
          backgroundColor: colors.card,
          borderColor: colors.borderLight,
          shadowColor: colors.shadow,
        },
      ]}
    >
      <View style={styles.balanceHeaderRow}>
        <View style={[styles.balanceIconWrap, { backgroundColor: `${accent}18` }]}>
          <Text style={styles.balanceEmoji}>{emoji}</Text>
        </View>
        <Text style={[styles.balanceType, { color: colors.textSecondary }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text style={[styles.balanceRemaining, { color: accent }]}>{remaining}</Text>
      <Text style={[styles.balanceSub, { color: colors.textMuted }]}>days left</Text>
      <View style={styles.balanceMetaRow}>
        <Text style={[styles.balanceMeta, { color: colors.textSecondary }]}>
          {used} used{pendingDays > 0 ? ` · ${pendingDays} pending` : ''}
        </Text>
        <Text style={[styles.balanceMeta, { color: colors.textSecondary }]}>{total} total</Text>
      </View>
      <View style={[styles.progressBg, { backgroundColor: colors.borderLight }]}>
        <View style={[styles.progressFill, { backgroundColor: accent, width: `${usedPercent}%` }]} />
      </View>
    </View>
  );
}

export default function LeaveScreen() {
  const { leaveBalances, leaveRequests, availableCompensatoryCredits, refreshData, cancelLeave } =
    useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData])
  );

  const displayBalances = useMemo(
    () => computeLeaveBalances(leaveBalances, leaveRequests),
    [leaveBalances, leaveRequests]
  );

  const approvedCount = leaveRequests.filter((r) => r.status === 'approved').length;
  const pendingCount = leaveRequests.filter((r) => r.status === 'pending').length;
  const today = format(new Date(), 'yyyy-MM-dd');

  const handleCancelLeave = async (requestId: string, label: string, isApproved: boolean) => {
    if (cancellingId) return;
    const ok = await showConfirm(
      isApproved ? 'Request cancellation' : 'Cancel leave',
      isApproved
        ? `Request to cancel your approved ${label} leave? Admin must approve before it is cancelled.`
        : `Cancel your ${label} leave request? Admin will be notified.`
    );
    if (!ok) return;
    setCancellingId(requestId);
    try {
      await cancelLeave(requestId);
      showAlert(
        isApproved ? 'Request sent' : 'Cancelled',
        isApproved
          ? 'Your cancellation request was sent to admin for approval.'
          : 'Your leave request was cancelled. Admin has been notified.'
      );
    } catch (e) {
      showAlert('Could not cancel', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <ScreenHeader title="Leaves" />

      <View style={styles.statusRow}>
        <StatusOptionChip status="approved" count={approvedCount} active />
        <StatusOptionChip status="pending" count={pendingCount} />
      </View>

      <Link href="/leave-request" asChild>
        <Button title="+ Request Leave" style={styles.requestBtn} />
      </Link>

      {availableCompensatoryCredits > 0 ? (
        <Card style={[styles.compCard, { borderColor: '#2563EB', backgroundColor: '#EFF6FF' }]}>
          <Text style={[styles.compTitle, { color: '#1D4ED8' }]}>Compensatory credits</Text>
          <Text style={[styles.compBody, { color: colors.text }]}>
            {availableCompensatoryCredits} available from extra continued shifts. Use on a scheduled day off, or
            keep working — credits stay until you use them.
          </Text>
          <Link href="/compensatory-off" asChild>
            <Button title="Use Compensatory Off" variant="outline" style={styles.compBtn} />
          </Link>
        </Card>
      ) : null}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Leave Balances</Text>
      <View style={styles.balanceGrid}>
        {displayBalances
          .filter((balance) => DISPLAYED_LEAVE_TYPES.has(balance.type))
          .map((balance) => (
            <LeaveBalanceBox
              key={balance.type}
              label={LEAVE_TYPE_LABELS[balance.type]}
              remaining={balance.remaining}
              total={balance.total}
              used={balance.used}
              pendingDays={leaveRequests
                .filter((request) => {
                  const isPaidBucket = balance.type === 'paid' || balance.type === 'annual';
                  const reqPaid =
                    request.type === 'paid' || request.type === 'annual' || request.type === 'sick';
                  if (isPaidBucket) return reqPaid && request.status === 'pending';
                  return request.type === balance.type && request.status === 'pending';
                })
                .reduce((sum, request) => sum + request.days, 0)}
              accent={LEAVE_ACCENT[balance.type] ?? colors.primary}
              emoji={LEAVE_EMOJI[balance.type] ?? '📅'}
              colors={colors}
            />
          ))}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>My Requests</Text>
      {leaveRequests.length === 0 ? (
        <Card>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No leave requests yet.</Text>
        </Card>
      ) : (
        leaveRequests.map((request) => {
          const isPending = request.status === 'pending';
          const isApproved = request.status === 'approved';
          const cancelPending = isApproved && !!request.cancelRequestedAt;
          const canCancelPending = isPending;
          const canRequestCancel = isApproved && !cancelPending && today < request.startDate;
          const requestCancelExpired = isApproved && !cancelPending && today >= request.startDate;
          const label = LEAVE_TYPE_LABELS[request.type] ?? request.type;
          return (
            <Card key={request.id} style={styles.requestCard}>
              <View style={styles.requestHeader}>
                <Text style={[styles.requestType, { color: colors.text }]}>
                  {label}
                </Text>
                <StatusSymbolBadge status={statusMap[request.status]} compact />
              </View>
              <Text style={[styles.requestDates, { color: colors.textSecondary }]}>
                {format(parseISO(request.startDate), 'MMM d')} –{' '}
                {format(parseISO(request.endDate), 'MMM d, yyyy')}
                {' · '}
                {request.days} day{request.days > 1 ? 's' : ''}
              </Text>
              <Text style={[styles.requestReason, { color: colors.text }]}>{request.reason}</Text>
              <Text style={[styles.requestMeta, { color: colors.textSecondary }]}>
                Submitted {format(parseISO(request.submittedAt), 'MMM d, yyyy')}
              </Text>
              {cancelPending ? (
                <Text style={[styles.cancelPendingLabel, { color: colors.textMuted }]}>
                  Cancellation pending admin approval
                </Text>
              ) : canCancelPending || canRequestCancel || requestCancelExpired ? (
                <Button
                  title={
                    cancellingId === request.id
                      ? isApproved
                        ? 'Sending...'
                        : 'Cancelling...'
                      : isApproved
                        ? 'Request cancellation'
                        : 'Cancel leave'
                  }
                  variant={isApproved ? 'danger' : 'outline'}
                  size={isApproved ? 'md' : 'sm'}
                  style={isApproved ? styles.requestCancelBtn : styles.cancelBtn}
                  disabled={cancellingId === request.id || requestCancelExpired}
                  onPress={() => handleCancelLeave(request.id, label, isApproved)}
                />
              ) : request.status === 'cancelled' ? (
                <Text style={[styles.cancelledLabel, { color: colors.textMuted }]}>Cancelled</Text>
              ) : null}
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  statusRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 12 },
  requestBtn: { marginBottom: 20 },
  compCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 20, gap: 8 },
  compTitle: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  compBody: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  compBtn: { marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  balanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  balanceBox: {
    width: '48%',
    flexGrow: 1,
    minWidth: 148,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2,
  },
  balanceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  balanceIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  balanceEmoji: { fontSize: 13 },
  balanceType: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    lineHeight: 14,
  },
  balanceRemaining: { fontSize: 30, fontWeight: '800', lineHeight: 34 },
  balanceSub: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  balanceMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
  },
  balanceMeta: { fontSize: 11, fontWeight: '600' },
  progressBg: { height: 5, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  requestCard: { marginBottom: 12 },
  requestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  requestType: { fontSize: 16, fontWeight: '700', flex: 1, paddingRight: 8 },
  requestDates: { fontSize: 13, marginTop: 8 },
  requestReason: { fontSize: 14, marginTop: 8 },
  requestMeta: { fontSize: 11, marginTop: 8 },
  cancelBtn: { marginTop: 12, alignSelf: 'flex-start' },
  requestCancelBtn: { marginTop: 12 },
  cancelledLabel: { marginTop: 10, fontSize: 12, fontWeight: '700' },
  cancelPendingLabel: { marginTop: 10, fontSize: 12, fontWeight: '600', fontStyle: 'italic' },
  empty: { textAlign: 'center', padding: 16 },
});
