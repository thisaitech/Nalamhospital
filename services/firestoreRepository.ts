import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { DEFAULT_NORMAL_SHIFT_TIMINGS, DEFAULT_SHIFT_CHANGE_TIMINGS, INITIAL_USERS } from '@/constants/config';
import {
  FIRESTORE_COLLECTIONS,
  FIRESTORE_SEED_VERSION,
} from '@/constants/firestoreCollections';
import { MOCK_CLINICS, DEFAULT_CLINIC } from '@/data/mockClinics';
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
  localDeleteShiftAssignment,
  localEnsureSeed,
  localLoadAllAttendance,
  localLoadAllSalarySlips,
  localLoadAllShiftAssignments,
  localLoadAttendanceForEmployee,
  localLoadChatMessages,
  localLoadLeaveRequests,
  localLoadPerformanceReviews,
  localLoadSalarySlips,
  localSaveAttendanceRecords,
  localSaveChatMessage,
  localSaveLeaveRequests,
  localSaveSalarySlips,
  localSaveShiftAssignments,
  localLoadShiftChangeDates,
  localSaveShiftChangeDates,
  localLoadShiftChangeTimings,
  localSaveShiftChangeTimings,
  localLoadNormalShiftTimings,
  localSaveNormalShiftTimings,
  localLoadAttendanceRules,
  localSaveAttendanceRules,
  localLoadNotifications,
  localSaveNotifications,
  localLoadClinics,
  localSaveClinics,
  localLoadCompensatoryCredits,
  localSaveCompensatoryCredits,
} from '@/services/localRepository';
import { sanitizeEmployeeAvatar } from '@/components/ui/EmployeeAvatar';
import type { ChatMessage } from '@/types/chat';
import type { AdminNotification } from '@/types/notification';
import type { AttendanceRules } from '@/types/attendanceRules';
import { DEFAULT_ATTENDANCE_RULES } from '@/types/attendanceRules';
import { normalizeAttendanceRules } from '@/utils/attendanceRules';
import type {
  AppUser,
  AttendanceRecord,
  CompensatoryCredit,
  Employee,
  LeaveBalance,
  LeaveRequest,
  NormalShiftTimings,
  PerformanceReview,
  SalarySlip,
  ShiftAssignment,
  ShiftChangeTimings,
} from '@/types/employee';
import type { Clinic, CreateClinicInput, SaveClinicLocationInput, UpdateClinicInput } from '@/types/clinic';
import { DEFAULT_CLINIC_ID, MAX_CLINIC_LOCATION_HISTORY } from '@/types/clinic';

/** Firestore rejects `undefined` field values — omit them before writes. */
function stripUndefinedFields<T extends Record<string, unknown>>(value: T): T {
  const cleaned = { ...value };
  for (const key of Object.keys(cleaned)) {
    if (cleaned[key] === undefined) {
      delete cleaned[key];
    }
  }
  return cleaned;
}

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

/** Staff/doctor directory always uses Firestore — never the on-device fallback store. */
async function withCloudOnly<T>(cloud: () => Promise<T>): Promise<T> {
  try {
    return await cloud();
  } catch (error) {
    if (isPermissionError(error)) {
      throw new Error(
        'Could not save to Firebase. Check your internet connection and Firestore rules, then try again.'
      );
    }
    throw error;
  }
}

let cloudSeedPromise: Promise<void> | null = null;

