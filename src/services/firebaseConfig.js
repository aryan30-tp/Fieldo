import { getAnalytics, isSupported } from 'firebase/analytics';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const firebaseConfig = {
  apiKey: 'AIzaSyDTeu1_adOPfbF8yQeSsbZoVSnsMQ2afUg',
  authDomain: 'fieldo-257c9.firebaseapp.com',
  projectId: 'fieldo-257c9',
  storageBucket: 'fieldo-257c9.firebasestorage.app',
  messagingSenderId: '1090320840826',
  appId: '1:1090320840826:web:87214808d2c4488adb63c3',
  measurementId: 'G-11GCRTVFSR',
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const appDb = getFirestore(firebaseApp);

let appAuth;

try {
  appAuth =
    Platform.OS === 'web'
      ? initializeAuth(firebaseApp, { persistence: browserLocalPersistence })
      : initializeAuth(firebaseApp, { persistence: getReactNativePersistence(AsyncStorage) });
} catch {
  appAuth = getAuth(firebaseApp);
}

export const auth = appAuth;
export const db = appDb;
export const firebaseAuth = appAuth;
export const firebaseDb = appDb;

export let analytics = null;
export let firebaseAnalytics = null;

if (Platform.OS === 'web') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(firebaseApp);
      firebaseAnalytics = analytics;
    }
  });
}