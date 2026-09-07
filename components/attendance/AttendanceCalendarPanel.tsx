import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  endOfWeek,
} from 'date-fns';

import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/SelectField';
import { StatCard } from '@/components/ui/StatCard';
import Colors from '@/constants/Colors';
import { LEAVE_TYPE_LABELS } from '@/constants/config';
import { getLeaveReasonLabel } from '@/constants/leaveOptions';
import { getEmployeeDisplayName, loadEmployees } from '@/services/employeeRegistry';
import {
  loadAllAttendance,
  loadAttendanceForEmployee,
  loadLeaveRequests,
} from '@/services/firestoreRepository';
import { loadShiftsInRange } from '@/services/shiftService';
import type { AttendanceRecord, Employee, LeaveRequest, ShiftAssignment } from '@/types/employee';
import type { Clinic } from '@/types/clinic';
import { useColorScheme } from '@/components/useColorScheme';
import { formatDisplayTime } from '@/utils/formatTime';
import {
  calcLateMinutes,
  formatHoursMinutes,
  formatMinutesLabel,
  formatRupee,
} from '@/utils/attendanceRules';
import {
  CALENDAR_ALL_PEOPLE,
  categoryLabel,
  clinicSelectOptions,
  getAdminCalendarPeople,
  getAllDoctors,
  getDoctorCalendarPeople,
  isCalendarAllPeople,
  toPersonSelectOptions,
  type CalendarViewType,
} from '@/utils/calendarAccess';
import { normalizeLeaveType } from '@/utils/clinicLeave';

const LATE_DOT = '#EA580C';

type CalendarMode = 'admin' | 'doctor';

type DayMarks = { hasLeave: boolean; hasLate: boolean };

type DayPersonRow =
  | {
      kind: 'leave';
      employeeId: string;
      name: string;
      clinicName?: string;
      leave: LeaveRequest;
    }
  | {
      kind: 'late';
      employeeId: string;
      name: string;
      clinicName?: string;
      record: AttendanceRecord;
      lateMinutes: number;
      shift: ShiftAssignment | null;
    };

interface AttendanceCalendarPanelProps {
  mode: CalendarMode;
  doctorClinicId?: string;
  clinics?: Clinic[];
  defaultClinicId?: string;
  employees?: Employee[];
}

function leaveCoversDate(req: LeaveRequest, dateKey: string): boolean {
  if (req.status === 'rejected') return false;
  if (req.status !== 'approved' && req.status !== 'pending') return false;
  return dateKey >= req.startDate && dateKey <= req.endDate;
}

function lateMinutesForRecord(
  record: AttendanceRecord,
  shifts: ShiftAssignment[]
): number {
  if (!record.punchIn) return 0;
  if (record.lateMinutes != null && record.lateMinutes >= 0) {
    return record.lateMinutes;
  }
  const shift = shifts
    .filter((s) => s.employeeId === record.employeeId && s.date === record.date)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
  if (!shift?.startTime) return 0;
  return calcLateMinutes(record.punchIn, shift.startTime);
}

function marksForDate(
  dateKey: string,
  peopleIds: Set<string>,
  leaves: LeaveRequest[],
  attendance: AttendanceRecord[],
  shifts: ShiftAssignment[]
): DayMarks {
  const hasLeave = leaves.some(
    (req) => peopleIds.has(req.employeeId) && leaveCoversDate(req, dateKey)
  );
  const hasLate = attendance.some((record) => {
    if (!peopleIds.has(record.employeeId) || record.date !== dateKey) return false;
    return lateMinutesForRecord(record, shifts) > 0;
  });
  return { hasLeave, hasLate };
}

