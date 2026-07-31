import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { INITIAL_USERS } from '@/constants/config';
import {
  FIRESTORE_COLLECTIONS,
  FIRESTORE_SEED_VERSION,
} from '@/constants/firestoreCollections';
import { INITIAL_TEAM_MESSAGES } from '@/data/mockChat';
import {
  MOCK_EMPLOYEES,
  MOCK_LEAVE_BALANCES,
  MOCK_LEAVE_REQUESTS,
  MOCK_PERFORMANCE,
  MOCK_SALARY,
  getInitialAttendance,
  getInitialShifts,
} from '@/data/mockData';
import { firestore } from '@/services/firebase';
import { getItem, setItem } from '@/services/storage';
import {
  localCreateNewHireRecords,
  localDeleteShiftAssignment,
  localEnsureSeed,
  localLoadAllAttendance,
  localLoadAllSalarySlips,
  localLoadAllShiftAssignments,
  localLoadAttendanceForEmployee,
  localLoadChatMessages,
  localLoadEmployees,
  localLoadLeaveBalancesMap,
  localLoadLeaveRequests,
  localLoadPerformanceReviews,
  localLoadSalarySlips,
  localLoadUsers,
  localSaveAttendanceRecords,
  localSaveChatMessage,
  localSaveEmployees,
  localSaveLeaveBalancesMap,
  localSaveLeaveRequests,
  localSaveSalarySlips,
  localSaveShiftAssignments,
  localSaveUsers,
} from '@/services/localRepository';
import { sanitizeEmployeeAvatar } from '@/components/ui/EmployeeAvatar';
import type { ChatMessage } from '@/types/chat';
import type {
  AppUser,
  AttendanceRecord,
  Employee,
  LeaveBalance,
  LeaveRequest,
  PerformanceReview,
  SalarySlip,
  ShiftAssignment,
} from '@/types/employee';

/** Once Firestore denies access, stay on local storage. */
const LOCAL_MODE_KEY = '@hospitalhrm/force_local_mode';
let forceLocalMode = false;
let modeLoaded = false;
let seedPromise: Promise<void> | null = null;

async function ensureModeLoaded(): Promise<void> {
  if (modeLoaded) return;
  modeLoaded = true;
  const saved = await getItem<boolean>(LOCAL_MODE_KEY);
  if (saved) forceLocalMode = true;
}

async function enableLocalMode(): Promise<void> {
  forceLocalMode = true;
  await setItem(LOCAL_MODE_KEY, true);
  await localEnsureSeed();
}

function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  const code = (err.code ?? '').toLowerCase();
  const message = (err.message ?? '').toLowerCase();
  return (
    code.includes('permission-denied') ||
    code.includes('permissions-denied') ||
    message.includes('missing or insufficient permissions') ||
    message.includes('permission_denied')
  );
}

async function withStore<T>(
  cloud: () => Promise<T>,
  local: () => Promise<T>
): Promise<T> {
  await ensureModeLoaded();
  if (forceLocalMode) {
    return local();
  }
  try {
    return await cloud();
  } catch (error) {
    if (isPermissionError(error)) {
      console.warn('[HospitalHRM] Firestore permission denied — using on-device local data.');
      await enableLocalMode();
      return local();
    }
    throw error;
  }
}

function usersCollection() {
  return collection(firestore, FIRESTORE_COLLECTIONS.USERS);
}

function employeesCollection() {
  return collection(firestore, FIRESTORE_COLLECTIONS.EMPLOYEES);
}

function leaveBalancesCollection() {
  return collection(firestore, FIRESTORE_COLLECTIONS.LEAVE_BALANCES);
}

function attendanceCollection() {
  return collection(firestore, FIRESTORE_COLLECTIONS.ATTENDANCE);
}

function leaveRequestsCollection() {
  return collection(firestore, FIRESTORE_COLLECTIONS.LEAVE_REQUESTS);
}

function chatMessagesCollection() {
  return collection(firestore, FIRESTORE_COLLECTIONS.CHAT_MESSAGES);
}

function salarySlipsCollection() {
  return collection(firestore, FIRESTORE_COLLECTIONS.SALARY_SLIPS);
}

function performanceReviewsCollection() {
  return collection(firestore, FIRESTORE_COLLECTIONS.PERFORMANCE_REVIEWS);
}

function shiftAssignmentsCollection() {
  return collection(firestore, FIRESTORE_COLLECTIONS.SHIFT_ASSIGNMENTS);
}

function userDocId(email: string) {
  return email.trim().toLowerCase();
}

export function isUsingLocalDataStore(): boolean {
  return forceLocalMode;
}

export async function ensureFirestoreSeed(): Promise<void> {
  await ensureModeLoaded();
  if (forceLocalMode) {
    await localEnsureSeed();
    return;
  }
  if (!seedPromise) {
    seedPromise = seedFirestoreIfNeeded().catch(async (error) => {
      seedPromise = null;
      if (isPermissionError(error)) {
        await enableLocalMode();
        return;
      }
      throw error;
    });
  }
  await seedPromise;
}

