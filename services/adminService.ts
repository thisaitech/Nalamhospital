import { findEmployeeById, getEmployeeDisplayName, loadEmployees } from '@/services/employeeRegistry';
import {
  loadAllAttendance,
  loadLeaveBalancesMap,
  loadLeaveRequests,
  saveAttendanceRecords,
  saveLeaveBalancesMap,
  saveLeaveRequests,
} from '@/services/firestoreRepository';
import { adminInsertLeave } from '@/services/employeeService';
import { normalizeLeaveType } from '@/utils/clinicLeave';
import type {
  AttendanceRecord,
  Employee,
  LeaveRequest,
  LeaveStatus,
} from '@/types/employee';

export interface EnrichedAttendanceApproval extends AttendanceRecord {
  employeeName: string;
  department: string;
}

async function syncLeaveBalancesForEmployee(employeeId: string): Promise<void> {
  const [map, requests] = await Promise.all([
    loadLeaveBalancesMap(),
    loadLeaveRequests(employeeId),
  ]);
  const balances = map[employeeId];
  if (!balances?.length) return;

  const synced = balances.map((balance) => {
    const bucket = balance.type === 'paid' || balance.type === 'annual' ? 'paid' : balance.type === 'unpaid' ? 'unpaid' : balance.type;
    const approvedDays = requests
      .filter((request) => {
        const normalized = normalizeLeaveType(request.type);
        if (bucket === 'paid') return normalized === 'paid' && request.status === 'approved';
        if (bucket === 'unpaid') return normalized === 'unpaid' && request.status === 'approved';
        return request.type === balance.type && request.status === 'approved';
      })
      .reduce((sum, request) => sum + request.days, 0);

    if (balance.type === 'unpaid') {
      return { ...balance, used: approvedDays, remaining: 0, total: 0 };
    }

    return {
      ...balance,
      used: approvedDays,
      remaining: Math.max(0, balance.total - approvedDays),
    };
  });

  await saveLeaveBalancesMap({ [employeeId]: synced });
}

function countDoctors(employees: Employee[]): number {
  return employees.filter((e) => e.staffCategory === 'doctor').length;
}

function countStaff(employees: Employee[]): number {
  return employees.filter((e) => e.staffCategory !== 'doctor').length;
}

export async function getAllLeaveRequests(): Promise<LeaveRequest[]> {
  return loadLeaveRequests();
}

export async function getPendingLeaveApprovals(): Promise<LeaveRequest[]> {
  const all = await getAllLeaveRequests();
  return all.filter((r) => r.status === 'pending');
}

/** @deprecated Use getPendingLeaveApprovals */
export async function getPendingApprovals(): Promise<LeaveRequest[]> {
  return getPendingLeaveApprovals();
}

export async function getPendingAttendanceApprovals(): Promise<AttendanceRecord[]> {
  const all = await loadAllAttendance();
  return all.filter((record) => record.manualApprovalStatus === 'pending');
}

export async function reviewLeaveRequest(
  requestId: string,
  status: Exclude<LeaveStatus, 'pending'>,
  reviewedBy: string
): Promise<LeaveRequest> {
  const all = await getAllLeaveRequests();
  const target = all.find((r) => r.id === requestId);
  if (!target) {
    throw new Error('Leave request not found');
  }
  if (target.status !== 'pending') {
    throw new Error('Request already reviewed');
  }
  const updated: LeaveRequest = {
    ...target,
    status,
    reviewedAt: new Date().toISOString(),
    reviewedBy,
  };
  await saveLeaveRequests([updated]);
  if (status === 'approved') {
    await syncLeaveBalancesForEmployee(target.employeeId);
  }
  return updated;
}

export async function insertLeaveForEmployee(params: {
  employeeId: string;
  date: string;
  reason: string;
  reviewedBy: string;
}): Promise<LeaveRequest> {
  const request = await adminInsertLeave(params);
  await syncLeaveBalancesForEmployee(params.employeeId);
  return request;
}

export async function reviewAttendanceApproval(
  recordId: string,
  approved: boolean,
  _reviewedBy: string
): Promise<AttendanceRecord> {
  const all = await loadAllAttendance();
  const target = all.find((record) => record.id === recordId);
  if (!target) {
    throw new Error('Attendance record not found');
  }
  if (target.manualApprovalStatus !== 'pending') {
    throw new Error('Attendance already reviewed');
  }

  const updated: AttendanceRecord = {
    ...target,
    manualApprovalStatus: approved ? 'approved' : 'rejected',
    status: approved ? 'present' : 'absent',
    punchIn: approved ? target.punchIn : null,
    punchInMethod: approved ? target.punchInMethod : null,
  };
  await saveAttendanceRecords([updated]);
  return updated;
}

export async function getAdminStats() {
  const [employees, pendingLeave, pendingAttendance] = await Promise.all([
    loadEmployees(),
    getPendingLeaveApprovals(),
    getPendingAttendanceApprovals(),
  ]);
  return {
    totalEmployees: employees.length,
    totalSupervisors: countDoctors(employees),
    pendingApprovals: pendingLeave.length + pendingAttendance.length,
    departments: countStaff(employees),
  };
}

export async function enrichLeaveRequest(request: LeaveRequest) {
  const employee = await findEmployeeById(request.employeeId);
  return {
    ...request,
    employeeName: employee ? getEmployeeDisplayName(employee) : request.employeeId,
    department: employee?.department ?? '—',
    supervisor: employee?.manager ?? '—',
    staffCategory: employee?.staffCategory ?? 'staff',
  };
}

export async function enrichAttendanceApproval(record: AttendanceRecord): Promise<EnrichedAttendanceApproval> {
  const employee = await findEmployeeById(record.employeeId);
  return {
    ...record,
    employeeName: employee ? getEmployeeDisplayName(employee) : record.employeeId,
    department: employee?.department ?? '—',
  };
}
