import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { DEMO_LOGINS } from '@/constants/config';
import {
  enrichAttendanceApproval,
  enrichLeaveRequest,
  getAdminStats,
  getPendingAttendanceApprovals,
  getPendingLeaveApprovals,
  insertLeaveForEmployee,
  reviewAttendanceApproval,
  reviewLeaveRequest,
} from '@/services/adminService';
import { loadChatMessages, sendChatMessage } from '@/services/chatService';
import {
  assignSupervisor,
  createNewHire,
  findEmployeeByEmail,
  getEmployeeDisplayName,
  getSupervisorOptions,
  registerEmployee,
  updateEmployeeProfile,
  loadEmployees,
  loadUsers,
} from '@/services/employeeRegistry';
import {
  getLeaveBalances,
  getLeaveRequests,
  getPeopleOnLeaveToday,
  getSalarySlips,
  loadAttendance,
  punchIn,
  punchOut,
  submitLeaveRequest,
} from '@/services/employeeService';
import { ensureFirestoreSeed, loadAllAttendance, loadLeaveRequests } from '@/services/firestoreRepository';
import { generatePayrollForMonth, loadPayrollSlips } from '@/services/payrollService';
import {
  getUpcomingShifts,
  loadShiftsForDate,
  loadShiftsInRange,
  removeShiftAssignment,
  upsertShiftAssignment,
} from '@/services/shiftService';
import { getItem, removeItem, setItem, storageKeys } from '@/services/storage';
import type { ChatCategory, ChatMessage } from '@/types/chat';
import type {
  AttendanceRecord,
  Employee,
  EmployeeProfileUpdate,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  NewHireInput,
  PersonOnLeave,
  PunchMethod,
  RegisterInput,
  SalarySlip,
  ShiftAssignment,
  ShiftType,
  UserRole,
} from '@/types/employee';
import { monthDateRange, summarizeAttendanceForPeriod } from '@/utils/attendanceSummary';
import type { AttendanceSummary } from '@/types/employee';

interface Session {
  role: UserRole;
  email: string;
  employeeId?: string;
  name: string;
}

export interface EnrichedLeaveRequest extends LeaveRequest {
  employeeName: string;
  department: string;
  supervisor: string;
  staffCategory?: string;
}

export interface EnrichedAttendanceApproval extends AttendanceRecord {
  employeeName: string;
  department: string;
}

