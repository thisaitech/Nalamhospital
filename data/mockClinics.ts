import { DEFAULT_CLINIC_ID, type Clinic } from '@/types/clinic';

/**
 * Display fallback only when an employee record has no clinic name.
 * Not written to Firestore automatically.
 */
export const DEFAULT_CLINIC: Clinic = {
  id: DEFAULT_CLINIC_ID,
  name: 'Clinic',
  address: '',
  active: true,
  createdAt: '2022-01-01T00:00:00.000Z',
};

/** No default clinics — admins create clinics in the app. */
export const MOCK_CLINICS: Clinic[] = [];
