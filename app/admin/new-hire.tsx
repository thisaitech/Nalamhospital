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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { DateInputField } from '@/components/ui/DateInputField';
import { SelectField } from '@/components/ui/SelectField';
import { getEmployeeDisplayName, findEmployeeById } from '@/services/employeeRegistry';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import {
  DEFAULT_DAY_SHIFT,
  DEFAULT_NIGHT_SHIFT,
  DEFAULT_SPLIT_SECOND_SHIFT,
} from '@/constants/config';
import {
  DEPARTMENT_OPTIONS,
  POSITIONS_BY_DEPARTMENT,
  STAFF_CATEGORY_OPTIONS,
  buildTimeOptions,
} from '@/constants/hrOptions';
import { getNormalShiftTimings } from '@/services/shiftService';
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
  const { employeeId: editEmployeeId } = useLocalSearchParams<{ employeeId?: string }>();
  const isEditMode = typeof editEmployeeId === 'string' && editEmployeeId.length > 0;
  const { createHire, updateHire, getSupervisors, allClinics, selectedClinicId } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const [supervisors, setSupervisors] = useState<Employee[]>([]);
  const [supervisorId, setSupervisorId] = useState('');
  const [clinicId, setClinicId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingEmployee, setLoadingEmployee] = useState(false);

  const clinicOptions = useMemo(
    () => allClinics.map((clinic) => ({ label: clinic.name, value: clinic.id })),
    [allClinics]
  );

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
    is24HourDuty: false,
    dayShiftStart: DEFAULT_DAY_SHIFT.start,
    dayShiftEnd: DEFAULT_DAY_SHIFT.end,
    nightShiftStart: DEFAULT_NIGHT_SHIFT.start,
    nightShiftEnd: DEFAULT_NIGHT_SHIFT.end,
    splitShiftEnabled: false,
  });

  const timeOptions = useMemo(() => buildTimeOptions(), []);

  useEffect(() => {
    getSupervisors().then((list) => {
      setSupervisors(list);
      if (!isEditMode && list[0]) setSupervisorId(list[0].employeeId);
    });
  }, [getSupervisors, isEditMode]);

  useEffect(() => {
    if (isEditMode) return;
    getNormalShiftTimings()
      .then((timings) => {
        setForm((prev) => ({
          ...prev,
          dayShiftStart: timings.dayStart,
          dayShiftEnd: timings.dayEnd,
          nightShiftStart: timings.nightStart,
          nightShiftEnd: timings.nightEnd,
        }));
      })
      .catch(() => {
        // keep defaults
      });
  }, [isEditMode]);

  useEffect(() => {
    if (!isEditMode || !editEmployeeId) return;
    let cancelled = false;
    setLoadingEmployee(true);
    findEmployeeById(editEmployeeId)
      .then((emp) => {
        if (cancelled || !emp) return;
        setForm({
          firstName: emp.firstName ?? '',
          lastName: emp.lastName ?? '',
          email: emp.email ?? '',
          phone: emp.phone ?? '',
          department: emp.department ?? '',
          position: emp.position ?? '',
          address: emp.address ?? '',
          emergencyContact: emp.emergencyContact ?? '',
          joinDate: emp.joinDate ?? new Date().toISOString().split('T')[0],
          tempPassword: '',
          staffCategory: emp.staffCategory ?? 'staff',
          baseSalary: emp.baseSalary != null ? String(emp.baseSalary) : '',
          busFare: emp.busFare != null ? String(emp.busFare) : '',
          dayShiftEnabled: emp.is24HourDuty
            ? true
            : Boolean(emp.dayShiftEnabled) || !emp.nightShiftEnabled,
          nightShiftEnabled: emp.is24HourDuty
            ? false
            : Boolean(emp.nightShiftEnabled) && !emp.dayShiftEnabled,
          is24HourDuty: emp.is24HourDuty ?? false,
          dayShiftStart:
            emp.dayShiftStart ||
            (emp.is24HourDuty ? '08:00' : DEFAULT_DAY_SHIFT.start),
          dayShiftEnd: emp.is24HourDuty
            ? emp.dayShiftEnd && emp.dayShiftEnd !== emp.dayShiftStart
              ? emp.dayShiftEnd
              : '10:00'
            : emp.dayShiftEnd || DEFAULT_DAY_SHIFT.end,
          nightShiftStart: emp.nightShiftStart || DEFAULT_NIGHT_SHIFT.start,
          nightShiftEnd: emp.nightShiftEnd || DEFAULT_NIGHT_SHIFT.end,
          splitShiftEnabled: emp.splitShiftEnabled ?? false,
        });
        setClinicId(emp.clinicId ?? '');
        getSupervisors().then((list) => {
          if (cancelled) return;
          const match = list.find(
            (sup) => getEmployeeDisplayName(sup) === emp.manager || sup.employeeId === emp.manager
          );
          setSupervisorId(match?.employeeId ?? list[0]?.employeeId ?? '');
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingEmployee(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEditMode, editEmployeeId, getSupervisors]);

  useEffect(() => {
    if (allClinics.length === 0) {
      setClinicId('');
      return;
    }
    const preferred =
      selectedClinicId !== 'all' && allClinics.some((clinic) => clinic.id === selectedClinicId)
        ? selectedClinicId
        : allClinics[0].id;
    setClinicId((current) =>
      current && allClinics.some((clinic) => clinic.id === current) ? current : preferred
    );
  }, [allClinics, selectedClinicId]);

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
    if (!clinicId) {
      showAlert('Missing clinic', 'Add a clinic on the Employees page first.');
      return;
    }
    if (form.is24HourDuty && form.dayShiftStart.slice(0, 5) === form.dayShiftEnd.slice(0, 5)) {
      showAlert(
        'Present before required',
        'For 24-hour doctors, set Present before to a time after Present from (e.g. 08:00 → 10:00).'
      );
      return;
    }
    if (form.splitShiftEnabled) {
      if (!form.dayShiftEnabled || form.is24HourDuty) {
        showAlert('Split shift', 'Split Shift / Break Required is only available for day shift employees.');
        return;
      }
      if (form.dayShiftStart.slice(0, 5) >= form.dayShiftEnd.slice(0, 5)) {
        showAlert('Invalid day shift timing', 'Day shift end must be after day shift start.');
        return;
      }
    }

    const joinDate =
      form.joinDate.length === 10 && parseLeaveDate(form.joinDate)
        ? form.joinDate
        : new Date().toISOString().split('T')[0];

    const dayEnabled = form.is24HourDuty ? true : form.dayShiftEnabled;
    const nightEnabled = form.is24HourDuty ? false : form.nightShiftEnabled;
    const password = form.tempPassword.trim() || (isEditMode ? '' : 'welcome123');

    setSubmitting(true);
    try {
      const payload = {
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
        is24HourDuty: form.is24HourDuty,
        dayShiftStart: form.dayShiftStart,
        dayShiftEnd: form.dayShiftEnd,
        nightShiftStart: form.is24HourDuty ? form.dayShiftStart : form.nightShiftStart,
        nightShiftEnd: form.is24HourDuty ? form.dayShiftEnd : form.nightShiftEnd,
        splitShiftEnabled: form.splitShiftEnabled && form.dayShiftEnabled && !form.is24HourDuty,
        ...(form.splitShiftEnabled && form.dayShiftEnabled && !form.is24HourDuty
          ? {
              splitSecondShiftStart: DEFAULT_SPLIT_SECOND_SHIFT.start,
              splitSecondShiftEnd: DEFAULT_SPLIT_SECOND_SHIFT.end,
            }
          : {}),
        clinicId,
      };

      if (isEditMode && editEmployeeId) {
        const updated = await updateHire(editEmployeeId, payload);
        showAlert(
          'Staff updated',
          `${getEmployeeDisplayName(updated)} has been updated.`,
          () => router.replace('/admin/employees')
        );
      } else {
        const created = await createHire(payload);
        showAlert(
          'Person added',
          `${getEmployeeDisplayName(created)} added.\nLogin: ${created.email}\nTemp password: ${password}`,
          () => router.replace('/admin/employees')
        );
      }
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : isEditMode ? 'Could not update staff' : 'Could not create account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: isEditMode ? 'Edit Doctor / Staff' : 'Add Doctor / Staff',
          presentation: 'modal',
        }}
      />
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.title, { color: colors.text }]}>
            {isEditMode ? 'Edit doctor or staff' : 'Add doctor or staff'}
          </Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {isEditMode
              ? `Update details for ${editEmployeeId}. Leave password blank to keep the current one.`
              : 'Only name and email are required. Other fields are optional.'}
          </Text>

          {loadingEmployee ? (
            <Text style={[styles.hint, { color: colors.textMuted }]}>Loading staff details…</Text>
          ) : null}

          <SelectField
            label="Category"
            value={form.staffCategory}
            onChange={(v) => update('staffCategory', v)}
            options={STAFF_CATEGORY_OPTIONS}
            compact
            {...fieldColors}
          />

          {clinicOptions.length > 0 ? (
            <SelectField
              label="Clinic *"
              value={clinicId}
              onChange={setClinicId}
              options={clinicOptions}
              compact
              {...fieldColors}
            />
          ) : (
            <Text style={[styles.hint, { color: colors.danger, marginBottom: 8 }]}>
              No clinics yet. Go to Employees → Add clinic first.
            </Text>
          )}

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
                  backgroundColor:
                    form.dayShiftEnabled && !form.is24HourDuty ? colors.primaryLight : colors.card,
                  borderColor:
                    form.dayShiftEnabled && !form.is24HourDuty ? colors.primary : colors.borderLight,
                },
              ]}
              onPress={() =>
                setForm((prev) => ({
                  ...prev,
                  is24HourDuty: false,
                  dayShiftEnabled: true,
                  nightShiftEnabled: false,
                }))
              }
            >
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>Day shift</Text>
            </Pressable>
            <Pressable
              style={[
                styles.toggle,
                {
                  backgroundColor:
                    form.nightShiftEnabled && !form.is24HourDuty ? colors.primaryLight : colors.card,
                  borderColor:
                    form.nightShiftEnabled && !form.is24HourDuty ? colors.primary : colors.borderLight,
                },
              ]}
              onPress={() =>
                setForm((prev) => ({
                  ...prev,
                  is24HourDuty: false,
                  dayShiftEnabled: false,
                  nightShiftEnabled: true,
                  splitShiftEnabled: false,
                }))
              }
            >
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>Night shift</Text>
            </Pressable>
            <Pressable
              style={[
                styles.toggle,
                {
                  backgroundColor: form.is24HourDuty ? colors.primaryLight : colors.card,
                  borderColor: form.is24HourDuty ? colors.primary : colors.borderLight,
                },
              ]}
              onPress={() =>
                setForm((prev) => ({
                  ...prev,
                  is24HourDuty: true,
                  dayShiftEnabled: true,
                  nightShiftEnabled: false,
                  splitShiftEnabled: false,
                  // Present window: from 08:00, must mark Present before 10:00 (admin can edit)
                  dayShiftStart: '08:00',
                  dayShiftEnd: '10:00',
                  nightShiftStart: '08:00',
                  nightShiftEnd: '10:00',
                }))
              }
            >
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>24 hours</Text>
            </Pressable>
          </View>

          {form.dayShiftEnabled && !form.is24HourDuty ? (
            <View style={styles.timingBlock}>
              <Text style={[styles.timingTitle, { color: colors.text }]}>Day shift timing</Text>
              <View style={styles.timingRow}>
                <View style={styles.timingHalf}>
                  <SelectField
                    label="Start"
                    value={form.dayShiftStart}
                    options={timeOptions}
                    onChange={(v) => update('dayShiftStart', v)}
                    compact
                    hideLeadingIcon
                    {...fieldColors}
                  />
                </View>
                <View style={styles.timingHalf}>
                  <SelectField
                    label="End"
                    value={form.dayShiftEnd}
                    options={timeOptions}
                    onChange={(v) => update('dayShiftEnd', v)}
                    compact
                    hideLeadingIcon
                    {...fieldColors}
                  />
                </View>
              </View>
              <Pressable
                style={styles.splitToggleRow}
                onPress={() => update('splitShiftEnabled', !form.splitShiftEnabled)}
              >
                <View
                  style={[
                    styles.splitCheckbox,
                    {
                      borderColor: form.splitShiftEnabled ? colors.primary : colors.borderLight,
                      backgroundColor: form.splitShiftEnabled ? colors.primary : colors.card,
                    },
                  ]}
                >
                  {form.splitShiftEnabled ? (
                    <Text style={styles.splitCheckMark}>✓</Text>
                  ) : null}
                </View>
                <Text style={[styles.splitToggleLabel, { color: colors.text }]}>
                  Split Shift / Break Required
                </Text>
              </Pressable>
            </View>
          ) : null}

          {form.nightShiftEnabled && !form.is24HourDuty ? (
            <View style={styles.timingBlock}>
              <Text style={[styles.timingTitle, { color: colors.text }]}>Night shift timing</Text>
              <View style={styles.timingRow}>
                <View style={styles.timingHalf}>
                  <SelectField
                    label="Start"
                    value={form.nightShiftStart}
                    options={timeOptions}
                    onChange={(v) => update('nightShiftStart', v)}
                    compact
                    hideLeadingIcon
                    {...fieldColors}
                  />
                </View>
                <View style={styles.timingHalf}>
                  <SelectField
                    label="End"
                    value={form.nightShiftEnd}
                    options={timeOptions}
                    onChange={(v) => update('nightShiftEnd', v)}
                    compact
                    hideLeadingIcon
                    {...fieldColors}
                  />
                </View>
              </View>
            </View>
          ) : null}

          {form.is24HourDuty ? (
            <View style={styles.timingBlock}>
              <View style={styles.timingRow}>
                <View style={styles.timingHalf}>
                  <SelectField
                    label="Present from"
                    value={form.dayShiftStart}
                    options={timeOptions}
                    onChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        dayShiftStart: v,
                        nightShiftStart: v,
                      }))
                    }
                    compact
                    hideLeadingIcon
                    {...fieldColors}
                  />
                </View>
                <View style={styles.timingHalf}>
                  <SelectField
                    label="Present before"
                    value={form.dayShiftEnd}
                    options={timeOptions}
                    onChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        dayShiftEnd: v,
                        nightShiftEnd: v,
                      }))
                    }
                    compact
                    hideLeadingIcon
                    {...fieldColors}
                  />
                </View>
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
            title={isEditMode ? 'Save changes' : 'Create account'}
            onPress={handleSubmit}
            loading={submitting}
            disabled={submitting || loadingEmployee}
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
  timingBlock: { marginBottom: 10, gap: 2 },
  timingTitle: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  timingRow: { flexDirection: 'row', gap: 10 },
  timingHalf: { flex: 1, minWidth: 0 },
  splitToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  splitCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitCheckMark: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  splitToggleLabel: { fontSize: 13, fontWeight: '700', flex: 1 },
  supervisorList: { gap: 6 },
  supChip: { padding: 10, borderRadius: 12, borderWidth: 1.5 },
  supText: { fontSize: 13, fontWeight: '600' },
  submit: { marginTop: 16, marginBottom: 8 },
});
