import * as TaskManager from 'expo-task-manager';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebaseConfig';
import socketInstance from './socket'; // Import the service
import AsyncStorage from '@react-native-async-storage/async-storage';

export const BACKGROUND_LOCATION_TASK = 'background-location-tracking';
const ACTIVE_USER_KEY = '@fieldo_active_user';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background task error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    const location = locations[0];

    if (location) {
      const activeUserJson = await AsyncStorage.getItem(ACTIVE_USER_KEY);
      const activeUser = activeUserJson ? JSON.parse(activeUserJson) : null;
      if (!activeUser?.userId || !activeUser?.email) return;

      const timestamp = Date.now();
      const today = new Date().toISOString().split('T')[0];
      const routeRef = doc(db, 'daily_routes', `${activeUser.userId}_${today}`);
      await setDoc(routeRef, {
        userId: activeUser.userId,
        name: activeUser.email.split('@')[0],
        date: today,
        points: arrayUnion({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          timestamp
        }),
        lastPing: timestamp,
        isActive: true
      }, { merge: true });

      socketInstance.connect(activeUser.userId);
      socketInstance.emitLocation({
        userId: activeUser.userId,
        name: activeUser.email.split('@')[0],
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        timestamp
      });
    }
  }
});