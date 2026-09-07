const EARTH_RADIUS_M = 6371000;

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
