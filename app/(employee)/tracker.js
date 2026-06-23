import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { arrayUnion, doc, setDoc } from 'firebase/firestore';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, Dimensions, Platform, TextInput, ScrollView, ActivityIndicator, Modal } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { auth, db } from '../../src/services/firebaseConfig';
import { BACKGROUND_LOCATION_TASK } from '../../src/services/locationTask'; 
import socketInstance from '../../src/services/socket';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

let MapView = null;
let Polyline = null;
let Marker = null;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Polyline = Maps.Polyline;
  Marker = Maps.Marker;
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

  // 🧭 UI NAV STATES
  const [activeTab, setActiveTab] = useState('live'); 
  const [isFormExpanded, setIsFormExpanded] = useState(false); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // 🛠️ ISSUE REPORT FORM STATES
  const [issueSubject, setIssueSubject] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [isSendingIssue, setIsSendingIssue] = useState(false);

  // 📝 CRM FIELD REPORT STATES
  const [clientName, setClientName] = useState(''); 
  const [contactPerson, setContactPerson] = useState(''); 
  const [personPosition, setPersonPosition] = useState(''); 
  const [personMobile, setPersonMobile] = useState(''); 
  const [summary, setSummary] = useState(''); 
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  // 📊 PERSONAL HISTORY LOG STATES
  const [myAttendanceLogs, setMyAttendanceLogs] = useState([]);
  const [myVisitNotes, setMyVisitNotes] = useState([]);
  const [viewingPastDate, setViewingPastDate] = useState(null);
  const [pastRoutePoints, setPastRoutePoints] = useState([]);
  const [isLoadingPastRoute, setIsLoadingPastRoute] = useState(false);

  // Auth Listener & Profile Sync
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
        console.log("Failed to sync profile:", err);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // ANTI-HIJACKING SINGLE-DEVICE SESSION ENGINE
  useEffect(() => {
    if (!user) return;

    const checkDeviceSessionValidity = async () => {
      try {
        const localSessionId = await AsyncStorage.getItem('@fieldo_device_session_id');
        if (!localSessionId) return;

        const response = await fetch("https://fieldo.onrender.com/api/employees/verify-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.uid,
            currentDeviceId: localSessionId
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.valid === false) {
            if (isTracking) {
              if (locationSub) locationSub.remove();
              if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK)) {
                await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
              }
            }
            await AsyncStorage.removeItem('@fieldo_device_session_id');
            await auth.signOut();
            Alert.alert(
              "Session Terminated", 
              "This account has been activated on another mobile device. Tracking has been stopped.",
              [{ text: "OK", onPress: () => router.replace('/') }]
            );
          }
        }
      } catch (err) {
        console.log("Session checker offline bypass.");
      }
    };

    checkDeviceSessionValidity();
    const sessionVerificationTimer = setInterval(checkDeviceSessionValidity, 30000);
    return () => clearInterval(sessionVerificationTimer);
  }, [user, isTracking, locationSub, router]);

  // Fetch Personal Employee History Logs
  const loadMyHistoryData = useCallback(async () => {
    if (!user) return;
    try {
      const [attRes, visitRes] = await Promise.all([
        fetch(`https://fieldo.onrender.com/api/attendance/${user.uid}`),
        fetch(`https://fieldo.onrender.com/api/visits?userId=${user.uid}`)
      ]);
      setMyAttendanceLogs(attRes.ok ? await attRes.json() : []);
      setMyVisitNotes(visitRes.ok ? await visitRes.json() : []);
    } catch (err) {
      console.error("Failed to load history logs:", err);
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadMyHistoryData();
    }
  }, [activeTab, loadMyHistoryData]);

  // Load past map path line for the employee to review
  const handleViewPastDayRoute = async (date) => {
    // 🟢 BUG FIX: If clicking the exact same date that is already being viewed, collapse it instantly
    if (viewingPastDate === date) {
      setViewingPastDate(null);
      setPastRoutePoints([]);
      return;
    }

    setViewingPastDate(date);
    setIsLoadingPastRoute(true);
    try {
      const res = await fetch(`https://fieldo.onrender.com/api/routes/${user.uid}/${date}`);
      const data = res.ok ? await res.json() : null;
      if (data?.points?.length > 0) {
        const formattedPoints = data.points
          .sort((a, b) => a.timestamp - b.timestamp)
          .map(p => ({ latitude: p.lat, longitude: p.lng }));
        setPastRoutePoints(formattedPoints);
      } else {
        setPastRoutePoints([]);
        Alert.alert("No Map Data", "No tracking points recorded on this specific shift node.");
      }
    } catch (err) {
      setPastRoutePoints([]);
    } finally {
      setIsLoadingPastRoute(false);
    }
  };

  const handleNewLocationPoint = async (newPoint, latitude, longitude) => {
    if (!user) return;
    const state = await NetInfo.fetch();
    const today = new Date().toISOString().split('T')[0];
    const routeRef = doc(db, 'daily_routes', `${user.uid}_${today}`);

    if (state.isConnected && state.isInternetReachable) {
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
      try {
        const existingData = await AsyncStorage.getItem(OFFLINE_STORAGE_KEY);
        const pointsList = existingData ? JSON.parse(existingData) : [];
        pointsList.push({ lat: latitude, lng: longitude, timestamp: Date.now() });
        await AsyncStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(pointsList));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const syncCachedPayloadsToServer = useCallback(async () => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];

    try {
      const cachedData = await AsyncStorage.getItem(OFFLINE_STORAGE_KEY);
      if (cachedData) {
        const pointsToSync = JSON.parse(cachedData);
        if (pointsToSync.length > 0) {
          const response = await fetch('https://fieldo.onrender.com/api/routes/sync-offline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.uid, name: user.email.split('@')[0], date: today, points: pointsToSync })
          });
          if (response.ok) await AsyncStorage.removeItem(OFFLINE_STORAGE_KEY);
        }
      }
    } catch (err) { console.error(err); }

    try {
      const cachedVisits = await AsyncStorage.getItem(OFFLINE_VISITS_KEY);
      if (cachedVisits) {
        const visitsToSync = JSON.parse(cachedVisits);
        if (visitsToSync.length > 0) {
          const response = await fetch('https://fieldo.onrender.com/api/visits/sync-offline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visits: visitsToSync })
          });
          if (response.ok) await AsyncStorage.removeItem(OFFLINE_VISITS_KEY);
        }
      }
    } catch (err) { console.error(err); }
  }, [user]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) syncCachedPayloadsToServer();
    });
    return () => unsubscribe();
  }, [syncCachedPayloadsToServer]);

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
            setCurrentCoords(prev => ({ ...newPoint, latitudeDelta: 0.01, longitudeDelta: 0.01 }));
            setRoutePoints(prev => [...prev, newPoint]);
            await handleNewLocationPoint(newPoint, location.coords.latitude, location.coords.longitude);
          }
        );
        setLocationSub(sub);
      }
    };
    syncTrackingState();
  }, [user]);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCurrentCoords({ latitude: location.coords.latitude, longitude: location.coords.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 });
    })();
  }, []);

  const toggleTracking = async () => {
    const today = new Date().toISOString().split('T')[0];
    const docId = `${user.uid}_${today}`;
    const routeRef = doc(db, 'daily_routes', docId);

    if (isTracking) {
      if (locationSub) locationSub.remove();
      setLocationSub(null);
      if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK)) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      setIsTracking(false);
      setStatus('Tracking stopped');
      await setDoc(routeRef, { isActive: false }, { merge: true });
      return;
    }

    const fgPerm = await Location.requestForegroundPermissionsAsync();
    if (fgPerm.status !== 'granted') return;
    const bgPerm = await Location.requestBackgroundPermissionsAsync();

    setIsTracking(true);
    setStatus('Tracking live & in background...');
    setDoc(routeRef, { userId: user.uid, name: user.email.split('@')[0], date: today, isActive: true }, { merge: true });

    if (bgPerm.status === 'granted') {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Highest, timeInterval: 10000, distanceInterval: 5, showsBackgroundLocationIndicator: true,
        foregroundService: { notificationTitle: "Fieldo is active", notificationBody: "Tracking your shift route.", notificationColor: "#22C55E" }
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

  const handleSubmitVisitNote = async () => {
    if (!clientName.trim() || !contactPerson.trim() || !personMobile.trim() || !summary.trim()) {
      Alert.alert("Missing Fields", "Please populate Company, Person Met, Mobile Number, and Summary details.");
      return;
    }
    setIsSubmittingNote(true);

    try {
      let lat = 0; let lng = 0;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude; lng = loc.coords.longitude;
      } catch (e) {
        if (currentCoords) { lat = currentCoords.latitude; lng = currentCoords.longitude; }
      }

      const today = new Date().toISOString().split('T')[0];
      const payload = {
        userId: user.uid,
        employeeName: user.email.split('@')[0],
        clientName: clientName, 
        contactPerson: contactPerson, 
        personPosition: personPosition.trim() || '-', 
        personMobile: personMobile, 
        summary: summary, 
        date: today,
        lat, lng,
        timestamp: Date.now()
      };

      const state = await NetInfo.fetch();

      if (state.isConnected && state.isInternetReachable) {
        const response = await fetch("https://fieldo.onrender.com/api/visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          Alert.alert("Success", "Field report logged cleanly!");
          setClientName(''); setContactPerson(''); setPersonPosition(''); setPersonMobile(''); setSummary('');
          setIsFormExpanded(false); 
        } else {
          throw new Error();
        }
      } else {
        const existingData = await AsyncStorage.getItem(OFFLINE_VISITS_KEY);
        const visitList = existingData ? JSON.parse(existingData) : [];
        visitList.push(payload);
        await AsyncStorage.setItem(OFFLINE_VISITS_KEY, JSON.stringify(visitList));
        
        Alert.alert("Cached Offline", "No active connection. Field report saved locally and will sync once internet returns.");
        setClientName(''); setContactPerson(''); setPersonPosition(''); setPersonMobile(''); setSummary('');
        setIsFormExpanded(false);
      }
    } catch (err) {
      Alert.alert("Submission Failure", "Failed to process the field report.");
    } finally {
      setIsSubmittingNote(false);
    }
  };

  // 🟢 NEW: FIRE SUBMISSION LOOP TO POST ISSUE REPORT DIRECTLY TO API
  const handleReportIssueSubmit = async () => {
    if (!issueSubject.trim() || !issueDescription.trim()) {
      Alert.alert("Missing Input", "Please populate both fields before transmitting.");
      return;
    }
    setIsSendingIssue(true);
    try {
      const response = await fetch("https://fieldo.onrender.com/api/notifications/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          employeeName: user.email.split('@')[0],
          subject: issueSubject.trim(),
          description: issueDescription.trim()
        })
      });
      if (response.ok) {
        Alert.alert("Issue Logged", "Your support request has been dropped directly into the HR Admin grid notifications feed.");
        setIssueSubject('');
        setIssueDescription('');
        setIsReportModalOpen(false);
      } else {
        Alert.alert("Submission Denied", "The central matrix server rejected the issue schema properties.");
      }
    } catch (error) {
      Alert.alert("Network Offline", "Unable to transmit diagnostic parameters to active cluster nodes.");
    } finally {
      setIsSendingIssue(false);
    }
  };

  const handleGlobalLogoutAction = async () => {
    setIsSettingsOpen(false);
    if (isTracking) await toggleTracking();
    await auth.signOut();
    router.replace('/');
  };

  const filteredPastNotesForSelectedDate = useMemo(() => {
    return myVisitNotes.filter(n => n.date === viewingPastDate);
  }, [myVisitNotes, viewingPastDate]);

  return (
    <View style={styles.container}>
      {/* 🟢 FIXED NAV BRANDING BAR HEADER: Stays fixed, top of screen, non-absolute contextual layout */}
      <View style={styles.brandingNavbarContainer}>
        {/* Sleek Minimalist Graphic Vector Identity Element */}
        <View style={styles.brandGroup}>
          <View style={styles.logoIconTelemetryWrapper}>
            <View style={styles.logoRadarDotActivePing} />
          </View>
          <Text style={styles.brandingTextLogotype}>FIELDO</Text>
        </View>

        {/* Dynamic Cog Gear Switcher launcher for application configurations drawer */}
        <Pressable style={styles.settingsLauncherIconContainerButton} onPress={() => setIsSettingsOpen(true)}>
          <Text style={{ fontSize: 18, color: '#38BDF8' }}>⚙️</Text>
        </Pressable>
      </View>

      {/* SEGMENTED TAB SWITCHER */}
      <View style={styles.tabNavbar}>
        <Pressable style={[styles.navTab, activeTab === 'live' && styles.navTabActive]} onPress={() => setActiveTab('live')}>
          <Text style={[styles.navTabPropsText, activeTab === 'live' && styles.textActiveColor]}>📡 Live Session</Text>
        </Pressable>
        <Pressable style={[styles.navTab, activeTab === 'history' && styles.navTabActive]} onPress={() => setActiveTab('history')}>
          <Text style={[styles.navTabPropsText, activeTab === 'history' && styles.textActiveColor]}>📊 My Logs</Text>
        </Pressable>
      </View>

      {/* VIEWPORT SWITCH CONTAINER BINDING */}
      {activeTab === 'live' ? (
        <View style={{ flex: 1 }}>
          {Platform.OS === 'web' ? (
            <View style={styles.loadingMap}><Text style={{ color: '#94A3B8' }}>Available on mobile apps only.</Text></View>
          ) : currentCoords && MapView ? (
            <MapView style={styles.map} region={currentCoords} showsUserLocation={true} followsUserLocation={true}>
              {routePoints.length > 0 && Polyline && <Polyline coordinates={routePoints} strokeColor="#38BDF8" strokeWidth={6} />}
            </MapView>
          ) : (
            <View style={styles.loadingMap}><Text style={{ color: '#94A3B8' }}>Finding location...</Text></View>
          )}

          {/* STREAMLINED CONTROLS CARD - Wrapped cleanly relative to screen elements */}
          <View style={styles.cardContainer}>
            <View style={styles.scrollCardFloating}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.kicker}>Shift State</Text>
                  <Text style={styles.status} numberOfLines={1}>{status}</Text>
                </View>
                <Pressable style={[styles.button, isTracking ? styles.stopButton : styles.startButton]} onPress={toggleTracking}>
                  <Text style={styles.buttonText}>{isTracking ? 'Stop' : 'Start'}</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* EXPANDABLE FAB EXPANSION BUTTON */}
          <Pressable style={styles.floatingFormLauncherFab} onPress={() => setIsFormExpanded(true)}>
            <Text style={{ fontSize: 22, color: '#06101D' }}>📝</Text>
          </Pressable>
        </View>
      ) : (
        /* 🟢 COMPLETE BUG-FREE OVERLAY COMPLIANT REWORKED HISTORY PANEL VIEWPORT */
        <ScrollView style={styles.historyScrollFrame} contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
          <Text style={styles.historyViewTitle}>My Attendance & Logs</Text>
          
          <View style={{ gap: 12 }}>
            {myAttendanceLogs.map((log) => {
              const isSelectedDay = viewingPastDate === log.date;
              return (
                <View key={log.date} style={[styles.historyLogItemContainer, isSelectedDay && styles.logItemContainerSelected]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={styles.logDateText}>📅 {log.date}</Text>
                      <Text style={styles.logSubText}>{log.hoursLogged.toFixed(2)} active hours tracked</Text>
                    </View>
                    <Pressable style={styles.viewPastRouteInlineBtn} onPress={() => handleViewPastDayRoute(log.date)}>
                      <Text style={styles.viewPastRouteInlineBtnText}>{isSelectedDay ? 'Collapse' : 'View Data'}</Text>
                    </Pressable>
                  </View>

                  {/* If row is actively selected, map map path loop metrics cleanly */}
                  {isSelectedDay && (
                    <View style={styles.embeddedPastDayDetailsPane}>
                      <Text style={styles.embeddedPaneTitleLabel}>Route Trail Map</Text>
                      {isLoadingPastRoute ? (
                        <ActivityIndicator color="#38BDF8" style={{ marginVertical: 12 }} />
                      ) : Platform.OS !== 'web' && MapView && pastRoutePoints.length > 0 ? (
                        <View style={styles.miniMapContainerWrapper}>
                          <MapView 
                            style={styles.miniMapElementStyles} 
                            initialRegion={{
                              latitude: pastRoutePoints[0].latitude,
                              longitude: pastRoutePoints[0].longitude,
                              latitudeDelta: 0.02,
                              longitudeDelta: 0.02
                            }}
                            scrollEnabled={true} // Allow exploration safely inside history container node
                            zoomEnabled={true}
                          >
                            <Polyline coordinates={pastRoutePoints} strokeColor="#38BDF8" strokeWidth={4} />
                            
                            <Marker 
                              coordinate={{
                                latitude: pastRoutePoints[0].latitude,
                                longitude: pastRoutePoints[0].longitude
                              }} 
                              title="Start Location" 
                            />
                            <Marker 
                              coordinate={{
                                latitude: pastRoutePoints[pastRoutePoints.length - 1].latitude,
                                longitude: pastRoutePoints[pastRoutePoints.length - 1].longitude
                              }} 
                              title="End Location" 
                              pinColor="#EF4444" 
                            />
                          </MapView>
                        </View>
                      ) : (
                        <Text style={styles.emptyLogsPastLabelFallback}>No GPS coordinate line generated for this day.</Text>
                      )}

                      <Text style={styles.embeddedPaneTitleLabel}>Visit Reports Filed</Text>
                      {filteredPastNotesForSelectedDate.map((note, index) => (
                        <View key={index} style={styles.pastNoteItemCard}>
                          <Text style={styles.pastNoteCardCompany}>🏢 {note.clientName} ({note.contactPerson})</Text>
                          <Text style={styles.pastNoteCardSummary}>"{note.summary}"</Text>
                        </View>
                      ))}
                      {filteredPastNotesForSelectedDate.length === 0 && (
                        <Text style={styles.emptyLogsPastLabelFallback}>No client field notes compiled on this shift.</Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            {myAttendanceLogs.length === 0 && (
              <Text style={{ color: '#64748B', fontStyle: 'italic', textAlign: 'center', marginTop: 20 }}>No logs recorded in the roster database yet.</Text>
            )}
          </View>
        </ScrollView>
      )}

      {/* 🟢 NEW COMPLETE SETTINGS SLIDER OPTIONS DRAWER PANEL LAYER */}
      <Modal visible={isSettingsOpen} animationType="slide" transparent onRequestClose={() => setIsSettingsOpen(false)}>
        <View style={styles.settingsDrawerBackdrop}>
          <Pressable style={styles.drawerDismissClickableArea} onPress={() => setIsSettingsOpen(false)} />
          <View style={styles.settingsDrawerContentContainer}>
            <View style={styles.drawerHeaderContainerRow}>
              <Text style={styles.drawerTitleText}>Application Settings</Text>
              <Pressable style={styles.closeSheetCrossBtn} onPress={() => setIsSettingsOpen(false)}>
                <Text style={{ color: '#94A3B8', fontWeight: '800', fontSize: 14 }}>✕</Text>
              </Pressable>
            </View>

            <View style={{ gap: 12, marginTop: 14 }}>
              {/* Theme Selector Toggle block placeholder */}
              <View style={styles.drawerOptionRowItem}>
                <View>
                  <Text style={styles.optionItemTitle}>App Theme UI Mode</Text>
                  <Text style={styles.optionItemSub}>Toggle dark workspace visual palettes</Text>
                </View>
                <View style={styles.dummyToggleActiveBackground}><View style={styles.dummyToggleCircleKnob} /></View>
              </View>

              {/* Issue report launcher trigger button */}
              <Pressable style={styles.drawerOptionRowItemInteractive} onPress={() => { setIsSettingsOpen(false); setIsReportModalOpen(true); }}>
                <View>
                  <Text style={styles.optionItemTitle}>⚠️ Report an Issue</Text>
                  <Text style={styles.optionItemSub}>Transmit bugs straight to corporate dashboard</Text>
                </View>
                <Text style={{ color: '#64748B', fontSize: 16 }}>❯</Text>
              </Pressable>

              {/* Developer validation card info block */}
              <View style={styles.developerContactCardBlock}>
                <Text style={styles.devCardHeading}>Contact System Developer</Text>
                <Text style={styles.devCardSubText}>Technical Node Core: Build Version 2.0.4</Text>
                <Text style={styles.devCardEmailLabelText}>support-engine@fieldo.enterprise.com</Text>
              </View>

              {/* Clean Logout Trigger Link button targeting authentication systems */}
              <Pressable style={styles.drawerLogOutActionBtnContainer} onPress={handleGlobalLogoutAction}>
                <Text style={styles.drawerLogOutText}>Disconnect Secure Session</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 🟢 NEW REPORT AN ISSUE SUB-MODAL CAPTURE WORKSPACE */}
      <Modal visible={isReportModalOpen} animationType="fade" transparent onRequestClose={() => setIsReportModalOpen(false)}>
        <View style={styles.bottomSheetBackdrop}>
          <View style={[styles.bottomSheetContentContainer, { borderTopLeftRadius: 16, borderTopRightRadius: 16 }]}>
            <View style={styles.sheetHeaderIndicatorRow}>
              <Text style={styles.formTitle}>⚠️ Diagnostic Issue Report</Text>
              <Pressable style={styles.closeSheetCrossBtn} onPress={() => setIsReportModalOpen(false)}>
                <Text style={{ color: '#94A3B8', fontWeight: '800', fontSize: 14 }}>✕</Text>
              </Pressable>
            </View>

            <View style={{ gap: 12, paddingBottom: 20 }}>
              <TextInput style={styles.input} placeholder="Subject (e.g., GPS drift error, Sync fail)" placeholderTextColor="#64748B" value={issueSubject} onChangeText={setIssueSubject} />
              <TextInput style={[styles.input, styles.textArea]} placeholder="Describe the problem you are experiencing in full details..." placeholderTextColor="#64748B" multiline numberOfLines={4} value={issueDescription} onChangeText={setIssueDescription} />
              
              <Pressable style={styles.formButton} onPress={handleReportIssueSubmit} disabled={isSendingIssue}>
                {isSendingIssue ? <ActivityIndicator color="#06101D" /> : <Text style={styles.formButtonText}>Transmit Bug Logs</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* EXPANDABLE CRM SHEET FULL FORM OVERLAY MODAL */}
      <Modal visible={isFormExpanded} animationType="slide" transparent onRequestClose={() => setIsFormExpanded(false)}>
        <View style={styles.bottomSheetBackdrop}>
          <View style={styles.bottomSheetContentContainer}>
            <View style={styles.sheetHeaderIndicatorRow}>
              <Text style={styles.formTitle}>📝 Submit Detailed Field Report</Text>
              <Pressable style={styles.closeSheetCrossBtn} onPress={() => setIsFormExpanded(false)}>
                <Text style={{ color: '#94A3B8', fontWeight: '800', fontSize: 14 }}>✕</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
              <TextInput style={styles.input} placeholder="Company / Client Name" placeholderTextColor="#64748B" value={clientName} onChangeText={setClientName} />
              <TextInput style={styles.input} placeholder="Person Met Name" placeholderTextColor="#64748B" value={contactPerson} onChangeText={setContactPerson} />
              <TextInput style={styles.input} placeholder="Position/Title (Optional)" placeholderTextColor="#64748B" value={personPosition} onChangeText={setPersonPosition} />
              <TextInput style={styles.input} placeholder="Person Mobile Number" placeholderTextColor="#64748B" keyboardType="phone-pad" value={personMobile} onChangeText={setPersonMobile} />
              <TextInput style={[styles.input, styles.textArea]} placeholder="What was discussed? Summary notes report..." placeholderTextColor="#64748B" multiline numberOfLines={4} value={summary} onChangeText={setSummary} />
              
              <Pressable style={styles.formButton} onPress={handleSubmitVisitNote} disabled={isSubmittingNote}>
                {isSubmittingNote ? <ActivityIndicator color="#06101D" /> : <Text style={styles.formButtonText}>Submit Visit Note</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06101D' },
  
  // 🟢 BRANDING BAR PLACEMENT STYLES
  brandingNavbarContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 44, paddingBottom: 14, backgroundColor: '#0F1B2E', borderBottomWidth: 1, borderColor: '#1E293B' },
  brandGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoIconTelemetryWrapper: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#38BDF8', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(56, 189, 248, 0.1)' },
  logoRadarDotActivePing: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#38BDF8' },
  brandingTextLogotype: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  settingsLauncherIconContainerButton: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' },

  tabNavbar: { flexDirection: 'row', backgroundColor: '#0F1B2E', borderBottomWidth: 1, borderColor: '#223248' },
  navTab: { flex: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  navTabActive: { borderColor: '#38BDF8', backgroundColor: '#11223B' },
  navTabPropsText: { color: '#94A3B8', fontSize: 13, fontWeight: '700' },
  textActiveColor: { color: '#38BDF8' },
  map: { flex: 1, width: Dimensions.get('window').width, height: '100%' },
  loadingMap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#06101D' },
  
  // 🟢 REPOSITIONED HEADLIGHT OVERLAY: Anchored completely cleanly under switcher
  header: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(15, 27, 46, 0.9)', padding: 12, borderRadius: 10, zIndex: 10, display: 'none' },
  headerTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '900' },
  logoutText: { color: '#EF4444', fontSize: 14, fontWeight: '700' },
  
  cardContainer: { position: 'absolute', bottom: 30, left: 20, right: 90, zIndex: 10 },
  scrollCardFloating: { width: '100%', padding: 14, borderRadius: 14, backgroundColor: 'rgba(15, 27, 46, 0.95)', borderWidth: StyleSheet.hairlineWidth, borderColor: '#223248' },
  kicker: { color: '#38BDF8', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  status: { color: '#F8FAFC', fontSize: 13, fontWeight: '700', marginTop: 1 },
  button: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, justifyContent: 'center' },
  startButton: { backgroundColor: '#22C55E' },
  stopButton: { backgroundColor: '#EF4444' },
  buttonText: { color: '#06101D', fontSize: 13, fontWeight: '900' },
  floatingFormLauncherFab: { position: 'absolute', bottom: 30, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: '#38BDF8', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5, zIndex: 11 },
  
  bottomSheetBackdrop: { flex: 1, backgroundColor: 'rgba(6, 16, 29, 0.6)', justifyContent: 'flex-end' },
  bottomSheetContentContainer: { backgroundColor: '#111C2E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderWidth: 1, borderColor: '#223248', maxHeight: '75%', gap: 14 },
  sheetHeaderIndicatorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: '#223248', paddingBottom: 10 },
  formTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '900' },
  closeSheetCrossBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' },
  input: { backgroundColor: '#0F172A', color: '#F8FAFC', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#1E293B', fontSize: 14 },
  textArea: { height: 70, textAlignVertical: 'top' },
  formButton: { backgroundColor: '#38BDF8', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  formButtonText: { color: '#06101D', fontSize: 14, fontWeight: '900' },

  historyScrollFrame: { flex: 1, backgroundColor: '#06101D' },
  historyViewTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '900', marginBottom: 6 },
  historyLogItemContainer: { backgroundColor: '#0F1B2E', borderWidth: 1, borderColor: '#1E293B', padding: 12, borderRadius: 12, gap: 8, marginBottom: 4 },
  logItemContainerSelected: { borderColor: '#38BDF8', backgroundColor: '#12233A' },
  logDateText: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  logSubText: { color: '#94A3B8', fontSize: 12 },
  viewPastRouteInlineBtn: { backgroundColor: '#1E293B', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 4 },
  viewPastRouteInlineBtnText: { color: '#38BDF8', fontSize: 11, fontWeight: '700' },
  embeddedPastDayDetailsPane: { marginTop: 8, borderTopWidth: 1, borderColor: '#223248', paddingTop: 10, gap: 6 },
  embeddedPaneTitleLabel: { color: '#38BDF8', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  miniMapContainerWrapper: { width: '100%', height: 130, borderRadius: 8, overflow: 'hidden', backgroundColor: '#06101D', borderWidth: 1, borderColor: '#223248' },
  miniMapElementStyles: { width: '100%', height: '100%' },
  emptyLogsPastLabelFallback: { color: '#64748B', fontSize: 11, fontStyle: 'italic', paddingVertical: 2 },
  pastNoteItemCard: { backgroundColor: '#0F172A', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#223248', marginBottom: 4 },
  pastNoteCardCompany: { color: '#F8FAFC', fontSize: 12, fontWeight: '700' },
  pastNoteCardSummary: { color: '#94A3B8', fontSize: 12, fontStyle: 'italic', marginTop: 1 },

  // 🟢 NEW SETTINGS SIDE SLIDER CONFIG CONTAINER STYLINGS
  settingsDrawerBackdrop: { flex: 1, backgroundColor: 'rgba(6, 16, 29, 0.7)', flexDirection: 'row' },
  drawerDismissClickableArea: { flex: 1 },
  settingsDrawerContentContainer: { width: 280, height: '100%', backgroundColor: '#0F1B2E', borderLeftWidth: 1, borderColor: '#1E293B', padding: 20, paddingTop: 44, gap: 14 },
  drawerHeaderContainerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: '#1E293B', paddingBottom: 12 },
  drawerTitleText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  drawerOptionRowItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111C2E', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B' },
  drawerOptionRowItemInteractive: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111C2E', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', borderLeftWidth: 3, borderLeftColor: '#38BDF8' },
  optionItemTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: '700' },
  optionItemSub: { color: '#64748B', fontSize: 11, marginTop: 1 },
  dummyToggleActiveBackground: { width: 34, height: 18, borderRadius: 9, backgroundColor: '#38BDF8', padding: 2, alignItems: 'flex-end' },
  dummyToggleCircleKnob: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#06101D' },
  developerContactCardBlock: { backgroundColor: '#111C2E', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', borderStyle: 'dashed', gap: 4, marginTop: 10 },
  devCardHeading: { color: '#94A3B8', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  devCardSubText: { color: '#64748B', fontSize: 12 },
  devCardEmailLabelText: { color: '#38BDF8', fontSize: 12, fontWeight: '600', marginTop: 2 },
  drawerLogOutActionBtnContainer: { marginTop: 24, backgroundColor: 'rgba(239, 68, 68, 0.15)', borderWidth: 1, borderColor: '#EF4444', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  drawerLogOutText: { color: '#EF4444', fontSize: 13, fontWeight: '800' }
});