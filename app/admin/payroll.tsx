import { useCallback, useMemo, useState, useEffect } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusSymbolBadge } from '@/components/ui/StatusSymbolBadge';
import { SelectField } from '@/components/ui/SelectField';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { MONTH_NAMES } from '@/constants/config';
import { formatCurrency } from '@/services/employeeService';
import { getEmployeeDisplayName } from '@/services/employeeRegistry';
import type { SalarySlip } from '@/types/employee';
import { useColorScheme } from '@/components/useColorScheme';
import {
  amountInWords,
  buildFinancialYearOptions,
  currentFinancialYearLabel,
  formatPayslipDate,
} from '@/utils/annualPayslip';
import { downloadAnnualPayslipPdf } from '@/utils/downloadAnnualPayslipPdf';
import {
  buildClinicFilterOptions,
  filterEmployeesByClinic,
  type ClinicFilterId,
} from '@/utils/clinicScope';
import { showAlert } from '@/utils/uiAlert';

type PayrollTab = 'monthly' | 'annual';
type AnnualStep = 'start' | 'form';

const ACCENT = '#4F46E5';
const ACCENT_SOFT = '#EEF2FF';

const EARNING_HEADS = [
  { key: 'basic', label: 'Basic' },
  { key: 'dearness', label: 'Dearness Allowance' },
  { key: 'onCall', label: 'On-call Allowance' },
  { key: 'conveyance', label: 'Conveyance Allowance' },
  { key: 'medical', label: 'Medical Allowance' },
  { key: 'special', label: 'Special Allowance' },
] as const;

type EarningKey = (typeof EARNING_HEADS)[number]['key'];
type EarningAmounts = Record<EarningKey, string>;

const EMPTY_EARNINGS: EarningAmounts = {
  basic: '',
  dearness: '',
  onCall: '',
  conveyance: '',
  medical: '',
  special: '',
};