async function ensureCloudFirestoreSeed(): Promise<void> {
  if (!cloudSeedPromise) {
    cloudSeedPromise = seedFirestoreIfNeeded(true).catch((error) => {
      cloudSeedPromise = null;
      throw error;
    });
  }
  await cloudSeedPromise;
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

function notificationsCollection() {
  return collection(firestore, FIRESTORE_COLLECTIONS.NOTIFICATIONS);
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

function clinicsCollection() {
  return collection(firestore, FIRESTORE_COLLECTIONS.CLINICS);
}

function clinicSettingsCollection() {
  return collection(firestore, FIRESTORE_COLLECTIONS.CLINIC_SETTINGS);
}

function compensatoryCreditsCollection() {
  return collection(firestore, FIRESTORE_COLLECTIONS.COMPENSATORY_CREDITS);
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

async function seedFirestoreIfNeeded(ignoreLocalMode = false): Promise<void> {
  if (!ignoreLocalMode && forceLocalMode) {
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

  MOCK_CLINICS.forEach((clinic) => {
    batch.set(doc(clinicsCollection(), clinic.id), clinic);
  });

  batch.set(metaRef, {
    seeded: true,
    seedVersion: FIRESTORE_SEED_VERSION,
    seededAt: new Date().toISOString(),
    appName: 'Nalam Healthcare',
  });

  await batch.commit();
}

async function ensureClinicsSeeded(): Promise<void> {
  const snapshot = await getDocs(clinicsCollection());
  if (snapshot.empty) {
    const batch = writeBatch(firestore);
    MOCK_CLINICS.forEach((clinic) => {
      batch.set(doc(clinicsCollection(), clinic.id), clinic);
    });
    await batch.commit();
  }
}

function nextClinicId(clinics: Clinic[]): string {
  const nums = clinics
    .map((c) => parseInt(c.id.replace('CLN', ''), 10))
    .filter((n) => !Number.isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `CLN${String(next).padStart(3, '0')}`;
}

function withClinicDefaults(raw: Clinic): Clinic {
  const latitude = raw.latitude ?? null;
  const longitude = raw.longitude ?? null;
  const punchRadiusMeters = raw.punchRadiusMeters ?? 150;
  let locationHistory = raw.locationHistory ?? [];
  let activeLocationId = raw.activeLocationId ?? null;

  if (locationHistory.length === 0 && latitude != null && longitude != null) {
    const legacyId = `loc_${raw.id}_legacy`;
    locationHistory = [
      {
        id: legacyId,
        latitude,
        longitude,
        punchRadiusMeters,
        savedAt: raw.createdAt ?? new Date().toISOString(),
        savedBy: null,
        isActive: true,
      },
    ];
    activeLocationId = legacyId;
  }

  return {
    ...raw,
    active: raw.active ?? true,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    latitude,
    longitude,
    punchRadiusMeters,
    locationHistory,
    activeLocationId,
  };
}

function validateClinicLocationInput(input: SaveClinicLocationInput) {
  if (input.latitude < -90 || input.latitude > 90) {
    throw new Error('Latitude must be between -90 and 90.');
  }
  if (input.longitude < -180 || input.longitude > 180) {
    throw new Error('Longitude must be between -180 and 180.');
  }
  if (input.punchRadiusMeters < 20 || input.punchRadiusMeters > 5000) {
    throw new Error('Punch radius must be between 20 and 5000 meters.');
  }
}

function withEmployeeClinicDefaults(raw: Employee): Employee {
  const avatar = sanitizeEmployeeAvatar(raw.avatar);
  const employee: Employee = {
    ...raw,
    staffCategory: raw.staffCategory ?? 'staff',
    baseSalary: raw.baseSalary ?? 30000,
    busFare: raw.busFare ?? 0,
    dayShiftEnabled: raw.dayShiftEnabled ?? true,
    nightShiftEnabled: raw.nightShiftEnabled ?? false,
    is24HourDuty: raw.is24HourDuty ?? false,
    dayShiftStart: raw.dayShiftStart ?? '08:00',
    dayShiftEnd: raw.dayShiftEnd ?? '20:00',
    nightShiftStart: raw.nightShiftStart ?? '20:00',
    nightShiftEnd: raw.nightShiftEnd ?? '08:00',
    clinicId: raw.clinicId ?? DEFAULT_CLINIC_ID,
    clinicName: raw.clinicName ?? DEFAULT_CLINIC.name,
    deletedAt: raw.deletedAt ?? null,
  };
  if (avatar) {
    employee.avatar = avatar;
  } else {
    delete employee.avatar;
  }
  return employee;
}

export async function loadClinics(): Promise<Clinic[]> {
  return withCloudOnly(async () => {
    await ensureCloudFirestoreSeed();
    await ensureClinicsSeeded();
    const snapshot = await getDocs(clinicsCollection());
    return snapshot.docs
      .map((item) => withClinicDefaults(item.data() as Clinic))
      .filter((c) => c.active)
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function createClinic(input: CreateClinicInput): Promise<Clinic> {
  return withCloudOnly(async () => {
    await ensureClinicsSeeded();
    const name = input.name.trim();
    const address = input.address.trim();
    if (!name) {
      throw new Error('Clinic name is required.');
    }
    if (!address) {
      throw new Error('Clinic address is required.');
    }

    const existing = await getDocs(clinicsCollection());
    const clinics = existing.docs.map((item) => item.data() as Clinic);
    const clinic: Clinic = {
      id: nextClinicId(clinics),
      name,
      address,
      active: true,
      createdAt: new Date().toISOString(),
      latitude: null,
      longitude: null,
      punchRadiusMeters: 150,
    };
    await setDoc(doc(clinicsCollection(), clinic.id), clinic);
    return withClinicDefaults(clinic);
  });
}

export async function updateClinic(clinicId: string, input: UpdateClinicInput): Promise<Clinic> {
  return withCloudOnly(async () => {
    await ensureClinicsSeeded();
    const ref = doc(clinicsCollection(), clinicId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error('Clinic not found');
    }

    const current = withClinicDefaults(snap.data() as Clinic);
    const next: Clinic = { ...current };

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error('Clinic name is required.');
      next.name = name;
    }
    if (input.address !== undefined) {
      const address = input.address.trim();
      if (!address) throw new Error('Clinic address is required.');
      next.address = address;
    }
    if (input.latitude !== undefined) next.latitude = input.latitude;
    if (input.longitude !== undefined) next.longitude = input.longitude;
    if (input.punchRadiusMeters !== undefined) {
      const radius = input.punchRadiusMeters;
      if (radius != null && (radius < 20 || radius > 5000)) {
        throw new Error('Punch radius must be between 20 and 5000 meters.');
      }
      next.punchRadiusMeters = radius;
    }

    await updateDoc(ref, {
      name: next.name,
      address: next.address,
      latitude: next.latitude ?? null,
      longitude: next.longitude ?? null,
      punchRadiusMeters: next.punchRadiusMeters ?? 150,
    });
    return withClinicDefaults(next);
  });
}

export async function saveClinicLocation(
  clinicId: string,
  input: SaveClinicLocationInput
): Promise<Clinic> {
  return withCloudOnly(async () => {
    await ensureClinicsSeeded();
    validateClinicLocationInput(input);

    const ref = doc(clinicsCollection(), clinicId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error('Clinic not found');
    }

    const current = withClinicDefaults(snap.data() as Clinic);
    const savedAt = new Date().toISOString();
    let history = [...(current.locationHistory ?? [])];
    let entryId = input.entryId ?? null;

    if (entryId && history.some((entry) => entry.id === entryId)) {
      history = history.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              latitude: input.latitude,
              longitude: input.longitude,
              punchRadiusMeters: input.punchRadiusMeters,
              placeName: input.placeName?.trim() || entry.placeName || null,
              savedAt,
              savedBy: input.savedBy ?? entry.savedBy ?? null,
              isActive: true,
            }
          : { ...entry, isActive: false }
      );
    } else {
      entryId = `loc_${Date.now()}`;
      history = [
        {
          id: entryId,
          latitude: input.latitude,
          longitude: input.longitude,
          punchRadiusMeters: input.punchRadiusMeters,
          placeName: input.placeName?.trim() || null,
          savedAt,
          savedBy: input.savedBy ?? null,
          isActive: true,
        },
        ...history.map((entry) => ({ ...entry, isActive: false })),
      ].slice(0, MAX_CLINIC_LOCATION_HISTORY);
    }

    const next: Clinic = {
      ...current,
      latitude: input.latitude,
      longitude: input.longitude,
      punchRadiusMeters: input.punchRadiusMeters,
      activeLocationId: entryId,
      locationHistory: history,
    };

    await updateDoc(ref, {
      latitude: next.latitude,
      longitude: next.longitude,
      punchRadiusMeters: next.punchRadiusMeters,
      activeLocationId: next.activeLocationId,
      locationHistory: next.locationHistory,
    });
    return withClinicDefaults(next);
  });
}

export async function activateClinicLocation(clinicId: string, entryId: string): Promise<Clinic> {
  return withCloudOnly(async () => {
    await ensureClinicsSeeded();
    const ref = doc(clinicsCollection(), clinicId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error('Clinic not found');
    }

    const current = withClinicDefaults(snap.data() as Clinic);
    const target = current.locationHistory?.find((entry) => entry.id === entryId);
    if (!target) {
      throw new Error('Saved location not found');
    }

    const history = (current.locationHistory ?? []).map((entry) => ({
      ...entry,
      isActive: entry.id === entryId,
    }));

    const next: Clinic = {
      ...current,
      latitude: target.latitude,
      longitude: target.longitude,
      punchRadiusMeters: target.punchRadiusMeters,
      activeLocationId: entryId,
      locationHistory: history,
    };

    await updateDoc(ref, {
      latitude: next.latitude,
      longitude: next.longitude,
      punchRadiusMeters: next.punchRadiusMeters,
      activeLocationId: next.activeLocationId,
      locationHistory: next.locationHistory,
    });
    return withClinicDefaults(next);
  });
}

export async function deactivateClinicLocation(clinicId: string, entryId: string): Promise<Clinic> {
  return withCloudOnly(async () => {
    await ensureClinicsSeeded();
    const ref = doc(clinicsCollection(), clinicId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error('Clinic not found');
    }

    const current = withClinicDefaults(snap.data() as Clinic);
    const target = current.locationHistory?.find((entry) => entry.id === entryId);
    if (!target) {
      throw new Error('Saved location not found');
    }
    if (!target.isActive) {
      return current;
    }

    const history = (current.locationHistory ?? []).map((entry) => ({
      ...entry,
      isActive: false,
    }));

    const next: Clinic = {
      ...current,
      latitude: null,
      longitude: null,
      activeLocationId: null,
      locationHistory: history,
    };

    await updateDoc(ref, {
      latitude: null,
      longitude: null,
      activeLocationId: null,
      locationHistory: next.locationHistory,
    });
    return withClinicDefaults(next);
  });
}

export async function removeClinicLocation(clinicId: string, entryId: string): Promise<Clinic> {
  return withCloudOnly(async () => {
    await ensureClinicsSeeded();
    const ref = doc(clinicsCollection(), clinicId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error('Clinic not found');
    }

    const current = withClinicDefaults(snap.data() as Clinic);
    const target = current.locationHistory?.find((entry) => entry.id === entryId);
    if (!target) {
      throw new Error('Saved location not found');
    }

    const history = (current.locationHistory ?? []).filter((entry) => entry.id !== entryId);
    const wasActive = Boolean(target.isActive || current.activeLocationId === entryId);
    const next: Clinic = wasActive
      ? {
          ...current,
          latitude: null,
          longitude: null,
          activeLocationId: null,
          locationHistory: history.map((entry) => ({ ...entry, isActive: false })),
        }
      : {
          ...current,
          locationHistory: history,
        };

    await updateDoc(ref, {
      latitude: next.latitude ?? null,
      longitude: next.longitude ?? null,
      activeLocationId: next.activeLocationId ?? null,
      locationHistory: next.locationHistory,
    });
    return withClinicDefaults(next);
  });
}

export async function createNewHireRecords(
  employee: Employee,
  user: AppUser,
  leaveBalances: LeaveBalance[]
): Promise<void> {
  return withCloudOnly(async () => {
    const batch = writeBatch(firestore);
    batch.set(
      doc(employeesCollection(), employee.employeeId),
      stripUndefinedFields(employee as unknown as Record<string, unknown>)
    );
    batch.set(
      doc(usersCollection(), userDocId(user.email)),
      stripUndefinedFields(user as unknown as Record<string, unknown>)
    );
    batch.set(doc(leaveBalancesCollection(), employee.employeeId), {
      employeeId: employee.employeeId,
      balances: leaveBalances,
    });
    await batch.commit();
  });
}

export async function loadUsers(): Promise<AppUser[]> {
  return withCloudOnly(async () => {
    await ensureCloudFirestoreSeed();
    const snapshot = await getDocs(usersCollection());
    return snapshot.docs.map((item) => item.data() as AppUser);
  });
}

export async function saveUsers(users: AppUser[]): Promise<void> {
  return withCloudOnly(async () => {
    const batch = writeBatch(firestore);
    users.forEach((user) => {
      batch.set(doc(usersCollection(), userDocId(user.email)), user);
    });
    await batch.commit();
  });
}

export async function loadEmployees(): Promise<Employee[]> {
  return withCloudOnly(async () => {
    await ensureCloudFirestoreSeed();
    const snapshot = await getDocs(employeesCollection());

    return snapshot.docs.map((item) => withEmployeeClinicDefaults(item.data() as Employee));
  });
}

export async function saveEmployees(employees: Employee[]): Promise<void> {
  return withCloudOnly(async () => {
    const batch = writeBatch(firestore);
    employees.forEach((employee) => {
      batch.set(
        doc(employeesCollection(), employee.employeeId),
        stripUndefinedFields(employee as unknown as Record<string, unknown>)
      );
    });
    await batch.commit();
  });
}

export async function loadLeaveBalancesMap(): Promise<Record<string, LeaveBalance[]>> {
  return withCloudOnly(async () => {
    await ensureCloudFirestoreSeed();
    const snapshot = await getDocs(leaveBalancesCollection());
    const map: Record<string, LeaveBalance[]> = {};
    snapshot.docs.forEach((item) => {
      const data = item.data() as { employeeId: string; balances: LeaveBalance[] };
      map[data.employeeId] = data.balances;
    });
    return map;
  });
}

export async function saveLeaveBalancesMap(map: Record<string, LeaveBalance[]>): Promise<void> {
  return withCloudOnly(async () => {
    const batch = writeBatch(firestore);
    Object.entries(map).forEach(([employeeId, balances]) => {
      batch.set(doc(leaveBalancesCollection(), employeeId), { employeeId, balances });
    });
    await batch.commit();
  });
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
        continuePunchIn: raw.continuePunchIn ?? null,
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
        continuePunchIn: raw.continuePunchIn ?? null,
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

export async function loadNotifications(employeeId?: string): Promise<AdminNotification[]> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snapshot = employeeId
      ? await getDocs(query(notificationsCollection(), where('employeeId', '==', employeeId)))
      : await getDocs(notificationsCollection());
    return snapshot.docs
      .map((item) => item.data() as AdminNotification)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, () => localLoadNotifications(employeeId));
}

export async function saveNotifications(notifications: AdminNotification[]): Promise<void> {
  return withStore(async () => {
    const batch = writeBatch(firestore);
    notifications.forEach((notification) => {
      batch.set(doc(notificationsCollection(), notification.id), notification);
    });
    await batch.commit();
  }, () => localSaveNotifications(notifications));
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

export async function loadShiftChangeDates(): Promise<string[]> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snap = await getDoc(doc(clinicSettingsCollection(), 'shiftChangeDates'));
    if (!snap.exists()) return [];
    const dates = snap.data()?.dates;
    return Array.isArray(dates) ? (dates as string[]).sort() : [];
  }, localLoadShiftChangeDates);
}

export async function saveShiftChangeDates(dates: string[]): Promise<void> {
  const unique = Array.from(new Set(dates)).sort();
  return withStore(async () => {
    await setDoc(doc(clinicSettingsCollection(), 'shiftChangeDates'), { dates: unique });
  }, () => localSaveShiftChangeDates(unique));
}

function normalizeShiftChangeTimings(raw: Partial<ShiftChangeTimings> | undefined): ShiftChangeTimings {
  return {
    nightStart: raw?.nightStart ?? DEFAULT_SHIFT_CHANGE_TIMINGS.nightStart,
    nightEnd: raw?.nightEnd ?? DEFAULT_SHIFT_CHANGE_TIMINGS.nightEnd,
    dayStart: raw?.dayStart ?? DEFAULT_SHIFT_CHANGE_TIMINGS.dayStart,
    dayEnd: raw?.dayEnd ?? DEFAULT_SHIFT_CHANGE_TIMINGS.dayEnd,
  };
}

export async function loadShiftChangeTimings(): Promise<ShiftChangeTimings> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snap = await getDoc(doc(clinicSettingsCollection(), 'shiftChangeTimings'));
    if (!snap.exists()) return { ...DEFAULT_SHIFT_CHANGE_TIMINGS };
    return normalizeShiftChangeTimings(snap.data() as Partial<ShiftChangeTimings>);
  }, async () => {
    const stored = await localLoadShiftChangeTimings();
    return stored ? normalizeShiftChangeTimings(stored) : { ...DEFAULT_SHIFT_CHANGE_TIMINGS };
  });
}

