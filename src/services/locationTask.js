import * as TaskManager from 'expo-task-manager';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

export const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';

// Define the global background task running at the OS level
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error("Background location task error:", error);
    return;
  }

  if (data) {
    const { locations } = data;
    if (!locations || locations.length === 0) return;

    // Grab the securely logged-in user
    const user = auth.currentUser;
    if (!user) return; // Stop if no one is logged in

    const location = locations[0];
    const newCoords = {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      timestamp: Date.now(), // ⏱️ ADD THIS: Time the point was recorded
    };
    
    console.log("🌌 Background GPS Ping:", newCoords);

    try {
      const today = new Date().toISOString().split('T')[0];
      const docId = `${user.uid}_${today}`;
      const routeRef = doc(db, 'daily_routes', docId);

      // Push exactly like the foreground UI does
      await setDoc(routeRef, {
        points: arrayUnion({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          timestamp: Date.now()
        }),
        lastPing: Date.now(),
        isActive: true // 🟢 ADD THIS: Force the status to true on every ping!
      }, { merge: true });
      
    } catch (err) {
      console.error("Failed to write background ping to Firestore:", err);
    }
  }
});