import {
  activateClinicLocation as activateClinicLocationInFirestore,
  createClinic as createClinicInFirestore,
  deactivateClinicLocation as deactivateClinicLocationInFirestore,
  loadClinics as loadClinicsFromFirestore,
  removeClinicLocation as removeClinicLocationInFirestore,
  saveClinicLocation as saveClinicLocationInFirestore,
  updateClinic as updateClinicInFirestore,
} from '@/services/firestoreRepository';
import type {
  Clinic,
  CreateClinicInput,
  SaveClinicLocationInput,
  UpdateClinicInput,
} from '@/types/clinic';

export async function loadClinics(): Promise<Clinic[]> {
  return loadClinicsFromFirestore();
}

export async function createClinic(input: CreateClinicInput): Promise<Clinic> {
  return createClinicInFirestore(input);
}

export async function updateClinic(clinicId: string, input: UpdateClinicInput): Promise<Clinic> {
  return updateClinicInFirestore(clinicId, input);
}

export async function saveClinicLocation(
  clinicId: string,
  input: SaveClinicLocationInput
): Promise<Clinic> {
  return saveClinicLocationInFirestore(clinicId, input);
}

export async function activateClinicLocation(clinicId: string, entryId: string): Promise<Clinic> {
  return activateClinicLocationInFirestore(clinicId, entryId);
}

export async function deactivateClinicLocation(clinicId: string, entryId: string): Promise<Clinic> {
  return deactivateClinicLocationInFirestore(clinicId, entryId);
}

export async function removeClinicLocation(clinicId: string, entryId: string): Promise<Clinic> {
  return removeClinicLocationInFirestore(clinicId, entryId);
}
