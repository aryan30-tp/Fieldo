import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { arrayUnion, doc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';

import { auth, db } from '../../src/services/firebaseConfig';

export default function TrackerScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [locationSub, setLocationSub] = useState(null);
  const [status, setStatus] = useState('Idle');
  const [currentCoords, setCurrentCoords] = useState(null);
  const [lastError, setLastError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.replace('/');
        return;
      }

      setUser(currentUser);
    });

    return () => {
      unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    return () => {
      if (locationSub) {
        locationSub.remove();
      }
    };
  }, [locationSub]);

  const toggleTracking = async () => {
    const today = new Date().toISOString().split('T')[0];
    const docId = `${user.uid}_${today}`;
    const routeRef = doc(db, 'daily_routes', docId);

    if (isTracking) {
      console.log('🛑 Stopping GPS tracking');
      if (locationSub) {
        locationSub.remove();
      }

      setLocationSub(null);
      setIsTracking(false);
      setStatus('Tracking stopped');

      await setDoc(routeRef, { isActive: false }, { merge: true });
      return;
    }

    if (!user) {
      return;
    }

    console.log('▶️ Requesting foreground location permission');
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      console.warn('⚠️ Location permission denied');
      setLastError('Location permission denied');
      Alert.alert('Permission denied', 'App needs location access to track routes.');
      return;
    }

    setIsTracking(true);
    setStatus('Awaiting first GPS fix...');
    setCurrentCoords(null);
    setLastError('');
    console.log('✅ Permission granted, starting GPS watcher');

    try {
      console.log('📍 Requesting initial GPS fix');
      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      const initialCoords = [initialLocation.coords.latitude, initialLocation.coords.longitude];
      setCurrentCoords(initialCoords);
      setStatus('Tracking live GPS');
      console.log('✅ Initial GPS fix received:', initialCoords);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch GPS fix';
      console.error('Initial GPS fix failed:', error);
      setLastError(message);
    }

    setDoc(
      routeRef,
      {
        userId: user.uid,
        name: user.email.split('@')[0],
        date: today,
        isActive: true,
      },
      { merge: true }
    ).catch((error) => {
      console.error('Firestore session write failed:', error);
    });

    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Highest,
        timeInterval: 3000,
        distanceInterval: 0,
      },
      async (location) => {
        const coords = [location.coords.latitude, location.coords.longitude];
        setCurrentCoords(coords);
        setStatus('Tracking live GPS');
        setLastError('');

        console.log('📡 GPS fix received:', coords);

        try {
          await setDoc(
            routeRef,
            {
              points: arrayUnion({
                lat: location.coords.latitude,
                lng: location.coords.longitude,
              }),
            },
            { merge: true }
          );

          console.log('📍 Pushed to Firestore:', coords);
        } catch (error) {
          console.error('Firestore push failed:', error);
        }
      }
    );

    setLocationSub(sub);
    console.log('👀 GPS watcher attached');
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.kicker}>Employee Tracker</Text>
        <Text style={styles.title}>Start and stop live GPS tracking</Text>
        <Text style={styles.status}>{status}</Text>

        <Pressable
          style={[styles.button, isTracking ? styles.stopButton : styles.startButton]}
          onPress={toggleTracking}>
          <Text style={styles.buttonText}>{isTracking ? 'Stop Tracking' : 'Start Tracking'}</Text>
        </Pressable>

        <View style={styles.pointCard}>
          <Text style={styles.pointLabel}>Last GPS point</Text>
          <Text style={styles.pointValue}>
            {currentCoords ? `${currentCoords[0].toFixed(6)}, ${currentCoords[1].toFixed(6)}` : 'Waiting for GPS...'}
          </Text>
          {lastError ? <Text style={styles.errorText}>{lastError}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#06101D',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    gap: 14,
    padding: 24,
    borderRadius: 22,
    backgroundColor: '#0F1B2E',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#223248',
  },
  kicker: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    color: '#F8FAFC',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
  },
  status: {
    color: '#94A3B8',
    fontSize: 14,
  },
  button: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#22C55E',
  },
  stopButton: {
    backgroundColor: '#EF4444',
  },
  buttonText: {
    color: '#06101D',
    fontSize: 18,
    fontWeight: '900',
  },
  pointCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#111C2E',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#334155',
    gap: 6,
  },
  pointLabel: {
    color: '#94A3B8',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    fontWeight: '700',
  },
  pointValue: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    marginTop: 4,
  },
});