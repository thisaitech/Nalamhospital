import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, format, parseISO, startOfDay, subDays } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/Colors';
import {
  DEFAULT_NORMAL_SHIFT_TIMINGS,
  DEFAULT_SHIFT_CHANGE_TIMINGS,
} from '@/constants/config';
import { buildTimeOptions } from '@/constants/hrOptions';
import { getEmployeeDisplayName, updateEmployeePayrollFields } from '@/services/employeeRegistry';
import {
  getShiftChangeTimings,
  loadShiftsInRange,
  saveShiftChangeTimings,
  setShiftChangeDay,
  upsertShiftAssignment,
} from '@/services/shiftService';
import type { Employee, ShiftChangeTimings, ShiftType } from '@/types/employee';
import { useColorScheme } from '@/components/useColorScheme';
import { filterEmployeesByClinic } from '@/utils/clinicScope';
import { getPunchGpsReading, reverseGeocodePlaceName } from '@/services/locationService';
import type { Clinic, ClinicLocationHistoryEntry } from '@/types/clinic';
import { calcHoursBetween } from '@/utils/shiftHours';
import { showAlert, showConfirm } from '@/utils/uiAlert';

const HISTORY_KEY = '@hospitalhrm/individual_shift_changes';
const MAX_HISTORY = 40;
const PRIMARY = '#4F46E5';
const PRIMARY_SOFT = '#EEF2FF';
const DAY_ACCENT = '#EA580C';
const NIGHT_ACCENT = '#7C3AED';

type ShiftsPageTab = 'shift' | 'clinic';

const SHIFTS_PAGE_TABS: { id: ShiftsPageTab; label: string }[] = [
  { id: 'shift', label: 'Shift' },
  { id: 'clinic', label: 'Clinic' },
];

