import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmployeeAvatar } from '@/components/ui/EmployeeAvatar';
import { getEmployeeDisplayName } from '@/services/employeeRegistry';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import type { Employee } from '@/types/employee';
import { useColorScheme } from '@/components/useColorScheme';
import { showAlert, showConfirm } from '@/utils/uiAlert';

export default function AdminEmployeesScreen() {
  const router = useRouter();
  const {
    clinicEmployees,
    deletedClinicEmployees,
    allClinics,
    updateSupervisor,
    getSupervisors,
    refreshData,
    createClinic,
    deleteEmployee,
  } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [supervisors, setSupervisors] = useState<Employee[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [pickerEmployee, setPickerEmployee] = useState<Employee | null>(null);
  const [clinicModalOpen, setClinicModalOpen] = useState(false);
  const [clinicName, setClinicName] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [savingClinic, setSavingClinic] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const clinicNameById = useMemo(
    () => new Map(allClinics.map((clinic) => [clinic.id, clinic.name])),
    [allClinics]
  );

  useEffect(() => {
    getSupervisors().then(setSupervisors);
  }, [getSupervisors, clinicEmployees]);

  const handleAssign = (employee: Employee) => {
    const options = supervisors.filter((s) => s.employeeId !== employee.employeeId);
    if (options.length === 0) {
      showAlert('No supervisors', 'Add more employees first.');
      return;
    }
    setPickerEmployee(employee);
  };

  const handleSelectSupervisor = async (supervisor: Employee) => {
    if (!pickerEmployee) return;
    setAssigningId(pickerEmployee.employeeId);
    try {
      await updateSupervisor(pickerEmployee.employeeId, supervisor.employeeId);
      await refreshData();
      showAlert('Updated', `Supervisor set to ${getEmployeeDisplayName(supervisor)}`);
    } catch (error) {
      showAlert('Error', error instanceof Error ? error.message : 'Could not update supervisor');
    } finally {
      setAssigningId(null);
      setPickerEmployee(null);
    }
  };

  const handleCreateClinic = async () => {
    if (!clinicName.trim()) {
      showAlert('Missing name', 'Enter a clinic name.');
      return;
    }
    if (!clinicAddress.trim()) {
      showAlert('Missing address', 'Enter a clinic address.');
      return;
    }

    setSavingClinic(true);
    try {
      const created = await createClinic({ name: clinicName, address: clinicAddress });
      setClinicName('');
      setClinicAddress('');
      setClinicModalOpen(false);
      showAlert('Clinic added', `${created.name} (${created.id}) is ready for new hires.`);
    } catch (error) {
      showAlert('Error', error instanceof Error ? error.message : 'Could not add clinic');
    } finally {
      setSavingClinic(false);
    }
  };

  const handleDelete = async (employee: Employee) => {
    if (deletingId) return;
    const ok = await showConfirm(
      'Delete staff',
      `Move ${getEmployeeDisplayName(employee)} to Deleted staff? Their details stay saved.`
    );
    if (!ok) return;
    setDeletingId(employee.employeeId);
    try {
      await deleteEmployee(employee.employeeId);
      showAlert('Moved', `${getEmployeeDisplayName(employee)} is now in Deleted staff.`);
    } catch (error) {
      showAlert('Error', error instanceof Error ? error.message : 'Could not delete');
    } finally {
      setDeletingId(null);
    }
  };

  const supervisorOptions = pickerEmployee
    ? supervisors.filter((s) => s.employeeId !== pickerEmployee.employeeId)
    : [];

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 12 }]}
      >
        <View style={styles.headerRow}>
          <Button
            title={`Deleted staff${deletedClinicEmployees.length ? ` (${deletedClinicEmployees.length})` : ''}`}
            size="sm"
            onPress={() => router.push('/admin/deleted-staff' as Href)}
          />
          <View style={styles.headerActions}>
            <Button title="Add clinic" size="sm" onPress={() => setClinicModalOpen(true)} />
            <Link href="/admin/new-hire" asChild>
              <Button title="+ New hire" size="sm" />
            </Link>
          </View>
        </View>

        {clinicEmployees.length === 0 ? (
          <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
            No staff for this clinic yet. Use + New hire and pick this clinic.
          </Text>
        ) : null}

        {clinicEmployees.map((emp) => {
          const clinicLabel = emp.clinicName ?? clinicNameById.get(emp.clinicId) ?? emp.clinicId;
          return (
            <Card key={emp.employeeId} style={styles.card} noPadding>
              <Pressable
                style={styles.cardInner}
                onPress={() => router.push(`/admin/employee/${emp.employeeId}` as Href)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${getEmployeeDisplayName(emp)} details`}
              >
                <View style={styles.row}>
                  <EmployeeAvatar
                    firstName={emp.firstName}
                    lastName={emp.lastName}
                    avatar={emp.avatar}
                    employeeId={emp.employeeId}
                    size={42}
                    borderRadius={14}
                    borderWidth={0}
                    backgroundColor={colors.background}
                    textColor={colors.textMuted}
                    fontSize={14}
                  />
                  <View style={styles.info}>
                    <Text style={[styles.name, { color: colors.text }]}>{getEmployeeDisplayName(emp)}</Text>
                    <Text style={[styles.position, { color: colors.textSecondary }]}>
                      {emp.staffCategory === 'doctor' ? 'Doctor' : 'Staff'} · {emp.position}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textMuted }]}>
                      {emp.employeeId} · {emp.department} · {clinicLabel}
                    </Text>
                    <Text style={[styles.supervisor, { color: colors.primary }]}>
                      {emp.is24HourDuty
                        ? '24 hours'
                        : `${emp.dayShiftEnabled ? 'Day' : ''}${
                            emp.dayShiftEnabled && emp.nightShiftEnabled ? ' + ' : ''
                          }${emp.nightShiftEnabled ? 'Night' : ''}`}{' '}
                      · Base ₹{emp.baseSalary?.toLocaleString?.() ?? emp.baseSalary} · Bus ₹{emp.busFare ?? 0}
                    </Text>
                  </View>
                  <View style={[styles.editIconBtn, { backgroundColor: colors.background }]}>
                    <Ionicons name="eye-outline" size={18} color={colors.primary} />
                  </View>
                </View>
              </Pressable>
              <View style={styles.cardActions}>
                <Pressable
                  style={[styles.actionBtn, { borderColor: colors.primary, backgroundColor: colors.primary }]}
                  onPress={() =>
                    router.push(`/admin/new-hire?employeeId=${encodeURIComponent(emp.employeeId)}` as Href)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${getEmployeeDisplayName(emp)}`}
                >
                  <Ionicons name="create-outline" size={14} color="#FFF" />
                  <Text style={styles.editBtnText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, { borderColor: colors.borderLight }]}
                  onPress={() => handleAssign(emp)}
                  disabled={assigningId === emp.employeeId}
                >
                  <Text style={[styles.assignText, { color: colors.primary }]}>Change supervisor</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, { borderColor: colors.danger }]}
                  onPress={() => handleDelete(emp)}
                  disabled={deletingId === emp.employeeId}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${getEmployeeDisplayName(emp)}`}
                >
                  <Text style={[styles.assignText, { color: colors.danger }]}>
                    {deletingId === emp.employeeId ? 'Deleting…' : 'Delete'}
                  </Text>
                </Pressable>
              </View>
            </Card>
          );
        })}
      </ScrollView>

      <Modal visible={!!pickerEmployee} transparent animationType="fade" onRequestClose={() => setPickerEmployee(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerEmployee(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]} onPress={() => undefined}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Assign supervisor</Text>
            {pickerEmployee ? (
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                For {getEmployeeDisplayName(pickerEmployee)}
              </Text>
            ) : null}
            <ScrollView style={styles.modalList}>
              {supervisorOptions.map((sup) => (
                <Pressable
                  key={sup.employeeId}
                  style={[styles.modalOption, { borderColor: colors.borderLight }]}
                  onPress={() => handleSelectSupervisor(sup)}
                >
                  <Text style={[styles.modalOptionText, { color: colors.text }]}>{getEmployeeDisplayName(sup)}</Text>
                  <Text style={[styles.modalOptionMeta, { color: colors.textMuted }]}>{sup.position}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Button title="Cancel" variant="outline" onPress={() => setPickerEmployee(null)} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={clinicModalOpen} transparent animationType="fade" onRequestClose={() => setClinicModalOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setClinicModalOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]} onPress={() => undefined}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add clinic</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              New locations appear in the hire form clinic dropdown.
            </Text>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>CLINIC NAME *</Text>
              <TextInput
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.borderLight, backgroundColor: colors.background },
                ]}
                value={clinicName}
                onChangeText={setClinicName}
                placeholder="e.g. Nalam West Branch"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>ADDRESS *</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.inputMultiline,
                  { color: colors.text, borderColor: colors.borderLight, backgroundColor: colors.background },
                ]}
                value={clinicAddress}
                onChangeText={setClinicAddress}
                placeholder="Street, area, city"
                placeholderTextColor={colors.textMuted}
                multiline
              />
            </View>
            <Button title="Save clinic" onPress={handleCreateClinic} loading={savingClinic} disabled={savingClinic} />
            <Button title="Cancel" variant="outline" onPress={() => setClinicModalOpen(false)} style={styles.cancelBtn} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 },
  headerActions: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  emptyHint: { fontSize: 13, marginBottom: 12, fontWeight: '500' },
  card: { marginBottom: 10 },
  cardInner: { padding: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800' },
  position: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  meta: { fontSize: 11, marginTop: 2 },
  supervisor: { fontSize: 11, marginTop: 4, fontWeight: '600' },
  editIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  editBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  assignText: { fontSize: 12, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { borderRadius: 16, padding: 16, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSubtitle: { fontSize: 13, marginTop: 4, marginBottom: 12 },
  modalList: { maxHeight: 320, marginBottom: 12 },
  modalOption: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  modalOptionText: { fontSize: 14, fontWeight: '700' },
  modalOptionMeta: { fontSize: 12, marginTop: 2 },
  fieldGroup: { marginBottom: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 0.4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  cancelBtn: { marginTop: 8 },
});
