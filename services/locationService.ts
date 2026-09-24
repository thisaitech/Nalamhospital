import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type PunchGpsReading = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
};

export type PunchGpsFailureReason =
  | 'permission_denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported';

export type PunchGpsResult =
  | { ok: true; reading: PunchGpsReading }
  | { ok: false; reason: PunchGpsFailureReason; message: string };

const LOCATION_TIMEOUT_MS = 15000;

function failureMessage(reason: PunchGpsFailureReason): string {
  if (reason === 'permission_denied') {
    if (Platform.OS === 'web') {
      return (
        'Location was blocked. In your browser, open site settings for this page ' +
        '(lock icon near the address bar) → Location → Allow, then try again. ' +
        'You can also type latitude and longitude manually.'
      );
    }
    return 'Location permission was denied. Enable it in phone settings and try again.';
  }
  if (reason === 'timeout') {
    return 'Could not get a GPS fix in time. Move near a window, turn on device location, and try again.';
  }
  if (reason === 'unsupported') {
    return 'This browser does not support GPS. Enter latitude and longitude manually, or use Chrome/Edge on a phone.';
  }
  return 'Location is unavailable right now. Enter coordinates manually or try again.';
}

function mapNativeError(error: unknown): PunchGpsFailureReason {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('permission') || message.includes('denied')) return 'permission_denied';
  if (message.includes('timeout')) return 'timeout';
  return 'unavailable';
}

function readWebPosition(): Promise<PunchGpsReading> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('unsupported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters:
            typeof position.coords.accuracy === 'number' ? position.coords.accuracy : null,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) reject(new Error('permission_denied'));
        else if (error.code === error.TIMEOUT) reject(new Error('timeout'));
        else reject(new Error('unavailable'));
      },
      {
        enableHighAccuracy: true,
        timeout: LOCATION_TIMEOUT_MS,
        maximumAge: 0,
      }
    );
  });
}

async function readNativePosition(): Promise<PunchGpsReading> {
  const { status: currentStatus } = await Location.getForegroundPermissionsAsync();
  let finalStatus = currentStatus;
  if (currentStatus !== Location.PermissionStatus.GRANTED) {
    const { status } = await Location.requestForegroundPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== Location.PermissionStatus.GRANTED) {
    throw new Error('permission_denied');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters:
      typeof position.coords.accuracy === 'number' ? position.coords.accuracy : null,
  };
}

/** Best-effort GPS for punch-in / clinic setup. */
export async function getPunchGpsReading(): Promise<PunchGpsResult> {
  try {
    const reading = Platform.OS === 'web' ? await readWebPosition() : await readNativePosition();
    return { ok: true, reading };
  } catch (error) {
    const raw = error instanceof Error ? error.message.toLowerCase() : '';
    const reason: PunchGpsFailureReason = raw.includes('unsupported')
      ? 'unsupported'
      : raw.includes('permission')
        ? 'permission_denied'
        : raw.includes('timeout')
          ? 'timeout'
          : mapNativeError(error);
    return { ok: false, reason, message: failureMessage(reason) };
  }
}

export async function requestPunchLocationPermission(): Promise<boolean> {
  const result = await getPunchGpsReading();
  return result.ok;
}

/** Resolve a short place name from GPS coordinates (village, town, suburb, etc.). */
export async function reverseGeocodePlaceName(
  latitude: number,
  longitude: number
): Promise<string | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(latitude))}` +
      `&lon=${encodeURIComponent(String(longitude))}&format=json&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        'User-Agent': 'NalamHealthcare-HRM/1.0',
      },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      display_name?: string;
      address?: Record<string, string | undefined>;
    };
    const addr = data.address ?? {};
    const name =
      addr.village ||
      addr.town ||
      addr.city ||
      addr.suburb ||
      addr.neighbourhood ||
      addr.locality ||
      addr.hamlet ||
      addr.residential ||
      addr.county;

    if (name && String(name).trim()) {
      return String(name).trim();
    }

    if (typeof data.display_name === 'string' && data.display_name.trim()) {
      return data.display_name.split(',')[0]?.trim() ?? null;
    }

    return null;
  } catch {
    return null;
  }
}
