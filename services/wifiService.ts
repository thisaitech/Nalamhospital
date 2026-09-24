import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { ALLOWED_WIFI_SSIDS } from '@/constants/config';
import { isOfficeIpAddress } from '@/utils/officeNetwork';

export interface WifiVerificationResult {
  valid: boolean;
  ssid: string | null;
  ipAddress: string | null;
  connectionType: string;
  message: string;
}

function normalizeSsid(ssid: string): string {
  return ssid.replace(/^"|"$/g, '').trim();
}

function isAllowedSsid(ssid: string): boolean {
  const normalized = normalizeSsid(ssid).toLowerCase();
  return ALLOWED_WIFI_SSIDS.some((allowed) => allowed.toLowerCase() === normalized);
}

export async function requestWifiPermissions(): Promise<boolean> {
  try {
    const { status: currentStatus } = await Location.getForegroundPermissionsAsync();
    if (currentStatus === Location.PermissionStatus.GRANTED) {
      return true;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === Location.PermissionStatus.GRANTED;
  } catch {
    return false;
  }
}

export async function getCurrentWifiInfo(): Promise<{
  ssid: string | null;
  ipAddress: string | null;
  connectionType: string;
  isWifi: boolean;
}> {
  const state = await NetInfo.fetch();
  const isWifi = state.type === 'wifi';
  let ssid: string | null = null;
  let ipAddress: string | null = null;

  if (isWifi && state.details && 'ssid' in state.details) {
    const raw = state.details.ssid;
    ssid = raw ? normalizeSsid(String(raw)) : null;
  }

  if (isWifi && state.details && 'ipAddress' in state.details) {
    const rawIp = state.details.ipAddress;
    ipAddress = rawIp ? String(rawIp).trim() : null;
  }

  return {
    ssid,
    ipAddress,
    connectionType: state.type,
    isWifi,
  };
}

export async function verifyOfficeWifi(): Promise<WifiVerificationResult> {
  const hasPermission = await requestWifiPermissions();
  if (!hasPermission) {
    return {
      valid: false,
      ssid: null,
      ipAddress: null,
      connectionType: 'unknown',
      message:
        Platform.OS === 'web'
          ? 'Use the mobile app on THISAI WiFi.'
          : 'Allow location access to verify WiFi.',
    };
  }

  const { ssid, ipAddress, connectionType, isWifi } = await getCurrentWifiInfo();

  if (!isWifi) {
    return {
      valid: false,
      ssid: null,
      ipAddress,
      connectionType,
      message: 'Connect to THISAI WiFi.',
    };
  }

  if (!ssid) {
    return {
      valid: false,
      ssid: null,
      ipAddress,
      connectionType,
      message: 'Connect to THISAI WiFi.',
    };
  }

  if (!isAllowedSsid(ssid)) {
    return {
      valid: false,
      ssid,
      ipAddress,
      connectionType,
      message: 'Wrong network — connect to THISAI.',
    };
  }

  if (ipAddress && !isOfficeIpAddress(ipAddress)) {
    return {
      valid: false,
      ssid,
      ipAddress,
      connectionType,
      message: 'Wrong IP — use THISAI (192.168.100.x).',
    };
  }

  const ipNote = ipAddress ? ` · ${ipAddress}` : '';
  return {
    valid: true,
    ssid,
    ipAddress,
    connectionType,
    message: `Verified · ${ssid}${ipNote}`,
  };
}

export function getAllowedNetworks(): string[] {
  return [...ALLOWED_WIFI_SSIDS];
}