async function seedFirestoreIfNeeded(): Promise<void> {
  if (forceLocalMode) {
    await localEnsureSeed();
    return;
  }

  const metaRef = doc(firestore, FIRESTORE_COLLECTIONS.META, 'app');
  const metaSnap = await getDoc(metaRef);
  const existingVersion = metaSnap.exists() ? Number(metaSnap.data()?.seedVersion ?? 0) : 0;
  if (metaSnap.exists() && metaSnap.data()?.seeded && existingVersion >= FIRESTORE_SEED_VERSION) {
    return;
  }

  const batch = writeBatch(firestore);

  INITIAL_USERS.forEach((user) => {
    batch.set(doc(usersCollection(), userDocId(user.email)), user);
  });

  MOCK_EMPLOYEES.forEach((employee) => {
    batch.set(doc(employeesCollection(), employee.employeeId), employee);
  });

  Object.entries(MOCK_LEAVE_BALANCES).forEach(([employeeId, balances]) => {
    batch.set(doc(leaveBalancesCollection(), employeeId), { employeeId, balances });
  });

  getInitialAttendance().forEach((record) => {
    batch.set(doc(attendanceCollection(), record.id), record);
  });

  MOCK_LEAVE_REQUESTS.forEach((request) => {
    batch.set(doc(leaveRequestsCollection(), request.id), request);
  });

  INITIAL_TEAM_MESSAGES.forEach((message) => {
    batch.set(doc(chatMessagesCollection(), message.id), message);
  });

  MOCK_SALARY.forEach((slip) => {
    batch.set(doc(salarySlipsCollection(), slip.id), slip);
  });

  MOCK_PERFORMANCE.forEach((review) => {
    batch.set(doc(performanceReviewsCollection(), review.id), review);
  });

  getInitialShifts().forEach((shift) => {
    batch.set(doc(shiftAssignmentsCollection(), shift.id), shift);
  });

  batch.set(metaRef, {
    seeded: true,
    seedVersion: FIRESTORE_SEED_VERSION,
    seededAt: new Date().toISOString(),
    appName: 'Hospital HRM',
  });

  await batch.commit();
}

export async function createNewHireRecords(
  employee: Employee,
  user: AppUser,
  leaveBalances: LeaveBalance[]
): Promise<void> {
  return withStore(
    async () => {
      const batch = writeBatch(firestore);
      batch.set(doc(employeesCollection(), employee.employeeId), employee);
      batch.set(doc(usersCollection(), userDocId(user.email)), user);
      batch.set(doc(leaveBalancesCollection(), employee.employeeId), {
        employeeId: employee.employeeId,
        balances: leaveBalances,
      });
      await batch.commit();
    },
    () => localCreateNewHireRecords(employee, user, leaveBalances)
  );
}

export async function loadUsers(): Promise<AppUser[]> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snapshot = await getDocs(usersCollection());
    return snapshot.docs.map((item) => item.data() as AppUser);
  }, localLoadUsers);
}

export async function saveUsers(users: AppUser[]): Promise<void> {
  return withStore(async () => {
    const batch = writeBatch(firestore);
    users.forEach((user) => {
      batch.set(doc(usersCollection(), userDocId(user.email)), user);
    });
    await batch.commit();
  }, () => localSaveUsers(users));
}

export async function loadEmployees(): Promise<Employee[]> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snapshot = await getDocs(employeesCollection());

    return snapshot.docs.map((item) => {
      const raw = item.data() as Employee;
      const avatar = sanitizeEmployeeAvatar(raw.avatar);
      return {
        ...raw,
        avatar: avatar === raw.avatar ? raw.avatar : avatar,
        staffCategory: raw.staffCategory ?? 'staff',
        baseSalary: raw.baseSalary ?? 30000,
        busFare: raw.busFare ?? 0,
        dayShiftEnabled: raw.dayShiftEnabled ?? true,
        nightShiftEnabled: raw.nightShiftEnabled ?? false,
        dayShiftStart: raw.dayShiftStart ?? '09:00',
        dayShiftEnd: raw.dayShiftEnd ?? '17:00',
        nightShiftStart: raw.nightShiftStart ?? '21:00',
        nightShiftEnd: raw.nightShiftEnd ?? '05:00',
      };
    });
  }, localLoadEmployees);
}

export async function saveEmployees(employees: Employee[]): Promise<void> {
  return withStore(async () => {
    const batch = writeBatch(firestore);
    employees.forEach((employee) => {
      batch.set(doc(employeesCollection(), employee.employeeId), employee);
    });
    await batch.commit();
  }, () => localSaveEmployees(employees));
}

export async function loadLeaveBalancesMap(): Promise<Record<string, LeaveBalance[]>> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snapshot = await getDocs(leaveBalancesCollection());
    const map: Record<string, LeaveBalance[]> = {};
    snapshot.docs.forEach((item) => {
      const data = item.data() as { employeeId: string; balances: LeaveBalance[] };
      map[data.employeeId] = data.balances;
    });
    return map;
  }, localLoadLeaveBalancesMap);
}

