import * as TaskManager from 'expo-task-manager';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebaseConfig';
import socketInstance from './socket'; // Import the service

export const BACKGROUND_LOCATION_TASK = 'background-location-tracking';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background task error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    const location = locations[0];

    if (location) {
      // We need to pull the current user from memory or standard global scope securely
      // For background tasks, we pull the cached active trace metadata
      console.log(`📱 Background GPS Ping:`, location.coords.latitude, location.coords.longitude);

      // 1. Emit live stream event directly over the WebSocket to Render
      // (Note: SocketInstance maintains its internal connection profile)
      // Replace with active session attributes dynamically if needed
      socketInstance.emitLocation({
        userId: "background_engine", 
        name: "Field Employee",
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        timestamp: Date.now()
      });

      // 2. Keep Firebase Updated as a low-frequency lightweight backup sync heartbeat
      // This satisfies our dashboard fallback mechanics
      const today = new Date().toISOString().split('T')[0];
      const routeRef = doc(db, 'daily_routes', `zombie_fallback_${today}`);
      await setDoc(routeRef, {
        lastPing: Date.now(),
        isActive: true
      }, { merge: true }).catch(() => {});
    }
  }
});