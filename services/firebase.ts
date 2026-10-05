import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { Platform } from 'react-native';

import { firebaseConfig } from '@/constants/firebase';

let firebaseApp: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;

function getFirebaseApp(): FirebaseApp {
  if (!firebaseApp) {
    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  return firebaseApp;
}

/** Lazy Firestore — avoids native init during module load before the JS runtime is ready. */
export function getFirestoreDb(): Firestore {
  if (firestoreInstance) {
    return firestoreInstance;
  }
  const app = getFirebaseApp();
  if (Platform.OS === 'web') {
    firestoreInstance = getFirestore(app);
    return firestoreInstance;
  }
  try {
    firestoreInstance = initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });
  } catch {
    firestoreInstance = getFirestore(app);
  }
  return firestoreInstance;
}

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

  return getAnalytics(getFirebaseApp());
}
