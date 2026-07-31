import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { DateInputField } from '@/components/ui/DateInputField';
import { SelectField } from '@/components/ui/SelectField';
import { getEmployeeDisplayName } from '@/services/employeeRegistry';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import {
  DEFAULT_DAY_SHIFT,
  DEFAULT_NIGHT_SHIFT,
} from '@/constants/config';
import {
  buildTimeOptions,
  DEPARTMENT_OPTIONS,
  POSITIONS_BY_DEPARTMENT,
  STAFF_CATEGORY_OPTIONS,
} from '@/constants/hrOptions';
import type { Employee, StaffCategory } from '@/types/employee';
import { useColorScheme } from '@/components/useColorScheme';
import { parseLeaveDate } from '@/utils/leaveValidation';

function showAlert(title: string, message: string, onOk?: () => void) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    onOk?.();
    return;
  }
  Alert.alert(title, message, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
}

const TEXT_FIELDS: {
  key: 'firstName' | 'lastName' | 'email' | 'phone' | 'address' | 'emergencyContact' | 'tempPassword';
  label: string;
  optional?: boolean;
}[] = [
  { key: 'firstName', label: 'First name *' },
  { key: 'lastName', label: 'Last name *' },
  { key: 'email', label: 'Work email *' },
  { key: 'phone', label: 'Phone (optional)', optional: true },
  { key: 'address', label: 'Address (optional)', optional: true },
  { key: 'emergencyContact', label: 'Emergency contact (optional)', optional: true },
  { key: 'tempPassword', label: 'Temporary password (optional)', optional: true },
];

