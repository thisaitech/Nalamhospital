export type PunchMethod = 'wifi' | 'manual';

/** Clinic personnel category (auth role remains employee | admin). */
export type StaffCategory = 'doctor' | 'staff';

export type ShiftType = 'day' | 'night';

/** Admin-configurable hours used on shift-change days. */
export interface ShiftChangeTimings {
  nightStart: string;
  nightEnd: string;
  dayStart: string;
  dayEnd: string;
}

/** Admin-configurable hours used on normal (non change) days. */
export type NormalShiftTimings = ShiftChangeTimings;

export interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  manager: string;
  joinDate: string;
  avatar?: string;
  address: string;
  emergencyContact: string;
  /** Doctor or staff — drives leave quota and payroll labels. */
  staffCategory: StaffCategory;
  /** Fixed monthly base salary. */
  baseSalary: number;
  /** Transport / bus fare allowance added to monthly pay. */
  busFare: number;
  /** Monthly fixed salary or hourly wage. */
  salaryType?: 'monthly' | 'hourly';
  /** Used when salaryType is hourly. */
  hourlyRate?: number;
  /** Per-employee OT pay multiplier (falls back to clinic rule). */
  otMultiplier?: number;
  /** Whether this person can be scheduled on day shift. */
  dayShiftEnabled: boolean;
  /** Whether this person can be scheduled on night shift. */
  nightShiftEnabled: boolean;
  /** 24-hour continuous duty (uses dayShiftStart/dayShiftEnd as duty window). */
  is24HourDuty?: boolean;
  /** Individual day-shift start (HH:mm). */
  dayShiftStart: string;
  /** Individual day-shift end (HH:mm). */
  dayShiftEnd: string;
  /** Individual night-shift start (HH:mm). */
  nightShiftStart: string;
  /** Individual night-shift end (HH:mm). */
  nightShiftEnd: string;
  /** Split day into two work sessions with a break between them. */
  splitShiftEnabled?: boolean;
  /** Second session start (HH:mm) when splitShiftEnabled. */
  splitSecondShiftStart?: string;
  /** Second session end (HH:mm) when splitShiftEnabled. */
  splitSecondShiftEnd?: string;
  /** Assigned clinic location. */
  clinicId: string;
  /** Cached clinic name for list display. */
  clinicName?: string;
  /** Soft-deleted (archived). Details are kept; hidden from active staff lists. */
  deletedAt?: string | null;
}

/** Admin-assigned shift for a person on a specific date. */
export interface ShiftAssignment {
  id: string;
  employeeId: string;
  date: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  notes?: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  punchIn: string | null;
  punchOut: string | null;
  punchInMethod: PunchMethod | null;
  punchOutMethod: PunchMethod | null;
  wifiSsid: string | null;
  hoursWorked: number;
  /** Hours beyond shift end + 1 hour grace (payable OT). Early punch-in is never OT. */
  otHours: number;
  /** Scheduled working hours for the day from assigned shift(s). */
  scheduledHours: number;
  /**
   * When set, the person continued into another shift after punching out.
   * Punch-out for this segment adds hours into the same day's record (one history row).
   */
  continuePunchIn?: string | null;
  /** Split-shift employee is on break between first and second session. */
  splitShiftOnBreak?: boolean;
  /** Time of first-session punch-out (break start); kept for history after final out. */
  splitShiftBreakAt?: string | null;
  status: 'present' | 'absent' | 'half-day' | 'late' | 'on-leave';
  manualApprovalStatus?: 'pending' | 'approved' | 'rejected';
  shiftType?: ShiftType | 'both' | null;
  /** Minutes late vs scheduled shift start (excluding grace). */
  lateMinutes?: number;
  /** Seconds late vs scheduled shift start (strict, no grace). */
  lateSeconds?: number;
  /** Admin-entered lateness penalty for this day. */
  penaltyAmount?: number;
  /** Admin-entered timing value used with fineMultiplier to set penalty. */
  fineTiming?: number;
  /** Admin-entered multiplication value used with fineTiming to set penalty. */
  fineMultiplier?: number;
  /** True when admin marked this day present (forgot punch). */
  insertedByAdmin?: boolean;
  /** Optional note when admin inserts attendance. */
  adminNote?: string;
  /** GPS at punch-in. */
  punchInLatitude?: number | null;
  punchInLongitude?: number | null;
  punchInAccuracyMeters?: number | null;
  punchInDistanceMeters?: number | null;
  punchInLocationStatus?: 'in_clinic' | 'out_of_clinic' | 'unknown' | null;
  locationApprovalStatus?: 'pending' | 'approved' | 'rejected' | null;
}

