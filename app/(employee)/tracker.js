import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { arrayUnion, doc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, Dimensions, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { auth, db } from '../../src/services/firebaseConfig';
import { BACKGROUND_LOCATION_TASK } from '../../src/services/locationTask'; 

// Safely load the native map ONLY if the app is running on a phone
let MapView = null;
let Polyline = null;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Polyline = Maps.Polyline;
}

export default function TrackerScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [locationSub, setLocationSub] = useState(null);
  const [status, setStatus] = useState('Idle');
  
  const [currentCoords, setCurrentCoords] = useState(null);
  const [routePoints, setRoutePoints] = useState([]);
  const [lastError, setLastError] = useState('');

  // 1. Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.replace('/');
        return;
      }
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, [router]);

 // 🧠 NEW: Smart Boot Sync
  // When the app opens, ask the OS if tracking is already running in the background.
  useEffect(() => {
    const syncTrackingState = async () => {
      if (!user) return;
      const today = new Date().toISOString().split('T')[0];
      const routeRef = doc(db, 'daily_routes', `${user.uid}_${today}`);

      // Ask the Operating System if our task survived the force-close
      const hasTask = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);

      if (hasTask) {
        console.log("🔄 Auto-resuming UI from background task...");
        setIsTracking(true);
        setStatus('Tracking live & in background...');
        
        // Tell Firestore we are definitely online
        setDoc(routeRef, { isActive: true }, { merge: true });

        // Re-attach the foreground UI watcher so the blue line draws on the screen
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Highest, timeInterval: 3000, distanceInterval: 0 },
          async (location) => {
            const newPoint = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            };
            setCurrentCoords(prev => ({ 
              ...newPoint, 
              latitudeDelta: prev?.latitudeDelta || 0.01, 
              longitudeDelta: prev?.longitudeDelta || 0.01 
            }));
            setRoutePoints(prev => [...prev, newPoint]);

            try {
              await setDoc(routeRef, {
                points: arrayUnion({ lat: newPoint.latitude, lng: newPoint.longitude, timestamp: Date.now() }),
                lastPing: Date.now(),
                isActive: true // Force active here too
              }, { merge: true });
            } catch (error) {
              console.error('Firestore push failed:', error);
            }
          }
        );
        setLocationSub(sub);
      } else {
        // Only kill the session if the OS confirms tracking is completely off
        setDoc(routeRef, { isActive: false }, { merge: true }).catch(() => {});
      }
    };

    syncTrackingState();
  }, [user]);

  // 2. Get initial location to center the map immediately
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      try {
        let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCurrentCoords({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      } catch (error) {
        console.warn("Could not get initial location map center");
      }
    })();

    return () => {
      if (locationSub) locationSub.remove();
    };
  }, []);

  // 3. The Core Tracking Logic (Foreground + Background)
  const toggleTracking = async () => {
    const today = new Date().toISOString().split('T')[0];
    const docId = `${user.uid}_${today}`;
    const routeRef = doc(db, 'daily_routes', docId);

    if (isTracking) {
      console.log('🛑 Stopping all tracking');
      
      if (locationSub) locationSub.remove();
      setLocationSub(null);

      const hasTask = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
      if (hasTask) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }

      setIsTracking(false);
      setStatus('Tracking stopped');
      await setDoc(routeRef, { isActive: false }, { merge: true });
      return;
    }

    if (!user) return;

    console.log('▶️ Requesting permissions');
    const fgPerm = await Location.requestForegroundPermissionsAsync();
    if (fgPerm.status !== 'granted') {
      Alert.alert('Permission denied', 'App needs location access to track routes.');
      return;
    }

    const bgPerm = await Location.requestBackgroundPermissionsAsync();
    if (bgPerm.status !== 'granted') {
      Alert.alert('Background Denied', 'Your route will only be recorded while your screen is on.');
    }

    setIsTracking(true);
    setStatus('Tracking live & in background...');
    setLastError('');

    // Set Active State (Without Push Token for now)
    setDoc(routeRef, {
      userId: user.uid,
      name: user.email.split('@')[0],
      date: today,
      isActive: true,
    }, { merge: true }).catch((error) => console.error('Firestore write failed:', error));

    // --- START BACKGROUND SERVICE ---
    if (bgPerm.status === 'granted') {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Highest,
        timeInterval: 10000, 
        distanceInterval: 5, 
        showsBackgroundLocationIndicator: true, 
        foregroundService: {
          notificationTitle: "Fieldo is active",
          notificationBody: "Tracking your shift route.",
          notificationColor: "#22C55E",
        },
      });
      console.log('🚀 Background Service Started!');
    }

    // --- START FOREGROUND UI WATCHER ---
    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Highest,
        timeInterval: 3000,
        distanceInterval: 0,
      },
      async (location) => {
        const newPoint = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };

        setCurrentCoords(prev => ({ 
          ...newPoint, 
          latitudeDelta: prev?.latitudeDelta || 0.01, 
          longitudeDelta: prev?.longitudeDelta || 0.01 
        }));
        setRoutePoints(prev => [...prev, newPoint]);

        try {
          await setDoc(routeRef, {
            points: arrayUnion({ 
              lat: location.coords.latitude, 
              lng: location.coords.longitude,
              timestamp: Date.now() 
            }),
            lastPing: Date.now() 
          }, { merge: true });
        } catch (error) {
          console.error('Firestore push failed:', error);
        }
      }
    );

    setLocationSub(sub);
  };

 return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        <View style={styles.loadingMap}>
          <Text style={{ color: '#94A3B8' }}>Employee Tracker is only available on the mobile app.</Text>
        </View>
      ) : currentCoords && MapView ? (
        <MapView
          style={styles.map}
          region={currentCoords}
          showsUserLocation={true}
          followsUserLocation={true}
        >
          {routePoints.length > 0 && Polyline && (
            <Polyline
              coordinates={routePoints}
              strokeColor="#38BDF8"
              strokeWidth={6}
            />
          )}
        </MapView>
      ) : (
        <View style={styles.loadingMap}>
          <Text style={{ color: '#94A3B8' }}>Finding your location...</Text>
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Fieldo</Text>
        <Pressable onPress={async () => {
          if (isTracking) await toggleTracking();
          auth.signOut();
        }}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.cardContainer}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Employee Tracker</Text>
          <Text style={styles.title}>Live Session</Text>
          <Text style={styles.status}>{status}</Text>

          <Pressable
            style={[styles.button, isTracking ? styles.stopButton : styles.startButton]}
            onPress={toggleTracking}>
            <Text style={styles.buttonText}>{isTracking ? 'Stop Tracking' : 'Start Tracking'}</Text>
          </Pressable>

          <View style={styles.pointCard}>
            <Text style={styles.pointLabel}>Last GPS point</Text>
            <Text style={styles.pointValue}>
              {currentCoords ? `${currentCoords.latitude.toFixed(5)}, ${currentCoords.longitude.toFixed(5)}` : 'Waiting for GPS...'}
            </Text>
            {lastError ? <Text style={styles.errorText}>{lastError}</Text> : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06101D' },
  map: { width: Dimensions.get('window').width, height: Dimensions.get('window').height },
  loadingMap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#06101D' },
  header: { position: 'absolute', top: 50, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(15, 27, 46, 0.9)', padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#223248' },
  headerTitle: { color: '#F8FAFC', fontSize: 20, fontWeight: '900' },
  logoutText: { color: '#EF4444', fontSize: 16, fontWeight: '700' },
  cardContainer: { position: 'absolute', bottom: 40, left: 20, right: 20, alignItems: 'center' },
  card: { width: '100%', maxWidth: 440, gap: 14, padding: 24, borderRadius: 22, backgroundColor: 'rgba(15, 27, 46, 0.95)', borderWidth: StyleSheet.hairlineWidth, borderColor: '#223248', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 15, elevation: 10 },
  kicker: { color: '#38BDF8', fontSize: 12, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  title: { color: '#F8FAFC', fontSize: 30, lineHeight: 36, fontWeight: '900' },
  status: { color: '#94A3B8', fontSize: 14 },
  button: { borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  startButton: { backgroundColor: '#22C55E' },
  stopButton: { backgroundColor: '#EF4444' },
  buttonText: { color: '#06101D', fontSize: 18, fontWeight: '900' },
  pointCard: { borderRadius: 16, padding: 16, backgroundColor: '#111C2E', borderWidth: StyleSheet.hairlineWidth, borderColor: '#334155', gap: 6 },
  pointLabel: { color: '#94A3B8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.9, fontWeight: '700' },
  pointValue: { color: '#F8FAFC', fontSize: 15, fontWeight: '700' },
  errorText: { color: '#FCA5A5', fontSize: 13, marginTop: 4 },
});