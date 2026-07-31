import { addDays, format, startOfDay } from 'date-fns';

import type { SelectOption } from '@/constants/leaveOptions';

export const DEPARTMENT_OPTIONS: SelectOption[] = [
  { value: 'Medical', label: 'Medical' },
  { value: 'Nursing', label: 'Nursing' },
  { value: 'Administration', label: 'Administration' },
  { value: 'Laboratory', label: 'Laboratory' },
  { value: 'Pharmacy', label: 'Pharmacy' },
  { value: 'Support', label: 'Support' },
];

export const POSITIONS_BY_DEPARTMENT: Record<string, SelectOption[]> = {
  Medical: [
    { value: 'General Physician', label: 'General Physician' },
    { value: 'Specialist Doctor', label: 'Specialist Doctor' },
    { value: 'Resident Doctor', label: 'Resident Doctor' },
    { value: 'Consultant', label: 'Consultant' },
  ],
  Nursing: [
    { value: 'Staff Nurse', label: 'Staff Nurse' },
    { value: 'Senior Nurse', label: 'Senior Nurse' },
    { value: 'Nursing Supervisor', label: 'Nursing Supervisor' },
  ],
  Administration: [
    { value: 'Receptionist', label: 'Receptionist' },
    { value: 'HR Executive', label: 'HR Executive' },
    { value: 'Admin Officer', label: 'Admin Officer' },
  ],
  Laboratory: [
    { value: 'Lab Technician', label: 'Lab Technician' },
    { value: 'Lab Supervisor', label: 'Lab Supervisor' },
  ],
  Pharmacy: [
    { value: 'Pharmacist', label: 'Pharmacist' },
    { value: 'Pharmacy Assistant', label: 'Pharmacy Assistant' },
  ],
  Support: [
    { value: 'Attendant', label: 'Attendant' },
    { value: 'Security', label: 'Security' },
    { value: 'Housekeeping', label: 'Housekeeping' },
  ],
};

export const STAFF_CATEGORY_OPTIONS: SelectOption[] = [
  { value: 'doctor', label: 'Doctor' },
  { value: 'staff', label: 'Staff' },
];

export const SHIFT_TYPE_OPTIONS: SelectOption[] = [
  { value: 'day', label: 'Day Shift' },
  { value: 'night', label: 'Night Shift' },
];

export function buildJoinDateOptions(pastDays = 3650, futureDays = 365): SelectOption[] {
  const today = startOfDay(new Date());
  const total = pastDays + futureDays + 1;
  return Array.from({ length: total }, (_, index) => {
    const date = addDays(today, index - pastDays);
    const value = format(date, 'yyyy-MM-dd');
    return {
      value,
      label: format(date, 'EEE, MMM d, yyyy'),
    };
  });
}

export function buildTimeOptions(stepMinutes = 30): SelectOption[] {
  const options: SelectOption[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    options.push({ value, label: value });
  }
  return options;
}
