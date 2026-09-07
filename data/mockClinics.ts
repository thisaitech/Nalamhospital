import { DEFAULT_CLINIC_ID, type Clinic } from '@/types/clinic';

export const DEFAULT_CLINIC: Clinic = {
  id: DEFAULT_CLINIC_ID,
  name: 'Nalam Clinic',
  address: 'Main Branch, City Center',
  active: true,
  createdAt: '2022-01-01T00:00:00.000Z',
};

export const MOCK_CLINICS: Clinic[] = [DEFAULT_CLINIC];
