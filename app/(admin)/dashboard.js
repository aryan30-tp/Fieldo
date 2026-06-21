import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Button, Platform, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore'; 
import { useRouter } from 'expo-router';
import { auth, db } from '../../src/services/firebaseConfig';

let WebMap = null;
if (Platform.OS === 'web') {
  WebMap = require('../../src/components/WebMap').default;
}

export default function Dashboard() {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [liveEmployees, setLiveEmployees] = useState({});
  
  // 📁 Management & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [roster, setRoster] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState(null);
  const [selectedEmpName, setSelectedEmpName] = useState('');
  
  // 🔄 Replay & CRM View States
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [visitNotes, setVisitNotes] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [replayPoints, setReplayPoints] = useState(null);

  useEffect(() => {
    setIsClient(true);
    fetchMasterRoster(''); // Load base directory list

    // 📻 Live Real-time Map Heartbeat listener via Firestore
    const unsubscribe = onSnapshot(collection(db, 'daily_routes'), (snapshot) => {
      const liveMap = {};
      const today = new Date().toISOString().split('T')[0];
      
      snapshot.forEach((firestoreDoc) => {
        const { userId, name, date, points, isActive, lastPing } = firestoreDoc.data();
        const isRecentlyActive = lastPing ? (Date.now() - lastPing) < 120000 : false;
        
        if (date === today && isActive && isRecentlyActive) {
          // If the worker is running foreground pings today, format array for the live pin display
          if (points && points.length > 0) {
            const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
            const latest = sorted[sorted.length - 1];
            liveMap[userId] = { name, lat: latest.lat, lng: latest.lng, lastPing };
          }
        }
      });
      setLiveEmployees(liveMap);
    });

    return () => unsubscribe();
  }, []);

  // 🔍 Fetch Roster using Fuzzy Text Search Endpoint
  const fetchMasterRoster = async (query) => {
    try {
      const response = await fetch(`https://fieldo-backend.onrender.com/api/employees/search?q=${query}`);
      const data = await response.json();
      setRoster(data);
    } catch (err) {
      console.error("Failed to query employee index:", err);
    }
  };

  const handleSearchChange = (text) => {
    setSearchQuery(text);
    fetchMasterRoster(text);
  };

  // 📈 Click handler to pull data for a specific employee
  const handleSelectEmployee = async (userId, name) => {
    setSelectedEmpId(userId);
    setSelectedEmpName(name);
    setSelectedDate(null);
    setReplayPoints(null);

    try {
      // 1. Pull attendance metrics logs
      const attRes = await fetch(`https://fieldo-backend.onrender.com/api/attendance/${userId}`);
      const attData = await attRes.json();
      setAttendanceLogs(attData);

      // 2. Pull all CRM Client visit summaries submitted by this employee
      const visitRes = await fetch(`https://fieldo-backend.onrender.com/api/visits?userId=${userId}`);
      const visitData = await visitRes.json();
      setVisitNotes(visitData);
    } catch (err) {
      console.error("Failed to fetch historical aggregates:", err);
    }
  };

  // ⏱️ Load Route Replay Data array for a specific date
  const handleLoadRouteReplay = async (date) => {
    setSelectedDate(date);
    try {
      const res = await fetch(`https://fieldo-backend.onrender.com/api/routes/${selectedEmpId}/${date}`);
      const data = await res.json();
      
      if (data && data.points && data.points.length > 0) {
        // Formats coordinate geometry array cleanly for Leaflet mapper ingestion
        const formattedCoordinates = data.points.map(p => [p.lat, p.lng]);
        setReplayPoints(formattedCoordinates);
      } else {
        setReplayPoints([]);
      }
    } catch (err) {
      console.error("Failed to pull tracking replay route coordinates:", err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      {/* HEADER BAR */}
      <View style={styles.header}>
        <Text style={styles.title}>Fieldo HR Portal</Text>
        <Button title="Logout" onPress={handleLogout} color="#111" />
      </View>

      <View style={styles.mainContent}>
        
        {/* SIDEBAR: MASTER ROSTER & MANAGEMENT LIST */}
        <View style={styles.sidebar}>
          <Text style={styles.sidebarTitle}>Employee Management</Text>
          <TextInput 
            style={styles.searchBar}
            placeholder="🔍 Search employees by name..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={handleSearchChange}
          />

          <ScrollView style={{ flex: 1, marginTop: 10 }}>
            {roster.map((emp) => {
              const isLiveNow = !!liveEmployees[emp.userId];
              return (
                <TouchableOpacity
                  key={emp.userId}
                  style={[styles.empCard, selectedEmpId === emp.userId && styles.empCardActive]}
                  onPress={() => handleSelectEmployee(emp.userId, emp.name)}
                >
                  <View style={[styles.statusDot, isLiveNow ? styles.statusDotLive : styles.statusDotIdle]} />
                  <Text style={styles.empName}>{emp.name}</Text>
                  {isLiveNow && <Text style={styles.liveLabel}>LIVE</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* WORKSPACE AREA: BREAKS DOWN HISTORIES, ATTENDANCE & MAP VISUALS */}
        <View style={styles.workspace}>
          {selectedEmpId ? (
            <View style={{ flex: 1, flexDirection: 'row' }}>
              
              {/* HISTORICAL LOG DETAILS COLUMN */}
              <View style={styles.historyPanel}>
                <Text style={styles.panelHeading}>📊 {selectedEmpName}'s Records</Text>
                
                {/* ATTENDANCE SHIFTS TRACKER */}
                <Text style={styles.sectionSubHeading}>Attendance History</Text>
                <ScrollView style={styles.listBlock} nestedScrollEnabled>
                  {attendanceLogs.map((log) => (
                    <TouchableOpacity 
                      key={log.date} 
                      style={[styles.historyRow, selectedDate === log.date && styles.historyRowActive]}
                      onPress={() => handleLoadRouteReplay(log.date)}
                    >
                      <Text style={styles.rowDate}>📅 {log.date}</Text>
                      <Text style={styles.rowHours}>{log.hoursLogged.toFixed(2)} Hrs Logged</Text>
                    </TouchableOpacity>
                  ))}
                  {attendanceLogs.length === 0 && <Text style={styles.emptyLabel}>No shifts logged.</Text>}
                </ScrollView>

                {/* CRM VISIT CLIENT MINUTES NOTES */}
                <Text style={styles.sectionSubHeading}>CRM Client Visit Summaries</Text>
                <ScrollView style={styles.listBlock} nestedScrollEnabled>
                  {visitNotes.map((note) => (
                    <View key={note._id} style={styles.noteCard}>
                      <Text style={styles.noteClient}>🏢 Client: {note.clientName}</Text>
                      <Text style={styles.noteSummary}>"{note.summary}"</Text>
                      <Text style={styles.noteTime}>Logged: {new Date(note.timestamp).toLocaleTimeString()}</Text>
                    </View>
                  ))}
                  {visitNotes.length === 0 && <Text style={styles.emptyLabel}>No visits filed yet.</Text>}
                </ScrollView>
              </View>

              {/* MAP VISUALIZER REPLAY WINDOW */}
              <View style={styles.mapFrame}>
                {isClient && Platform.OS === 'web' && WebMap ? (
                  <WebMap 
                    routePoints={replayPoints} 
                    employeeName={selectedEmpName} 
                  />
                ) : (
                  <View style={styles.placeholder}><Text>Initializing Mapper Component Engine...</Text></View>
                )}
              </View>

            </View>
          ) : (
            <View style={styles.placeholderContainer}>
              <Text style={styles.placeholderText}>Select an active employee profile from the lookup directory.</Text>
            </View>
          )}
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: '#111' },
  title: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  mainContent: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 300, backgroundColor: 'white', borderRightWidth: 1, borderColor: '#ddd', padding: 15 },
  sidebarTitle: { fontSize: 16, fontWeight: 'bold', color: '#334155', marginBottom: 10, textTransform: 'uppercase' },
  searchBar: { backgroundColor: '#F1F5F9', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', color: '#1E293B', fontSize: 14, marginBottom: 10 },
  empCard: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f8f9fa', borderRadius: 8, marginBottom: 6 },
  empCardActive: { backgroundColor: '#e6f2ff', borderWidth: 1, borderColor: '#007bff' },
  empName: { fontSize: 15, fontWeight: '600', color: '#1E293B', flex: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  statusDotLive: { backgroundColor: '#22C55E' },
  statusDotIdle: { backgroundColor: '#94A3B8' },
  liveLabel: { fontSize: 10, fontWeight: '800', color: '#22C55E', backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  workspace: { flex: 1, backgroundColor: '#fff' },
  historyPanel: { width: 340, borderRightWidth: 1, borderColor: '#ddd', backgroundColor: '#FAFAFA', padding: 15 },
  panelHeading: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 15 },
  sectionSubHeading: { fontSize: 13, fontWeight: '700', color: '#64748B', uppercase: true, letterSpacing: 0.5, marginBottom: 8, marginTop: 10 },
  listBlock: { maxHeight: 220, backgroundColor: 'white', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', padding: 8, marginBottom: 10 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  historyRowActive: { backgroundColor: '#007bff', borderRadius: 4 },
  rowDate: { fontSize: 13, color: '#334155', fontWeight: '500' },
  rowHours: { fontSize: 13, color: '#64748B' },
  noteCard: { backgroundColor: '#F8FAFC', padding: 10, borderRadius: 6, borderLeftWidth: 3, borderColor: '#38BDF8', marginBottom: 8 },
  noteClient: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  noteSummary: { fontSize: 13, color: '#475569', fontStyle: 'italic', marginVertical: 4 },
  noteTime: { fontSize: 11, color: '#94A3B8' },
  emptyLabel: { fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: 15 },
  mapFrame: { flex: 1, backgroundColor: '#E2E8F0' },
  placeholderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  placeholderText: { fontSize: 16, color: '#888' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});