export default function NewHireScreen() {
  const router = useRouter();
  const { createHire, getSupervisors } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const [supervisors, setSupervisors] = useState<Employee[]>([]);
  const [supervisorId, setSupervisorId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const timeOptions = useMemo(() => buildTimeOptions(30), []);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    department: '',
    position: '',
    address: '',
    emergencyContact: '',
    joinDate: new Date().toISOString().split('T')[0],
    tempPassword: 'welcome123',
    staffCategory: 'staff' as StaffCategory,
    baseSalary: '',
    busFare: '',
    dayShiftEnabled: true,
    nightShiftEnabled: false,
    dayShiftStart: DEFAULT_DAY_SHIFT.start,
    dayShiftEnd: DEFAULT_DAY_SHIFT.end,
    nightShiftStart: DEFAULT_NIGHT_SHIFT.start,
    nightShiftEnd: DEFAULT_NIGHT_SHIFT.end,
  });

  useEffect(() => {
    getSupervisors().then((list) => {
      setSupervisors(list);
      if (list[0]) setSupervisorId(list[0].employeeId);
    });
  }, [getSupervisors]);

  const positionOptions = useMemo(
    () => (form.department ? POSITIONS_BY_DEPARTMENT[form.department] ?? [] : []),
    [form.department]
  );

  const fieldColors = {
    textColor: colors.text,
    mutedColor: colors.textMuted,
    borderColor: colors.borderLight,
    cardColor: colors.card,
    dangerColor: colors.danger,
    primaryColor: colors.primary,
  };

  const update = (key: keyof typeof form, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleFieldChange = (key: keyof typeof form, value: string) => {
    if (key === 'phone' || key === 'emergencyContact') {
      update(key, value.replace(/\D/g, '').slice(0, 10));
      return;
    }
    update(key, value);
  };

  const handleDepartmentChange = (value: string) => {
    setForm((prev) => ({ ...prev, department: value, position: '' }));
  };

  const handleSubmit = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      showAlert('Missing name', 'First name and last name are required.');
      return;
    }
    if (!form.email.trim()) {
      showAlert('Missing email', 'Work email is required for login.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      showAlert('Invalid email', 'Please enter a valid work email address.');
      return;
    }
    if (form.phone && form.phone.length !== 10) {
      showAlert('Invalid phone', 'Phone number must be exactly 10 digits, or leave it blank.');
      return;
    }
    if (form.emergencyContact && form.emergencyContact.length !== 10) {
      showAlert('Invalid emergency contact', 'Emergency contact must be exactly 10 digits, or leave it blank.');
      return;
    }
    if (form.joinDate && form.joinDate.length === 10 && !parseLeaveDate(form.joinDate)) {
      showAlert('Invalid join date', 'Enter join date as YYYY-MM-DD (past dates allowed).');
      return;
    }

    const joinDate =
      form.joinDate.length === 10 && parseLeaveDate(form.joinDate)
        ? form.joinDate
        : new Date().toISOString().split('T')[0];

    const dayEnabled = form.dayShiftEnabled || (!form.dayShiftEnabled && !form.nightShiftEnabled);
    const nightEnabled = form.nightShiftEnabled;
    const password = form.tempPassword.trim() || 'welcome123';

    setSubmitting(true);
    try {
      const created = await createHire({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        department: form.department || 'General',
        position: form.position || (form.staffCategory === 'doctor' ? 'Doctor' : 'Staff'),
        supervisorId: supervisorId || '',
        address: form.address,
        emergencyContact: form.emergencyContact,
        joinDate,
        tempPassword: password,
        staffCategory: form.staffCategory,
        baseSalary: Number(form.baseSalary) || 0,
        busFare: Number(form.busFare) || 0,
        dayShiftEnabled: dayEnabled,
        nightShiftEnabled: nightEnabled,
        dayShiftStart: form.dayShiftStart,
        dayShiftEnd: form.dayShiftEnd,
        nightShiftStart: form.nightShiftStart,
        nightShiftEnd: form.nightShiftEnd,
      });
      showAlert(
        'Person added',
        `${getEmployeeDisplayName(created)} added.\nLogin: ${created.email}\nTemp password: ${password}`,
        () => router.replace('/admin/employees')
      );
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not create account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Add Doctor / Staff', presentation: 'modal' }} />
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.title, { color: colors.text }]}>Add doctor or staff</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Only name and email are required. Other fields are optional.
          </Text>

          <SelectField
            label="Category"
            value={form.staffCategory}
            onChange={(v) => update('staffCategory', v)}
            options={STAFF_CATEGORY_OPTIONS}
            compact
            {...fieldColors}
          />

          {TEXT_FIELDS.slice(0, 4).map((field) => (
            <View key={field.key} style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textMuted }]}>{field.label.toUpperCase()}</Text>
              <TextInput
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.borderLight, backgroundColor: colors.card },
                ]}
                value={form[field.key]}
                onChangeText={(v) => handleFieldChange(field.key, v)}
                autoCapitalize={field.key === 'email' ? 'none' : 'words'}
                keyboardType={
                  field.key === 'email' ? 'email-address' : field.key === 'phone' ? 'phone-pad' : 'default'
                }
                maxLength={field.key === 'phone' ? 10 : undefined}
              />
            </View>
          ))}

          <SelectField
            label="Department (optional)"
            value={form.department}
            onChange={handleDepartmentChange}
            options={DEPARTMENT_OPTIONS}
            placeholder="Select department"
            compact
            {...fieldColors}
          />

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textMuted }]}>POSITION (OPTIONAL)</Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.borderLight, backgroundColor: colors.card },
              ]}
              value={form.position}
              onChangeText={(v) => update('position', v)}
              placeholder={form.department ? 'Type or pick below' : 'e.g. Staff Nurse'}
              placeholderTextColor={colors.textMuted}
            />
          </View>
          {positionOptions.length > 0 ? (
            <SelectField
              label="Or choose position"
              value={form.position}
              onChange={(value) => update('position', value)}
              options={positionOptions}
              placeholder="Select position"
              compact
              {...fieldColors}
            />
          ) : null}

          <View style={styles.rowFields}>
            <View style={styles.half}>
              <Text style={[styles.label, { color: colors.textMuted }]}>BASE SALARY (OPTIONAL)</Text>
              <TextInput
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.borderLight, backgroundColor: colors.card },
                ]}
                value={form.baseSalary}
                onChangeText={(v) => update('baseSalary', v.replace(/[^\d.]/g, ''))}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.half}>
              <Text style={[styles.label, { color: colors.textMuted }]}>BUS FARE (OPTIONAL)</Text>
              <TextInput
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.borderLight, backgroundColor: colors.card },
                ]}
                value={form.busFare}
                onChangeText={(v) => update('busFare', v.replace(/[^\d.]/g, ''))}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <Text style={[styles.section, { color: colors.text }]}>Shift availability & timing (optional)</Text>
          <View style={styles.shiftToggles}>
            <Pressable
              style={[
                styles.toggle,
                {
                  backgroundColor: form.dayShiftEnabled ? colors.primaryLight : colors.card,
                  borderColor: form.dayShiftEnabled ? colors.primary : colors.borderLight,
                },
              ]}
              onPress={() => update('dayShiftEnabled', !form.dayShiftEnabled)}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>Day shift</Text>
            </Pressable>
            <Pressable
              style={[
                styles.toggle,
                {
                  backgroundColor: form.nightShiftEnabled ? colors.primaryLight : colors.card,
                  borderColor: form.nightShiftEnabled ? colors.primary : colors.borderLight,
                },
              ]}
              onPress={() => update('nightShiftEnabled', !form.nightShiftEnabled)}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>Night shift</Text>
            </Pressable>
          </View>

          {form.dayShiftEnabled ? (
            <View style={styles.rowFields}>
              <View style={styles.half}>
                <SelectField
                  label="Day start"
                  value={form.dayShiftStart}
                  options={timeOptions}
                  onChange={(v) => update('dayShiftStart', v)}
                  compact
                  {...fieldColors}
                />
              </View>
              <View style={styles.half}>
                <SelectField
                  label="Day end"
                  value={form.dayShiftEnd}
                  options={timeOptions}
                  onChange={(v) => update('dayShiftEnd', v)}
                  compact
                  {...fieldColors}
                />
              </View>
            </View>
          ) : null}

          {form.nightShiftEnabled ? (
            <View style={styles.rowFields}>
              <View style={styles.half}>
                <SelectField
                  label="Night start"
                  value={form.nightShiftStart}
                  options={timeOptions}
                  onChange={(v) => update('nightShiftStart', v)}
                  compact
                  {...fieldColors}
                />
              </View>
              <View style={styles.half}>
                <SelectField
                  label="Night end"
                  value={form.nightShiftEnd}
                  options={timeOptions}
                  onChange={(v) => update('nightShiftEnd', v)}
                  compact
                  {...fieldColors}
                />
              </View>
            </View>
          ) : null}

          <DateInputField
            label="Join date (optional — past dates allowed)"
            value={form.joinDate}
            onChange={(value) => update('joinDate', value)}
            placeholder="YYYY-MM-DD"
            {...fieldColors}
          />

          {TEXT_FIELDS.slice(4).map((field) => (
            <View key={field.key} style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textMuted }]}>{field.label.toUpperCase()}</Text>
              <TextInput
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.borderLight, backgroundColor: colors.card },
                ]}
                value={form[field.key]}
                onChangeText={(v) => handleFieldChange(field.key, v)}
                autoCapitalize={field.key === 'tempPassword' ? 'none' : 'words'}
                keyboardType={field.key === 'emergencyContact' ? 'phone-pad' : 'default'}
                maxLength={field.key === 'emergencyContact' ? 10 : undefined}
              />
            </View>
          ))}

          {supervisors.length > 0 ? (
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textMuted }]}>REPORTS TO (OPTIONAL)</Text>
              <View style={styles.supervisorList}>
                {supervisors.map((sup) => (
                  <Pressable
                    key={sup.employeeId}
                    style={[
                      styles.supChip,
                      {
                        backgroundColor: supervisorId === sup.employeeId ? colors.primaryLight : colors.card,
                        borderColor: supervisorId === sup.employeeId ? colors.primary : colors.borderLight,
                      },
                    ]}
                    onPress={() => setSupervisorId(sup.employeeId)}
                  >
                    <Text
                      style={[
                        styles.supText,
                        { color: supervisorId === sup.employeeId ? colors.primary : colors.text },
                      ]}
                    >
                      {getEmployeeDisplayName(sup)} · {sup.position}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <Button
            title="Create account"
            onPress={handleSubmit}
            loading={submitting}
            disabled={submitting}
            size="lg"
            style={styles.submit}
          />
          <Button title="Cancel" variant="outline" onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  hint: { fontSize: 13, marginBottom: 12, fontWeight: '500' },
  section: { fontSize: 15, fontWeight: '800', marginTop: 8, marginBottom: 8 },
  fieldGroup: { marginBottom: 6 },
  label: { fontSize: 11, fontWeight: '700', marginBottom: 4, letterSpacing: 0.6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
  rowFields: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  shiftToggles: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  toggle: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  supervisorList: { gap: 6 },
  supChip: { padding: 10, borderRadius: 12, borderWidth: 1.5 },
  supText: { fontSize: 13, fontWeight: '600' },
  submit: { marginTop: 16, marginBottom: 8 },
});
