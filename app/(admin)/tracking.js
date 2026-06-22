import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../src/services/firebaseConfig';

let WebMap = null;
if (Platform.OS === 'web') {
  WebMap = require('../../src/components/WebMap').default;
}

export default function EmployeeTrackingWorkspace() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // 📁 Navigation Query Parameters State Management
  const [activeUserId, setActiveUserId] = useState(params.userId || null);
  const [activeName, setActiveName] = useState(params.name || 'Employee');

  const [isClient, setIsClient] = useState(false);
  const [liveEmployees, setLiveEmployees] = useState({});
  const [roster, setRoster] = useState([]);
  const [sidebarSearch, setSidebarSearch] = useState('');

  // 🔄 Analytics States for Selected User
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [visitNotes, setVisitNotes] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [replayPoints, setReplayPoints] = useState(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  // 🔍 Fetch master employee list for the left sidebar roster array
  const fetchSidebarRoster = useCallback(async () => {
    try {
      const response = await fetch('https://fieldo.onrender.com/api/hr/employees');
      if (!response.ok) throw new Error();
      const data = await response.json();
      setRoster(data || []);
    } catch (err) {
      console.error("Failed to load tracking workspace index:", err);
    }
  }, []);

  // 📈 Pull shift coordinates and notes for the active worker
  const loadTargetWorkspaceMetrics = useCallback(async (targetId) => {
    if (!targetId) return;
    setIsLoadingRoute(false);
    setSelectedDate(null);
    setReplayPoints(null);
    setAttendanceLogs([]);
    setVisitNotes([]);

    try {
      const [attRes, visitRes] = await Promise.all([
        fetch(`https://fieldo.onrender.com/api/attendance/${targetId}`),
        fetch(`https://fieldo.onrender.com/api/visits?userId=${targetId}`)
      ]);

      const attData = attRes.ok ? await attRes.json() : [];
      const visitData = visitRes.ok ? await visitRes.json() : [];

      setAttendanceLogs(attData);
      setVisitNotes(visitData);
    } catch (err) {
      console.error("Failed to pull aggregate tracking data details:", err);
    }
  }, []);

  useEffect(() => {
    setIsClient(true);
    fetchSidebarRoster();
    
    // Catch upstream parameters if passed initially
    if (params.userId) {
      setActiveUserId(params.userId);
      setActiveName(params.name || 'Employee');
    }

    // 📻 Live Real-Time Activity Heartbeat Listener
    const unsubscribe = onSnapshot(collection(db, 'daily_routes'), (snapshot) => {
      const liveMap = {};
      const today = new Date().toISOString().split('T')[0];
      
      snapshot.forEach((firestoreDoc) => {
        if (!firestoreDoc.exists()) return;
        const { userId, name, date, points, isActive, lastPing } = firestoreDoc.data();
        const isRecentlyActive = lastPing ? (Date.now() - lastPing) < 120000 : false;
        
        if (date === today && isActive && isRecentlyActive) {
          if (points && points.length > 0) {
            const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
            const latest = sorted[sorted.length - 1];
            if (latest && latest.lat && latest.lng) {
              liveMap[userId] = { name, lat: latest.lat, lng: latest.lng, lastPing };
            }
          }
        }
      });
      setLiveEmployees(liveMap);
    });

    return () => unsubscribe();
  }, [fetchSidebarRoster, params.userId, params.name]);

  // Hook tracker to watch state swaps when another worker is chosen
  useEffect(() => {
    if (activeUserId) {
      loadTargetWorkspaceMetrics(activeUserId);
    }
  }, [activeUserId, loadTargetWorkspaceMetrics]);

  // Load points array stream for a specific date
  const handleLoadRouteReplay = async (date) => {
    if (selectedDate === date && replayPoints) return;
    
    setSelectedDate(date);
    setIsLoadingRoute(true);
    
    try {
      const res = await fetch(`https://fieldo.onrender.com/api/routes/${activeUserId}/${date}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      
      if (data && Array.isArray(data.points) && data.points.length > 0) {
        const sortedPoints = data.points
          .filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number')
          .sort((a, b) => a.timestamp - b.timestamp);

        setReplayPoints(sortedPoints);
      } else {
        setReplayPoints([]);
      }
    } catch (err) {
      console.error("Error updating replay array index:", err);
      setReplayPoints([]);
    } finally {
      setIsLoadingRoute(false);
    }
  };

  // Sidebar dynamic computational loop
  const filteredSidebarRoster = useMemo(() => {
    return roster.filter(emp => {
      const labelStr = `${emp.firstName || ''} ${emp.lastName || ''}`.toLowerCase();
      return labelStr.includes(sidebarSearch.toLowerCase());
    });
  }, [roster, sidebarSearch]);

  // Attendance Tracker Grid Builder
  const renderCalendarGrid = useMemo(() => {
    if (!activeUserId) return null;

    const todayObj = new Date();
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
    const totalDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    const attendanceMap = {};
    attendanceLogs.forEach(log => {
      attendanceMap[log.date] = log.hoursLogged;
    });

    const gridCells = [];
    for (let i = 0; i < firstDayIndex; i++) {
      gridCells.push(<View key={`empty-${i}`} style={styles.calendarDayEmpty} />);
    }

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dayString = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const hoursLogged = attendanceMap[dayString] || 0;
      
      const isPresent = hoursLogged >= 0.25;
      const hasRecord = attendanceMap[dayString] !== undefined;
      const isFutureDate = new Date(calendarYear, calendarMonth, day) > todayObj;

      gridCells.push(
        <TouchableOpacity 
          key={`day-${day}`} 
          style={[styles.calendarDayCell, selectedDate === dayString && styles.calendarDayCellSelected]}
          onPress={() => hasRecord && handleLoadRouteReplay(dayString)}
          disabled={!hasRecord}
        >
          <Text style={[styles.calendarDayText, selectedDate === dayString && styles.textWhite]}>{day}</Text>
          {!isFutureDate && (
            <View style={[styles.indicatorDot, isPresent ? styles.dotPresent : styles.dotAbsent]} />
          )}
        </TouchableOpacity>
      );
    }

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const yearOptions = [2025, 2026, 2027, 2028];

    return (
      <View style={styles.calendarWrapper}>
        <div style={styles.selectHeaderRow}>
          <select value={calendarMonth} onChange={(e) => setCalendarMonth(Number(e.target.value))} style={styles.dropdownSelector}>
            {monthNames.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
          </select>
          <select value={calendarYear} onChange={(e) => setCalendarYear(Number(e.target.value))} style={styles.dropdownSelector}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginTop: '10px' }}>
          {['S','M','T','W','T','F','S'].map((d, idx) => (
            <Text key={`h-${idx}`} style={styles.calendarDayHeaderLabel}>{d}</Text>
          ))}
          {gridCells}
        </div>
      </View>
    );
  }, [attendanceLogs, activeUserId, selectedDate, calendarMonth, calendarYear]);

  return (
    <View style={styles.container}>
      {/* GLOBAL MANAGEMENT SCREEN HEADER */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {/* 🟢 FIXED ROUTE DIRECTORY REDIRECT PATH */}
          <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/dashboard')}>
            <Text style={styles.textWhite}>⬅️ Back to DBMS</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Fieldo Operational Tracking Workspace</Text>
        </View>
        <Text style={styles.activeProfileLabel}>Selected Target: <Text style={{fontWeight: '900', color: '#38BDF8'}}>{activeName}</Text></Text>
      </View>

      <View style={styles.mainContent}>
        
        {/* 🟢 RESTORED LEFT SIDED QUICK SELECT EMPLOYEE LIST SIDEBAR */}
        <View style={styles.sidebar}>
          <Text style={styles.sidebarTitle}>Employee Directory</Text>
          <TextInput 
            style={styles.searchBarContainer}
            placeholder="🔍 Search profiles..."
            placeholderTextColor="#94A3B8"
            value={sidebarSearch}
            onChangeText={setSidebarSearch}
          />
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {filteredSidebarRoster.map((emp) => {
              const isLiveNow = !!liveEmployees[emp.userId];
              const isSelected = activeUserId === emp.userId;
              
              return (
                <TouchableOpacity
                  key={emp.userId}
                  style={[styles.empCard, isSelected && styles.empCardActive]}
                  onPress={() => {
                    setActiveUserId(emp.userId);
                    setActiveName(emp.firstName || emp.name);
                  }}
                >
                  <View style={[styles.statusDot, isLiveNow ? styles.statusDotLive : styles.statusDotIdle]} />
                  <Text style={[styles.empName, isSelected && styles.textLinkActive]} numberOfLines={1}>
                    {emp.firstName || emp.name}
                  </Text>
                  {isLiveNow && <Text style={styles.liveLabel}>LIVE</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* HISTORICAL RECORDS PANEL */}
        <View style={styles.historyPanel}>
          <Text style={styles.panelHeading}>📊 Logs Overview</Text>
          
          <Text style={styles.sectionSubHeading}>Attendance Dashboard Tracker</Text>
          {renderCalendarGrid}

          <Text style={styles.sectionSubHeading}>Attendance History Logs</Text>
          <ScrollView style={styles.listBlock} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {attendanceLogs.map((log) => (
              <TouchableOpacity 
                key={log.date} 
                style={[styles.historyRow, selectedDate === log.date && styles.historyRowActive]}
                onPress={() => handleLoadRouteReplay(log.date)}
              >
                <Text style={[styles.rowDate, selectedDate === log.date && styles.textWhite]}>📅 {log.date}</Text>
                <Text style={[styles.rowHours, selectedDate === log.date && styles.textWhiteLight]}>{log.hoursLogged.toFixed(2)} Hrs</Text>
              </TouchableOpacity>
            ))}
            {attendanceLogs.length === 0 && <Text style={styles.emptyLabel}>No shifts logged.</Text>}
          </ScrollView>

          <Text style={styles.sectionSubHeading}>CRM Client Visit Summaries</Text>
          <ScrollView style={styles.listBlock} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {visitNotes.map((note) => {
              const parsedDate = new Date(note.timestamp);
              return (
                <View key={note._id || note.timestamp} style={styles.noteCard}>
                  <h4 style={styles.noteClient}>🏢 Client: {note.clientName}</h4>
                  <Text style={styles.noteSummary}>"{note.summary}"</Text>
                  <Text style={styles.noteTime}>Logged: {parsedDate.toLocaleDateString()} at {parsedDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
                </View>
              );
            })}
            {visitNotes.length === 0 && <Text style={styles.emptyLabel}>No visits filed yet.</Text>}
          </ScrollView>
        </View>

        {/* INTERACTIVE LEAFLET DISPLAY MAP LAYER */}
        <View style={styles.mapFrame}>
          {isLoadingRoute ? (
            <View style={styles.mapCenteredMsg}><Text style={styles.msgText}>Processing history metrics...</Text></View>
          ) : isClient && Platform.OS === 'web' && WebMap && Array.isArray(replayPoints) ? (
            <WebMap 
              routePoints={replayPoints} 
              employeeName={activeName} 
              visitNotes={visitNotes} 
            />
          ) : (
            <View style={styles.mapCenteredMsg}>
              <Text style={styles.msgText}>
                {selectedDate ? "No tracking coordinate maps available for this selection." : "Select a shift log date or calendar cell parameter from the profile tracking panel to load route replays."}
              </Text>
            </View>
          )}
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, backgroundColor: '#0F172A' },
  title: { fontSize: 16, fontWeight: '900', color: '#F8FAFC' },
  backBtn: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#475569' },
  activeProfileLabel: { color: '#94A3B8', fontSize: 13 },
  textWhite: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  mainContent: { flex: 1, flexDirection: 'row' },
  
  // Sidebar List Styles
  sidebar: { width: 230, backgroundColor: '#FFFFFF', borderRightWidth: 1, borderColor: '#E2E8F0', padding: 12 },
  sidebarTitle: { fontSize: 11, fontWeight: '800', color: '#64748B', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  searchBarContainer: { backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 13, color: '#1E293B', marginBottom: 12 },
  empCard: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#F8FAFC', borderRadius: 6, marginBottom: 6, borderWidth: 1, borderColor: 'transparent' },
  empCardActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  empName: { fontSize: 13, fontWeight: '600', color: '#334155', flex: 1 },
  textLinkActive: { color: '#2563EB', fontWeight: '700' },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  statusDotLive: { backgroundColor: '#22C55E' },
  statusDotIdle: { backgroundColor: '#94A3B8' },
  liveLabel: { fontSize: 9, fontWeight: '900', color: '#15803D', backgroundColor: '#DCFCE7', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  
  historyPanel: { width: 320, borderRightWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', padding: 14, overflowY: 'auto' },
  panelHeading: { fontSize: 15, fontWeight: '800', color: '#1E293B', marginBottom: 8 },
  sectionSubHeading: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  listBlock: { maxHeight: 140, minHeight: 80, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', padding: 6, marginBottom: 4 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderRadius: 6, marginBottom: 4 },
  historyRowActive: { backgroundColor: '#3B82F6' },
  rowDate: { fontSize: 13, color: '#334155', fontWeight: '600' },
  rowHours: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  textWhiteLight: { color: '#BFDBFE' },
  noteCard: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderColor: '#0EA5E9', marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  noteClient: { margin: '0 0 4px 0', fontSize: '13px', fontWeight: '700', color: '#1E293B' },
  noteSummary: { fontSize: 13, color: '#475569', fontStyle: 'italic', marginVertical: 4 },
  noteTime: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  emptyLabel: { fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: 16, fontStyle: 'italic' },
  mapFrame: { flex: 1, backgroundColor: '#F1F5F9', position: 'relative' },
  mapCenteredMsg: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  msgText: { fontSize: 14, color: '#64748B', fontWeight: '500', textAlign: 'center' },
  calendarWrapper: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 4 },
  selectHeaderRow: { display: 'flex', gap: '8px', justifyContent: 'center', width: '100%' },
  dropdownSelector: { padding: '6px 10px', borderRadius: '6px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: '13px', color: '#334155', fontWeight: '700', outline: 'none' },
  calendarDayHeaderLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textAlign: 'center', paddingBottom: 4 },
  calendarDayCell: { backgroundColor: '#F8FAFC', borderRadius: 6, paddingVertical: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
  calendarDayCellSelected: { backgroundColor: '#3B82F6', borderColor: '#2563EB' },
  calendarDayEmpty: { backgroundColor: 'transparent' },
  calendarDayText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  indicatorDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  dotPresent: { backgroundColor: '#22C55E' },
  dotAbsent: { backgroundColor: '#EF4444', opacity: 0.8 }
});