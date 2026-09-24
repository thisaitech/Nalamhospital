import type { Clinic } from '@/types/clinic';
import type { PunchGpsReading } from '@/services/locationService';

const EARTH_RADIUS_M = 6371000;
const POOR_GPS_ACCURACY_M = 100;

/** Haversine distance in meters between two GPS points. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type PunchLocationStatus = 'in_clinic' | 'out_of_clinic' | 'unknown';

export type ClinicGeofence = {
  lat: number;
  lng: number;
  radiusMeters: number;
};

/** Active clinic GPS center + radius from saved location history or legacy fields. */
export function getActiveClinicGeofence(clinic: Clinic | null | undefined): ClinicGeofence | null {
  if (!clinic) return null;

  const activeEntry =
    clinic.locationHistory?.find((entry) => entry.isActive || entry.id === clinic.activeLocationId) ??
    null;

  const lat = activeEntry?.latitude ?? clinic.latitude ?? null;
  const lng = activeEntry?.longitude ?? clinic.longitude ?? null;
  const radiusMeters = activeEntry?.punchRadiusMeters ?? clinic.punchRadiusMeters ?? null;

  if (lat == null || lng == null || radiusMeters == null || radiusMeters <= 0) {
    return null;
  }

  return { lat, lng, radiusMeters };
}

export function outsideClinicRadiusMessage(distanceMeters: number, action = 'punch in'): string {
  return `You are outside the allowed clinic radius (${distanceMeters} meters away). Please move closer to ${action}.`;
}

/** Throws when GPS is missing, inaccurate, or outside the configured clinic radius. */
export function assertWithinClinicGeofence(params: {
  gps: PunchGpsReading | null;
  clinic: Clinic | null | undefined;
  action?: 'punch in' | 'punch out';
}): { distanceMeters: number | null } {
  const fence = getActiveClinicGeofence(params.clinic);
  if (!fence) {
    return { distanceMeters: null };
  }

  const actionLabel = params.action ?? 'punch in';

  if (!params.gps) {
    throw new Error(
      `Location is required to ${actionLabel}. Enable GPS in your phone settings and try again.`
    );
  }

  if (params.gps.accuracyMeters != null && params.gps.accuracyMeters > POOR_GPS_ACCURACY_M) {
    throw new Error(
      `GPS accuracy is too low (${Math.round(params.gps.accuracyMeters)} m). Move to an open area and try again to ${actionLabel}.`
    );
  }

  const dist = Math.round(distanceMeters(params.gps.latitude, params.gps.longitude, fence.lat, fence.lng));
  if (dist > fence.radiusMeters) {
    throw new Error(outsideClinicRadiusMessage(dist, actionLabel));
  }

  return { distanceMeters: dist };
}

export function resolvePunchLocationStatus(params: {
  userLat: number | null | undefined;
  userLng: number | null | undefined;
  clinicLat: number | null | undefined;
  clinicLng: number | null | undefined;
  radiusMeters: number | null | undefined;
}): { status: PunchLocationStatus; distanceMeters: number | null } {
  const { userLat, userLng, clinicLat, clinicLng, radiusMeters } = params;
  if (
    userLat == null ||
    userLng == null ||
    clinicLat == null ||
    clinicLng == null ||
    !radiusMeters ||
    radiusMeters <= 0
  ) {
    return { status: 'unknown', distanceMeters: null };
  }

  const dist = distanceMeters(userLat, userLng, clinicLat, clinicLng);
  return {
    status: dist <= radiusMeters ? 'in_clinic' : 'out_of_clinic',
    distanceMeters: Math.round(dist),
  };
}