/** Paid leave is auto-applied until quota is used; then unpaid. */
export type LeaveType = 'paid' | 'unpaid' | 'annual' | 'sick' | 'personal' | 'compensatory';

export type CompensatoryCreditStatus = 'available' | 'used';

/** Earned when staff completes a continued (second) shift; redeemed as compensatory leave. */
export interface CompensatoryCredit {
  id: string;
  employeeId: string;
  earnedDate: string;
  earnedFromAttendanceId: string;
  status: CompensatoryCreditStatus;
  createdAt: string;
  redeemedOnDate?: string | null;
  redeemedLeaveRequestId?: string | null;
}
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveBalance {
  type: LeaveType;
  total: number;
  used: number;
  remaining: number;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  /** True when admin inserted leave on behalf of the person. */
  insertedByAdmin?: boolean;
  /** Links compensatory leave to the credit that was redeemed. */
  compensatoryCreditId?: string;
  /** Set when staff requests to cancel an approved leave (awaiting admin decision). */
  cancelRequestedAt?: string | null;
}

export interface PerformanceReview {
  id: string;
  employeeId: string;
  period: string;
  rating: number;
  goals: { title: string; completed: boolean }[];
  strengths: string[];
  improvements: string[];
  reviewer: string;
  reviewDate: string;
}

export interface SalarySlip {
  id: string;
  employeeId: string;
  month: string;
  year: number;
  basic: number;
  allowances: number;
  deductions: number;
  netPay: number;
  paymentDate: string;
  status: 'paid' | 'pending';
  /** Breakdown for clinic payroll transparency. */
  attendedHours?: number;
  scheduledHours?: number;
  absentDays?: number;
  unpaidLeaveDays?: number;
  otHours?: number;
  otPay?: number;
  busFare?: number;
  unpaidLeaveDeduction?: number;
  absentDeduction?: number;
  /** Sum of auto late fines for the period. */
  lateFine?: number;
  /** Days with a late punch-in during the month. */
  lateDays?: number;
  /** Total late minutes during the month. */
  lateMinutes?: number;
  /** Late days as a percentage of scheduled shift days. */
  latePercentage?: number;
  /** Admin-entered ₹ per late day used when this payslip was generated. */
  lateDeductionPerDay?: number;
  compensatoryLeaveDays?: number;
  compensatoryAllowance?: number;
}

export interface AttendanceSummary {
  employeeId: string;
  employeeName: string;
  staffCategory: StaffCategory;
  scheduledHours: number;
  attendedHours: number;
  absentDays: number;
  otHours: number;
}

export interface UserCredentials {
  email: string;
  password: string;
}

export type UserRole = 'employee' | 'admin';

export interface AppUser extends UserCredentials {
  role: UserRole;
  employeeId?: string;
  name: string;
}

export interface NewHireInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  supervisorId: string;
  address: string;
  emergencyContact: string;
  joinDate: string;
  tempPassword: string;
  staffCategory: StaffCategory;
  baseSalary: number;
  busFare: number;
  dayShiftEnabled: boolean;
  nightShiftEnabled: boolean;
  dayShiftStart: string;
  dayShiftEnd: string;
  nightShiftStart: string;
  nightShiftEnd: string;
  is24HourDuty?: boolean;
  splitShiftEnabled?: boolean;
  splitSecondShiftStart?: string;
  splitSecondShiftEnd?: string;
  clinicId: string;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

export interface EmployeeProfileUpdate {
  phone: string;
  address: string;
  emergencyContact: string;
  avatar?: string;
}

export interface PersonOnLeave {
  employeeId: string;
  employeeName: string;
  staffCategory: StaffCategory;
  department: string;
  leaveType: LeaveType;
  reason: string;
  /** Set when listing pending/approved applications for a date. */
  leaveStatus?: 'pending' | 'approved';
}
