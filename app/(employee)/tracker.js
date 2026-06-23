import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { arrayUnion, doc, setDoc } from 'firebase/firestore';
import { useEffect, useState, useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, Dimensions, Platform, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { auth, db } from '../../src/services/firebaseConfig';
import { BACKGROUND_LOCATION_TASK } from '../../src/services/locationTask'; 
import socketInstance from '../../src/services/socket';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

let MapView = null;
let Polyline = null;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Polyline = Maps.Polyline;
}

const OFFLINE_STORAGE_KEY = '@fieldo_offline_points';
const OFFLINE_VISITS_KEY = '@fieldo_offline_visits';

export default function TrackerScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [locationSub, setLocationSub] = useState(null);
  const [status, setStatus] = useState('Idle');
  
  const [currentCoords, setCurrentCoords] = useState(null);
  const [routePoints, setRoutePoints] = useState([]);
  const [lastError, setLastError] = useState('');

  // 📝 CRM Visit Form States
  const [clientName, setClientName] = useState('');
  const [summary, setSummary] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  // 1. Auth Listener & Profile Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace('/');
        return;
      }
      setUser(currentUser);
      socketInstance.connect(currentUser.uid);

      try {
        await fetch("https://fieldo.onrender.com/api/employees/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: currentUser.uid,
            name: currentUser.email.split('@')[0],
            email: currentUser.email
          })
        });
      } catch (err) {
        console.log("Failed to sync profile to MongoDB roster:", err);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // 📥 DUAL-QUEUE OFFLINE SYNC BATCH PROXIES
  const handleNewLocationPoint = async (newPoint, latitude, longitude) => {
    if (!user) return;
    const state = await NetInfo.fetch();
    const today = new Date().toISOString().split('T')[0];
    const routeRef = doc(db, 'daily_routes', `${user.uid}_${today}`);

    if (state.isConnected && state.isInternetReachable) {
      // 🌐 ONLINE PROXY: Stream over WebSocket & Firestore instantly
      socketInstance.emitLocation({
        userId: user.uid,
        name: user.email.split('@')[0],
        lat: latitude,
        lng: longitude,
        timestamp: Date.now()
      });

      try {
        await setDoc(routeRef, {
          points: arrayUnion({ lat: latitude, lng: longitude, timestamp: Date.now() }),
          lastPing: Date.now(),
          isActive: true
        }, { merge: true });
      } catch (error) {
        console.error('Firestore push failed:', error);
      }
    } else {
      // 🚫 OFFLINE PROXY: Queue coordinate data locally to disk hardware
      try {
        const existingData = await AsyncStorage.getItem(OFFLINE_STORAGE_KEY);
        const pointsList = existingData ? JSON.parse(existingData) : [];
        
        pointsList.push({
          lat: latitude,
          lng: longitude,
          timestamp: Date.now()
        });

        await AsyncStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(pointsList));
        console.log(`📍 Cached location point locally. Pending cluster: ${pointsList.length}`);
      } catch (err) {
        console.error("Failed to write coordinates to AsyncStorage:", err);
      }
    }
  };

  const syncCachedPayloadsToServer = useCallback(async () => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];

    // --- BATCH STREAM 1: COORDINATES SYNC ---
    try {
      const cachedData = await AsyncStorage.getItem(OFFLINE_STORAGE_KEY);
      if (cachedData) {
        const pointsToSync = JSON.parse(cachedData);
        if (pointsToSync.length > 0) {
          console.log("⚡ Network recovered! Flushing offline coordinate trails...");
          const response = await fetch('https://fieldo.onrender.com/api/routes/sync-offline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.uid,
              name: user.email.split('@')[0],
              date: today,
              points: pointsToSync
            })
          });
          if (response.ok) {
            await AsyncStorage.removeItem(OFFLINE_STORAGE_KEY);
            console.log("✅ Coordinate cache emptied out successfully.");
          }
        }
      }
    } catch (err) {
      console.error("Failed to sync trailing locations:", err);
    }

    // --- BATCH STREAM 2: CRM VISIT NOTES SYNC ---
    try {
      const cachedVisits = await AsyncStorage.getItem(OFFLINE_VISITS_KEY);
      if (cachedVisits) {
        const visitsToSync = JSON.parse(cachedVisits);
        if (visitsToSync.length > 0) {
          console.log("⚡ Network recovered! Flushing pending offline CRM visit notes...");
          const response = await fetch('https://fieldo.onrender.com/api/visits/sync-offline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visits: visitsToSync })
          });
          if (response.ok) {
            await AsyncStorage.removeItem(OFFLINE_VISITS_KEY);
            console.log("✅ Offline visit logs database synchronized cleanly.");
          }
        }
      }
    } catch (err) {
      console.error("Failed to batch upload queued visit summaries:", err);
    }
  }, [user]);

  // NetInfo network subscriber setup
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        syncCachedPayloadsToServer();
      }
    });
    return () => unsubscribe();
  }, [syncCachedPayloadsToServer]);

  // Smart Boot Sync
  useEffect(() => {
    const syncTrackingState = async () => {
      if (!user) return;
      const today = new Date().toISOString().split('T')[0];
      const routeRef = doc(db, 'daily_routes', `${user.uid}_${today}`);
      const hasTask = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);

      if (hasTask) {
        setIsTracking(true);
        setStatus('Tracking live & in background...');
        setDoc(routeRef, { isActive: true }, { merge: true });

        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Highest, timeInterval: 3000, distanceInterval: 0 },
          async (location) => {
            const newPoint = { latitude: location.coords.latitude, longitude: location.coords.longitude };
            setCurrentCoords(prev => ({ 
              ...newPoint, 
              latitudeDelta: prev?.latitudeDelta || 0.01, 
              longitudeDelta: prev?.longitudeDelta || 0.01 
            }));
            setRoutePoints(prev => [...prev, newPoint]);

            await handleNewLocationPoint(newPoint, location.coords.latitude, location.coords.longitude);
          }
        );
        setLocationSub(sub);
      } else {
        setDoc(routeRef, { isActive: false }, { merge: true }).catch(() => {});
      }
    };
    syncTrackingState();
  }, [user]);

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
    return () => { if (locationSub) locationSub.remove(); };
  }, [locationSub]);

  const toggleTracking = async () => {
    const today = new Date().toISOString().split('T')[0];
    const docId = `${user.uid}_${today}`;
    const routeRef = doc(db, 'daily_routes', docId);

    if (isTracking) {
      if (locationSub) locationSub.remove();
      setLocationSub(null);
      const hasTask = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
      if (hasTask) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      setIsTracking(false);
      setStatus('Tracking stopped');
      await setDoc(routeRef, { isActive: false }, { merge: true });
      return;
    }

    if (!user) return;

    const fgPerm = await Location.requestForegroundPermissionsAsync();
    if (fgPerm.status !== 'granted') {
      Alert.alert('Permission denied', 'App needs location access to track routes.');
      return;
    }
    const bgPerm = await Location.requestBackgroundPermissionsAsync();

    setIsTracking(true);
    setStatus('Tracking live & in background...');

    setDoc(routeRef, { userId: user.uid, name: user.email.split('@')[0], date: today, isActive: true }, { merge: true });

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
    }

    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Highest, timeInterval: 3000, distanceInterval: 0 },
      async (location) => {
        const newPoint = { latitude: location.coords.latitude, longitude: location.coords.longitude };
        setCurrentCoords(prev => ({ ...newPoint, latitudeDelta: 0.01, longitudeDelta: 0.01 }));
        setRoutePoints(prev => [...prev, newPoint]);

        await handleNewLocationPoint(newPoint, location.coords.latitude, location.coords.longitude);
      }
    );
    setLocationSub(sub);
  };

  // 🚀 Upgraded CRM Note Submission with Offline Interceptor
  const handleSubmitVisitNote = async () => {
    if (!clientName.trim() || !summary.trim()) {
      Alert.alert("Missing Fields", "Please populate both fields before submitting log entries.");
      return;
    }
    setIsSubmittingNote(true);

    try {
      let lat = 0;
      let lng = 0;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      } catch (e) {
        if (currentCoords) {
          lat = currentCoords.latitude;
          lng = currentCoords.longitude;
        }
      }

      const today = new Date().toISOString().split('T')[0];
      const payload = {
        userId: user.uid,
        employeeName: user.email.split('@')[0],
        clientName: clientName,
        summary: summary,
        lat: lat,
        lng: lng,
        date: today,
        timestamp: Date.now()
      };

      const state = await NetInfo.fetch();

      if (state.isConnected && state.isInternetReachable) {
        // 🌐 ONLINE ENTRANCE: Ship directly to cloud metrics endpoint
        const response = await fetch("https://fieldo.onrender.com/api/visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          Alert.alert("Success", "Visit logged successfully into the cloud framework!");
          setClientName('');
          setSummary('');
        } else {
          throw new Error();
        }
      } else {
        // 🚫 OFFLINE ENTRANCE: Intercept and append details safely to local cache array
        const existingData = await AsyncStorage.getItem(OFFLINE_VISITS_KEY);
        const visitList = existingData ? JSON.parse(existingData) : [];
        
        visitList.push(payload);
        await AsyncStorage.setItem(OFFLINE_VISITS_KEY, JSON.stringify(visitList));
        
        Alert.alert("Cached Offline", "No active connection detected. Field report stored securely on device and will auto-sync once signal returns.");
        setClientName('');
        setSummary('');
      }
    } catch (err) {
      Alert.alert("Submission Failure", "Failed to process field report package parameters.");
    } finally {
      setIsSubmittingNote(false);
    }
  };

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        <View style={styles.loadingMap}><Text style={{ color: '#94A3B8' }}>Available on mobile apps only.</Text></View>
      ) : currentCoords && MapView ? (
        <MapView style={styles.map} region={currentCoords} showsUserLocation={true} followsUserLocation={true}>
          {routePoints.length > 0 && Polyline && <Polyline coordinates={routePoints} strokeColor="#38BDF8" strokeWidth={6} />}
        </MapView>
      ) : (
        <View style={styles.loadingMap}><Text style={{ color: '#94A3B8' }}>Finding location...</Text></View>
      )}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Fieldo</Text>
        <Pressable onPress={async () => { if (isTracking) await toggleTracking(); auth.signOut(); }}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.cardContainer}>
        <ScrollView style={styles.scrollCard} contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
          <View>
            <Text style={styles.kicker}>Employee Tracker</Text>
            <Text style={styles.title}>Live Session</Text>
            <Text style={styles.status}>{status}</Text>
          </View>

          <Pressable style={[styles.button, isTracking ? styles.stopButton : styles.startButton]} onPress={toggleTracking}>
            <Text style={styles.buttonText}>{isTracking ? 'Stop Tracking' : 'Start Tracking'}</Text>
          </Pressable>

          {/* CRM VISIT SUBMISSION FORM */}
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>📝 Log Client Visit</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Client/Company Name" 
              placeholderTextColor="#64748B"
              value={clientName}
              onChangeText={setClientName}
            />
            <TextInput 
              style={[styles.input, styles.textArea]} 
              placeholder="What was discussed? Summary report..." 
              placeholderTextColor="#64748B"
              multiline
              numberOfLines={3}
              value={summary}
              onChangeText={setSummary}
            />
            <Pressable style={styles.formButton} onPress={handleSubmitVisitNote} disabled={isSubmittingNote}>
              {isSubmittingNote ? <ActivityIndicator color="#06101D" /> : <Text style={styles.formButtonText}>Submit Visit Note</Text>}
            </Pressable>
          </View>

          <View style={styles.pointCard}>
            <Text style={styles.pointLabel}>Last GPS point</Text>
            <Text style={styles.pointValue}>
              {currentCoords ? `${currentCoords.latitude.toFixed(5)}, ${currentCoords.longitude.toFixed(5)}` : 'Waiting for GPS...'}
            </Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06101D' },
  map: { width: Dimensions.get('window').width, height: Dimensions.get('window').height },
  loadingMap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#06101D' },
  header: { position: 'absolute', top: 50, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(15, 27, 46, 0.9)', padding: 16, borderRadius: 16, zIndex: 10 },
  headerTitle: { color: '#F8FAFC', fontSize: 20, fontWeight: '900' },
  logoutText: { color: '#EF4444', fontSize: 16, fontWeight: '700' },
  cardContainer: { position: 'absolute', bottom: 30, left: 20, right: 20, maxHeight: 420 },
  scrollCard: { width: '100%', padding: 20, borderRadius: 22, backgroundColor: 'rgba(15, 27, 46, 0.95)', borderWidth: StyleSheet.hairlineWidth, borderColor: '#223248' },
  kicker: { color: '#38BDF8', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#F8FAFC', fontSize: 24, fontWeight: '900' },
  status: { color: '#94A3B8', fontSize: 13, marginBottom: 5 },
  button: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  startButton: { backgroundColor: '#22C55E' },
  stopButton: { backgroundColor: '#EF4444' },
  buttonText: { color: '#06101D', fontSize: 16, fontWeight: '900' },
  formContainer: { backgroundColor: '#111C2E', padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#334155', gap: 10 },
  formTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '800' },
  input: { backgroundColor: '#0F172A', color: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#1E293B', fontSize: 14 },
  textArea: { height: 60, textAlignVertical: 'top' },
  formButton: { backgroundColor: '#38BDF8', padding: 12, borderRadius: 8, alignItems: 'center' },
  formButtonText: { color: '#06101D', fontSize: 14, fontWeight: '800' },
  pointCard: { borderRadius: 14, padding: 12, backgroundColor: '#111C2E', borderWidth: StyleSheet.hairlineWidth, borderColor: '#334155', marginBottom: 20 },
  pointLabel: { color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', fontWeight: '700' },
  pointValue: { color: '#F8FAFC', fontSize: 14, fontWeight: '700' },
});