export async function saveLeaveBalancesMap(map: Record<string, LeaveBalance[]>): Promise<void> {
  return withStore(async () => {
    const batch = writeBatch(firestore);
    Object.entries(map).forEach(([employeeId, balances]) => {
      batch.set(doc(leaveBalancesCollection(), employeeId), { employeeId, balances });
    });
    await batch.commit();
  }, () => localSaveLeaveBalancesMap(map));
}

export async function loadAllAttendance(): Promise<AttendanceRecord[]> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snapshot = await getDocs(attendanceCollection());
    return snapshot.docs.map((item) => {
      const raw = item.data() as AttendanceRecord;
      return {
        ...raw,
        otHours: raw.otHours ?? 0,
        scheduledHours: raw.scheduledHours ?? 0,
      };
    });
  }, localLoadAllAttendance);
}

export async function loadAttendanceForEmployee(employeeId: string): Promise<AttendanceRecord[]> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snapshot = await getDocs(query(attendanceCollection(), where('employeeId', '==', employeeId)));
    return snapshot.docs.map((item) => {
      const raw = item.data() as AttendanceRecord;
      return {
        ...raw,
        otHours: raw.otHours ?? 0,
        scheduledHours: raw.scheduledHours ?? 0,
      };
    });
  }, () => localLoadAttendanceForEmployee(employeeId));
}

export async function saveAttendanceRecords(records: AttendanceRecord[]): Promise<void> {
  return withStore(async () => {
    const batch = writeBatch(firestore);
    records.forEach((record) => {
      batch.set(doc(attendanceCollection(), record.id), record);
    });
    await batch.commit();
  }, () => localSaveAttendanceRecords(records));
}

export async function loadLeaveRequests(employeeId?: string): Promise<LeaveRequest[]> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snapshot = employeeId
      ? await getDocs(query(leaveRequestsCollection(), where('employeeId', '==', employeeId)))
      : await getDocs(leaveRequestsCollection());
    return snapshot.docs
      .map((item) => item.data() as LeaveRequest)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }, () => localLoadLeaveRequests(employeeId));
}

export async function saveLeaveRequests(requests: LeaveRequest[]): Promise<void> {
  return withStore(async () => {
    const batch = writeBatch(firestore);
    requests.forEach((request) => {
      batch.set(doc(leaveRequestsCollection(), request.id), request);
    });
    await batch.commit();
  }, () => localSaveLeaveRequests(requests));
}

export async function loadChatMessages(): Promise<ChatMessage[]> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snapshot = await getDocs(chatMessagesCollection());
    return snapshot.docs
      .map((item) => item.data() as ChatMessage)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, localLoadChatMessages);
}

export async function saveChatMessage(message: ChatMessage): Promise<void> {
  return withStore(
    () => setDoc(doc(chatMessagesCollection(), message.id), message),
    () => localSaveChatMessage(message)
  );
}

export async function loadSalarySlips(employeeId: string): Promise<SalarySlip[]> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snapshot = await getDocs(query(salarySlipsCollection(), where('employeeId', '==', employeeId)));
    return snapshot.docs
      .map((item) => item.data() as SalarySlip)
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month.localeCompare(a.month);
      });
  }, () => localLoadSalarySlips(employeeId));
}

export async function loadAllSalarySlips(): Promise<SalarySlip[]> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snapshot = await getDocs(salarySlipsCollection());
    return snapshot.docs.map((item) => item.data() as SalarySlip);
  }, localLoadAllSalarySlips);
}

export async function saveSalarySlips(slips: SalarySlip[]): Promise<void> {
  return withStore(async () => {
    const batch = writeBatch(firestore);
    slips.forEach((slip) => {
      batch.set(doc(salarySlipsCollection(), slip.id), slip);
    });
    await batch.commit();
  }, () => localSaveSalarySlips(slips));
}

export async function loadPerformanceReviews(employeeId: string): Promise<PerformanceReview[]> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snapshot = await getDocs(
      query(performanceReviewsCollection(), where('employeeId', '==', employeeId))
    );
    return snapshot.docs.map((item) => item.data() as PerformanceReview);
  }, () => localLoadPerformanceReviews(employeeId));
}

export async function loadAllShiftAssignments(): Promise<ShiftAssignment[]> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snapshot = await getDocs(shiftAssignmentsCollection());
    return snapshot.docs.map((item) => item.data() as ShiftAssignment);
  }, localLoadAllShiftAssignments);
}

export async function saveShiftAssignments(assignments: ShiftAssignment[]): Promise<void> {
  return withStore(async () => {
    const batch = writeBatch(firestore);
    assignments.forEach((assignment) => {
      batch.set(doc(shiftAssignmentsCollection(), assignment.id), assignment);
    });
    await batch.commit();
  }, () => localSaveShiftAssignments(assignments));
}

export async function deleteShiftAssignment(id: string): Promise<void> {
  return withStore(
    () => deleteDoc(doc(shiftAssignmentsCollection(), id)),
    () => localDeleteShiftAssignment(id)
  );
}