interface AppContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  role: UserRole | null;
  isAdmin: boolean;
  employee: Employee | null;
  adminName: string | null;
  attendance: AttendanceRecord[];
  leaveBalances: LeaveBalance[];
  leaveRequests: LeaveRequest[];
  salarySlips: SalarySlip[];
  chatMessages: ChatMessage[];
  allEmployees: Employee[];
  pendingApprovals: EnrichedLeaveRequest[];
  pendingAttendanceApprovals: EnrichedAttendanceApproval[];
  adminStats: { totalEmployees: number; totalSupervisors: number; pendingApprovals: number; departments: number };
  peopleOnLeaveToday: PersonOnLeave[];
  upcomingShifts: ShiftAssignment[];
  todayShifts: ShiftAssignment[];
  login: (email: string, password: string, role: UserRole) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (input: EmployeeProfileUpdate) => Promise<void>;
  refreshData: () => Promise<void>;
  doPunchIn: (method: PunchMethod, wifiSsid?: string | null) => Promise<AttendanceRecord | null>;
  doPunchOut: (method: PunchMethod) => Promise<AttendanceRecord | null>;
  requestLeave: (type: LeaveType | null, startDate: string, endDate: string, reason: string) => Promise<void>;
  sendMessage: (text: string, category?: ChatCategory) => Promise<void>;
  createHire: (input: NewHireInput) => Promise<Employee>;
  updateSupervisor: (employeeId: string, supervisorId: string) => Promise<void>;
  approveLeave: (requestId: string) => Promise<void>;
  rejectLeave: (requestId: string) => Promise<void>;
  approveAttendance: (recordId: string) => Promise<void>;
  rejectAttendance: (recordId: string) => Promise<void>;
  getSupervisors: () => Promise<Employee[]>;
  insertLeave: (employeeId: string, date: string, reason: string) => Promise<void>;
  assignShift: (employeeId: string, date: string, shiftType: ShiftType) => Promise<void>;
  deleteShift: (shiftId: string) => Promise<void>;
  loadShiftChart: (fromDate: string, toDate: string) => Promise<ShiftAssignment[]>;
  getAttendanceSummaries: (year: number, monthIndex: number) => Promise<AttendanceSummary[]>;
  generatePayroll: (year: number, monthIndex: number) => Promise<SalarySlip[]>;
  loadAllPayroll: () => Promise<SalarySlip[]>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [salarySlips, setSalarySlips] = useState<SalarySlip[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<EnrichedLeaveRequest[]>([]);
  const [pendingAttendanceApprovals, setPendingAttendanceApprovals] = useState<EnrichedAttendanceApproval[]>([]);
  const [adminStats, setAdminStats] = useState({
    totalEmployees: 0,
    totalSupervisors: 0,
    pendingApprovals: 0,
    departments: 0,
  });
  const [peopleOnLeaveToday, setPeopleOnLeaveToday] = useState<PersonOnLeave[]>([]);
  const [upcomingShifts, setUpcomingShifts] = useState<ShiftAssignment[]>([]);
  const [todayShifts, setTodayShifts] = useState<ShiftAssignment[]>([]);

  const employeeId = employee?.employeeId ?? '';
  const role = session?.role ?? null;
  const isAdmin = role === 'admin';

  const refreshData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const [messages, onLeave, shiftsToday] = await Promise.all([
      loadChatMessages(),
      getPeopleOnLeaveToday(today),
      loadShiftsForDate(today),
    ]);
    setChatMessages(messages);
    setPeopleOnLeaveToday(onLeave);
    setTodayShifts(shiftsToday);

    if (session?.role === 'admin') {
      const [employees, pendingLeave, pendingAttendance, stats] = await Promise.all([
        loadEmployees(),
        getPendingLeaveApprovals(),
        getPendingAttendanceApprovals(),
        getAdminStats(),
      ]);
      const [enrichedLeave, enrichedAttendance] = await Promise.all([
        Promise.all(pendingLeave.map((r) => enrichLeaveRequest(r))),
        Promise.all(pendingAttendance.map((r) => enrichAttendanceApproval(r))),
      ]);
      setAllEmployees(employees);
      setPendingApprovals(enrichedLeave);
      setPendingAttendanceApprovals(enrichedAttendance);
      setAdminStats(stats);
      return;
    }

    if (employeeId) {
      const [att, leaves, balances, slips, upcoming] = await Promise.all([
        loadAttendance(employeeId),
        getLeaveRequests(employeeId),
        getLeaveBalances(employeeId),
        getSalarySlips(employeeId),
        getUpcomingShifts(employeeId),
      ]);
      setAttendance(att);
      setLeaveRequests(leaves);
      setLeaveBalances(balances);
      setSalarySlips(slips);
      setUpcomingShifts(upcoming);
    }
  }, [employeeId, session?.role]);

  useEffect(() => {
    (async () => {
      try {
        await ensureFirestoreSeed();
        const saved = await getItem<Session>(storageKeys.SESSION);
        if (saved) {
          if (saved.role === 'employee' && saved.email) {
            const emp = await findEmployeeByEmail(saved.email);
            if (!emp) {
              await removeItem(storageKeys.SESSION);
            } else {
              setSession(saved);
              setEmployee(emp);
            }
          } else {
            setSession(saved);
          }
        }
        const messages = await loadChatMessages();
        setChatMessages(messages);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (session) {
      refreshData();
    }
  }, [session, employeeId, refreshData]);

  const login = useCallback(async (email: string, password: string, loginRole: UserRole) => {
    const users = await loadUsers();
    const user = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password && u.role === loginRole
    );
    if (!user) {
      throw new Error(`Invalid ${loginRole} credentials`);
    }

    if (user.role === 'admin') {
      const newSession: Session = { role: 'admin', email: user.email, name: user.name };
      await setItem(storageKeys.SESSION, newSession);
      setSession(newSession);
      setEmployee(null);
      return;
    }

    const emp = await findEmployeeByEmail(user.email);
    if (!emp) {
      throw new Error('Employee record not found');
    }
    const newSession: Session = {
      role: 'employee',
      email: user.email,
      employeeId: user.employeeId,
      name: user.name,
    };
    await setItem(storageKeys.SESSION, newSession);
    setSession(newSession);
    setEmployee(emp);
  }, []);

  const register = useCallback(
    async (input: RegisterInput) => {
      const emp = await registerEmployee(input);
      const newSession: Session = {
        role: 'employee',
        email: emp.email,
        employeeId: emp.employeeId,
        name: getEmployeeDisplayName(emp),
      };
      await setItem(storageKeys.SESSION, newSession);
      setSession(newSession);
      setEmployee(emp);
      await refreshData();
    },
    [refreshData]
  );

  const updateProfile = useCallback(
    async (input: EmployeeProfileUpdate) => {
      if (!employeeId) {
        throw new Error('You must be logged in to update your profile.');
      }
      const updated = await updateEmployeeProfile(employeeId, input);
      setEmployee(updated);
      await refreshData();
    },
    [employeeId, refreshData]
  );

  const logout = useCallback(async () => {
    await removeItem(storageKeys.SESSION);
    setSession(null);
    setEmployee(null);
    setAttendance([]);
    setLeaveRequests([]);
    setLeaveBalances([]);
    setSalarySlips([]);
    setAllEmployees([]);
    setPendingApprovals([]);
    setPendingAttendanceApprovals([]);
    setPeopleOnLeaveToday([]);
    setUpcomingShifts([]);
    setTodayShifts([]);
    setAdminStats({ totalEmployees: 0, totalSupervisors: 0, pendingApprovals: 0, departments: 0 });
  }, []);

  const doPunchIn = useCallback(
    async (method: PunchMethod, wifiSsid: string | null = null) => {
      if (!employeeId) return null;
      const record = await punchIn(employeeId, method, wifiSsid);
      await refreshData();
      return record;
    },
    [employeeId, refreshData]
  );

  const doPunchOut = useCallback(
    async (method: PunchMethod) => {
      if (!employeeId) return null;
      const record = await punchOut(employeeId, method);
      await refreshData();
      return record;
    },
    [employeeId, refreshData]
  );

  const requestLeave = useCallback(
    async (type: LeaveType | null, startDate: string, endDate: string, reason: string) => {
      if (!employeeId) {
        throw new Error('You must be logged in as an employee to submit leave.');
      }
      await submitLeaveRequest(employeeId, type, startDate, endDate, reason);
      await refreshData();
    },
    [employeeId, refreshData]
  );

  const sendMessage = useCallback(
    async (text: string, category: ChatCategory = 'general') => {
      if (!session) return;
      if (employee) {
        const message = await sendChatMessage(
          employee.employeeId,
          getEmployeeDisplayName(employee),
          employee.department,
          text,
          category
        );
        setChatMessages((prev) => [...prev, message]);
        return;
      }
      if (isAdmin) {
        const message = await sendChatMessage('ADMIN', session.name, 'Administration', text, category);
        setChatMessages((prev) => [...prev, message]);
      }
    },
    [employee, session, isAdmin]
  );

  const createHire = useCallback(
    async (input: NewHireInput) => {
      const created = await createNewHire(input);
      await refreshData();
      return created;
    },
    [refreshData]
  );

  const updateSupervisor = useCallback(
    async (empId: string, supervisorId: string) => {
      await assignSupervisor(empId, supervisorId);
      await refreshData();
    },
    [refreshData]
  );

  const approveLeave = useCallback(
    async (requestId: string) => {
      await reviewLeaveRequest(requestId, 'approved', session?.name ?? 'Admin');
      setPendingApprovals((prev) => prev.filter((item) => item.id !== requestId));
      setAdminStats((prev) => ({
        ...prev,
        pendingApprovals: Math.max(0, prev.pendingApprovals - 1),
      }));
      await refreshData();
    },
    [session?.name, refreshData]
  );

  const rejectLeave = useCallback(
    async (requestId: string) => {
      await reviewLeaveRequest(requestId, 'rejected', session?.name ?? 'Admin');
      setPendingApprovals((prev) => prev.filter((item) => item.id !== requestId));
      setAdminStats((prev) => ({
        ...prev,
        pendingApprovals: Math.max(0, prev.pendingApprovals - 1),
      }));
      await refreshData();
    },
    [session?.name, refreshData]
  );

  const approveAttendance = useCallback(
    async (recordId: string) => {
      await reviewAttendanceApproval(recordId, true, session?.name ?? 'Admin');
      setPendingAttendanceApprovals((prev) => prev.filter((item) => item.id !== recordId));
      setAdminStats((prev) => ({
        ...prev,
        pendingApprovals: Math.max(0, prev.pendingApprovals - 1),
      }));
      await refreshData();
    },
    [session?.name, refreshData]
  );

  const rejectAttendance = useCallback(
    async (recordId: string) => {
      await reviewAttendanceApproval(recordId, false, session?.name ?? 'Admin');
      setPendingAttendanceApprovals((prev) => prev.filter((item) => item.id !== recordId));
      setAdminStats((prev) => ({
        ...prev,
        pendingApprovals: Math.max(0, prev.pendingApprovals - 1),
      }));
      await refreshData();
    },
    [session?.name, refreshData]
  );

  const getSupervisors = useCallback(() => getSupervisorOptions(), []);

  const insertLeave = useCallback(
    async (empId: string, date: string, reason: string) => {
      await insertLeaveForEmployee({
        employeeId: empId,
        date,
        reason,
        reviewedBy: session?.name ?? 'Admin',
      });
      await refreshData();
    },
    [session?.name, refreshData]
  );

  const assignShift = useCallback(
    async (empId: string, date: string, shiftType: ShiftType) => {
      await upsertShiftAssignment({ employeeId: empId, date, shiftType });
      await refreshData();
    },
    [refreshData]
  );

  const deleteShift = useCallback(
    async (shiftId: string) => {
      await removeShiftAssignment(shiftId);
      await refreshData();
    },
    [refreshData]
  );

  const loadShiftChart = useCallback(async (fromDate: string, toDate: string) => {
    return loadShiftsInRange(fromDate, toDate);
  }, []);

  const getAttendanceSummaries = useCallback(async (year: number, monthIndex: number) => {
    const { fromDate, toDate } = monthDateRange(year, monthIndex);
    const [employees, att, leaves, shifts] = await Promise.all([
      loadEmployees(),
      loadAllAttendance(),
      loadLeaveRequests(),
      loadShiftsInRange(fromDate, toDate),
    ]);
    return employees.map((emp) =>
      summarizeAttendanceForPeriod(emp, att, leaves, shifts, fromDate, toDate)
    );
  }, []);

  const generatePayroll = useCallback(
    async (year: number, monthIndex: number) => {
      const slips = await generatePayrollForMonth(year, monthIndex);
      await refreshData();
      return slips;
    },
    [refreshData]
  );

  const loadAllPayroll = useCallback(async () => loadPayrollSlips(), []);

  const value = useMemo<AppContextValue>(
    () => ({
      isLoading,
      isAuthenticated: !!session,
      role,
      isAdmin,
      employee,
      adminName: isAdmin ? session?.name ?? null : null,
      attendance,
      leaveBalances,
      leaveRequests,
      salarySlips,
      chatMessages,
      allEmployees,
      pendingApprovals,
      pendingAttendanceApprovals,
      adminStats,
      peopleOnLeaveToday,
      upcomingShifts,
      todayShifts,
      login,
      register,
      logout,
      updateProfile,
      refreshData,
      doPunchIn,
      doPunchOut,
      requestLeave,
      sendMessage,
      createHire,
      updateSupervisor,
      approveLeave,
      rejectLeave,
      approveAttendance,
      rejectAttendance,
      getSupervisors,
      insertLeave,
      assignShift,
      deleteShift,
      loadShiftChart,
      getAttendanceSummaries,
      generatePayroll,
      loadAllPayroll,
    }),
    [
      isLoading,
      session,
      role,
      isAdmin,
      employee,
      attendance,
      leaveBalances,
      leaveRequests,
      salarySlips,
      chatMessages,
      allEmployees,
      pendingApprovals,
      pendingAttendanceApprovals,
      adminStats,
      peopleOnLeaveToday,
      upcomingShifts,
      todayShifts,
      login,
      register,
      logout,
      updateProfile,
      refreshData,
      doPunchIn,
      doPunchOut,
      requestLeave,
      sendMessage,
      createHire,
      updateSupervisor,
      approveLeave,
      rejectLeave,
      approveAttendance,
      rejectAttendance,
      getSupervisors,
      insertLeave,
      assignShift,
      deleteShift,
      loadShiftChart,
      getAttendanceSummaries,
      generatePayroll,
      loadAllPayroll,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export { DEMO_LOGINS };
