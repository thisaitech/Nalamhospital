import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import type { LeaveRequest } from '@/types/employee';
import {
  formatLeaveActionTime,
  getLeaveCancelDecision,
  getLeaveDecision,
} from '@/utils/leaveAudit';

interface LeaveAuditInfoProps {
  request: LeaveRequest;
  color: string;
  textStyle?: StyleProp<TextStyle>;
}

export function LeaveAuditInfo({ request, color, textStyle }: LeaveAuditInfoProps) {
  const decision = getLeaveDecision(request);
  const cancelDecision = getLeaveCancelDecision(request);
  if (!decision && !cancelDecision) return null;

  const verb = decision?.action === 'rejected' ? 'Rejected' : 'Approved';
  const cancelVerb = cancelDecision?.action === 'cancel_rejected' ? 'rejected' : 'approved';

  return (
    <View style={styles.wrap}>
      {decision ? (
        <>
          <Text style={[styles.line, textStyle, { color }]}>
            {verb} by: <Text style={styles.strong}>{decision.by}</Text>
          </Text>
          {decision.at ? (
            <Text style={[styles.line, textStyle, { color }]}>
              {verb} on: {formatLeaveActionTime(decision.at)}
            </Text>
          ) : null}
        </>
      ) : null}
      {cancelDecision ? (
        <Text style={[styles.line, textStyle, { color }]}>
          Cancellation {cancelVerb} by: <Text style={styles.strong}>{cancelDecision.by}</Text> ·{' '}
          {formatLeaveActionTime(cancelDecision.at)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  line: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  strong: { fontWeight: '700' },
});