export async function saveShiftChangeTimings(timings: ShiftChangeTimings): Promise<void> {
  const normalized = normalizeShiftChangeTimings(timings);
  return withStore(async () => {
    await setDoc(doc(clinicSettingsCollection(), 'shiftChangeTimings'), normalized);
  }, () => localSaveShiftChangeTimings(normalized));
}

function normalizeNormalShiftTimings(raw: Partial<NormalShiftTimings> | undefined): NormalShiftTimings {
  return {
    dayStart: raw?.dayStart ?? DEFAULT_NORMAL_SHIFT_TIMINGS.dayStart,
    dayEnd: raw?.dayEnd ?? DEFAULT_NORMAL_SHIFT_TIMINGS.dayEnd,
    nightStart: raw?.nightStart ?? DEFAULT_NORMAL_SHIFT_TIMINGS.nightStart,
    nightEnd: raw?.nightEnd ?? DEFAULT_NORMAL_SHIFT_TIMINGS.nightEnd,
  };
}

export async function loadNormalShiftTimings(): Promise<NormalShiftTimings> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snap = await getDoc(doc(clinicSettingsCollection(), 'normalShiftTimings'));
    if (!snap.exists()) return { ...DEFAULT_NORMAL_SHIFT_TIMINGS };
    return normalizeNormalShiftTimings(snap.data() as Partial<NormalShiftTimings>);
  }, async () => {
    const stored = await localLoadNormalShiftTimings();
    return stored ? normalizeNormalShiftTimings(stored) : { ...DEFAULT_NORMAL_SHIFT_TIMINGS };
  });
}