function ClinicMasterPanel({
  clinics,
  clinicOptions,
  fieldColors,
  colors,
  saveClinicLocationEntry,
  activateClinicLocationEntry,
  deactivateClinicLocationEntry,
  removeClinicLocationEntry,
  adminName,
}: {
  clinics: Clinic[];
  clinicOptions: { value: string; label: string }[];
  fieldColors: {
    labelColor: string;
    textColor: string;
    borderColor: string;
    backgroundColor: string;
    placeholderColor: string;
    mutedColor: string;
    cardColor: string;
    dangerColor: string;
    primaryColor: string;
  };
  colors: (typeof Colors)['light'];
  saveClinicLocationEntry: (
    clinicId: string,
    input: {
      latitude: number;
      longitude: number;
      punchRadiusMeters: number;
      placeName?: string | null;
      savedBy?: string;
      entryId?: string | null;
    }
  ) => Promise<unknown>;
  activateClinicLocationEntry: (clinicId: string, entryId: string) => Promise<unknown>;
  deactivateClinicLocationEntry: (clinicId: string, entryId: string) => Promise<unknown>;
  removeClinicLocationEntry: (clinicId: string, entryId: string) => Promise<unknown>;
  adminName: string | null;
}) {
  const [masterClinicId, setMasterClinicId] = useState(clinics[0]?.id ?? '');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [radius, setRadius] = useState('150');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const syncedClinicIdRef = useRef<string | null>(null);

  const selectedClinic = useMemo(
    () => clinics.find((clinic) => clinic.id === masterClinicId) ?? null,
    [clinics, masterClinicId]
  );

  const locationHistory = useMemo(() => {
    const rows = selectedClinic?.locationHistory ?? [];
    return [...rows].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }, [selectedClinic]);

  const resolvePlaceName = useCallback(async (lat: number, lng: number) => {
    const name = await reverseGeocodePlaceName(lat, lng);
    if (name) {
      setPlaceName(name);
    }
    return name;
  }, []);

  const resetFormFromClinic = useCallback((clinic: Clinic | null) => {
    setEditingEntryId(null);
    if (!clinic) {
      setLatitude('');
      setLongitude('');
      setPlaceName('');
      setRadius('150');
      return;
    }

    const activeEntry =
      clinic.locationHistory?.find(
        (entry) => entry.isActive || entry.id === clinic.activeLocationId
      ) ?? null;

    if (activeEntry) {
      setLatitude(String(activeEntry.latitude));
      setLongitude(String(activeEntry.longitude));
      setPlaceName(activeEntry.placeName?.trim() ?? '');
      setRadius(String(activeEntry.punchRadiusMeters));
      return;
    }

    if (clinic.latitude != null && clinic.longitude != null) {
      setLatitude(String(clinic.latitude));
      setLongitude(String(clinic.longitude));
      setPlaceName('');
      setRadius(String(clinic.punchRadiusMeters ?? 150));
      return;
    }

    setLatitude('');
    setLongitude('');
    setPlaceName('');
    setRadius(String(clinic.punchRadiusMeters ?? 150));
  }, []);

  useEffect(() => {
    if (!masterClinicId && clinics[0]?.id) {
      setMasterClinicId(clinics[0].id);
    }
  }, [clinics, masterClinicId]);

  useEffect(() => {
    if (!masterClinicId) return;
    if (syncedClinicIdRef.current === masterClinicId) return;
    syncedClinicIdRef.current = masterClinicId;
    resetFormFromClinic(selectedClinic);
  }, [masterClinicId, selectedClinic, resetFormFromClinic]);

  const handleClinicChange = (nextId: string) => {
    syncedClinicIdRef.current = nextId;
    setMasterClinicId(nextId);
    const clinic = clinics.find((item) => item.id === nextId) ?? null;
    resetFormFromClinic(clinic);
  };

  useEffect(() => {
    if (!selectedClinic?.locationHistory?.length) return;
    let active = true;
    void (async () => {
      const updates: Record<string, string> = {};
      for (const entry of selectedClinic.locationHistory ?? []) {
        if (entry.placeName?.trim()) continue;
        const name = await reverseGeocodePlaceName(entry.latitude, entry.longitude);
        if (name) updates[entry.id] = name;
      }
      if (active && Object.keys(updates).length) {
        setResolvedNames((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const [id, name] of Object.entries(updates)) {
            if (!next[id]) {
              next[id] = name;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedClinic]);

  const handleUseMyLocation = async () => {
    setLocating(true);
    try {
      const result = await getPunchGpsReading();
      if (!result.ok) {
        showAlert('Location unavailable', result.message);
        return;
      }
      setLatitude(result.reading.latitude.toFixed(6));
      setLongitude(result.reading.longitude.toFixed(6));
      await resolvePlaceName(result.reading.latitude, result.reading.longitude);
    } finally {
      setLocating(false);
    }
  };

  const handleLoadEntry = (entry: ClinicLocationHistoryEntry) => {
    setEditingEntryId(entry.id);
    setLatitude(String(entry.latitude));
    setLongitude(String(entry.longitude));
    setPlaceName(entry.placeName?.trim() || resolvedNames[entry.id] || '');
    setRadius(String(entry.punchRadiusMeters));
  };

  const handleCancelEdit = () => {
    resetFormFromClinic(selectedClinic);
  };

  const handleSave = async () => {
    if (!masterClinicId) {
      showAlert('Select clinic', 'Choose a clinic first.');
      return;
    }

    const punchRadiusMeters = radius.trim() ? Number(radius) : 150;
    const lat = latitude.trim() ? Number(latitude) : NaN;
    const lng = longitude.trim() ? Number(longitude) : NaN;

    if (!latitude.trim() || !longitude.trim() || Number.isNaN(lat) || Number.isNaN(lng)) {
      showAlert('Missing coordinates', 'Enter latitude and longitude, or tap Use my location.');
      return;
    }
    if (Number.isNaN(punchRadiusMeters)) {
      showAlert('Invalid radius', 'Enter a valid punch radius in meters.');
      return;
    }

    setSaving(true);
    try {
      let resolvedName = placeName.trim();
      if (!resolvedName) {
        resolvedName = (await reverseGeocodePlaceName(lat, lng)) ?? '';
      }

      const savedClinic = (await saveClinicLocationEntry(masterClinicId, {
        latitude: lat,
        longitude: lng,
        punchRadiusMeters,
        placeName: resolvedName || null,
        savedBy: adminName ?? 'Admin',
        entryId: editingEntryId,
      })) as Clinic;
      showAlert(
        'Saved',
        editingEntryId
          ? 'Location updated in history and set as active.'
          : 'New location saved and set as active.'
      );
      setEditingEntryId(null);
      setLatitude(String(savedClinic.latitude ?? lat));
      setLongitude(String(savedClinic.longitude ?? lng));
      setPlaceName(
        savedClinic.locationHistory?.find((entry) => entry.isActive)?.placeName?.trim() ||
          resolvedName ||
          ''
      );
      setRadius(String(savedClinic.punchRadiusMeters ?? punchRadiusMeters));
    } catch (error) {
      showAlert('Could not save', error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (entry: ClinicLocationHistoryEntry) => {
    if (!masterClinicId || activatingId || removingId) return;
    setActivatingId(entry.id);
    try {
      if (entry.isActive) {
        await deactivateClinicLocationEntry(masterClinicId, entry.id);
      } else {
        await activateClinicLocationEntry(masterClinicId, entry.id);
      }
      if (editingEntryId === entry.id && entry.isActive) {
        setLatitude('');
        setLongitude('');
      }
    } catch (error) {
      showAlert('Could not update', error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setActivatingId(null);
    }
  };

  const handleRemoveEntry = async (entry: ClinicLocationHistoryEntry) => {
    if (!masterClinicId || removingId) return;
    const confirmed = await showConfirm(
      'Remove saved location',
      `Remove this location from ${selectedClinic?.name ?? 'clinic'} history?`
    );
    if (!confirmed) return;

    setRemovingId(entry.id);
    try {
      await removeClinicLocationEntry(masterClinicId, entry.id);
      if (editingEntryId === entry.id || entry.isActive) {
        setEditingEntryId(null);
        setLatitude('');
        setLongitude('');
        setPlaceName('');
        setRadius('150');
      }
    } catch (error) {
      showAlert('Could not remove', error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setRemovingId(null);
    }
  };

  if (clinics.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyHint}>No clinics found.</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Select clinic</Text>
        <SelectField
          label=""
          value={masterClinicId}
          options={clinicOptions}
          onChange={handleClinicChange}
          placeholder="Select clinic"
          hideLeadingIcon
          {...fieldColors}
        />

        <Text style={styles.fieldLabel}>Location name</Text>
        <TextInput
          value={placeName}
          onChangeText={setPlaceName}
          placeholder="e.g. Thisaiyanvilai, MBC Market"
          placeholderTextColor={colors.textMuted}
          style={[styles.fieldInput, { color: colors.text, borderColor: colors.borderLight }]}
        />

        <Text style={styles.fieldLabel}>Punch radius (meters)</Text>
        <TextInput
          value={radius}
          onChangeText={setRadius}
          placeholder="150"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          style={[styles.fieldInput, { color: colors.text, borderColor: colors.borderLight }]}
        />

        <Text style={styles.fieldLabel}>Latitude</Text>
        <TextInput
          value={latitude}
          onChangeText={setLatitude}
          placeholder="e.g. 11.0168"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          style={[styles.fieldInput, { color: colors.text, borderColor: colors.borderLight }]}
        />

        <Text style={styles.fieldLabel}>Longitude</Text>
        <TextInput
          value={longitude}
          onChangeText={setLongitude}
          placeholder="e.g. 76.9558"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          style={[styles.fieldInput, { color: colors.text, borderColor: colors.borderLight }]}
        />

        <View style={styles.clinicActions}>
          <Button
            title="My location"
            size="sm"
            variant="secondary"
            onPress={handleUseMyLocation}
            loading={locating}
            style={styles.clinicActionBtn}
          />
          <Button
            title={editingEntryId ? 'Update' : 'Save'}
            size="sm"
            onPress={handleSave}
            loading={saving}
            style={styles.clinicActionBtn}
          />
        </View>

        {latitude.trim() && longitude.trim() ? (
          <Text style={styles.locationReadyText}>Location ready · tap Save location</Text>
        ) : null}

        {editingEntryId ? (
          <Pressable onPress={handleCancelEdit} style={styles.cancelEditBtn}>
            <Text style={styles.cancelEditText}>Cancel edit</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.stepTitle}>Saved location history</Text>
        {locationHistory.length === 0 ? (
          <Text style={styles.emptyHint}>No saved locations yet for this clinic.</Text>
        ) : (
          locationHistory.map((entry) => {
            const isEditing = editingEntryId === entry.id;
            const isActive = Boolean(entry.isActive);
            return (
              <View
                key={entry.id}
                style={[
                  styles.locationHistoryRow,
                  isEditing && styles.locationHistoryRowEditing,
                  isActive && styles.locationHistoryRowActive,
                ]}
              >
                <View style={styles.locationHistoryMain}>
                  <View style={styles.locationHistoryInfo}>
                    <Text style={styles.locationHistoryDate}>
                      {entry.placeName?.trim() || resolvedNames[entry.id] || 'Saved location'}
                    </Text>
                    <Text style={styles.locationHistoryMeta}>
                      {format(parseISO(entry.savedAt), 'MMM d, yyyy · h:mm a')} · Radius{' '}
                      {entry.punchRadiusMeters} m
                    </Text>
                  </View>
                  <View style={styles.locationHistoryRight}>
                    <Pressable
                      onPress={() => handleToggleActive(entry)}
                      disabled={activatingId === entry.id}
                      style={styles.locationHistoryStatusBtn}
                      accessibilityLabel={isActive ? 'Mark inactive' : 'Mark active'}
                    >
                      <Ionicons
                        name={isActive ? 'checkmark-circle' : 'ellipse-outline'}
                        size={24}
                        color={isActive ? '#059669' : '#94A3B8'}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => handleLoadEntry(entry)}
                      style={styles.locationHistoryEditBtn}
                      accessibilityLabel="Edit saved location"
                    >
                      <Ionicons name="create-outline" size={20} color={PRIMARY} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleRemoveEntry(entry)}
                      disabled={removingId === entry.id}
                      style={styles.locationHistoryRemoveBtn}
                      accessibilityLabel="Remove saved location"
                    >
                      <Ionicons name="trash-outline" size={20} color="#DC2626" />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </>
  );
}

type ShiftChoice = 'day' | 'night';

type ShiftChangeHistoryItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  clinicId: string;
  previousShift: string;
  newShift: string;
  date: string;
  reason?: string;
  changedAt: string;
};

function buildDateOptions(pastDays = 7, futureDays = 21) {
  const today = startOfDay(new Date());
  return Array.from({ length: pastDays + futureDays + 1 }, (_, i) => {
    const date = addDays(subDays(today, pastDays), i);
    return {
      value: format(date, 'yyyy-MM-dd'),
      label: format(date, 'EEE, MMM d, yyyy'),
    };
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function currentShiftOf(emp: Employee): ShiftChoice | '24h' | null {
  if (emp.is24HourDuty) return '24h';
  if (emp.nightShiftEnabled && !emp.dayShiftEnabled) return 'night';
  if (emp.dayShiftEnabled && !emp.nightShiftEnabled) return 'day';
  if (emp.nightShiftEnabled) return 'night';
  if (emp.dayShiftEnabled) return 'day';
  return null;
}

function shiftLabel(type: ShiftChoice): string {
  return type === 'night' ? 'Night Shift' : 'Day Shift';
}

function staffIdsWithShiftChangeOnDate(
  history: ShiftChangeHistoryItem[],
  date: string
): Set<string> {
  return new Set(
    history.filter((item) => item.date === date).map((item) => item.employeeId)
  );
}

function formatShiftChangeDateLabel(date: string): string {
  return format(parseISO(date), 'EEE, MMM d');
}

async function loadChangeHistory(): Promise<ShiftChangeHistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ShiftChangeHistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveChangeHistory(items: ShiftChangeHistoryItem[]): Promise<void> {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
}

function StepBadge({ n }: { n: number }) {
  return (
    <View style={styles.stepBadge}>
      <Text style={styles.stepBadgeText}>{n}</Text>
    </View>
  );
}

function ShiftBadge({ kind }: { kind: ShiftChoice | '24h' }) {
  if (kind === '24h') {
    return (
      <View style={[styles.shiftBadge, { backgroundColor: '#EEF2FF' }]} accessibilityLabel="24 Hours">
        <Ionicons name="time-outline" size={14} color={PRIMARY} />
      </View>
    );
  }
  if (kind === 'night') {
    return (
      <View style={[styles.shiftBadge, { backgroundColor: '#F3E8FF' }]} accessibilityLabel="Night Shift">
        <Ionicons name="moon" size={14} color={NIGHT_ACCENT} />
      </View>
    );
  }
  return (
    <View style={[styles.shiftBadge, { backgroundColor: '#FFF7ED' }]} accessibilityLabel="Day Shift">
      <Ionicons name="sunny" size={14} color={DAY_ACCENT} />
    </View>
  );
}

export default function AdminShiftsScreen() {
  const { allEmployees, allClinics, selectedClinicId, refreshData, deleteShift, saveClinicLocationEntry, activateClinicLocationEntry, deactivateClinicLocationEntry, removeClinicLocationEntry, adminName } =
    useApp();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [pageTab, setPageTab] = useState<ShiftsPageTab>('shift');

  const dateOptions = useMemo(() => buildDateOptions(7, 21), []);
  const timeOptions = useMemo(() => buildTimeOptions(), []);
  const clinicOptions = useMemo(
    () => allClinics.map((clinic) => ({ value: clinic.id, label: clinic.name })),
    [allClinics]
  );

  const [clinicId, setClinicId] = useState(
    selectedClinicId !== 'all' ? selectedClinicId : allClinics[0]?.id ?? ''
  );
  const [staffSearch, setStaffSearch] = useState('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(startOfDay(new Date()), 'yyyy-MM-dd'));
  const [fromShift, setFromShift] = useState<ShiftChoice>('night');
  const [toShift, setToShift] = useState<ShiftChoice>('day');
  const [startTime, setStartTime] = useState(DEFAULT_SHIFT_CHANGE_TIMINGS.nightStart);
  const [endTime, setEndTime] = useState(DEFAULT_SHIFT_CHANGE_TIMINGS.nightEnd);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ShiftChangeHistoryItem[]>([]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fieldColors = {
    labelColor: colors.textSecondary,
    textColor: colors.text,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    placeholderColor: colors.textMuted,
    mutedColor: colors.textMuted,
    cardColor: colors.card,
    dangerColor: colors.danger,
    primaryColor: colors.primary,
  };

  const clinicStaff = useMemo(() => {
    if (!clinicId) return [];
    return filterEmployeesByClinic(
      allEmployees.filter((e) => !e.deletedAt && !e.is24HourDuty),
      clinicId
    ).sort((a, b) => getEmployeeDisplayName(a).localeCompare(getEmployeeDisplayName(b)));
  }, [allEmployees, clinicId]);

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return clinicStaff;
    return clinicStaff.filter((emp) => {
      const name = getEmployeeDisplayName(emp).toLowerCase();
      const role = (emp.position || '').toLowerCase();
      return name.includes(q) || role.includes(q) || emp.employeeId.toLowerCase().includes(q);
    });
  }, [clinicStaff, staffSearch]);

  const selectedClinicName =
    allClinics.find((c) => c.id === clinicId)?.name ?? (clinicId ? clinicId : '—');

  const totalHours = useMemo(() => calcHoursBetween(startTime, endTime), [startTime, endTime]);

  const staffBlockedForSelectedDate = useMemo(
    () => staffIdsWithShiftChangeOnDate(history, selectedDate),
    [history, selectedDate]
  );

  useEffect(() => {
    setSelectedStaffIds((prev) =>
      prev.filter((id) => !staffBlockedForSelectedDate.has(id))
    );
  }, [staffBlockedForSelectedDate]);

  const fromShiftRef = useRef(fromShift);
  const toShiftRef = useRef(toShift);
  fromShiftRef.current = fromShift;
  toShiftRef.current = toShift;

  const applyDefaultTiming = useCallback((from: ShiftChoice, to: ShiftChoice, timings: ShiftChangeTimings) => {
    if (from === 'night' && to === 'day') {
      setStartTime(timings.nightStart);
      setEndTime(timings.nightEnd);
      return;
    }
    if (from === 'day' && to === 'night') {
      setStartTime(timings.dayStart);
      setEndTime(timings.dayEnd);
      return;
    }
    if (from === 'night') {
      setStartTime(timings.nightStart);
      setEndTime(timings.nightEnd);
      return;
    }
    setStartTime(timings.dayStart);
    setEndTime(timings.dayEnd);
  }, []);

  useEffect(() => {
    if (!clinicId && allClinics[0]?.id) {
      setClinicId(selectedClinicId !== 'all' ? selectedClinicId : allClinics[0].id);
    }
  }, [allClinics, clinicId, selectedClinicId]);

  useEffect(() => {
    let active = true;
    void loadChangeHistory().then((hist) => {
      if (!active) return;
      setHistory(clinicId ? hist.filter((h) => h.clinicId === clinicId) : hist);
    });
    return () => {
      active = false;
    };
  }, [clinicId]);

  // Load saved timings only when entering this screen — not on background data refresh.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void (async () => {
        try {
          const timings = await getShiftChangeTimings();
          if (!active) return;
          applyDefaultTiming(fromShiftRef.current, toShiftRef.current, timings);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [applyDefaultTiming])
  );

  const toggleStaff = (employeeId: string) => {
    if (staffBlockedForSelectedDate.has(employeeId)) {
      const emp = allEmployees.find((e) => e.employeeId === employeeId);
      const name = emp ? getEmployeeDisplayName(emp) : employeeId;
      showAlert(
        'Shift change already exists',
        `${name} already has a shift change on ${formatShiftChangeDateLabel(selectedDate)}. Cancel the existing change in Recent Shift Changes first.`
      );
      return;
    }
    setSelectedStaffIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId]
    );
  };

  const handleClinicChange = (next: string) => {
    setClinicId(next);
    setSelectedStaffIds([]);
    setStaffSearch('');
    void loadChangeHistory().then((hist) => {
      setHistory(next ? hist.filter((h) => h.clinicId === next) : hist);
    });
  };

  const handleFromChange = async (value: string) => {
    const next = value as ShiftChoice;
    setFromShift(next);
    if (next === toShift) {
      setToShift(next === 'night' ? 'day' : 'night');
    }
    const timings = await getShiftChangeTimings();
    applyDefaultTiming(next, next === toShift ? (next === 'night' ? 'day' : 'night') : toShift, timings);
  };

  const handleToChange = async (value: string) => {
    const next = value as ShiftChoice;
    setToShift(next);
    if (next === fromShift) {
      setFromShift(next === 'night' ? 'day' : 'night');
    }
    const timings = await getShiftChangeTimings();
    const from = next === fromShift ? (next === 'night' ? 'day' : 'night') : fromShift;
    applyDefaultTiming(from, next, timings);
  };

  const resetForm = () => {
    setSelectedStaffIds([]);
    setStaffSearch('');
    setFromShift('night');
    setToShift('day');
    setStartTime(DEFAULT_SHIFT_CHANGE_TIMINGS.nightStart);
    setEndTime(DEFAULT_SHIFT_CHANGE_TIMINGS.nightEnd);
    setSelectedDate(format(startOfDay(new Date()), 'yyyy-MM-dd'));
  };

  const handleSave = async () => {
    if (!clinicId) {
      showAlert('Select clinic', 'Choose a clinic first.');
      return;
    }
    if (selectedStaffIds.length === 0) {
      showAlert('Select staff', 'Choose at least one staff member.');
      return;
    }
    if (!selectedDate) {
      showAlert('Select date', 'Choose the shift change date.');
      return;
    }
    if (fromShift === toShift) {
      showAlert('Invalid shift', 'From and To shifts must be different.');
      return;
    }

    const mismatched = selectedStaffIds.filter((id) => {
      const emp = allEmployees.find((e) => e.employeeId === id);
      if (!emp) return true;
      return currentShiftOf(emp) !== fromShift;
    });
    if (mismatched.length) {
      showAlert(
        'Staff mismatch',
        `Select only ${shiftLabel(fromShift)} staff for this change. ${mismatched.length} selected staff do not match.`
      );
      return;
    }

    const allHistory = await loadChangeHistory();
    const dayShifts = await loadShiftsInRange(selectedDate, selectedDate);
    const alreadyChanged = selectedStaffIds.filter((id) => {
      if (allHistory.some((h) => h.employeeId === id && h.date === selectedDate)) {
        return true;
      }
      const assignment = dayShifts.find((s) => s.employeeId === id);
      return assignment?.notes?.startsWith('Changed:') ?? false;
    });
    if (alreadyChanged.length) {
      const names = alreadyChanged.map((id) => {
        const emp = allEmployees.find((e) => e.employeeId === id);
        return emp ? getEmployeeDisplayName(emp) : id;
      });
      const dateLabel = formatShiftChangeDateLabel(selectedDate);
      showAlert(
        'Shift change already exists',
        names.length === 1
          ? `${names[0]} already has a shift change on ${dateLabel}. Only one shift change is allowed per staff per day. Cancel the existing change first.`
          : `These staff already have a shift change on ${dateLabel}: ${names.join(', ')}. Only one shift change is allowed per staff per day. Cancel existing changes first.`
      );
      return;
    }

    const ok = await showConfirm(
      'Save Shift Change',
      `Apply ${shiftLabel(fromShift)} → ${shiftLabel(toShift)} on ${format(
        parseISO(selectedDate),
        'EEE, MMM d'
      )} for ${selectedStaffIds.length} staff?`
    );
    if (!ok) return;

    setSaving(true);
    try {
      const existingTimings = await getShiftChangeTimings();
      const nextTimings: ShiftChangeTimings =
        fromShift === 'night'
          ? { ...existingTimings, nightStart: startTime, nightEnd: endTime }
          : { ...existingTimings, dayStart: startTime, dayEnd: endTime };

      await saveShiftChangeTimings(nextTimings);
      await setShiftChangeDay(selectedDate, true);

      const historyEntries: ShiftChangeHistoryItem[] = [];
      const assignedIds: string[] = [];

      for (const employeeId of selectedStaffIds) {
        const emp = allEmployees.find((e) => e.employeeId === employeeId);
        if (!emp) continue;

        const existing = (await loadShiftsInRange(selectedDate, selectedDate)).filter(
          (s) => s.employeeId === employeeId
        );
        for (const s of existing) {
          try {
            await deleteShift(s.id);
          } catch {
            // continue
          }
        }

        // Change-day window uses the "from" shift role timings; profile flips to "to" after.
        await upsertShiftAssignment({
          employeeId,
          date: selectedDate,
          shiftType: fromShift as ShiftType,
          startTime,
          endTime,
          notes: `Changed: ${shiftLabel(fromShift)} → ${shiftLabel(toShift)}`,
        });

        await updateEmployeePayrollFields(employeeId, {
          is24HourDuty: false,
          dayShiftEnabled: toShift === 'day',
          nightShiftEnabled: toShift === 'night',
          dayShiftStart: DEFAULT_NORMAL_SHIFT_TIMINGS.dayStart,
          dayShiftEnd: DEFAULT_NORMAL_SHIFT_TIMINGS.dayEnd,
          nightShiftStart: DEFAULT_NORMAL_SHIFT_TIMINGS.nightStart,
          nightShiftEnd: DEFAULT_NORMAL_SHIFT_TIMINGS.nightEnd,
        });

        assignedIds.push(employeeId);
        historyEntries.push({
          id: `chg-${Date.now()}-${employeeId}`,
          employeeId,
          employeeName: getEmployeeDisplayName(emp),
          clinicId: emp.clinicId,
          previousShift: shiftLabel(fromShift),
          newShift: shiftLabel(toShift),
          date: selectedDate,
          changedAt: new Date().toISOString(),
        });
      }

      if (assignedIds.length) {
        try {
          const { notifyShiftChangeDay } = await import('@/services/notificationService');
          const dateLabel = format(parseISO(selectedDate), 'EEEE, MMM d');
          await notifyShiftChangeDay({
            date: selectedDate,
            enabled: true,
            employeeIds: assignedIds,
            messageId: `shift-changed-${selectedDate}-${Date.now()}`,
            title: 'Your shift was changed',
            body: `${dateLabel}: ${shiftLabel(fromShift)} → ${shiftLabel(toShift)} (${startTime}–${endTime}). Check Upcoming shifts.`,
          });
        } catch (error) {
          console.warn('[shifts] Could not send shift-change notification', error);
        }
      }

      const nextHistory = [...historyEntries, ...(await loadChangeHistory())].slice(0, MAX_HISTORY);
      await saveChangeHistory(nextHistory);
      setHistory(nextHistory.filter((h) => h.clinicId === clinicId));
      await refreshData();

      showAlert(
        'Shift change saved',
        `${assignedIds.length} staff updated for ${format(parseISO(selectedDate), 'MMM d')}.`
      );
      setSelectedStaffIds([]);
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not save shift change');
    } finally {
      setSaving(false);
    }
  };

  const parseHistoryShift = (label: string): ShiftChoice | null => {
    const lower = label.toLowerCase();
    if (lower.includes('night')) return 'night';
    if (lower.includes('day')) return 'day';
    return null;
  };

  const handleCancelHistory = async (item: ShiftChangeHistoryItem) => {
    if (cancellingId) return;
    const ok = await showConfirm(
      'Cancel shift change',
      `Cancel ${item.employeeName}: ${item.previousShift} → ${item.newShift} on ${format(
        parseISO(item.date),
        'EEE, MMM d'
      )}?`
    );
    if (!ok) return;

    setCancellingId(item.id);
    try {
      const previous = parseHistoryShift(item.previousShift);
      if (previous) {
        await updateEmployeePayrollFields(item.employeeId, {
          is24HourDuty: false,
          dayShiftEnabled: previous === 'day',
          nightShiftEnabled: previous === 'night',
          dayShiftStart: DEFAULT_NORMAL_SHIFT_TIMINGS.dayStart,
          dayShiftEnd: DEFAULT_NORMAL_SHIFT_TIMINGS.dayEnd,
          nightShiftStart: DEFAULT_NORMAL_SHIFT_TIMINGS.nightStart,
          nightShiftEnd: DEFAULT_NORMAL_SHIFT_TIMINGS.nightEnd,
        });
      }

      const existing = (await loadShiftsInRange(item.date, item.date)).filter(
        (s) => s.employeeId === item.employeeId
      );
      for (const s of existing) {
        try {
          await deleteShift(s.id);
        } catch {
          // continue
        }
      }

      if (previous) {
        await upsertShiftAssignment({
          employeeId: item.employeeId,
          date: item.date,
          shiftType: previous,
          startTime:
            previous === 'night'
              ? DEFAULT_NORMAL_SHIFT_TIMINGS.nightStart
              : DEFAULT_NORMAL_SHIFT_TIMINGS.dayStart,
          endTime:
            previous === 'night'
              ? DEFAULT_NORMAL_SHIFT_TIMINGS.nightEnd
              : DEFAULT_NORMAL_SHIFT_TIMINGS.dayEnd,
          notes: 'Shift change cancelled — restored previous shift',
        });
      }

      try {
        const { notifyShiftChangeCancelledByAdmin } = await import('@/services/notificationService');
        const dateLabel = format(parseISO(item.date), 'EEEE, MMM d');
        await notifyShiftChangeCancelledByAdmin({
          employeeId: item.employeeId,
          date: item.date,
          body: `Your shift change on ${dateLabel} was cancelled by admin. Previous shift restored.`,
        });
      } catch (error) {
        console.warn('[shifts] Could not notify shift-change cancel', error);
      }

      const all = await loadChangeHistory();
      const next = all.filter((h) => h.id !== item.id);
      const stillChangeDayForDate = next.some((h) => h.date === item.date);
      if (!stillChangeDayForDate) {
        await setShiftChangeDay(item.date, false);
      }
      await saveChangeHistory(next);
      setHistory(next.filter((h) => !clinicId || h.clinicId === clinicId));
      await refreshData();
      showAlert('Cancelled', `${item.employeeName}'s shift change was cancelled.`);
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not cancel shift change');
    } finally {
      setCancellingId(null);
    }
  };

  const shiftOptions = [
    { value: 'night', label: 'Night Shift' },
    { value: 'day', label: 'Day Shift' },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: '#F8FAFC' }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.pageTabRow, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
        {SHIFTS_PAGE_TABS.map((item) => {
          const active = pageTab === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setPageTab(item.id)}
              style={[
                styles.pageTabBtn,
                {
                  backgroundColor: active ? PRIMARY : 'transparent',
                  borderColor: active ? PRIMARY : 'transparent',
                },
              ]}
            >
              <Text
                style={[styles.pageTabLabel, { color: active ? '#FFFFFF' : colors.text }]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {pageTab === 'clinic' ? (
        <ClinicMasterPanel
          clinics={allClinics}
          clinicOptions={clinicOptions}
          fieldColors={fieldColors}
          colors={colors}
          saveClinicLocationEntry={saveClinicLocationEntry}
          activateClinicLocationEntry={activateClinicLocationEntry}
          deactivateClinicLocationEntry={deactivateClinicLocationEntry}
          removeClinicLocationEntry={removeClinicLocationEntry}
          adminName={adminName}
        />
      ) : null}

      {pageTab === 'shift' ? (
        <>
      {loading ? <ActivityIndicator color={PRIMARY} style={{ marginVertical: 8 }} /> : null}

      {/* Step 1 */}
      <View style={styles.card}>
        <View style={styles.stepHeader}>
          <StepBadge n={1} />
          <Text style={styles.stepTitle}>Select Clinic</Text>
        </View>
        <SelectField
          label=""
          value={clinicId}
          options={clinicOptions}
          onChange={handleClinicChange}
          placeholder="Select clinic"
          hideLeadingIcon
          {...fieldColors}
        />
      </View>

      {/* Step 2 */}
      <View style={styles.card}>
        <View style={styles.stepHeader}>
          <StepBadge n={2} />
          <Text style={styles.stepTitle}>Select Staff</Text>
          {selectedStaffIds.length > 0 ? (
            <Text style={styles.selectedCount}>({selectedStaffIds.length} selected)</Text>
          ) : null}
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={staffSearch}
            onChangeText={setStaffSearch}
            placeholder="Search staff..."
            placeholderTextColor={colors.textMuted}
            style={[
              styles.searchInput,
              { color: colors.text, outline: 'none' } as object,
            ]}
          />
        </View>

        {!clinicId ? (
          <Text style={styles.emptyHint}>Select a clinic to load staff.</Text>
        ) : filteredStaff.length === 0 ? (
          <Text style={styles.emptyHint}>No staff found in this clinic.</Text>
        ) : (
          <ScrollView
            style={styles.staffList}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {filteredStaff.map((emp) => {
              const name = getEmployeeDisplayName(emp);
              const selected = selectedStaffIds.includes(emp.employeeId);
              const alreadyChanged = staffBlockedForSelectedDate.has(emp.employeeId);
              const kind = currentShiftOf(emp);
              return (
                <Pressable
                  key={emp.employeeId}
                  onPress={() => toggleStaff(emp.employeeId)}
                  disabled={alreadyChanged}
                  style={[
                    styles.staffRow,
                    selected && styles.staffRowSelected,
                    alreadyChanged && styles.staffRowBlocked,
                  ]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      selected && { backgroundColor: PRIMARY, borderColor: PRIMARY },
                      alreadyChanged && styles.checkboxBlocked,
                    ]}
                  >
                    {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                  </View>
                  <View style={[styles.avatar, selected && { backgroundColor: PRIMARY_SOFT }]}>
                    <Text style={[styles.avatarText, selected && { color: PRIMARY }]}>
                      {initials(name)}
                    </Text>
                  </View>
                  <View style={styles.staffInfo}>
                    <Text style={styles.staffName} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.staffRole} numberOfLines={1}>
                      {alreadyChanged
                        ? `Shift change already on ${formatShiftChangeDateLabel(selectedDate)}`
                        : emp.position || 'Staff'}
                    </Text>
                  </View>
                  {kind ? <ShiftBadge kind={kind} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Step 3 */}
      <View style={styles.card}>
        <View style={styles.stepHeader}>
          <StepBadge n={3} />
          <Text style={styles.stepTitle}>Choose Date</Text>
        </View>
        <SelectField
          label=""
          value={selectedDate}
          options={dateOptions}
          onChange={setSelectedDate}
          hideLeadingIcon
          {...fieldColors}
        />
      </View>

      {/* Step 4 */}
      <View style={styles.card}>
        <View style={styles.stepHeader}>
          <StepBadge n={4} />
          <Text style={styles.stepTitle}>Shift Change Details</Text>
        </View>
        <View style={styles.shiftChangeRow}>
          <View style={styles.shiftField}>
            <SelectField
              label="From Shift"
              value={fromShift}
              options={shiftOptions}
              onChange={(v) => void handleFromChange(v)}
              compact
              hideLeadingIcon
              {...fieldColors}
            />
          </View>
          <View style={styles.arrowWrap}>
            <Ionicons name="arrow-forward" size={18} color={PRIMARY} />
          </View>
          <View style={styles.shiftField}>
            <SelectField
              label="To Shift"
              value={toShift}
              options={shiftOptions}
              onChange={(v) => void handleToChange(v)}
              compact
              hideLeadingIcon
              {...fieldColors}
            />
          </View>
        </View>
      </View>

      {/* Step 5 */}
      <View style={styles.card}>
        <View style={styles.stepHeader}>
          <StepBadge n={5} />
          <Text style={styles.stepTitle}>Shift Change Timing</Text>
        </View>
        <View style={styles.timingPanel}>
          <View style={styles.timingFields}>
            <View style={styles.timingField}>
              <SelectField
                label="Start Time"
                value={startTime}
                options={timeOptions}
                onChange={setStartTime}
                compact
                hideLeadingIcon
                {...fieldColors}
              />
            </View>
            <View style={styles.timingField}>
              <SelectField
                label="End Time"
                value={endTime}
                options={timeOptions}
                onChange={setEndTime}
                compact
                hideLeadingIcon
                {...fieldColors}
              />
            </View>
          </View>
          <View style={styles.totalCard}>
            <Ionicons name="time-outline" size={18} color={PRIMARY} />
            <Text style={styles.totalLabel}>Total Working Time</Text>
            <Text style={styles.totalValue}>
              {Number.isInteger(totalHours) ? totalHours : totalHours.toFixed(1)} Hrs
            </Text>
          </View>
        </View>
      </View>

      {/* Preview */}
      <View style={styles.card}>
        <View style={styles.previewHeader}>
          <Ionicons name="checkmark-circle" size={20} color="#059669" />
          <Text style={styles.previewTitle}>Preview</Text>
        </View>
        <View style={styles.previewGrid}>
          <View style={styles.previewItem}>
            <Text style={styles.previewLabel}>Clinic</Text>
            <Text style={styles.previewValue} numberOfLines={2}>
              {selectedClinicName}
            </Text>
          </View>
          <View style={styles.previewItem}>
            <Text style={styles.previewLabel}>Staff Selected</Text>
            <Text style={styles.previewValue}>{selectedStaffIds.length} Staff</Text>
          </View>
          <View style={styles.previewItem}>
            <Text style={styles.previewLabel}>Date</Text>
            <Text style={styles.previewValue}>
              {selectedDate ? format(parseISO(selectedDate), 'd MMM yyyy') : '—'}
            </Text>
          </View>
          <View style={styles.previewItem}>
            <Text style={styles.previewLabel}>Shift</Text>
            <Text style={styles.previewValue}>
              {fromShift === 'night' ? 'Night' : 'Day'} → {toShift === 'night' ? 'Night' : 'Day'}
            </Text>
          </View>
          <View style={[styles.previewItem, styles.previewItemWide]}>
            <Text style={styles.previewLabel}>Timing</Text>
            <Text style={styles.previewValue}>
              {startTime} → {endTime}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={resetForm}
          disabled={saving}
          style={[styles.secondaryBtn, saving && styles.btnDisabled]}
        >
          <Text style={styles.secondaryBtnText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => void handleSave()}
          disabled={saving}
          style={[styles.primaryBtn, saving && styles.btnDisabled]}
        >
          <Ionicons name="save-outline" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>{saving ? 'Saving...' : 'Save Shift Change'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.stepHeader}>
          <View style={styles.recentIcon}>
            <Ionicons name="time-outline" size={16} color={PRIMARY} />
          </View>
          <Text style={styles.stepTitle}>Recent Shift Changes</Text>
        </View>

        {history.length === 0 ? (
          <Text style={styles.emptyHint}>No recent shift changes for this clinic.</Text>
        ) : (
          history.slice(0, 15).map((item) => (
            <View key={item.id} style={styles.historyRow}>
              <View style={styles.historyInfo}>
                <Text style={styles.historyName} numberOfLines={1}>
                  {item.employeeName}
                </Text>
                <Text style={styles.historyMeta}>
                  {item.previousShift.replace(' Shift', '')} → {item.newShift.replace(' Shift', '')}
                </Text>
                <Text style={styles.historyDate}>
                  {format(parseISO(item.date), 'EEE, MMM d, yyyy')}
                </Text>
              </View>
              <Pressable
                onPress={() => void handleCancelHistory(item)}
                disabled={cancellingId === item.id || saving}
                style={[
                  styles.historyCancelBtn,
                  (cancellingId === item.id || saving) && styles.btnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cancel shift change"
              >
                <Text style={styles.historyCancelText}>
                  {cancellingId === item.id ? '...' : 'Cancel'}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 14 },
  pageTabRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
    marginBottom: 2,
  },
  pageTabBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  pageTabLabel: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 15,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    gap: 12,
    shadowColor: 'rgba(15, 23, 42, 0.08)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 3,
  },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  stepTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', flexShrink: 1 },
  selectedCount: { fontSize: 13, fontWeight: '700', color: PRIMARY },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  emptyHint: { fontSize: 13, fontWeight: '500', color: '#94A3B8', textAlign: 'center', paddingVertical: 12 },
  staffList: { gap: 8, maxHeight: 320 },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 10,
    backgroundColor: '#FFFFFF',
  },
  staffRowSelected: {
    borderColor: '#C7D2FE',
    backgroundColor: '#F8FAFF',
  },
  staffRowBlocked: {
    opacity: 0.55,
    backgroundColor: '#F8FAFC',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBlocked: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '800', color: '#475569' },
  staffInfo: { flex: 1, minWidth: 0, gap: 2 },
  staffName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  staffRole: { fontSize: 12, fontWeight: '500', color: '#64748B' },
  shiftBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftChangeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  shiftField: { flex: 1, minWidth: 0 },
  arrowWrap: { paddingBottom: 14, paddingHorizontal: 2 },
  timingPanel: {
    backgroundColor: PRIMARY_SOFT,
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  timingFields: { flexDirection: 'row', gap: 10 },
  timingField: { flex: 1, minWidth: 0 },
  totalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  totalLabel: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  totalValue: { fontSize: 18, fontWeight: '800', color: PRIMARY },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 12,
  },
  previewItem: { width: '47%', gap: 2 },
  previewItemWide: { width: '100%' },
  previewLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.3 },
  previewValue: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  secondaryBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: PRIMARY },
  primaryBtn: {
    flex: 1.4,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: PRIMARY,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  btnDisabled: { opacity: 0.6 },
  recentIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: PRIMARY_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  historyInfo: { flex: 1, minWidth: 0, gap: 2 },
  historyName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  historyMeta: { fontSize: 13, fontWeight: '600', color: '#475569' },
  historyDate: { fontSize: 11, fontWeight: '500', color: '#94A3B8', marginTop: 2 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', marginTop: 4 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '500',
    backgroundColor: '#F8FAFC',
  },
  clinicActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  clinicActionBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, minHeight: 38 },
  locationReadyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
    textAlign: 'center',
  },
  cancelEditBtn: { alignSelf: 'center', paddingVertical: 4 },
  cancelEditText: { fontSize: 12, fontWeight: '700', color: PRIMARY },
  locationHistoryRow: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  locationHistoryRowEditing: {
    borderColor: '#C7D2FE',
    backgroundColor: '#F8FAFF',
  },
  locationHistoryRowActive: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  locationHistoryMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  locationHistoryInfo: { flex: 1, gap: 4 },
  locationHistoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  locationHistoryDate: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  activeLocationBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeLocationBadgeText: { fontSize: 10, fontWeight: '800', color: '#166534' },
  locationHistoryMeta: { fontSize: 11, fontWeight: '500', color: '#64748B' },
  locationHistoryStatusBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationHistoryEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PRIMARY_SOFT,
  },
  locationHistoryRemoveBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
  },
  historyCancelBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FEE2E2',
  },
  historyCancelText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
});
