import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

import { firebaseConfig } from '@/constants/firebase';

function createFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp(firebaseConfig);
}

export const firebaseApp = createFirebaseApp();
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);

/** Analytics only runs on web (not Android/iOS in Expo). */
export async function initFirebaseAnalytics() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  const { getAnalytics, isSupported } = await import('firebase/analytics');
  const supported = await isSupported();
  if (!supported) {
    return null;
  }

  return getAnalytics(firebaseApp);
}
