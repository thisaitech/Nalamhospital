import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmployeeAvatar } from '@/components/ui/EmployeeAvatar';
import { getEmployeeDisplayName } from '@/services/employeeRegistry';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import type { Employee } from '@/types/employee';
import { useColorScheme } from '@/components/useColorScheme';
import { showAlert } from '@/utils/uiAlert';

export default function AdminEmployeesScreen() {
  const { allEmployees, updateSupervisor, getSupervisors, refreshData } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [supervisors, setSupervisors] = useState<Employee[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [pickerEmployee, setPickerEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    getSupervisors().then(setSupervisors);
  }, [getSupervisors, allEmployees]);

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
          <Text style={[styles.title, { color: colors.text }]}>Employees</Text>
          <Link href="/admin/new-hire" asChild>
            <Button title="+ New hire" size="sm" />
          </Link>
        </View>

        {allEmployees.map((emp) => (
          <Card key={emp.employeeId} style={styles.card} noPadding>
            <View style={styles.cardInner}>
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
                    {emp.employeeId} · {emp.department}
                  </Text>
                  <Text style={[styles.supervisor, { color: colors.primary }]}>
                    {(emp.dayShiftEnabled ? 'Day' : '') +
                      (emp.dayShiftEnabled && emp.nightShiftEnabled ? ' + ' : '') +
                      (emp.nightShiftEnabled ? 'Night' : '')}{' '}
                    · Base ₹{emp.baseSalary?.toLocaleString?.() ?? emp.baseSalary} · Bus ₹{emp.busFare ?? 0}
                  </Text>
                </View>
              </View>
              <Pressable
                style={[styles.assignBtn, { borderColor: colors.borderLight }]}
                onPress={() => handleAssign(emp)}
                disabled={assigningId === emp.employeeId}
              >
                <Text style={[styles.assignText, { color: colors.primary }]}>Change supervisor</Text>
              </Pressable>
            </View>
          </Card>
        ))}
      </ScrollView>

      <Modal visible={!!pickerEmployee} transparent animationType="fade" onRequestClose={() => setPickerEmployee(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerEmployee(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]} onPress={() => undefined}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Assign supervisor
            </Text>
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
                  <Text style={[styles.modalOptionText, { color: colors.text }]}>
                    {getEmployeeDisplayName(sup)}
                  </Text>
                  <Text style={[styles.modalOptionMeta, { color: colors.textMuted }]}>{sup.position}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Button title="Cancel" variant="outline" onPress={() => setPickerEmployee(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '800' },
  card: { marginBottom: 8, borderRadius: 14 },
  cardInner: { padding: 10 },
  row: { flexDirection: 'row', gap: 8 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700' },
  position: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  meta: { fontSize: 11, marginTop: 2, fontWeight: '500' },
  supervisor: { fontSize: 11, marginTop: 3, fontWeight: '700' },
  assignBtn: { marginTop: 6, paddingVertical: 6, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  assignText: { fontSize: 12, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 16,
    padding: 14,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  modalSubtitle: { fontSize: 12, marginTop: 2, marginBottom: 8 },
  modalList: { maxHeight: 280, marginBottom: 8 },
  modalOption: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
  },
  modalOptionText: { fontSize: 14, fontWeight: '700' },
  modalOptionMeta: { fontSize: 11, marginTop: 1 },
});