export async function saveNormalShiftTimings(timings: NormalShiftTimings): Promise<void> {
  const normalized = normalizeNormalShiftTimings(timings);
  return withStore(async () => {
    await setDoc(doc(clinicSettingsCollection(), 'normalShiftTimings'), normalized);
  }, () => localSaveNormalShiftTimings(normalized));
}

export async function loadAttendanceRules(): Promise<AttendanceRules> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snap = await getDoc(doc(clinicSettingsCollection(), 'attendanceRules'));
    if (!snap.exists()) return { ...DEFAULT_ATTENDANCE_RULES };
    return normalizeAttendanceRules(snap.data() as Partial<AttendanceRules>);
  }, async () => {
    const stored = await localLoadAttendanceRules();
    return stored ? normalizeAttendanceRules(stored) : { ...DEFAULT_ATTENDANCE_RULES };
  });
}

export async function saveAttendanceRules(rules: AttendanceRules): Promise<void> {
  const normalized = normalizeAttendanceRules(rules);
  return withStore(async () => {
    await setDoc(doc(clinicSettingsCollection(), 'attendanceRules'), normalized);
  }, () => localSaveAttendanceRules(normalized));
}

export async function loadCompensatoryCredits(employeeId?: string): Promise<CompensatoryCredit[]> {
  return withStore(async () => {
    await ensureFirestoreSeed();
    const snapshot = employeeId
      ? await getDocs(query(compensatoryCreditsCollection(), where('employeeId', '==', employeeId)))
      : await getDocs(compensatoryCreditsCollection());
    return snapshot.docs
      .map((item) => item.data() as CompensatoryCredit)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, () => localLoadCompensatoryCredits(employeeId));
}

export async function saveCompensatoryCredits(credits: CompensatoryCredit[]): Promise<void> {
  return withStore(async () => {
    const batch = writeBatch(firestore);
    credits.forEach((credit) => {
      batch.set(doc(compensatoryCreditsCollection(), credit.id), credit);
    });
    await batch.commit();
  }, () => localSaveCompensatoryCredits(credits));
}
