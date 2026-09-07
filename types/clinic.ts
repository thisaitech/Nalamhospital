export interface ClinicLocationHistoryEntry {
  id: string;
  latitude: number;
  longitude: number;
  punchRadiusMeters: number;
  /** Human-readable area name, e.g. Thisaiyanvilai or MBC Market. */
  placeName?: string | null;
  savedAt: string;
  savedBy?: string | null;
  isActive?: boolean;
}

export interface Clinic {
  id: string;
  name: string;
  address: string;
  active: boolean;
  createdAt: string;
  /** Active clinic GPS center for punch geofence. */
  latitude?: number | null;
  longitude?: number | null;
  /** Active allowed punch distance from center in meters. */
  punchRadiusMeters?: number | null;
  /** Saved location versions for this clinic. */
  locationHistory?: ClinicLocationHistoryEntry[];
  activeLocationId?: string | null;
}

export interface CreateClinicInput {
  name: string;
  address: string;
}

export interface UpdateClinicInput {
  name?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  punchRadiusMeters?: number | null;
}

export interface SaveClinicLocationInput {
  latitude: number;
  longitude: number;
  punchRadiusMeters: number;
  placeName?: string | null;
  savedBy?: string;
  /** When set, updates an existing history entry instead of creating a new one. */
  entryId?: string | null;
}

export const DEFAULT_CLINIC_ID = 'CLN001';

export const MAX_CLINIC_LOCATION_HISTORY = 30;