function parseAmount(value: string): number {
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function formatAmountDisplay(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export default function AdminPayrollScreen() {
  const router = useRouter();
  const {
    generatePayroll,
    loadAllPayroll,
    markPayslipsPaid,
    allEmployees,
    allClinics,
    selectedClinicId,
  } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<PayrollTab>('monthly');
  const [annualStep, setAnnualStep] = useState<AnnualStep>('start');

  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [clinicId, setClinicId] = useState<ClinicFilterId>(
    selectedClinicId === 'all' ? 'all' : selectedClinicId
  );
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedSlipIds, setSelectedSlipIds] = useState<string[]>([]);
  const [markingPaid, setMarkingPaid] = useState(false);

  const [employeeId, setEmployeeId] = useState('');
  const [monthlyEmployeeId, setMonthlyEmployeeId] = useState('');
  const [financialYear, setFinancialYear] = useState(currentFinancialYearLabel());
  const [payslipDate, setPayslipDate] = useState(formatPayslipDate());
  const [earnings, setEarnings] = useState<EarningAmounts>(EMPTY_EARNINGS);
  const [reimbursement, setReimbursement] = useState('');
  const [yearDeduction, setYearDeduction] = useState('');

  const monthOptions = MONTH_NAMES.map((label, index) => ({
    value: String(index),
    label,
  }));

  const financialYearOptions = useMemo(() => buildFinancialYearOptions(6), []);

  const clinicOptions = useMemo(() => buildClinicFilterOptions(allClinics), [allClinics]);

  const activeEmployees = useMemo(
    () => allEmployees.filter((employee) => !employee.deletedAt),
    [allEmployees]
  );

  const scopedEmployees = useMemo(
    () => filterEmployeesByClinic(activeEmployees, clinicId),
    [activeEmployees, clinicId]
  );

  const scopedEmployeeIds = useMemo(
    () => new Set(scopedEmployees.map((e) => e.employeeId)),
    [scopedEmployees]
  );

  const employeeOptions = useMemo(
    () =>
      scopedEmployees.map((e) => ({
        value: e.employeeId,
        label: `${getEmployeeDisplayName(e)} (${e.employeeId})`,
      })),
    [scopedEmployees]
  );

  const selectedEmployee = scopedEmployees.find((e) => e.employeeId === employeeId) ?? null;

  const visibleMonthlySlips = useMemo(() => {
    if (!monthlyEmployeeId) return slips;
    return slips.filter((s) => s.employeeId === monthlyEmployeeId);
  }, [slips, monthlyEmployeeId]);

  const handleClinicChange = (nextClinicId: string) => {
    setClinicId(nextClinicId);
    setMonthlyEmployeeId('');
    setEmployeeId('');
    setSelectMode(false);
    setSelectedSlipIds([]);
    if (annualStep === 'form') setAnnualStep('start');
  };
  const earningTotals = useMemo(() => {
    const rows = EARNING_HEADS.map((head, index) => ({
      sno: index + 1,
      label: head.label,
      amount: parseAmount(earnings[head.key]),
    }));
    const gross = rows.reduce((sum, row) => sum + row.amount, 0);
    const reimbursementAmount = parseAmount(reimbursement);
    const yearDeductionAmount = parseAmount(yearDeduction);
    const net = Math.max(0, gross + reimbursementAmount - yearDeductionAmount);
    return { rows, gross, reimbursementAmount, yearDeductionAmount, net };
  }, [earnings, reimbursement, yearDeduction]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await loadAllPayroll();
      const month = MONTH_NAMES[monthIndex];
      setSlips(
        all.filter(
          (slip) =>
            slip.year === year &&
            slip.month === month &&
            scopedEmployeeIds.has(slip.employeeId)
        )
      );
    } finally {
      setLoading(false);
    }
  }, [loadAllPayroll, monthIndex, year, scopedEmployeeIds]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    setSelectMode(false);
    setSelectedSlipIds([]);
  }, [monthIndex, monthlyEmployeeId, clinicId]);

  const handleGenerate = async () => {
    if (!monthlyEmployeeId) {
      showAlert('Select employee', 'Choose an employee to generate their monthly payslip.');
      return;
    }
    setGenerating(true);
    try {
      await generatePayroll(year, monthIndex, monthlyEmployeeId);
      await load();
      const emp = scopedEmployees.find((e) => e.employeeId === monthlyEmployeeId);
      const name = emp ? getEmployeeDisplayName(emp) : monthlyEmployeeId;
      showAlert(
        'Payslip ready',
        `Generated ${MONTH_NAMES[monthIndex]} ${year} payslip for ${name}.`
      );
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not generate payroll');
    } finally {
      setGenerating(false);
    }
  };

  const toggleSelectMode = () => {
    setSelectMode((prev) => {
      if (prev) setSelectedSlipIds([]);
      return !prev;
    });
  };

  const toggleSlipSelection = (slip: SalarySlip) => {
    if (!selectMode || slip.status === 'paid') return;
    setSelectedSlipIds((prev) =>
      prev.includes(slip.id) ? prev.filter((id) => id !== slip.id) : [...prev, slip.id]
    );
  };

  const handleMarkPaid = async () => {
    if (!selectMode) {
      showAlert('Select mode', 'Tap Select first, then choose payslips to mark as paid.');
      return;
    }
    const pendingIds = selectedSlipIds.filter((id) => {
      const slip = visibleMonthlySlips.find((s) => s.id === id);
      return slip?.status === 'pending';
    });
    if (!pendingIds.length) {
      showAlert('Nothing selected', 'Select at least one pending payslip.');
      return;
    }
    setMarkingPaid(true);
    try {
      await markPayslipsPaid(pendingIds);
      await load();
      setSelectedSlipIds([]);
      setSelectMode(false);
      showAlert(
        'Marked paid',
        `${pendingIds.length} payslip${pendingIds.length === 1 ? '' : 's'} marked as paid. Staff will see Paid on their Pay page.`
      );
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not mark payslips as paid');
    } finally {
      setMarkingPaid(false);
    }
  };

  const resetAnnualForm = () => {
    setEarnings(EMPTY_EARNINGS);
    setReimbursement('');
    setYearDeduction('');
    setPayslipDate(formatPayslipDate());
  };

  const startAnnualSlip = () => {
    if (!employeeId) {
      showAlert('Choose employee', 'Select an employee before generating the annual slip.');
      return;
    }
    const emp = scopedEmployees.find((e) => e.employeeId === employeeId);
    if (!emp) {
      showAlert('Choose employee', 'Selected employee was not found.');
      return;
    }
    resetAnnualForm();
    setEarnings({
      ...EMPTY_EARNINGS,
      basic: emp.baseSalary ? String(emp.baseSalary) : '',
      conveyance: emp.busFare ? String(emp.busFare) : '',
    });
    setAnnualStep('form');
  };

  const updateEarning = (key: EarningKey, value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    setEarnings((prev) => ({ ...prev, [key]: cleaned }));
  };

  const validateAnnualSlip = () => {
    if (!selectedEmployee) {
      showAlert('Select employee', 'Choose an employee first.');
      return false;
    }
    if (earningTotals.gross <= 0 && earningTotals.reimbursementAmount <= 0) {
      showAlert('Enter amounts', 'Enter salary amounts manually before continuing.');
      return false;
    }
    return true;
  };

  const handleDownloadPdf = () => {
    if (!validateAnnualSlip() || !selectedEmployee) return;

    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      showAlert('Download on web', 'PDF download is available in the web browser.');
      return;
    }

    try {
      downloadAnnualPayslipPdf({
        financialYear,
        payslipDate,
        employeeName: getEmployeeDisplayName(selectedEmployee),
        employeeId: selectedEmployee.employeeId,
        designation: selectedEmployee.position || '—',
        location: selectedEmployee.department || '—',
        rows: earningTotals.rows,
        gross: earningTotals.gross,
        reimbursement: earningTotals.reimbursementAmount,
        yearDeduction: earningTotals.yearDeductionAmount,
        net: earningTotals.net,
      });
    } catch (e) {
      showAlert('Download failed', e instanceof Error ? e.message : 'Could not download PDF.');
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

  const renderAnnual = () => {
    if (annualStep === 'start') {
      return (
        <>
          <SelectField
            label="Year"
            value={financialYear}
            options={financialYearOptions}
            onChange={setFinancialYear}
            {...fieldColors}
          />
          <SelectField
            label="Clinic"
            value={clinicId}
            options={clinicOptions}
            onChange={handleClinicChange}
            {...fieldColors}
          />
          <SelectField
            label=""
            value={employeeId}
            options={employeeOptions}
            onChange={setEmployeeId}
            placeholder="Select employee"
            {...fieldColors}
          />
          <Button title="Generate Annual Slip" onPress={startAnnualSlip} />
        </>
      );
    }

    if (!selectedEmployee) {
      return (
        <Card style={styles.startCard}>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>Employee not found.</Text>
          <Button title="Back" onPress={() => setAnnualStep('start')} />
        </Card>
      );
    }

    const empName = getEmployeeDisplayName(selectedEmployee);

    return (
      <Card style={styles.slipCard}>
        <View style={styles.stepHeader}>
          <Pressable onPress={() => setAnnualStep('start')} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>← Back</Text>
          </Pressable>
        </View>

        <Text style={styles.slipTitle}>ANNUAL PAYSLIP</Text>
        <Text style={styles.fyLine}>For the Financial Year {financialYear}</Text>

        <View style={styles.metaBlock}>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              Name: <Text style={styles.metaStrong}>{empName}</Text>
            </Text>
            <Text style={styles.metaText}>
              Employee ID: <Text style={styles.metaStrong}>{selectedEmployee.employeeId}</Text>
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              Designation: <Text style={styles.metaStrong}>{selectedEmployee.position || '—'}</Text>
            </Text>
            <Text style={styles.metaText}>
              Date: <Text style={styles.metaStrong}>{payslipDate}</Text>
            </Text>
          </View>
          <Text style={styles.metaText}>
            Location: <Text style={styles.metaStrong}>{selectedEmployee.department || '—'}</Text>
          </Text>
        </View>

        <Text style={[styles.editLabel, { color: colors.textMuted }]}>Date (DD-MM-YYYY)</Text>
        <TextInput
          value={payslipDate}
          onChangeText={setPayslipDate}
          style={[styles.editInput, { color: colors.text, borderColor: colors.borderLight }]}
        />

        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.thSno]}>S. No.</Text>
          <Text style={[styles.th, styles.thHead]}>Salary Head</Text>
          <Text style={[styles.th, styles.thAmt]}>Amount (₹)</Text>
        </View>

        {EARNING_HEADS.map((head, index) => (
          <View key={head.key} style={styles.tableRow}>
            <Text style={styles.tdSno}>{index + 1}</Text>
            <Text style={styles.tdHead}>{head.label}</Text>
            <TextInput
              value={earnings[head.key]}
              onChangeText={(v) => updateEarning(head.key, v)}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#94A3B8"
              style={styles.amountInput}
            />
          </View>
        ))}

        <View style={styles.tableRow}>
          <View style={styles.tdSno} />
          <Text style={[styles.tdHead, styles.sumLabel]}>Gross Salary</Text>
          <Text style={[styles.amountAlign, styles.sumValue]}>
            {formatAmountDisplay(earningTotals.gross)}
          </Text>
        </View>

        <View style={styles.tableRow}>
          <View style={styles.tdSno} />
          <Text style={[styles.tdHead, styles.sumLabel]}>Reimbursement</Text>
          <TextInput
            value={reimbursement}
            onChangeText={(v) => setReimbursement(v.replace(/[^0-9.]/g, ''))}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#94A3B8"
            style={styles.amountInput}
          />
        </View>

        <View style={styles.tableRow}>
          <View style={styles.tdSno} />
          <Text style={[styles.tdHead, styles.sumLabel]}>Year Deduction</Text>
          <TextInput
            value={yearDeduction}
            onChangeText={(v) => setYearDeduction(v.replace(/[^0-9.]/g, ''))}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#94A3B8"
            style={styles.amountInput}
          />
        </View>

        <View style={[styles.tableRow, styles.netRowBox]}>
          <View style={styles.tdSno} />
          <Text style={[styles.tdHead, styles.netLabel]}>Net Salary</Text>
          <Text style={[styles.amountAlign, styles.netValue]}>
            {formatAmountDisplay(earningTotals.net)}
          </Text>
        </View>

        <Text style={styles.words}>
          <Text style={{ fontWeight: '700' }}>Amount in Words: </Text>
          {amountInWords(earningTotals.net)}
        </Text>

        <View style={styles.actionRow}>
          <Pressable
            onPress={handleDownloadPdf}
            style={[styles.outlineBtn, { borderColor: ACCENT }]}
          >
            <Ionicons name="download-outline" size={18} color={ACCENT} />
            <Text style={[styles.outlineBtnText, { color: ACCENT }]}>Download PDF</Text>
          </Pressable>
        </View>
      </Card>
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={
        tab === 'monthly' ? <RefreshControl refreshing={loading} onRefresh={load} /> : undefined
      }
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>Payroll</Text>
        <Pressable
          onPress={() => router.push('/admin/shift-attendance-report' as Href)}
          style={[styles.reportBtn, { borderColor: ACCENT, backgroundColor: ACCENT_SOFT }]}
        >
          <Ionicons name="document-text-outline" size={15} color={ACCENT} />
          <Text style={[styles.reportBtnText, { color: ACCENT }]}>Shift Report</Text>
        </Pressable>
      </View>

      <View style={[styles.tabRow, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
        <Pressable
          onPress={() => setTab('monthly')}
          style={[styles.tabBtn, tab === 'monthly' && { backgroundColor: colors.primaryLight }]}
        >
          <Text style={[styles.tabText, { color: tab === 'monthly' ? colors.primary : colors.textSecondary }]}>
            Monthly
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setTab('annual');
            setAnnualStep('start');
          }}
          style={[styles.tabBtn, tab === 'annual' && { backgroundColor: colors.primaryLight }]}
        >
          <Text style={[styles.tabText, { color: tab === 'annual' ? colors.primary : colors.textSecondary }]}>
            Annual payslip
          </Text>
        </Pressable>
      </View>

      {tab === 'monthly' ? (
        <>
          <View style={styles.filterRow}>
            <View style={styles.filterCell}>
              <SelectField
                label="Clinic"
                value={clinicId}
                options={clinicOptions}
                onChange={handleClinicChange}
                compact
                hideLeadingIcon
                {...fieldColors}
              />
            </View>
            <View style={styles.filterCell}>
              <SelectField
                label="Month"
                value={String(monthIndex)}
                options={monthOptions}
                onChange={(v) => setMonthIndex(Number(v))}
                compact
                hideLeadingIcon
                {...fieldColors}
              />
            </View>
          </View>
          <SelectField
            label=""
            value={monthlyEmployeeId}
            options={employeeOptions}
            onChange={setMonthlyEmployeeId}
            placeholder="Select employee"
            {...fieldColors}
          />

          <Button
            title={
              generating
                ? 'Generating...'
                : monthlyEmployeeId
                  ? `Generate ${MONTH_NAMES[monthIndex]} payslip`
                  : `Generate ${MONTH_NAMES[monthIndex]} payroll`
            }
            onPress={handleGenerate}
            disabled={generating}
          />

          {visibleMonthlySlips.length > 0 ? (
            <View style={styles.slipActionsRow}>
              <Pressable
                onPress={toggleSelectMode}
                style={({ pressed }) => [
                  styles.slipActionBtn,
                  {
                    borderColor: selectMode ? ACCENT : colors.borderLight,
                    backgroundColor: selectMode ? ACCENT_SOFT : colors.card,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Select payslips"
              >
                <Ionicons
                  name={selectMode ? 'checkbox' : 'checkbox-outline'}
                  size={16}
                  color={selectMode ? ACCENT : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.slipActionText,
                    { color: selectMode ? ACCENT : colors.textSecondary },
                  ]}
                >
                  Select
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void handleMarkPaid()}
                disabled={markingPaid || !selectMode || selectedSlipIds.length === 0}
                style={({ pressed }) => [
                  styles.slipActionBtn,
                  styles.slipActionBtnPaid,
                  {
                    borderColor: colors.success,
                    backgroundColor: colors.successLight,
                    opacity:
                      markingPaid || !selectMode || selectedSlipIds.length === 0
                        ? 0.45
                        : pressed
                          ? 0.85
                          : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Mark selected payslips as paid"
              >
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={[styles.slipActionText, { color: colors.success }]}>
                  {markingPaid ? 'Saving...' : 'Paid'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {selectMode && visibleMonthlySlips.some((s) => s.status === 'pending') ? (
            <Text style={[styles.selectHint, { color: colors.textMuted }]}>
              Tap pending payslips below to select, then tap Paid.
            </Text>
          ) : null}

          {visibleMonthlySlips.map((slip) => {
            const emp = scopedEmployees.find((e) => e.employeeId === slip.employeeId);
            const isSelected = selectedSlipIds.includes(slip.id);
            const canSelect = selectMode && slip.status === 'pending';
            return (
              <Pressable
                key={slip.id}
                onPress={() => toggleSlipSelection(slip)}
                disabled={!canSelect}
              >
                <Card
                  style={[
                    styles.card,
                    canSelect && isSelected
                      ? { borderWidth: 2, borderColor: ACCENT, backgroundColor: ACCENT_SOFT }
                      : null,
                    canSelect && !isSelected ? { borderWidth: 1, borderColor: colors.borderLight } : null,
                  ]}
                >
                  <View style={styles.slipHeaderRow}>
                    {selectMode ? (
                      <Ionicons
                        name={
                          slip.status === 'paid'
                            ? 'checkmark-circle'
                            : isSelected
                              ? 'checkbox'
                              : 'square-outline'
                        }
                        size={22}
                        color={
                          slip.status === 'paid'
                            ? colors.success
                            : isSelected
                              ? ACCENT
                              : colors.textMuted
                        }
                        style={styles.slipCheckIcon}
                      />
                    ) : null}
                    <View style={styles.slipHeaderText}>
                      <Text style={[styles.name, { color: colors.text }]}>
                        {emp ? getEmployeeDisplayName(emp) : slip.employeeId}
                      </Text>
                      <View style={styles.slipMetaRow}>
                        <Text style={[styles.meta, { color: colors.textSecondary, marginBottom: 0 }]}>
                          {slip.month} {slip.year}
                        </Text>
                        <StatusSymbolBadge status={slip.status} compact />
                      </View>
                    </View>
                  </View>
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.textMuted }]}>Basic</Text>
                  <Text style={[styles.value, { color: colors.text }]}>{formatCurrency(slip.basic)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.textMuted }]}>Allowances (bus + OT)</Text>
                  <Text style={[styles.value, { color: '#0F766E' }]}>+{formatCurrency(slip.allowances)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.textMuted }]}>Deductions</Text>
                  <Text style={[styles.value, { color: colors.danger }]}>-{formatCurrency(slip.deductions)}</Text>
                </View>
                {(slip.lateFine ?? 0) > 0 ? (
                  <View style={styles.row}>
                    <Text style={[styles.label, { color: colors.textMuted }]}>Late fine</Text>
                    <Text style={[styles.value, { color: colors.danger }]}>
                      -{formatCurrency(slip.lateFine ?? 0)}
                    </Text>
                  </View>
                ) : null}
                {(slip.otPay ?? 0) > 0 ? (
                  <View style={styles.row}>
                    <Text style={[styles.label, { color: colors.textMuted }]}>OT pay</Text>
                    <Text style={[styles.value, { color: '#0F766E' }]}>
                      +{formatCurrency(slip.otPay ?? 0)}
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.row, styles.netRow]}>
                  <Text style={[styles.label, { color: colors.text, fontWeight: '800' }]}>Net pay</Text>
                  <Text style={[styles.net, { color: colors.primary }]}>{formatCurrency(slip.netPay)}</Text>
                </View>
                <Text style={[styles.detail, { color: colors.textMuted }]}>
                  Attended {slip.attendedHours ?? 0}h / {slip.scheduledHours ?? 0}h · Absent {slip.absentDays ?? 0} ·
                  Unpaid leave {slip.unpaidLeaveDays ?? 0} · OT {slip.otHours ?? 0}h · Late fine ₹
                  {Math.round(slip.lateFine ?? 0)}
                </Text>
                </Card>
              </Pressable>
            );
          })}

          {!loading && visibleMonthlySlips.length === 0 ? (
            <Card>
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                {monthlyEmployeeId
                  ? 'No payslip for this employee yet. Tap Generate to create monthly payroll.'
                  : 'No payslips for this month yet. Tap Generate to create them.'}
              </Text>
            </Card>
          ) : null}
        </>
      ) : (
        renderAnnual()
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 10 },
  title: { fontSize: 24, fontWeight: '800', flexShrink: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  reportBtnText: { fontSize: 12, fontWeight: '800' },
  tabRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabText: { fontSize: 13, fontWeight: '700' },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  filterCell: {
    flex: 1,
    minWidth: 0,
  },
  slipActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  slipActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  slipActionBtnPaid: {},
  slipActionText: { fontSize: 13, fontWeight: '700' },
  selectHint: { fontSize: 12, textAlign: 'right', marginTop: -2 },
  slipHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  slipCheckIcon: { marginTop: 2 },
  slipHeaderText: { flex: 1, minWidth: 0 },
  slipMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
    marginBottom: 10,
  },
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
  startCard: { gap: 12 },
  startTitle: { fontSize: 18, fontWeight: '800' },
  startHint: { fontSize: 13, lineHeight: 18 },
  stepHeader: { marginBottom: 8, gap: 8 },
  stepTitle: { fontSize: 17, fontWeight: '800' },
  employeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    gap: 8,
  },
  employeeName: { fontSize: 15, fontWeight: '700' },
  employeeMeta: { fontSize: 12, marginTop: 3 },
  slipCard: { gap: 8, paddingVertical: 20 },
  slipTitle: {
    color: ACCENT,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  fyLine: {
    textAlign: 'center',
    color: '#334155',
    fontSize: 13,
    marginBottom: 8,
  },
  metaBlock: { gap: 8, marginBottom: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  metaText: { flex: 1, fontSize: 13, color: '#334155' },
  metaStrong: { fontWeight: '800', color: '#0F172A' },
  editLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: '#F8FAFC',
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: ACCENT_SOFT,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
  },
  th: { fontSize: 12, fontWeight: '800', color: ACCENT },
  thSno: { width: 58, textAlign: 'center' },
  thHead: { flex: 1 },
  thAmt: { width: 110, textAlign: 'right', paddingRight: 10 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
  },
  tdSno: { width: 58, textAlign: 'center', fontSize: 13, color: '#64748B', fontWeight: '600' },
  tdHead: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0F172A' },
  amountInput: {
    width: 110,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
  },
  amountAlign: {
    width: 110,
    textAlign: 'right',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  sumLabel: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  sumValue: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  netRowBox: {
    marginTop: 4,
    backgroundColor: ACCENT_SOFT,
    borderRadius: 10,
    borderBottomWidth: 0,
    paddingHorizontal: 0,
  },
  netLabel: { fontSize: 16, fontWeight: '800', color: ACCENT },
  netValue: { fontSize: 18, fontWeight: '800', color: ACCENT },
  words: { marginTop: 10, fontSize: 13, color: '#475569', lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  outlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 13,
    backgroundColor: '#FFF',
  },
  outlineBtnText: { fontSize: 13, fontWeight: '700' },
});
