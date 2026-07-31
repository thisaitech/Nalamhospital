import {
  eachDayOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
} from 'date-fns';

import type {
  AttendanceRecord,
  AttendanceSummary,
  Employee,
  LeaveRequest,
  ShiftAssignment,
} from '@/types/employee';

function isApprovedLeaveOnDate(requests: LeaveRequest[], employeeId: string, date: string): boolean {
  return requests.some(
    (r) =>
      r.employeeId === employeeId &&
      r.status === 'approved' &&
      date >= r.startDate &&
      date <= r.endDate
  );
}

export function summarizeAttendanceForPeriod(
  employee: Employee,
  attendance: AttendanceRecord[],
  leaveRequests: LeaveRequest[],
  shifts: ShiftAssignment[],
  fromDate: string,
  toDate: string
): AttendanceSummary {
  const records = attendance.filter(
    (r) => r.employeeId === employee.employeeId && r.date >= fromDate && r.date <= toDate
  );
  const empShifts = shifts.filter(
    (s) => s.employeeId === employee.employeeId && s.date >= fromDate && s.date <= toDate
  );

  const attendedHours = records.reduce((sum, r) => sum + (r.hoursWorked || 0), 0);
  const otHours = records.reduce((sum, r) => sum + (r.otHours || 0), 0);

  // Scheduled hours from shift assignments in range; fall back to recorded scheduledHours
  const scheduledFromShifts = empShifts.reduce((sum, s) => {
    const start = s.startTime;
    const end = s.endTime;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins <= 0) mins += 24 * 60;
    return sum + mins / 60;
  }, 0);

  const scheduledHours =
    scheduledFromShifts > 0
      ? Math.round(scheduledFromShifts * 10) / 10
      : records.reduce((sum, r) => sum + (r.scheduledHours || 0), 0);

  // Absent = scheduled day with no punch and not on approved leave
  const scheduledDates = new Set(empShifts.map((s) => s.date));
  let absentDays = 0;
  for (const date of scheduledDates) {
    if (isApprovedLeaveOnDate(leaveRequests, employee.employeeId, date)) continue;
    const record = records.find((r) => r.date === date);
    if (!record?.punchIn) {
      absentDays += 1;
    }
  }

  return {
    employeeId: employee.employeeId,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    staffCategory: employee.staffCategory ?? 'staff',
    scheduledHours,
    attendedHours: Math.round(attendedHours * 10) / 10,
    absentDays,
    otHours: Math.round(otHours * 10) / 10,
  };
}

export function monthDateRange(year: number, monthIndex: number): { fromDate: string; toDate: string } {
  const start = startOfMonth(new Date(year, monthIndex, 1));
  const end = endOfMonth(start);
  return {
    fromDate: format(start, 'yyyy-MM-dd'),
    toDate: format(end, 'yyyy-MM-dd'),
  };
}

export function datesInRange(fromDate: string, toDate: string): string[] {
  return eachDayOfInterval({ start: parseISO(fromDate), end: parseISO(toDate) }).map((d) =>
    format(d, 'yyyy-MM-dd')
  );
}
