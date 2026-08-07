import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addDays, format, parseISO, startOfDay } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/SelectField';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import { DEFAULT_DAY_SHIFT, DEFAULT_NIGHT_SHIFT, DEFAULT_SHIFT_CHANGE_TIMINGS } from '@/constants/config';
import { buildTimeOptions, SHIFT_TYPE_OPTIONS } from '@/constants/hrOptions';
import { getEmployeeDisplayName, updateEmployeePayrollFields } from '@/services/employeeRegistry';
import { getShiftChangeTimings, saveShiftChangeTimings } from '@/services/shiftService';
import type { Employee, ShiftAssignment, ShiftChangeTimings, ShiftType } from '@/types/employee';
import { useColorScheme } from '@/components/useColorScheme';
import { datesInRange } from '@/utils/attendanceSummary';
import { showAlert, showConfirm } from '@/utils/uiAlert';

function buildDateOptions(days = 21) {
  const today = startOfDay(new Date());
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i);
    return {
      value: format(date, 'yyyy-MM-dd'),
      label: format(date, 'EEE, MMM d'),
    };
  });
}

function currentShiftType(dayEnabled: boolean, nightEnabled: boolean): ShiftType | null {
  if (dayEnabled && !nightEnabled) return 'day';
  if (nightEnabled && !dayEnabled) return 'night';
  return null;
}

/** Role used when bulk-assigning a day mode (supports staff with both shifts enabled). */
function resolveAssignRole(
  emp: Pick<Employee, 'dayShiftEnabled' | 'nightShiftEnabled'>,
  existingForEmployee: ShiftAssignment[]
): ShiftType | null {
  const exclusive = currentShiftType(emp.dayShiftEnabled, emp.nightShiftEnabled);
  if (exclusive) return exclusive;

  if (!emp.dayShiftEnabled && !emp.nightShiftEnabled) return null;

  const existing = existingForEmployee.find((shift) => shift.shiftType === 'day' || shift.shiftType === 'night');
  if (existing) return existing.shiftType;

  return emp.dayShiftEnabled ? 'day' : 'night';
}

