import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/SelectField';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { MONTH_NAMES } from '@/constants/config';
import { formatCurrency } from '@/services/employeeService';
import { getEmployeeDisplayName } from '@/services/employeeRegistry';
import type { SalarySlip } from '@/types/employee';
import { useColorScheme } from '@/components/useColorScheme';
import { showAlert } from '@/utils/uiAlert';

export default function AdminPayrollScreen() {
  const { generatePayroll, loadAllPayroll, allEmployees } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const monthOptions = MONTH_NAMES.map((label, index) => ({
    value: String(index),
    label,
  }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await loadAllPayroll();
      const month = MONTH_NAMES[monthIndex];
      setSlips(all.filter((s) => s.year === year && s.month === month));
    } finally {
      setLoading(false);
    }
  }, [loadAllPayroll, monthIndex, year]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const generated = await generatePayroll(year, monthIndex);
      setSlips(generated);
      showAlert('Payroll ready', `Generated ${generated.length} payslip(s) for ${MONTH_NAMES[monthIndex]} ${year}.`);
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not generate payroll');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text style={[styles.title, { color: colors.text }]}>Payroll</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Base salary − unpaid/absent deductions + OT (after 1h past shift) + bus fare
      </Text>

      <SelectField
        label="Month"
        value={String(monthIndex)}
        options={monthOptions}
        onChange={(v) => setMonthIndex(Number(v))}
        textColor={colors.text}
        mutedColor={colors.textMuted}
        borderColor={colors.borderLight}
        cardColor={colors.card}
        primaryColor={colors.primary}
        dangerColor={colors.danger}
      />

      <Button
        title={generating ? 'Generating...' : `Generate ${MONTH_NAMES[monthIndex]} payroll`}
        onPress={handleGenerate}
        disabled={generating}
      />

      {slips.map((slip) => {
        const emp = allEmployees.find((e) => e.employeeId === slip.employeeId);
        return (
          <Card key={slip.id} style={styles.card}>
            <Text style={[styles.name, { color: colors.text }]}>
              {emp ? getEmployeeDisplayName(emp) : slip.employeeId}
            </Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {slip.month} {slip.year} · {slip.status}
            </Text>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Basic</Text>
              <Text style={[styles.value, { color: colors.text }]}>{formatCurrency(slip.basic)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textMuted }]}>
                Allowances (bus + OT)
              </Text>
              <Text style={[styles.value, { color: '#0F766E' }]}>+{formatCurrency(slip.allowances)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Deductions</Text>
              <Text style={[styles.value, { color: colors.danger }]}>-{formatCurrency(slip.deductions)}</Text>
            </View>
            <View style={[styles.row, styles.netRow]}>
              <Text style={[styles.label, { color: colors.text, fontWeight: '800' }]}>Net pay</Text>
              <Text style={[styles.net, { color: colors.primary }]}>{formatCurrency(slip.netPay)}</Text>
            </View>
            <Text style={[styles.detail, { color: colors.textMuted }]}>
              Attended {slip.attendedHours ?? 0}h / {slip.scheduledHours ?? 0}h · Absent {slip.absentDays ?? 0} ·
              Unpaid leave {slip.unpaidLeaveDays ?? 0} · OT {slip.otHours ?? 0}h
            </Text>
          </Card>
        );
      })}

      {!loading && slips.length === 0 ? (
        <Card>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No payslips for this month yet. Tap Generate to create them.
          </Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 10 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 13, marginBottom: 4 },
  card: { marginTop: 6 },
  name: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  netRow: { marginTop: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0' },
  label: { fontSize: 13 },
  value: { fontSize: 13, fontWeight: '700' },
  net: { fontSize: 18, fontWeight: '800' },
  detail: { fontSize: 11, marginTop: 8 },
  empty: { textAlign: 'center', padding: 16 },
});