export function AttendanceCalendarPanel({
  mode,
  doctorClinicId = '',
  clinics = [],
  defaultClinicId = 'all',
  employees: employeesProp,
}: AttendanceCalendarPanelProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const [employees, setEmployees] = useState<Employee[]>(employeesProp ?? []);
  const [viewType, setViewType] = useState<CalendarViewType>('doctor');
  const [clinicId, setClinicId] = useState(defaultClinicId);
  const [personId, setPersonId] = useState(CALENDAR_ALL_PEOPLE);
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (employeesProp) {
      setEmployees(employeesProp);
      return;
    }
    loadEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, [employeesProp]);

  useEffect(() => {
    setClinicId(defaultClinicId === 'all' || !defaultClinicId ? 'all' : defaultClinicId);
  }, [defaultClinicId]);

  const filterPeople = useMemo(() => {
    if (mode === 'doctor') {
      return getDoctorCalendarPeople(employees, doctorClinicId);
    }
    return getAdminCalendarPeople(employees, viewType, clinicId);
  }, [mode, employees, doctorClinicId, viewType, clinicId]);

  /** People included in overview / selected person scope. */
  const scopePeople = useMemo(() => {
    if (isCalendarAllPeople(personId)) {
      if (mode === 'doctor') return getAllDoctors(employees);
      return filterPeople;
    }
    const one = employees.find((e) => e.employeeId === personId);
    return one ? [one] : [];
  }, [personId, mode, employees, filterPeople]);

  const scopeIds = useMemo(
    () => new Set(scopePeople.map((p) => p.employeeId)),
    [scopePeople]
  );

  const allLabel = useMemo(() => {
    if (mode === 'doctor') return 'All Doctors';
    return viewType === 'doctor' ? 'All Doctors' : 'All Staff';
  }, [mode, viewType]);

  /** Dropdown list: All + people in the current clinic / view filter. */
  const personOptions = useMemo(() => {
    return toPersonSelectOptions(filterPeople, allLabel);
  }, [filterPeople, allLabel]);

  useEffect(() => {
    setPersonId((current) => {
      if (isCalendarAllPeople(current)) return CALENDAR_ALL_PEOPLE;
      if (current && filterPeople.some((p) => p.employeeId === current)) return current;
      return CALENDAR_ALL_PEOPLE;
    });
  }, [filterPeople, viewType, clinicId, mode]);

  const handlePersonChange = (next: string) => {
    setPersonId(next);
  };

  const clinicScopeLabel = useMemo(() => {
    if (mode !== 'admin' || viewType !== 'staff') return '';
    if (clinicId === 'all') return 'All clinics';
    return clinics.find((c) => c.id === clinicId)?.name ?? clinicId;
  }, [mode, viewType, clinicId, clinics]);

  const isAllMode = isCalendarAllPeople(personId);
  const selectedPerson = !isAllMode
    ? employees.find((e) => e.employeeId === personId) ?? null
    : null;

  const loadData = useCallback(async () => {
    if (scopeIds.size === 0) {
      setAttendance([]);
      setLeaves([]);
      setShifts([]);
      return;
    }
    setLoading(true);
    try {
      const from = format(startOfMonth(addMonths(monthCursor, -1)), 'yyyy-MM-dd');
      const to = format(endOfMonth(addMonths(monthCursor, 2)), 'yyyy-MM-dd');

      if (isAllMode) {
        const [allAtt, allLeaves, shiftList] = await Promise.all([
          loadAllAttendance(),
          loadLeaveRequests(),
          loadShiftsInRange(from, to),
        ]);
        setAttendance(allAtt.filter((r) => scopeIds.has(r.employeeId)));
        setLeaves(allLeaves.filter((r) => scopeIds.has(r.employeeId)));
        setShifts(shiftList.filter((s) => scopeIds.has(s.employeeId)));
      } else {
        const id = personId;
        const [att, leaveList, shiftList] = await Promise.all([
          loadAttendanceForEmployee(id),
          loadLeaveRequests(id),
          loadShiftsInRange(from, to, id),
        ]);
        setAttendance(att);
        setLeaves(leaveList);
        setShifts(shiftList);
      }
    } finally {
      setLoading(false);
    }
  }, [scopeIds, isAllMode, personId, monthCursor]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const monthKey = format(monthCursor, 'yyyy-MM');
  const monthStart = format(startOfMonth(monthCursor), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(monthCursor), 'yyyy-MM-dd');

  const leaveStats = useMemo(() => {
    const approvedPast = leaves.filter(
      (r) => r.status === 'approved' && r.endDate < todayKey
    );
    const thisMonth = leaves.filter(
      (r) =>
        r.status === 'approved' &&
        r.startDate.slice(0, 7) <= monthKey &&
        r.endDate.slice(0, 7) >= monthKey
    );
    const upcoming = leaves.filter(
      (r) =>
        (r.status === 'approved' || r.status === 'pending') && r.startDate >= todayKey
    );
    const totalDays = (list: LeaveRequest[]) => list.reduce((sum, r) => sum + (r.days || 0), 0);

    let lateThisMonth = 0;
    for (const record of attendance) {
      if (record.date < monthStart || record.date > monthEnd) continue;
      if (lateMinutesForRecord(record, shifts) > 0) lateThisMonth += 1;
    }

    return {
      totalTaken: totalDays(approvedPast) || approvedPast.length,
      thisMonth: totalDays(thisMonth) || thisMonth.length,
      lateThisMonth,
      upcoming: upcoming.length,
      history: approvedPast.slice().sort((a, b) => b.startDate.localeCompare(a.startDate)),
      upcomingList: upcoming.slice().sort((a, b) => a.startDate.localeCompare(b.startDate)),
    };
  }, [leaves, attendance, shifts, todayKey, monthKey, monthStart, monthEnd]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [monthCursor]);

  const selectedDayRows = useMemo((): DayPersonRow[] => {
    const empMap = new Map(scopePeople.map((e) => [e.employeeId, e]));
    const rows: DayPersonRow[] = [];

    for (const req of leaves) {
      if (!scopeIds.has(req.employeeId) || !leaveCoversDate(req, selectedDate)) continue;
      const emp = empMap.get(req.employeeId);
      rows.push({
        kind: 'leave',
        employeeId: req.employeeId,
        name: emp ? getEmployeeDisplayName(emp) : req.employeeId,
        clinicName: emp?.clinicName,
        leave: req,
      });
    }

    for (const record of attendance) {
      if (record.employeeId && record.date === selectedDate && scopeIds.has(record.employeeId)) {
        const mins = lateMinutesForRecord(record, shifts);
        if (mins <= 0) continue;
        const emp = empMap.get(record.employeeId);
        const shift =
          shifts
            .filter((s) => s.employeeId === record.employeeId && s.date === selectedDate)
            .sort((a, b) => a.startTime.localeCompare(b.startTime))[0] ?? null;
        rows.push({
          kind: 'late',
          employeeId: record.employeeId,
          name: emp ? getEmployeeDisplayName(emp) : record.employeeId,
          clinicName: emp?.clinicName,
          record,
          lateMinutes: mins,
          shift,
        });
      }
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
  }, [leaves, attendance, shifts, selectedDate, scopeIds, scopePeople]);

  const selectedMarks = marksForDate(selectedDate, scopeIds, leaves, attendance, shifts);

  const fieldColors = {
    textColor: colors.text,
    mutedColor: colors.textMuted,
    borderColor: colors.borderLight,
    cardColor: colors.card,
    dangerColor: colors.danger,
    primaryColor: colors.primary,
  };

  return (
    <View>
      {mode === 'admin' ? (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>VIEW TYPE</Text>
          <View style={styles.radioRow}>
            {(['doctor', 'staff'] as CalendarViewType[]).map((type) => {
              const active = viewType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => setViewType(type)}
                  style={[
                    styles.radioChip,
                    {
                      backgroundColor: active ? colors.primaryLight : colors.card,
                      borderColor: active ? colors.primary : colors.borderLight,
                    },
                  ]}
                >
                  <Text style={{ color: active ? colors.primary : colors.text, fontWeight: '700' }}>
                    {type === 'doctor' ? 'Doctors' : 'Staff'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {viewType === 'staff' ? (
            <SelectField
              label="Select Clinic"
              value={clinicId}
              onChange={setClinicId}
              options={clinicSelectOptions(clinics)}
              compact
              hideLeadingIcon
              {...fieldColors}
            />
          ) : null}

          <SelectField
            label={viewType === 'doctor' ? 'Select Doctor' : 'Select Staff'}
            value={personId}
            onChange={handlePersonChange}
            options={personOptions}
            placeholder="Select person"
            compact
            hideLeadingIcon
            {...fieldColors}
          />
        </>
      ) : (
        <>
          <SelectField
            label="People"
            value={personId}
            onChange={setPersonId}
            options={personOptions}
            placeholder="Select person"
            compact
            hideLeadingIcon
            {...fieldColors}
          />
        </>
      )}

      <View style={styles.statsRow}>
        <StatCard label="Total Leave Taken" value={String(leaveStats.totalTaken)} accent="#DC2626" compact centered />
        <StatCard label="This Month Leave" value={String(leaveStats.thisMonth)} accent="#B45309" compact centered />
        <StatCard label="Late This Month" value={String(leaveStats.lateThisMonth)} accent={LATE_DOT} compact centered />
      </View>

      <Card style={styles.calendarCard}>
        <View style={styles.monthHeader}>
          <Pressable onPress={() => setMonthCursor((m) => addMonths(m, -1))} hitSlop={8}>
            <Text style={[styles.monthNav, { color: colors.primary }]}>‹</Text>
          </Pressable>
          <Text style={[styles.monthTitle, { color: colors.text }]}>
            {format(monthCursor, 'MMMM yyyy')}
          </Text>
          <Pressable onPress={() => setMonthCursor((m) => addMonths(m, 1))} hitSlop={8}>
            <Text style={[styles.monthNav, { color: colors.primary }]}>›</Text>
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <Text key={`${d}-${i}`} style={[styles.weekLabel, { color: colors.textMuted }]}>
              {d}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {calendarDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const inMonth = isSameMonth(day, monthCursor);
            const marks = marksForDate(key, scopeIds, leaves, attendance, shifts);
            const selected = key === selectedDate;
            return (
              <Pressable
                key={key}
                onPress={() => setSelectedDate(key)}
                style={[
                  styles.dayCell,
                  selected && { backgroundColor: colors.primaryLight, borderRadius: 10 },
                ]}
              >
                <Text
                  style={[
                    styles.dayNum,
                    {
                      color: inMonth ? colors.text : colors.textMuted,
                      opacity: inMonth ? 1 : 0.45,
                      fontWeight: selected ? '800' : '600',
                    },
                  ]}
                >
                  {format(day, 'd')}
                </Text>
                <View style={styles.dotsRow}>
                  {inMonth && marks.hasLeave ? (
                    <View style={[styles.dot, { backgroundColor: colors.danger }]} />
                  ) : null}
                  {inMonth && marks.hasLate ? (
                    <View style={[styles.dot, { backgroundColor: LATE_DOT }]} />
                  ) : null}
                  {inMonth && !marks.hasLeave && !marks.hasLate ? (
                    <View style={[styles.dot, { backgroundColor: 'transparent' }]} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.legendRow}>
          <Legend color={colors.danger} label="Leave" textColor={colors.textMuted} />
          <Legend color={LATE_DOT} label="Late" textColor={colors.textMuted} />
        </View>
      </Card>

      <Card
        style={[
          styles.detailCard,
          {
            borderColor: selectedMarks.hasLeave
              ? colors.danger
              : selectedMarks.hasLate
                ? LATE_DOT
                : colors.borderLight,
          },
        ]}
      >
        <Text style={[styles.detailDate, { color: colors.text }]}>
          {format(parseISO(selectedDate), 'EEE, MMM d, yyyy')}
          {isAllMode
            ? ` · ${allLabel}${clinicScopeLabel ? ` · ${clinicScopeLabel}` : ''}`
            : ''}
        </Text>
        {loading ? (
          <Text style={{ color: colors.textMuted }}>Loading…</Text>
        ) : selectedDayRows.length === 0 ? (
          <Text style={[styles.detailMeta, { color: colors.textSecondary }]}>
            No leave or late on this date.
          </Text>
        ) : (
          selectedDayRows.map((row) => (
            <View key={`${row.kind}-${row.employeeId}-${row.kind === 'leave' ? row.leave.id : row.record.id}`} style={styles.detailBlock}>
              <Text
                style={[
                  styles.detailStatus,
                  { color: row.kind === 'leave' ? colors.danger : LATE_DOT },
                ]}
              >
                {row.kind === 'leave' ? 'Leave' : 'Late'} · {row.name}
                {row.clinicName ? ` · ${row.clinicName}` : ''}
              </Text>
              {row.kind === 'leave' ? (
                <Text style={[styles.detailMeta, { color: colors.textSecondary }]}>
                  {LEAVE_TYPE_LABELS[normalizeLeaveType(row.leave.type)] ?? row.leave.type} ·{' '}
                  {row.leave.status}
                  {getLeaveReasonLabel(row.leave.reason)
                    ? ` · ${getLeaveReasonLabel(row.leave.reason)}`
                    : ''}
                </Text>
              ) : (
                <>
                  <Text style={[styles.detailMeta, { color: colors.textSecondary }]}>
                    Late {formatMinutesLabel(row.lateMinutes)}
                    {row.shift
                      ? ` · Shift ${formatDisplayTime(row.shift.startTime)}–${formatDisplayTime(row.shift.endTime)}`
                      : ''}
                  </Text>
                  <Text style={[styles.detailMeta, { color: colors.textSecondary }]}>
                    In {formatDisplayTime(row.record.punchIn)} · Out{' '}
                    {row.record.punchOut ? formatDisplayTime(row.record.punchOut) : 'Still punched in'}
                    {' · '}Worked {formatHoursMinutes(row.record.hoursWorked || 0)}
                  </Text>
                  {(row.record.penaltyAmount ?? 0) > 0 ? (
                    <Text style={[styles.detailMeta, { color: colors.warning }]}>
                      Late Fine: {formatRupee(row.record.penaltyAmount ?? 0)}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          ))
        )}
        {selectedPerson ? (
          <Text style={[styles.personTag, { color: colors.textMuted }]}>
            {getEmployeeDisplayName(selectedPerson)} · {categoryLabel(selectedPerson.staffCategory)}
            {selectedPerson.clinicName ? ` · ${selectedPerson.clinicName}` : ''}
          </Text>
        ) : null}
      </Card>

      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: colors.text }]}>Leave History</Text>
      </View>
      {leaveStats.history.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>No past approved leave.</Text>
      ) : (
        leaveStats.history.slice(0, isAllMode ? 10 : 5).map((item) => {
          const emp = employees.find((e) => e.employeeId === item.employeeId);
          return (
            <Card key={item.id} style={styles.listCard}>
              <Text style={[styles.listName, { color: colors.text }]}>
                {isAllMode && emp ? `${getEmployeeDisplayName(emp)} · ` : ''}
                {format(parseISO(item.startDate), 'MMM d')}
                {item.endDate !== item.startDate
                  ? ` – ${format(parseISO(item.endDate), 'MMM d')}`
                  : ''}
              </Text>
              <Text style={[styles.listMeta, { color: colors.textSecondary }]}>
                {LEAVE_TYPE_LABELS[normalizeLeaveType(item.type)] ?? item.type} · {item.days} day(s)
              </Text>
            </Card>
          );
        })
      )}

      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: colors.text }]}>Upcoming Leaves</Text>
      </View>
      {leaveStats.upcomingList.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>No upcoming leave.</Text>
      ) : (
        leaveStats.upcomingList.slice(0, isAllMode ? 10 : 5).map((item) => {
          const emp = employees.find((e) => e.employeeId === item.employeeId);
          return (
            <Card key={item.id} style={styles.listCard}>
              <Text style={[styles.listName, { color: colors.text }]}>
                {isAllMode && emp ? `${getEmployeeDisplayName(emp)} · ` : ''}
                {format(parseISO(item.startDate), 'MMM d')}
                {item.endDate !== item.startDate
                  ? ` – ${format(parseISO(item.endDate), 'MMM d')}`
                  : ''}
              </Text>
              <Text style={[styles.listMeta, { color: colors.textSecondary }]}>
                {item.status} · {LEAVE_TYPE_LABELS[normalizeLeaveType(item.type)] ?? item.type}
              </Text>
            </Card>
          );
        })
      )}
    </View>
  );
}

function Legend({
  color,
  label,
  textColor,
}: {
  color: string;
  label: string;
  textColor: string;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6 },
  radioRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  radioChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  calendarCard: { marginBottom: 12, padding: 12 },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  monthTitle: { fontSize: 16, fontWeight: '800' },
  monthNav: { fontSize: 28, fontWeight: '300', paddingHorizontal: 8 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.285%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dayNum: { fontSize: 13 },
  dotsRow: { flexDirection: 'row', gap: 3, marginTop: 3, minHeight: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '600' },
  detailCard: { marginBottom: 14, borderWidth: 1.5, padding: 12 },
  detailDate: { fontSize: 15, fontWeight: '800', marginBottom: 6 },
  detailBlock: { marginBottom: 10 },
  detailStatus: { fontSize: 14, fontWeight: '700' },
  detailMeta: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  personTag: { fontSize: 11, marginTop: 8, fontWeight: '600' },
  listHeader: { marginBottom: 6, marginTop: 4 },
  listTitle: { fontSize: 16, fontWeight: '800' },
  listCard: { marginBottom: 6, padding: 10 },
  listName: { fontSize: 14, fontWeight: '700' },
  listMeta: { fontSize: 12, marginTop: 2 },
  empty: { fontSize: 12, marginBottom: 10 },
});
