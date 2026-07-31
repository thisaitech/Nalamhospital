export type PunchMethod = 'wifi' | 'manual';

/** Clinic personnel category (auth role remains employee | admin). */
export type StaffCategory = 'doctor' | 'staff';

export type ShiftType = 'day' | 'night';

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
  /** Whether this person can be scheduled on day shift. */
  dayShiftEnabled: boolean;
  /** Whether this person can be scheduled on night shift. */
  nightShiftEnabled: boolean;
  /** Individual day-shift start (HH:mm). */
  dayShiftStart: string;
  /** Individual day-shift end (HH:mm). */
  dayShiftEnd: string;
  /** Individual night-shift start (HH:mm). */
  nightShiftStart: string;
  /** Individual night-shift end (HH:mm). */
  nightShiftEnd: string;
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
  /** Hours beyond shift end + 1 hour grace (payable OT). */
  otHours: number;
  /** Scheduled working hours for the day from assigned shift(s). */
  scheduledHours: number;
  status: 'present' | 'absent' | 'half-day' | 'late' | 'on-leave';
  manualApprovalStatus?: 'pending' | 'approved' | 'rejected';
  shiftType?: ShiftType | 'both' | null;
}

/** Paid leave is auto-applied until quota is used; then unpaid. */
export type LeaveType = 'paid' | 'unpaid' | 'annual' | 'sick' | 'personal';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

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
}
