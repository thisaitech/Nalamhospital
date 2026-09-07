import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { DEMO_LOGINS } from '@/constants/config';
import {
  enrichAttendanceApproval,
  enrichLeaveRequest,
  enrichShiftChangeCancelRequest,
  getAdminStats,
  getPendingAttendanceApprovals,
  getPendingLeaveApprovals,
  getPendingLeaveCancelRequests,
  getPendingOutOfClinicPunchApprovals,
  getPendingShiftChangeCancelRequests,
  getRecentInClinicPunches,
  insertLeaveForEmployee,
  adminMarkPresent,
  reviewAttendanceApproval,
  reviewLeaveRequest,
  reviewLeaveCancelRequest,
  reviewLocationPunchApproval,
  reviewShiftChangeCancelRequest,
  type EnrichedShiftChangeCancelRequest,
} from '@/services/adminService';
import { loadAdminBroadcasts, sendAdminBroadcast } from '@/services/chatService';
import {
  ADMIN_NOTIFICATION_INBOX_ID,
} from '@/types/notification';
import {
  cancelShiftChangeNotification,
  countUnreadNotifications,
  getAdminNotifications,
  getNotificationsForEmployee,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notificationService';
import {
  assignSupervisor,
  createNewHire,
  findEmployeeByEmail,
  getEmployeeDisplayName,
  getSupervisorOptions,
  registerEmployee,
  updateEmployeeProfile,
  updateNewHire,
  loadEmployees,
  loadUsers,
  softDeleteEmployee,
  restoreEmployee,
} from '@/services/employeeRegistry';
import { createClinic, loadClinics, saveClinicLocation, activateClinicLocation, deactivateClinicLocation, removeClinicLocation, updateClinic } from '@/services/clinicService';
import { getPunchGpsReading } from '@/services/locationService';
import {
  getLeaveBalances,
  getLeaveRequests,
  getPeopleOnLeaveToday,
  getSalarySlips,
  loadAttendance,
  punchIn,
  punchOut,
  continueNextShift,
  mark24HourDoctorPresent,
  ensure24HourDoctorAbsentIfMissed,
  submitLeaveRequest,
  cancelLeaveRequest,
} from '@/services/employeeService';
import {
  countAvailableCompensatoryCredits,
  getCompensatoryCredits,
  submitCompensatoryLeave,
} from '@/services/compensatoryService';
import {
  ensureFirestoreSeed,
  loadAllAttendance,
  loadLeaveRequests,
} from '@/services/firestoreRepository';
import {
  generatePayrollForMonth,
  loadPayrollSlips,
  markPayslipsPaid as markPayslipsPaidInStore,
} from '@/services/payrollService';
import {
  getUpcomingShifts,
  loadShiftsForDate,
  loadShiftsInRange,
  removeShiftAssignment,
  setShiftChangeDay,
  getShiftChangeDates,
  isShiftChangeDay,
  swapRolesAfterChangeDay,
  upsertShiftAssignment,
} from '@/services/shiftService';
import { getItem, removeItem, setItem, storageKeys } from '@/services/storage';
import type { ChatCategory, ChatMessage } from '@/types/chat';
import type { AdminNotification } from '@/types/notification';
import type { Clinic, CreateClinicInput, SaveClinicLocationInput, UpdateClinicInput } from '@/types/clinic';
import type {
  AttendanceRecord,
  CompensatoryCredit,
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
import { filterVisibleLeave } from '@/utils/clinicLeave';
import {
  clinicStatsForEmployees,
  filterByEmployeeIds,
  filterEmployeesByClinic,
  type ClinicFilterId,
} from '@/utils/clinicScope';
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
  compensatoryCredits: CompensatoryCredit[];
  availableCompensatoryCredits: number;
  salarySlips: SalarySlip[];
  chatMessages: ChatMessage[];
  notifications: AdminNotification[];
  unreadNotificationCount: number;
  allEmployees: Employee[];
  allClinics: Clinic[];
  selectedClinicId: ClinicFilterId;
  setSelectedClinicId: (clinicId: ClinicFilterId) => Promise<void>;
  clinicEmployees: Employee[];
  deletedClinicEmployees: Employee[];
  clinicEmployeeIds: Set<string>;
  clinicPendingApprovals: EnrichedLeaveRequest[];
  clinicPendingLeaveCancelRequests: EnrichedLeaveRequest[];
  clinicPendingShiftChangeCancelRequests: EnrichedShiftChangeCancelRequest[];
  clinicPendingAttendanceApprovals: EnrichedAttendanceApproval[];
  clinicPendingOutOfClinicPunchApprovals: EnrichedAttendanceApproval[];
  clinicRecentInClinicPunches: EnrichedAttendanceApproval[];
  clinicAdminStats: {
    totalEmployees: number;
    totalSupervisors: number;
    pendingApprovals: number;
    departments: number;
  };
  clinicPeopleOnLeaveToday: PersonOnLeave[];
  clinicTodayShifts: ShiftAssignment[];
  pendingApprovals: EnrichedLeaveRequest[];
  pendingLeaveCancelRequests: EnrichedLeaveRequest[];
  pendingShiftChangeCancelRequests: EnrichedShiftChangeCancelRequest[];
  pendingAttendanceApprovals: EnrichedAttendanceApproval[];
  pendingOutOfClinicPunchApprovals: EnrichedAttendanceApproval[];
  recentInClinicPunches: EnrichedAttendanceApproval[];
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
  doContinueShift: (method: PunchMethod, wifiSsid?: string | null) => Promise<AttendanceRecord | null>;
  doMark24HourPresent: () => Promise<AttendanceRecord | null>;
  sync24HourPresentMiss: () => Promise<void>;
  requestLeave: (type: LeaveType | null, startDate: string, endDate: string, reason: string) => Promise<void>;
  cancelLeave: (requestId: string) => Promise<void>;
  useCompensatoryLeave: (leaveDate: string) => Promise<void>;
  sendMessage: (text: string, category?: ChatCategory) => Promise<void>;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  cancelShiftChange: (notificationId: string) => Promise<void>;
  createHire: (input: NewHireInput) => Promise<Employee>;
  updateHire: (employeeId: string, input: NewHireInput) => Promise<Employee>;
  createClinic: (input: CreateClinicInput) => Promise<Clinic>;
  updateClinicEntry: (clinicId: string, input: UpdateClinicInput) => Promise<Clinic>;
  saveClinicLocationEntry: (clinicId: string, input: SaveClinicLocationInput) => Promise<Clinic>;
  activateClinicLocationEntry: (clinicId: string, entryId: string) => Promise<Clinic>;
  deactivateClinicLocationEntry: (clinicId: string, entryId: string) => Promise<Clinic>;
  removeClinicLocationEntry: (clinicId: string, entryId: string) => Promise<Clinic>;
  updateSupervisor: (employeeId: string, supervisorId: string) => Promise<void>;
  deleteEmployee: (employeeId: string) => Promise<void>;
  restoreDeletedEmployee: (employeeId: string) => Promise<void>;
  approveLeave: (requestId: string) => Promise<void>;
  rejectLeave: (requestId: string) => Promise<void>;
  approveLeaveCancel: (requestId: string) => Promise<void>;
  rejectLeaveCancel: (requestId: string) => Promise<void>;
  approveShiftChangeCancel: (notificationId: string) => Promise<void>;
  rejectShiftChangeCancel: (notificationId: string) => Promise<void>;
  approveAttendance: (recordId: string) => Promise<void>;
  rejectAttendance: (recordId: string) => Promise<void>;
  approveLocationPunch: (recordId: string) => Promise<void>;
  rejectLocationPunch: (recordId: string) => Promise<void>;
  getSupervisors: () => Promise<Employee[]>;
  insertLeave: (employeeId: string, date: string, reason: string) => Promise<void>;
  markPresent: (params: {
    employeeId: string;
    date: string;
    punchIn: string;
    punchOut: string;
    reason?: string;
  }) => Promise<void>;
  assignShift: (
    employeeId: string,
    date: string,
    shiftType: ShiftType,
    options?: { startTime?: string; endTime?: string; force24Hour?: boolean }
  ) => Promise<void>;
  deleteShift: (shiftId: string) => Promise<void>;
  loadShiftChart: (fromDate: string, toDate: string) => Promise<ShiftAssignment[]>;
  checkShiftChangeDay: (date: string) => Promise<boolean>;
  markShiftChangeDay: (date: string, enabled: boolean) => Promise<void>;
  loadShiftChangeDates: () => Promise<string[]>;
  completeShiftChangeSwap: (date: string) => Promise<number>;
  getAttendanceSummaries: (year: number, monthIndex: number) => Promise<AttendanceSummary[]>;
  generatePayroll: (year: number, monthIndex: number, employeeId?: string) => Promise<SalarySlip[]>;
  loadAllPayroll: () => Promise<SalarySlip[]>;
  markPayslipsPaid: (slipIds: string[]) => Promise<SalarySlip[]>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [compensatoryCredits, setCompensatoryCredits] = useState<CompensatoryCredit[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [salarySlips, setSalarySlips] = useState<SalarySlip[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [allClinics, setAllClinics] = useState<Clinic[]>([]);
  const [selectedClinicId, setSelectedClinicIdState] = useState<ClinicFilterId>('all');
  const [pendingApprovals, setPendingApprovals] = useState<EnrichedLeaveRequest[]>([]);
  const [pendingLeaveCancelRequests, setPendingLeaveCancelRequests] = useState<EnrichedLeaveRequest[]>([]);
  const [pendingShiftChangeCancelRequests, setPendingShiftChangeCancelRequests] = useState<
    EnrichedShiftChangeCancelRequest[]
  >([]);
  const [pendingAttendanceApprovals, setPendingAttendanceApprovals] = useState<EnrichedAttendanceApproval[]>([]);
  const [pendingOutOfClinicPunchApprovals, setPendingOutOfClinicPunchApprovals] = useState<
    EnrichedAttendanceApproval[]
  >([]);
  const [recentInClinicPunches, setRecentInClinicPunches] = useState<EnrichedAttendanceApproval[]>([]);
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
  const availableCompensatoryCredits = useMemo(
    () => countAvailableCompensatoryCredits(compensatoryCredits),
    [compensatoryCredits]
  );

  const setSelectedClinicId = useCallback(async (clinicId: ClinicFilterId) => {
    setSelectedClinicIdState(clinicId);
    await setItem(storageKeys.ADMIN_CLINIC_FILTER, clinicId);
  }, []);

  const clinicEmployees = useMemo(
    () =>
      filterEmployeesByClinic(
        allEmployees.filter((employee) => !employee.deletedAt),
        selectedClinicId
      ),
    [allEmployees, selectedClinicId]
  );
  const deletedClinicEmployees = useMemo(
    () =>
      filterEmployeesByClinic(
        allEmployees.filter((employee) => Boolean(employee.deletedAt)),
        selectedClinicId
      ),
    [allEmployees, selectedClinicId]
  );

  const clinicEmployeeIds = useMemo(
    () => new Set(clinicEmployees.map((employee) => employee.employeeId)),
    [clinicEmployees]
  );

  const clinicPendingApprovals = useMemo(
    () => filterByEmployeeIds(pendingApprovals, clinicEmployeeIds, (item) => item.employeeId),
    [pendingApprovals, clinicEmployeeIds]
  );

  const clinicPendingLeaveCancelRequests = useMemo(
    () => filterByEmployeeIds(pendingLeaveCancelRequests, clinicEmployeeIds, (item) => item.employeeId),
    [pendingLeaveCancelRequests, clinicEmployeeIds]
  );

  const clinicPendingShiftChangeCancelRequests = useMemo(
    () =>
      filterByEmployeeIds(
        pendingShiftChangeCancelRequests,
        clinicEmployeeIds,
        (item) => item.employeeId
      ),
    [pendingShiftChangeCancelRequests, clinicEmployeeIds]
  );

  const clinicPendingAttendanceApprovals = useMemo(
    () =>
      filterByEmployeeIds(pendingAttendanceApprovals, clinicEmployeeIds, (item) => item.employeeId),
    [pendingAttendanceApprovals, clinicEmployeeIds]
  );

  const clinicPendingOutOfClinicPunchApprovals = useMemo(
    () =>
      filterByEmployeeIds(
        pendingOutOfClinicPunchApprovals,
        clinicEmployeeIds,
        (item) => item.employeeId
      ),
    [pendingOutOfClinicPunchApprovals, clinicEmployeeIds]
  );

  const clinicRecentInClinicPunches = useMemo(
    () => filterByEmployeeIds(recentInClinicPunches, clinicEmployeeIds, (item) => item.employeeId),
    [recentInClinicPunches, clinicEmployeeIds]
  );

  const clinicPeopleOnLeaveToday = useMemo(
    () => filterByEmployeeIds(peopleOnLeaveToday, clinicEmployeeIds, (item) => item.employeeId),
    [peopleOnLeaveToday, clinicEmployeeIds]
  );

  const clinicTodayShifts = useMemo(
    () => filterByEmployeeIds(todayShifts, clinicEmployeeIds, (item) => item.employeeId),
    [todayShifts, clinicEmployeeIds]
  );

  const clinicAdminStats = useMemo(() => {
    const scoped = clinicStatsForEmployees(clinicEmployees);
    return {
      ...scoped,
      pendingApprovals: clinicPendingApprovals.length + clinicPendingLeaveCancelRequests.length + clinicPendingShiftChangeCancelRequests.length + clinicPendingAttendanceApprovals.length + clinicPendingOutOfClinicPunchApprovals.length,
    };
  }, [clinicEmployees, clinicPendingApprovals, clinicPendingLeaveCancelRequests, clinicPendingShiftChangeCancelRequests, clinicPendingAttendanceApprovals, clinicPendingOutOfClinicPunchApprovals]);

  const refreshData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const [messages, onLeave, shiftsToday] = await Promise.all([
      loadAdminBroadcasts(),
      getPeopleOnLeaveToday(today),
      loadShiftsForDate(today),
    ]);
    setChatMessages(messages);
    setPeopleOnLeaveToday(
      session?.role === 'admin'
        ? onLeave
        : filterVisibleLeave(onLeave, employee?.staffCategory ?? 'staff')
    );
    setTodayShifts(shiftsToday);

    if (session?.role === 'admin') {
      const [employees, clinics, pendingLeave, pendingCancel, pendingShiftCancel, pendingAttendance, pendingOutLocation, recentInClinic, stats, adminNotifications] =
        await Promise.all([
          loadEmployees(),
          loadClinics(),
          getPendingLeaveApprovals(),
          getPendingLeaveCancelRequests(),
          getPendingShiftChangeCancelRequests(),
          getPendingAttendanceApprovals(),
          getPendingOutOfClinicPunchApprovals(),
          getRecentInClinicPunches(),
          getAdminStats(),
          getAdminNotifications(),
        ]);
      const [enrichedLeave, enrichedCancel, enrichedShiftCancel, enrichedAttendance, enrichedOutLocation, enrichedInClinic] =
        await Promise.all([
        Promise.all(pendingLeave.map((r) => enrichLeaveRequest(r))),
        Promise.all(pendingCancel.map((r) => enrichLeaveRequest(r))),
        Promise.all(pendingShiftCancel.map((r) => enrichShiftChangeCancelRequest(r))),
        Promise.all(pendingAttendance.map((r) => enrichAttendanceApproval(r))),
        Promise.all(pendingOutLocation.map((r) => enrichAttendanceApproval(r))),
        Promise.all(recentInClinic.map((r) => enrichAttendanceApproval(r))),
      ]);
      setAllEmployees(employees);
      setAllClinics(clinics);
      setPendingApprovals(enrichedLeave);
      setPendingLeaveCancelRequests(enrichedCancel);
      setPendingShiftChangeCancelRequests(enrichedShiftCancel);
      setPendingAttendanceApprovals(enrichedAttendance);
      setPendingOutOfClinicPunchApprovals(enrichedOutLocation);
      setRecentInClinicPunches(enrichedInClinic);
      setAdminStats(stats);
      setNotifications(adminNotifications);
      return;
    }

    if (employeeId) {
      const [att, leaves, balances, slips, upcoming, employeeNotifications, credits] =
        await Promise.all([
        loadAttendance(employeeId),
        getLeaveRequests(employeeId),
        getLeaveBalances(employeeId),
        getSalarySlips(employeeId),
        getUpcomingShifts(employeeId),
        getNotificationsForEmployee(employeeId),
        getCompensatoryCredits(employeeId),
      ]);
      setAttendance(att);
      setLeaveRequests(leaves);
      setLeaveBalances(balances);
      setSalarySlips(slips);
      setUpcomingShifts(upcoming);
      setNotifications(employeeNotifications);
      setCompensatoryCredits(credits);
    }
  }, [employeeId, employee?.staffCategory, session?.role]);

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
        const messages = await loadAdminBroadcasts();
        setChatMessages(messages);
        const savedClinic = await getItem<ClinicFilterId>(storageKeys.ADMIN_CLINIC_FILTER);
        if (savedClinic) {
          setSelectedClinicIdState(savedClinic);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedClinicId === 'all') return;
    if (allClinics.length > 0 && !allClinics.some((clinic) => clinic.id === selectedClinicId)) {
      setSelectedClinicId('all');
    }
  }, [allClinics, selectedClinicId, setSelectedClinicId]);

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
    if (emp.deletedAt) {
      throw new Error('This account is no longer active. Contact admin.');
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
    setCompensatoryCredits([]);
    setLeaveBalances([]);
    setSalarySlips([]);
    setAllEmployees([]);
    setPendingApprovals([]);
    setPendingLeaveCancelRequests([]);
    setPendingAttendanceApprovals([]);
    setPendingOutOfClinicPunchApprovals([]);
    setRecentInClinicPunches([]);
    setPeopleOnLeaveToday([]);
    setUpcomingShifts([]);
    setTodayShifts([]);
    setNotifications([]);
    setChatMessages([]);
    setAdminStats({ totalEmployees: 0, totalSupervisors: 0, pendingApprovals: 0, departments: 0 });
  }, []);

  const doPunchIn = useCallback(
    async (method: PunchMethod, wifiSsid: string | null = null) => {
      if (!employeeId) return null;
      const gpsResult = await getPunchGpsReading();
      const gps = gpsResult.ok ? gpsResult.reading : null;
      const record = await punchIn(employeeId, method, wifiSsid, gps);
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

  const doContinueShift = useCallback(
    async (method: PunchMethod, wifiSsid: string | null = null) => {
      if (!employeeId) return null;
      const record = await continueNextShift(employeeId, method, wifiSsid);
      await refreshData();
      return record;
    },
    [employeeId, refreshData]
  );

  const doMark24HourPresent = useCallback(async () => {
    if (!employeeId) return null;
    const record = await mark24HourDoctorPresent(employeeId);
    await refreshData();
    return record;
  }, [employeeId, refreshData]);

  const sync24HourPresentMiss = useCallback(async () => {
    if (!employeeId) return;
    const updated = await ensure24HourDoctorAbsentIfMissed(employeeId);
    if (updated) await refreshData();
  }, [employeeId, refreshData]);

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

  const cancelLeave = useCallback(
    async (requestId: string) => {
      if (!employeeId) {
        throw new Error('You must be logged in as an employee to cancel leave.');
      }
      await cancelLeaveRequest(employeeId, requestId);
      await refreshData();
    },
    [employeeId, refreshData]
  );

  const useCompensatoryLeave = useCallback(
    async (leaveDate: string) => {
      if (!employeeId) {
        throw new Error('You must be logged in as an employee to use compensatory leave.');
      }
      await submitCompensatoryLeave(employeeId, leaveDate);
      await refreshData();
    },
    [employeeId, refreshData]
  );

  const sendMessage = useCallback(
    async (text: string, category: ChatCategory = 'general') => {
      if (!session || !isAdmin) return;
      const message = await sendAdminBroadcast(session.name, text, category);
      setChatMessages((prev) => [...prev, message]);
    },
    [session, isAdmin]
  );

  const markNotificationAsRead = useCallback(
    async (notificationId: string) => {
      await markNotificationRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
    },
    []
  );

  const markAllNotificationsAsRead = useCallback(async () => {
    const inboxId = isAdmin ? ADMIN_NOTIFICATION_INBOX_ID : employeeId;
    if (!inboxId) return;
    await markAllNotificationsRead(inboxId);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [employeeId, isAdmin]);

  const cancelShiftChange = useCallback(
    async (notificationId: string) => {
      if (!employeeId) {
        throw new Error('You must be logged in to cancel a shift change.');
      }
      const updated = await cancelShiftChangeNotification({
        notificationId,
        employeeId,
      });
      if (updated) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? updated : n))
        );
      }
      await refreshData();
    },
    [employeeId, refreshData]
  );

  const createHire = useCallback(
    async (input: NewHireInput) => {
      const created = await createNewHire(input);
      await refreshData();
      return created;
    },
    [refreshData]
  );

  const updateHire = useCallback(
    async (employeeId: string, input: NewHireInput) => {
      const updated = await updateNewHire(employeeId, input);
      await refreshData();
      return updated;
    },
    [refreshData]
  );

  const createClinicEntry = useCallback(
    async (input: CreateClinicInput) => {
      const clinic = await createClinic(input);
      await refreshData();
      return clinic;
    },
    [refreshData]
  );

  const updateClinicEntry = useCallback(
    async (clinicId: string, input: UpdateClinicInput) => {
      const clinic = await updateClinic(clinicId, input);
      await refreshData();
      return clinic;
    },
    [refreshData]
  );

  const saveClinicLocationEntry = useCallback(
    async (clinicId: string, input: SaveClinicLocationInput) => {
      const clinic = await saveClinicLocation(clinicId, input);
      await refreshData();
      return clinic;
    },
    [refreshData]
  );

  const activateClinicLocationEntry = useCallback(
    async (clinicId: string, entryId: string) => {
      const clinic = await activateClinicLocation(clinicId, entryId);
      await refreshData();
      return clinic;
    },
    [refreshData]
  );

  const deactivateClinicLocationEntry = useCallback(
    async (clinicId: string, entryId: string) => {
      const clinic = await deactivateClinicLocation(clinicId, entryId);
      await refreshData();
      return clinic;
    },
    [refreshData]
  );

  const removeClinicLocationEntry = useCallback(
    async (clinicId: string, entryId: string) => {
      const clinic = await removeClinicLocation(clinicId, entryId);
      await refreshData();
      return clinic;
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

  const deleteEmployee = useCallback(
    async (employeeId: string) => {
      await softDeleteEmployee(employeeId);
      await refreshData();
    },
    [refreshData]
  );

  const restoreDeletedEmployee = useCallback(
    async (employeeId: string) => {
      await restoreEmployee(employeeId);
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

  const approveLeaveCancel = useCallback(
    async (requestId: string) => {
      await reviewLeaveCancelRequest(requestId, true, session?.name ?? 'Admin');
      setPendingLeaveCancelRequests((prev) => prev.filter((item) => item.id !== requestId));
      setAdminStats((prev) => ({
        ...prev,
        pendingApprovals: Math.max(0, prev.pendingApprovals - 1),
      }));
      await refreshData();
    },
    [session?.name, refreshData]
  );

  const rejectLeaveCancel = useCallback(
    async (requestId: string) => {
      await reviewLeaveCancelRequest(requestId, false, session?.name ?? 'Admin');
      setPendingLeaveCancelRequests((prev) => prev.filter((item) => item.id !== requestId));
      setAdminStats((prev) => ({
        ...prev,
        pendingApprovals: Math.max(0, prev.pendingApprovals - 1),
      }));
      await refreshData();
    },
    [session?.name, refreshData]
  );

  const approveShiftChangeCancel = useCallback(
    async (notificationId: string) => {
      await reviewShiftChangeCancelRequest(notificationId, true, session?.name ?? 'Admin');
      setPendingShiftChangeCancelRequests((prev) =>
        prev.filter((item) => item.notificationId !== notificationId)
      );
      setAdminStats((prev) => ({
        ...prev,
        pendingApprovals: Math.max(0, prev.pendingApprovals - 1),
      }));
      await refreshData();
    },
    [session?.name, refreshData]
  );

  const rejectShiftChangeCancel = useCallback(
    async (notificationId: string) => {
      await reviewShiftChangeCancelRequest(notificationId, false, session?.name ?? 'Admin');
      setPendingShiftChangeCancelRequests((prev) =>
        prev.filter((item) => item.notificationId !== notificationId)
      );
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

  const approveLocationPunch = useCallback(
    async (recordId: string) => {
      await reviewLocationPunchApproval(recordId, true, session?.name ?? 'Admin');
      setPendingOutOfClinicPunchApprovals((prev) => prev.filter((item) => item.id !== recordId));
      setAdminStats((prev) => ({
        ...prev,
        pendingApprovals: Math.max(0, prev.pendingApprovals - 1),
      }));
      await refreshData();
    },
    [session?.name, refreshData]
  );

  const rejectLocationPunch = useCallback(
    async (recordId: string) => {
      await reviewLocationPunchApproval(recordId, false, session?.name ?? 'Admin');
      setPendingOutOfClinicPunchApprovals((prev) => prev.filter((item) => item.id !== recordId));
      setAdminStats((prev) => ({
        ...prev,
        pendingApprovals: Math.max(0, prev.pendingApprovals - 1),
      }));
      await refreshData();
    },
    [session?.name, refreshData]
  );

  const getSupervisors = useCallback(async () => {
    const supervisors = await getSupervisorOptions();
    return filterEmployeesByClinic(supervisors, selectedClinicId);
  }, [selectedClinicId]);

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

  const markPresent = useCallback(
    async (params: {
      employeeId: string;
      date: string;
      punchIn: string;
      punchOut: string;
      reason?: string;
    }) => {
      await adminMarkPresent({
        ...params,
        reviewedBy: session?.name ?? 'Admin',
      });
      await refreshData();
    },
    [session?.name, refreshData]
  );

  const assignShift = useCallback(
    async (
      empId: string,
      date: string,
      shiftType: ShiftType,
      options?: { startTime?: string; endTime?: string; force24Hour?: boolean }
    ) => {
      await upsertShiftAssignment({
        employeeId: empId,
        date,
        shiftType,
        startTime: options?.startTime,
        endTime: options?.endTime,
        force24Hour: options?.force24Hour,
      });
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

  const checkShiftChangeDay = useCallback(async (date: string) => isShiftChangeDay(date), []);

  const markShiftChangeDay = useCallback(
    async (date: string, enabled: boolean) => {
      await setShiftChangeDay(date, enabled);
      await refreshData();
    },
    [refreshData]
  );

  const loadShiftChangeDateList = useCallback(async () => getShiftChangeDates(), []);

  const completeShiftChangeSwap = useCallback(
    async (date: string) => {
      const count = await swapRolesAfterChangeDay(date);
      await refreshData();
      return count;
    },
    [refreshData]
  );

  const getAttendanceSummaries = useCallback(async (year: number, monthIndex: number) => {
    const { fromDate, toDate } = monthDateRange(year, monthIndex);
    const [employees, att, leaves, shifts] = await Promise.all([
      loadEmployees(),
      loadAllAttendance(),
      loadLeaveRequests(),
      loadShiftsInRange(fromDate, toDate),
    ]);
    const scopedEmployees = filterEmployeesByClinic(employees, selectedClinicId);
    return scopedEmployees.map((emp) =>
      summarizeAttendanceForPeriod(emp, att, leaves, shifts, fromDate, toDate)
    );
  }, [selectedClinicId]);

  const generatePayroll = useCallback(
    async (year: number, monthIndex: number, employeeId?: string) => {
      const slips = await generatePayrollForMonth(year, monthIndex, employeeId);
      await refreshData();
      return slips;
    },
    [refreshData]
  );

  const loadAllPayroll = useCallback(async () => loadPayrollSlips(), []);

  const markPayslipsPaid = useCallback(async (slipIds: string[]) => {
    const updated = await markPayslipsPaidInStore(slipIds);
    const updatedById = new Map(updated.map((slip) => [slip.id, slip]));
    setSalarySlips((prev) => prev.map((slip) => updatedById.get(slip.id) ?? slip));
    return updated;
  }, []);

  const unreadNotificationCount = useMemo(
    () => countUnreadNotifications(notifications),
    [notifications]
  );

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
      compensatoryCredits,
      availableCompensatoryCredits,
      salarySlips,
      chatMessages,
      notifications,
      unreadNotificationCount,
      allEmployees,
      allClinics,
      selectedClinicId,
      setSelectedClinicId,
      clinicEmployees,
      deletedClinicEmployees,
      clinicEmployeeIds,
      clinicPendingApprovals,
      clinicPendingLeaveCancelRequests,
      clinicPendingShiftChangeCancelRequests,
      clinicPendingAttendanceApprovals,
      clinicPendingOutOfClinicPunchApprovals,
      clinicRecentInClinicPunches,
      clinicAdminStats,
      clinicPeopleOnLeaveToday,
      clinicTodayShifts,
      pendingApprovals,
      pendingLeaveCancelRequests,
      pendingShiftChangeCancelRequests,
      pendingAttendanceApprovals,
      pendingOutOfClinicPunchApprovals,
      recentInClinicPunches,
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
      doContinueShift,
      doMark24HourPresent,
      sync24HourPresentMiss,
      requestLeave,
      cancelLeave,
      useCompensatoryLeave,
      sendMessage,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      cancelShiftChange,
      createHire,
      updateHire,
      createClinic: createClinicEntry,
      updateClinicEntry,
      saveClinicLocationEntry,
      activateClinicLocationEntry,
      deactivateClinicLocationEntry,
      removeClinicLocationEntry,
      updateSupervisor,
      deleteEmployee,
      restoreDeletedEmployee,
      approveLeave,
      rejectLeave,
      approveLeaveCancel,
      rejectLeaveCancel,
      approveShiftChangeCancel,
      rejectShiftChangeCancel,
      approveAttendance,
      rejectAttendance,
      approveLocationPunch,
      rejectLocationPunch,
      getSupervisors,
      insertLeave,
      markPresent,
      assignShift,
      deleteShift,
      loadShiftChart,
      checkShiftChangeDay,
      markShiftChangeDay,
      loadShiftChangeDates: loadShiftChangeDateList,
      completeShiftChangeSwap,
      getAttendanceSummaries,
      generatePayroll,
      loadAllPayroll,
      markPayslipsPaid,
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
      compensatoryCredits,
      availableCompensatoryCredits,
      salarySlips,
      chatMessages,
      notifications,
      unreadNotificationCount,
      allEmployees,
      allClinics,
      selectedClinicId,
      setSelectedClinicId,
      clinicEmployees,
      deletedClinicEmployees,
      clinicEmployeeIds,
      clinicPendingApprovals,
      clinicPendingLeaveCancelRequests,
      clinicPendingShiftChangeCancelRequests,
      clinicPendingAttendanceApprovals,
      clinicPendingOutOfClinicPunchApprovals,
      clinicRecentInClinicPunches,
      clinicAdminStats,
      clinicPeopleOnLeaveToday,
      clinicTodayShifts,
      pendingApprovals,
      pendingLeaveCancelRequests,
      pendingShiftChangeCancelRequests,
      pendingAttendanceApprovals,
      pendingOutOfClinicPunchApprovals,
      recentInClinicPunches,
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
      doContinueShift,
      doMark24HourPresent,
      sync24HourPresentMiss,
      requestLeave,
      cancelLeave,
      useCompensatoryLeave,
      sendMessage,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      cancelShiftChange,
      createHire,
      updateHire,
      createClinicEntry,
      updateClinicEntry,
      saveClinicLocationEntry,
      activateClinicLocationEntry,
      deactivateClinicLocationEntry,
      removeClinicLocationEntry,
      updateSupervisor,
      deleteEmployee,
      restoreDeletedEmployee,
      approveLeave,
      rejectLeave,
      approveLeaveCancel,
      rejectLeaveCancel,
      approveShiftChangeCancel,
      rejectShiftChangeCancel,
      approveAttendance,
      rejectAttendance,
      approveLocationPunch,
      rejectLocationPunch,
      getSupervisors,
      insertLeave,
      markPresent,
      assignShift,
      deleteShift,
      loadShiftChart,
      checkShiftChangeDay,
      markShiftChangeDay,
      loadShiftChangeDateList,
      completeShiftChangeSwap,
      getAttendanceSummaries,
      generatePayroll,
      loadAllPayroll,
      markPayslipsPaid,
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