export default function AdminShiftsScreen() {
  const {
    allEmployees,
    loadShiftChart,
    assignShift,
    deleteShift,
    refreshData,
    checkShiftChangeDay,
    markShiftChangeDay,
  } = useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const dateOptions = useMemo(() => buildDateOptions(21), []);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0]?.value ?? '');
  const [customRange, setCustomRange] = useState(false);
  const [startDate, setStartDate] = useState(dateOptions[0]?.value ?? '');
  const [endDate, setEndDate] = useState(
    dateOptions[6]?.value ?? dateOptions[0]?.value ?? ''
  );
  const [employeeId, setEmployeeId] = useState('');
  const [shiftType, setShiftType] = useState<ShiftType | ''>('');
  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);
  const [saving, setSaving] = useState(false);
  const [isChangeDay, setIsChangeDay] = useState(false);
  const [pendingChangeDay, setPendingChangeDay] = useState(false);
  const [assigningDayMode, setAssigningDayMode] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [changeTimings, setChangeTimings] = useState<ShiftChangeTimings>({
    ...DEFAULT_SHIFT_CHANGE_TIMINGS,
  });
  const [savingTimings, setSavingTimings] = useState(false);

  const timeOptions = useMemo(() => buildTimeOptions(), []);
  const focusDate = customRange ? startDate : selectedDate;

  const employeeOptions = useMemo(
    () =>
      allEmployees.map((e) => {
        const role = currentShiftType(e.dayShiftEnabled, e.nightShiftEnabled);
        const roleLabel = role === 'day' ? 'Day' : role === 'night' ? 'Night' : 'Mixed';
        return {
          value: e.employeeId,
          label: `${getEmployeeDisplayName(e)} (${roleLabel})`,
        };
      }),
    [allEmployees]
  );

  const assignDates = useMemo(() => {
    if (!customRange) return selectedDate ? [selectedDate] : [];
    if (!startDate || !endDate) return [];
    if (endDate < startDate) return [];
    return datesInRange(startDate, endDate);
  }, [customRange, selectedDate, startDate, endDate]);

  const load = useCallback(async () => {
    if (!focusDate) return;
    const from = customRange ? startDate || focusDate : focusDate;
    const to = customRange
      ? endDate || format(addDays(parseISO(from), 6), 'yyyy-MM-dd')
      : format(addDays(parseISO(focusDate), 6), 'yyyy-MM-dd');
    const chartFrom = from <= to ? from : to;
    const chartTo = from <= to ? to : from;
    const [data, changeDay, timings] = await Promise.all([
      loadShiftChart(chartFrom, chartTo),
      checkShiftChangeDay(focusDate),
      getShiftChangeTimings(),
    ]);
    setShifts(data);
    setIsChangeDay(changeDay);
    setPendingChangeDay(changeDay);
    setChangeTimings(timings);
  }, [loadShiftChart, checkShiftChangeDay, focusDate, customRange, startDate, endDate]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const dayShifts = shifts.filter((s) => s.date === focusDate);

  const applyEmployeeRole = async (
    empId: string,
    next: ShiftType,
    date: string,
    existingAssignments: ShiftAssignment[]
  ) => {
    await updateEmployeePayrollFields(empId, {
      dayShiftEnabled: next === 'day',
      nightShiftEnabled: next === 'night',
      dayShiftStart: DEFAULT_DAY_SHIFT.start,
      dayShiftEnd: DEFAULT_DAY_SHIFT.end,
      nightShiftStart: DEFAULT_NIGHT_SHIFT.start,
      nightShiftEnd: DEFAULT_NIGHT_SHIFT.end,
    });

    const existing = existingAssignments.filter((s) => s.employeeId === empId);
    for (const shift of existing) {
      try {
        await deleteShift(shift.id);
      } catch {
        // Already removed or missing — continue
      }
    }
    await assignShift(empId, date, next);
  };

  const toggleCustomRange = () => {
    if (customRange) {
      setCustomRange(false);
      if (startDate) setSelectedDate(startDate);
      return;
    }
    setCustomRange(true);
    const from = selectedDate || dateOptions[0]?.value || '';
    setStartDate(from);
    const endValue = format(addDays(parseISO(from || format(new Date(), 'yyyy-MM-dd')), 6), 'yyyy-MM-dd');
    const weekEnd = dateOptions.some((d) => d.value === endValue)
      ? endValue
      : dateOptions[Math.min(6, dateOptions.length - 1)]?.value ?? from;
    setEndDate(weekEnd);
  };

  const handleAssignDayMode = async () => {
    if (assignDates.length === 0) {
      showAlert('Missing dates', customRange ? 'Choose a valid start and end date.' : 'Select a date.');
      return;
    }
    if (customRange && endDate < startDate) {
      showAlert('Invalid range', 'End date must be on or after start date.');
      return;
    }

    const modeLabel = pendingChangeDay ? 'Shift Change Day' : 'Normal Day';
    const rangeLabel =
      assignDates.length === 1
        ? dateOptions.find((d) => d.value === assignDates[0])?.label ?? assignDates[0]
        : `${assignDates.length} days (${assignDates[0]} → ${assignDates[assignDates.length - 1]})`;

    const confirmed = await showConfirm(
      'Assign day mode',
      pendingChangeDay
        ? `Apply Shift Change Day for ${rangeLabel}?\nNight ${changeTimings.nightStart}–${changeTimings.nightEnd} · Day ${changeTimings.dayStart}–${changeTimings.dayEnd}`
        : `Apply Normal Day for ${rangeLabel}?\nDay 8 AM–8 PM · Night 8 PM–8 AM`
    );
    if (!confirmed) return;

    setAssigningDayMode(true);
    try {
      let assigned = 0;
      let skipped = 0;
      const chartFrom = assignDates[0];
      const chartTo = assignDates[assignDates.length - 1];
      const rangeShifts = await loadShiftChart(chartFrom, chartTo);

      for (const date of assignDates) {
        await markShiftChangeDay(date, pendingChangeDay);
        const existingForDate = rangeShifts.filter((s) => s.date === date);

        for (const emp of allEmployees) {
          const existingForEmployee = existingForDate.filter((s) => s.employeeId === emp.employeeId);
          const role = resolveAssignRole(emp, existingForEmployee);
          if (!role) {
            skipped += 1;
            continue;
          }
          try {
            for (const shift of existingForEmployee) {
              if (shift.shiftType !== role) {
                try {
                  await deleteShift(shift.id);
                } catch {
                  // continue
                }
              }
            }
            await assignShift(emp.employeeId, date, role);
            assigned += 1;
          } catch {
            skipped += 1;
          }
        }
      }

      await refreshData();
      await load();

      if (assigned === 0) {
        showAlert('Error', `Could not assign ${modeLabel} to any staff.`);
      } else {
        showAlert(
          'Assigned',
          `${modeLabel} applied for ${assignDates.length} day(s). Staff assignments: ${assigned}${
            skipped ? ` · Skipped ${skipped}` : ''
          }.`
        );
      }
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not assign day mode');
    } finally {
      setAssigningDayMode(false);
    }
  };

  const handleChangeShiftAll = async () => {
    if (!focusDate) return;
    const confirmed = await showConfirm(
      'Change Shift',
      'Swap all staff: Day → Night and Night → Day. Continue?'
    );
    if (!confirmed) return;

    setSwapping(true);
    try {
      let updated = 0;
      let skipped = 0;
      const snapshot = [...dayShifts];

      for (const emp of allEmployees) {
        const current = currentShiftType(emp.dayShiftEnabled, emp.nightShiftEnabled);
        if (!current) {
          skipped += 1;
          continue;
        }
        const next: ShiftType = current === 'day' ? 'night' : 'day';
        await applyEmployeeRole(emp.employeeId, next, focusDate, snapshot);
        updated += 1;
      }

      await refreshData();
      await load();

      if (updated === 0) {
        showAlert('No changes', 'No staff had a clear Day or Night role to swap.');
      } else if (skipped > 0) {
        showAlert('Shift changed', `Swapped ${updated} staff. Skipped ${skipped} with mixed roles.`);
      } else {
        showAlert('Shift changed', `Swapped Day ↔ Night for ${updated} staff.`);
      }
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not change shifts');
    } finally {
      setSwapping(false);
    }
  };

  const handleUpdateOneEmployee = async () => {
    if (!employeeId || !shiftType || !focusDate) {
      showAlert('Missing info', 'Select a person and new shift.');
      return;
    }

    const emp = allEmployees.find((e) => e.employeeId === employeeId);
    if (!emp) {
      showAlert('Error', 'Employee not found.');
      return;
    }

    const current = currentShiftType(emp.dayShiftEnabled, emp.nightShiftEnabled);
    if (current === shiftType) {
      showAlert('No change', `This person is already on the ${shiftType} shift.`);
      return;
    }

    setSaving(true);
    try {
      await applyEmployeeRole(employeeId, shiftType, focusDate, dayShifts);
      await refreshData();
      await load();
      showAlert(
        'Updated',
        `${getEmployeeDisplayName(emp)} moved to ${shiftType === 'day' ? 'Day' : 'Night'} shift.`
      );
      setEmployeeId('');
      setShiftType('');
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not update employee shift');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveChangeTimings = async () => {
    setSavingTimings(true);
    try {
      await saveShiftChangeTimings(changeTimings);
      await refreshData();
      await load();
      showAlert('Saved', 'Shift change timings updated for all change days.');
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not save timings');
    } finally {
      setSavingTimings(false);
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

  const scheduleDateLabel =
    dateOptions.find((d) => d.value === focusDate)?.label ?? focusDate;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      {!customRange ? (
        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <SelectField
              label=""
              value={selectedDate}
              options={dateOptions}
              onChange={setSelectedDate}
              placeholder="Date"
              hideLeadingIcon
              {...fieldColors}
            />
          </View>
          <Pressable
            onPress={toggleCustomRange}
            style={[styles.customBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.customBtnText}>Custom</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.customRangeWrap}>
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <SelectField
                label=""
                value={startDate}
                options={dateOptions}
                onChange={(v) => {
                  setStartDate(v);
                  if (endDate && endDate < v) setEndDate(v);
                }}
                placeholder="Start date"
                hideLeadingIcon
                {...fieldColors}
              />
            </View>
            <Pressable
              onPress={toggleCustomRange}
              style={[styles.customBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.customBtnText}>Single</Text>
            </Pressable>
          </View>
          <SelectField
            label=""
            value={endDate}
            options={dateOptions}
            onChange={setEndDate}
            placeholder="End date"
            hideLeadingIcon
            {...fieldColors}
          />
        </View>
      )}

      <Card style={styles.block}>
        <View style={styles.shiftTypeHeader}>
          <Text style={[styles.shiftTypeTitle, { color: colors.text }]}>Shift Type</Text>
          {!pendingChangeDay ? (
            <Pressable
              onPress={handleAssignDayMode}
              disabled={assigningDayMode || allEmployees.length === 0}
              style={[
                styles.assignOutlineBtn,
                {
                  borderColor: colors.primary,
                  opacity: assigningDayMode || allEmployees.length === 0 ? 0.5 : 1,
                },
              ]}
            >
              <Ionicons name="person-add-outline" size={16} color={colors.primary} />
              <Text style={[styles.assignOutlineText, { color: colors.primary }]}>
                {assigningDayMode ? '...' : 'Assign'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.modeTrack, { borderColor: colors.borderLight }]}>
          <Pressable
            onPress={() => setPendingChangeDay(false)}
            disabled={assigningDayMode}
            style={[
              styles.modeOption,
              !pendingChangeDay && {
                borderColor: colors.primary,
                borderWidth: 1.5,
                backgroundColor: `${colors.primary}08`,
              },
            ]}
          >
            <View style={[styles.radioOuter, { borderColor: !pendingChangeDay ? colors.primary : '#CBD5E1' }]}>
              {!pendingChangeDay ? <View style={[styles.radioInner, { backgroundColor: colors.primary }]} /> : null}
            </View>
            <Text style={[styles.modeTitle, { color: !pendingChangeDay ? colors.primary : colors.text }]}>
              Normal Day
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setPendingChangeDay(true)}
            disabled={assigningDayMode}
            style={[
              styles.modeOption,
              pendingChangeDay && {
                borderColor: colors.primary,
                borderWidth: 1.5,
                backgroundColor: `${colors.primary}08`,
              },
            ]}
          >
            <View style={[styles.radioOuter, { borderColor: pendingChangeDay ? colors.primary : '#CBD5E1' }]}>
              {pendingChangeDay ? <View style={[styles.radioInner, { backgroundColor: colors.primary }]} /> : null}
            </View>
            <Text style={[styles.modeTitle, { color: pendingChangeDay ? colors.primary : colors.text }]}>
              Shift Change Day
            </Text>
          </Pressable>
        </View>
      </Card>

      {pendingChangeDay ? (
        <Card style={styles.block}>
          <Text style={[styles.timingsTitle, { color: colors.text }]}>Shift change timings</Text>
          <View style={styles.timingRow}>
            <View style={styles.timingHalf}>
              <SelectField
                label="Night start"
                value={changeTimings.nightStart}
                options={timeOptions}
                onChange={(v) => setChangeTimings((prev) => ({ ...prev, nightStart: v }))}
                compact
                hideLeadingIcon
                {...fieldColors}
              />
            </View>
            <View style={styles.timingHalf}>
              <SelectField
                label="Night end"
                value={changeTimings.nightEnd}
                options={timeOptions}
                onChange={(v) => setChangeTimings((prev) => ({ ...prev, nightEnd: v }))}
                compact
                hideLeadingIcon
                {...fieldColors}
              />
            </View>
          </View>
          <View style={styles.timingRow}>
            <View style={styles.timingHalf}>
              <SelectField
                label="Day start"
                value={changeTimings.dayStart}
                options={timeOptions}
                onChange={(v) => setChangeTimings((prev) => ({ ...prev, dayStart: v }))}
                compact
                hideLeadingIcon
                {...fieldColors}
              />
            </View>
            <View style={styles.timingHalf}>
              <SelectField
                label="Day end"
                value={changeTimings.dayEnd}
                options={timeOptions}
                onChange={(v) => setChangeTimings((prev) => ({ ...prev, dayEnd: v }))}
                compact
                hideLeadingIcon
                {...fieldColors}
              />
            </View>
          </View>
          <View style={styles.timingsActions}>
            <Button
              title={savingTimings ? 'Saving...' : 'Save timings'}
              variant="outline"
              onPress={handleSaveChangeTimings}
              disabled={savingTimings || assigningDayMode}
              style={styles.timingsActionBtn}
            />
            <Pressable
              onPress={handleAssignDayMode}
              disabled={assigningDayMode || savingTimings || allEmployees.length === 0}
              style={[
                styles.assignOutlineBtn,
                styles.timingsActionBtn,
                {
                  borderColor: colors.primary,
                  opacity: assigningDayMode || savingTimings || allEmployees.length === 0 ? 0.5 : 1,
                },
              ]}
            >
              <Ionicons name="person-add-outline" size={16} color={colors.primary} />
              <Text style={[styles.assignOutlineText, { color: colors.primary }]}>
                {assigningDayMode ? '...' : 'Assign'}
              </Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      <Card style={styles.block}>
        <View style={styles.timingRow}>
          <View style={styles.timingHalf}>
            <SelectField
              label=""
              value={employeeId}
              options={employeeOptions}
              onChange={setEmployeeId}
              placeholder="Person"
              hideLeadingIcon
              {...fieldColors}
            />
          </View>
          <View style={styles.timingHalf}>
            <SelectField
              label=""
              value={shiftType}
              options={SHIFT_TYPE_OPTIONS}
              onChange={(v) => setShiftType(v as ShiftType)}
              placeholder="New shift"
              hideLeadingIcon
              {...fieldColors}
            />
          </View>
        </View>
        <Button
          title={saving ? 'Updating...' : 'Update employee shift'}
          onPress={handleUpdateOneEmployee}
          disabled={saving || !employeeId || !shiftType}
        />
      </Card>

      <Card style={styles.block}>
        <View style={styles.scheduleHeader}>
          <View style={styles.scheduleHeaderText}>
            <Text style={[styles.scheduleTitle, { color: colors.text }]}>Today's Schedule</Text>
            <Text style={[styles.scheduleDate, { color: colors.textSecondary }]}>
              {scheduleDateLabel}
              {isChangeDay ? ' · Change day' : ''}
              {customRange && assignDates.length > 1 ? ` · Range ${assignDates.length}d` : ''}
            </Text>
          </View>
          <Pressable
            onPress={handleChangeShiftAll}
            disabled={swapping || allEmployees.length === 0}
            style={[
              styles.changeShiftOutlineBtn,
              {
                borderColor: colors.primary,
                opacity: swapping || allEmployees.length === 0 ? 0.5 : 1,
              },
            ]}
          >
            <Ionicons name="swap-horizontal-outline" size={16} color={colors.primary} />
            <Text style={[styles.changeShiftOutlineText, { color: colors.primary }]}>
              {swapping ? '...' : 'Change Shift'}
            </Text>
          </Pressable>
        </View>

        {dayShifts.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No assignments for this day.</Text>
        ) : (
          dayShifts.map((shift) => {
            const emp = allEmployees.find((e) => e.employeeId === shift.employeeId);
            return (
              <View key={shift.id} style={[styles.scheduleRow, { borderTopColor: colors.borderLight }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>
                    {emp ? getEmployeeDisplayName(emp) : shift.employeeId}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    {shift.shiftType.toUpperCase()} · {shift.startTime}–{shift.endTime}
                    {shift.notes ? ` · ${shift.notes}` : ''}
                  </Text>
                </View>
                <Pressable onPress={() => handleRemove(shift.id)}>
                  <Text style={{ color: colors.danger, fontWeight: '700' }}>Remove</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 12 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateField: { flex: 1 },
  customBtn: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  customRangeWrap: { gap: 10 },
  block: { gap: 12, marginTop: 4 },
  shiftTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  shiftTypeTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  assignOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FFF',
  },
  assignOutlineText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modeTrack: {
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    padding: 6,
  },
  modeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  scheduleHeaderText: {
    flex: 1,
    gap: 2,
  },
  scheduleTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  scheduleDate: {
    fontSize: 13,
    fontWeight: '500',
  },
  changeShiftOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FFF',
  },
  changeShiftOutlineText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modeTitle: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  timingsTitle: { fontSize: 15, fontWeight: '800' },
  timingsActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  timingsActionBtn: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  timingRow: { flexDirection: 'row', gap: 10 },
  timingHalf: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 3 },
  empty: { textAlign: 'center', paddingVertical: 8 },
});
