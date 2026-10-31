import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  initializeAuth,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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

const appAuth =
  Platform.OS === 'web'
    ? initializeAuth(firebaseApp, { persistence: browserLocalPersistence })
    : getAuth(firebaseApp);

export const auth = appAuth;
export const db = appDb;
export const firebaseAuth = appAuth;
export const firebaseDb = appDb;

export let analytics = null;
export let firebaseAnalytics = null;

if (Platform.OS === 'web') {
  const { getAnalytics, isSupported } = require('firebase/analytics');

  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(firebaseApp);
      firebaseAnalytics = analytics;
    }
  });
}