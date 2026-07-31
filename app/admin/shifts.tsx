import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addDays, format, startOfDay } from 'date-fns';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/SelectField';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { SHIFT_TYPE_OPTIONS } from '@/constants/hrOptions';
import { getEmployeeDisplayName } from '@/services/employeeRegistry';
import type { ShiftAssignment, ShiftType } from '@/types/employee';
import { useColorScheme } from '@/components/useColorScheme';
import { showAlert } from '@/utils/uiAlert';

function buildDateOptions(days = 14) {
  const today = startOfDay(new Date());
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i);
    return {
      value: format(date, 'yyyy-MM-dd'),
      label: format(date, 'EEE, MMM d'),
    };
  });
}

export default function AdminShiftsScreen() {
  const { allEmployees, loadShiftChart, assignShift, deleteShift, refreshData } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const dateOptions = useMemo(() => buildDateOptions(14), []);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0]?.value ?? '');
  const [employeeId, setEmployeeId] = useState('');
  const [shiftType, setShiftType] = useState<ShiftType>('day');
  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);
  const [saving, setSaving] = useState(false);

  const employeeOptions = allEmployees.map((e) => ({
    value: e.employeeId,
    label: `${getEmployeeDisplayName(e)} (${e.staffCategory})`,
  }));

  const load = useCallback(async () => {
    if (!selectedDate) return;
    const from = selectedDate;
    const to = format(addDays(new Date(selectedDate), 6), 'yyyy-MM-dd');
    const data = await loadShiftChart(from, to);
    setShifts(data);
  }, [loadShiftChart, selectedDate]);

  useFocusEffect(
    useCallback(() => {
      load();
      if (!employeeId && allEmployees[0]) setEmployeeId(allEmployees[0].employeeId);
    }, [load, allEmployees, employeeId])
  );

  const dayShifts = shifts.filter((s) => s.date === selectedDate);

  const handleAssign = async () => {
    if (!employeeId || !selectedDate) {
      showAlert('Missing info', 'Select a person and date.');
      return;
    }
    setSaving(true);
    try {
      await assignShift(employeeId, selectedDate, shiftType);
      await load();
      showAlert('Scheduled', 'Shift assignment saved.');
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not assign shift');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await deleteShift(id);
      await load();
      await refreshData();
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not remove shift');
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
      <Text style={[styles.title, { color: colors.text }]}>Shift chart</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Assign Day or Night shifts with each person's own timing
      </Text>

      <SelectField
        label="Date"
        value={selectedDate}
        options={dateOptions}
        onChange={setSelectedDate}
        {...fieldColors}
      />
      <SelectField
        label="Person"
        value={employeeId}
        options={employeeOptions}
        onChange={setEmployeeId}
        {...fieldColors}
      />
      <SelectField
        label="Shift"
        value={shiftType}
        options={SHIFT_TYPE_OPTIONS}
        onChange={(v) => setShiftType(v as ShiftType)}
        {...fieldColors}
      />

      <Button title={saving ? 'Saving...' : 'Assign shift'} onPress={handleAssign} disabled={saving} />

      <Text style={[styles.section, { color: colors.text }]}>
        Schedule for {dateOptions.find((d) => d.value === selectedDate)?.label ?? selectedDate}
      </Text>

      {dayShifts.length === 0 ? (
        <Card>
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No assignments for this day.</Text>
        </Card>
      ) : (
        dayShifts.map((shift) => {
          const emp = allEmployees.find((e) => e.employeeId === shift.employeeId);
          return (
            <Card key={shift.id} style={styles.card}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>
                    {emp ? getEmployeeDisplayName(emp) : shift.employeeId}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    {shift.shiftType.toUpperCase()} · {shift.startTime}–{shift.endTime}
                  </Text>
                </View>
                <Pressable onPress={() => handleRemove(shift.id)}>
                  <Text style={{ color: colors.danger, fontWeight: '700' }}>Remove</Text>
                </Pressable>
              </View>
            </Card>
          );
        })
      )}

      <Text style={[styles.section, { color: colors.text }]}>Next 7 days</Text>
      {shifts.map((shift) => {
        const emp = allEmployees.find((e) => e.employeeId === shift.employeeId);
        return (
          <Card key={`week-${shift.id}`} style={styles.card}>
            <Text style={[styles.name, { color: colors.text }]}>
              {emp ? getEmployeeDisplayName(emp) : shift.employeeId}
            </Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {shift.date} · {shift.shiftType} · {shift.startTime}–{shift.endTime}
            </Text>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 10 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 13, marginBottom: 4 },
  section: { fontSize: 16, fontWeight: '800', marginTop: 12 },
  card: { marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 3 },
  empty: { textAlign: 'center', padding: 12 },
});
