import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Button, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../src/services/firebaseConfig';

let WebMap = null;
if (Platform.OS === 'web') {
  WebMap = require('../../src/components/WebMap').default;
}

export default function HRMonolithicControlHub() {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [liveEmployees, setLiveEmployees] = useState({});
  const [roster, setRoster] = useState([]);
  
  // 🧭 UI WORKSPACE VIEW STATE
  const [currentTab, setCurrentTab] = useState('dbms');
  const [selectedUser, setSelectedUser] = useState({ id: null, name: '' });

  // Filter States
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [dbmsSearch, setDbmsSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  
  // Historical Analytics Tracker states
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [visitNotes, setVisitNotes] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [replayPoints, setReplayPoints] = useState(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  // Provision modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ empId: '', firstName: '', lastName: '', area: '', email: '', mobile: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editFields, setEditFields] = useState({ email: '', mobile: '' });

  const fetchMasterData = useCallback(async () => {
    try {
      const response = await fetch('https://fieldo.onrender.com/api/hr/employees');
      if (!response.ok) throw new Error();
      const data = await response.json();
      setRoster(data || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadProfileTrackingData = useCallback(async (targetId) => {
    if (!targetId) return;
    setIsLoadingRoute(false);
    setSelectedDate(null);
    setReplayPoints(null);
    
    try {
      const [attRes, visitRes] = await Promise.all([
        fetch(`https://fieldo.onrender.com/api/attendance/${targetId}`),
        fetch(`https://fieldo.onrender.com/api/visits?userId=${targetId}`)
      ]);
      setAttendanceLogs(attRes.ok ? await attRes.json() : []);
      setVisitNotes(visitRes.ok ? await visitRes.json() : []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    setIsClient(true);
    fetchMasterData();

    const unsubscribe = onSnapshot(collection(db, 'daily_routes'), (snapshot) => {
      const liveMap = {};
      const today = new Date().toISOString().split('T')[0];
      snapshot.forEach((doc) => {
        if (!doc.exists()) return;
        const { userId, name, date, points, isActive, lastPing } = doc.data();
        if (date === today && isActive && lastPing && (Date.now() - lastPing < 120000)) {
          if (points?.length > 0) {
            const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
            liveMap[userId] = { name, lat: sorted[sorted.length - 1].lat, lng: sorted[sorted.length - 1].lng };
          }
        }
      });
      setLiveEmployees(liveMap);
    });
    return () => unsubscribe();
  }, [fetchMasterData]);

  useEffect(() => {
    if (selectedUser.id) {
      loadProfileTrackingData(selectedUser.id);
    }
  }, [selectedUser.id, loadProfileTrackingData]);

  const handleLoadRouteReplay = async (date) => {
    if (selectedDate === date && replayPoints) return;
    setSelectedDate(date);
    setIsLoadingRoute(true);
    try {
      const res = await fetch(`https://fieldo.onrender.com/api/routes/${selectedUser.id}/${date}`);
      const data = res.ok ? await res.json() : null;
      if (data?.points?.length > 0) {
        setReplayPoints(data.points.sort((a, b) => a.timestamp - b.timestamp));
      } else {
        setReplayPoints([]);
      }
    } catch (err) {
      setReplayPoints([]);
    } finally {
      setIsLoadingRoute(false);
    }
  };

  const handleAddEmployee = async () => {
    if (!formData.empId || !formData.firstName || !formData.email || !formData.mobile) {
      alert("Please fill out all mandatory fields.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch('https://fieldo.onrender.com/api/hr/employees/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, password: 'employee' })
      });
      if (response.ok) {
        alert("Employee account provisioned successfully!");
        setIsModalOpen(false);
        setFormData({ empId: '', firstName: '', lastName: '', area: '', email: '', mobile: '' });
        fetchMasterData();
      } else {
        alert("Provisioning failed. Check for duplicate IDs or emails.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveInlineChanges = async (id) => {
    try {
      const res = await fetch(`https://fieldo.onrender.com/api/hr/employees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFields)
      });
      if (res.ok) { setEditingRowId(null); fetchMasterData(); }
    } catch (err) { console.error(err); }
  };

  const handleDeleteEmployee = async (id) => {
    if (!confirm("Delete record entry and revoke app access permissions permanently?")) return;
    try {
      const response = await fetch(`https://fieldo.onrender.com/api/hr/employees/${id}`, { method: 'DELETE' });
      if (response.ok) fetchMasterData();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredSidebarRoster = useMemo(() => {
    return roster.filter(e => `${e.firstName || e.name || ''} ${e.lastName || ''}`.toLowerCase().includes(sidebarSearch.toLowerCase()));
  }, [roster, sidebarSearch]);

  const filteredGridRoster = useMemo(() => {
    return roster.filter(e => {
      const nameMatch = `${e.firstName || e.name || ''} ${e.lastName || ''}`.toLowerCase().includes(dbmsSearch.toLowerCase());
      const idMatch = String(e.empId || '').toLowerCase().includes(dbmsSearch.toLowerCase());
      const areaMatch = areaFilter ? (e.area || '').toLowerCase().includes(areaFilter.toLowerCase()) : true;
      return (nameMatch || idMatch) && areaMatch;
    });
  }, [roster, dbmsSearch, areaFilter]);

  const renderCalendarGrid = useMemo(() => {
    if (!selectedUser.id) return null;
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
    const totalDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const attendanceMap = {};
    attendanceLogs.forEach(log => { attendanceMap[log.date] = log.hoursLogged; });

    const gridCells = [];
    for (let i = 0; i < firstDayIndex; i++) gridCells.push(<View key={`empty-${i}`} style={styles.calendarDayEmpty} />);
    
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dayString = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const hoursLogged = attendanceMap[dayString] || 0;
      
      // 🟢 CHANGED THRESHOLD: Must hit 4 hours logged to trigger a green present dot indicator
      const isPresent = hoursLogged >= 4.0;
      const hasRecord = attendanceMap[dayString] !== undefined;

      gridCells.push(
        <TouchableOpacity 
          key={`day-${day}`} 
          style={[styles.calendarDayCell, selectedDate === dayString && styles.calendarDayCellSelected]}
          onPress={() => hasRecord && handleLoadRouteReplay(dayString)}
          disabled={!hasRecord}
        >
          <Text style={[styles.calendarDayText, selectedDate === dayString && styles.textWhite]}>{day}</Text>
          {hasRecord && <View style={[styles.indicatorDot, isPresent ? styles.dotPresent : styles.dotAbsent]} />}
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.calendarWrapper}>
        <div style={styles.selectHeaderRow}>
          <select value={calendarMonth} onChange={(e) => setCalendarMonth(Number(e.target.value))} style={styles.dropdownSelector}>
            {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m,i)=><option key={i} value={i}>{m}</option>)}
          </select>
          <select value={calendarYear} onChange={(e) => setCalendarYear(Number(e.target.value))} style={styles.dropdownSelector}>
            {[2025,2026,2027,2028].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginTop: '10px' }}>
          {['S','M','T','W','T','F','S'].map((d,i)=><Text key={i} style={styles.calendarDayHeaderLabel}>{d}</Text>)}
          {gridCells}
        </div>
      </View>
    );
  }, [attendanceLogs, selectedUser.id, selectedDate, calendarMonth, calendarYear]);

  return (
    <View style={styles.container}>
      {/* HEADER NAVBAR CONTAINER */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {currentTab === 'tracking' && (
            <TouchableOpacity style={styles.backBtn} onPress={() => setCurrentTab('dbms')}>
              <Text style={styles.textWhite}>📋 Show Master Table Records</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.title}>Fieldo Workspace Hub — Admin Station</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={async () => { await signOut(auth); router.replace('/login'); }}>
          <Text style={styles.textWhite}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.mainContent}>
        {/* LEFT WORKER DIRECTORY SIDEBAR */}
        <View style={styles.sidebar}>
          <Text style={styles.sidebarTitle}>Employee Index</Text>
          <TextInput 
            style={styles.searchBarContainer}
            placeholder="Search roster..."
            placeholderTextColor="#94A3B8"
            value={sidebarSearch}
            onChangeText={setSidebarSearch}
          />
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {filteredSidebarRoster.map((emp) => {
              const isLiveNow = !!liveEmployees[emp.userId];
              const isSelected = selectedUser.id === emp.userId && currentTab === 'tracking';
              return (
                <TouchableOpacity
                  key={emp.userId}
                  style={[styles.empCard, isSelected && styles.empCardActive]}
                  onPress={() => {
                    setSelectedUser({ id: emp.userId, name: emp.firstName || emp.name });
                    setCurrentTab('tracking');
                  }}
                >
                  <View style={[styles.statusDot, isLiveNow ? styles.statusDotLive : styles.statusDotIdle]} />
                  <Text style={[styles.empName, isSelected && {fontWeight: '700', color:'#2563EB'}]} numberOfLines={1}>{emp.firstName || emp.name}</Text>
                  {isLiveNow && <Text style={styles.liveLabel}>LIVE</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* COMPONENT TAB PANELS VIEWPORTS */}
        {currentTab === 'dbms' ? (
          <View style={styles.workspace}>
            <View style={styles.controlBar}>
              <TextInput style={styles.tableInputFilter} placeholder="🔍 Filter metrics by name or asset key..." placeholderTextColor="#94A3B8" value={dbmsSearch} onChangeText={setDbmsSearch} />
              <TextInput style={[styles.tableInputFilter, { width: 180, flex: 0 }]} placeholder="📍 Base City..." placeholderTextColor="#94A3B8" value={areaFilter} onChangeText={setAreaFilter} />
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setIsModalOpen(true)}><Text style={styles.btnText}>➕ Provision Employee</Text></TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
              <View style={{ padding: 16 }}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.th, { width: 60 }]}>ID</Text>
                  <Text style={[styles.th, { width: 120 }]}>First Name</Text>
                  <Text style={[styles.th, { width: 120 }]}>Last Name</Text>
                  <Text style={[styles.th, { width: 120 }]}>Base City</Text>
                  <Text style={[styles.th, { width: 130 }]}>Current City</Text>
                  <Text style={[styles.th, { width: 130 }]}>Freq Client 1</Text>
                  <Text style={[styles.th, { width: 130 }]}>Freq Client 2</Text>
                  <Text style={[styles.th, { width: 130 }]}>Freq Client 3</Text>
                  <Text style={[styles.th, { width: 200 }]}>Corporate Email</Text>
                  <Text style={[styles.th, { width: 140 }]}>Mobile Phone</Text>
                  <Text style={[styles.th, { width: 110, textAlign: 'center' }]}>Month Days</Text>
                  <Text style={[styles.th, { width: 240, textAlign: 'center' }]}>Actions Control</Text>
                </View>
                <ScrollView style={{ flex: 1 }}>
                  {filteredGridRoster.map((emp, idx) => {
                    const isEditing = editingRowId === emp._id;
                    const isTravelling = emp.area && emp.area !== "Gurugram" && emp.area !== "Not Tracking" && emp.area !== "Out of Station";
                    return (
                      <View key={emp._id || idx} style={[styles.tableRow, idx % 2 === 1 && styles.rowAlternate]}>
                        <Text style={[styles.td, { width: 60, fontWeight: '700' }]}>{emp.empId}</Text>
                        <Text style={[styles.td, { width: 120 }]}>{emp.firstName || emp.name}</Text>
                        <Text style={[styles.td, { width: 120 }]}>{emp.lastName || '-'}</Text>
                        <Text style={[styles.td, { width: 120, color: '#475569' }]}>Gurugram</Text>
                        <View style={{ width: 130 }}><View style={[styles.badge, isTravelling ? styles.badgeTravel : styles.badgeHome]}><Text style={{fontSize:11, fontWeight:'700', color:isTravelling?'#0369A1':'#166534'}}>📍 {isTravelling?emp.area:'Gurugram'}</Text></View></View>
                        <Text style={[styles.td, { width: 130, color: '#0EA5E9', fontWeight: '700' }]}>{emp.freqClient1 || '-'}</Text>
                        <Text style={[styles.td, { width: 130 }]}>{emp.freqClient2 || '-'}</Text>
                        <Text style={[styles.td, { width: 130 }]}>{emp.freqClient3 || '-'}</Text>
                        {isEditing ? <TextInput style={[styles.inlineInput, { width: 190 }]} value={editFields.email} onChangeText={t=>setEditFields({...editFields, email:t})} /> : <Text style={[styles.td, { width: 200, fontSize: 12 }]}>{emp.email}</Text>}
                        {isEditing ? <TextInput style={[styles.inlineInput, { width: 130 }]} value={editFields.mobile} onChangeText={t=>setEditFields({...editFields, mobile:t})} /> : <Text style={[styles.td, { width: 140 }]}>{emp.mobile || '-'}</Text>}
                        <Text style={[styles.td, { width: 110, textAlign: 'center', color: '#22C55E', fontWeight: '800' }]}>{emp.daysPresent} Days</Text>
                        <View style={{ width: 240, flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
                          {isEditing ? (
                            <>
                              <TouchableOpacity style={styles.saveBtn} onPress={() => handleSaveInlineChanges(emp._id)}><Text style={styles.textWhite}>Save</Text></TouchableOpacity>
                              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingRowId(null)}><Text style={{color:'#334155'}}>Cancel</Text></TouchableOpacity>
                            </>
                          ) : (
                            <>
                              <TouchableOpacity style={styles.viewBtn} onPress={() => { setSelectedUser({ id: emp.userId, name: emp.firstName || emp.name }); setCurrentTab('tracking'); }}><Text style={{color:'#2563EB', fontWeight:'700'}}>🗺️ Track</Text></TouchableOpacity>
                              <TouchableOpacity style={styles.editBtn} onPress={() => { setEditingRowId(emp._id); setEditFields({ email: emp.email, mobile: emp.mobile }); }}><Text style={{color:'#475569'}}>Edit</Text></TouchableOpacity>
                              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteEmployee(emp._id)}><Text style={{color:'#FFFFFF', fontWeight:'700'}}>Wipe</Text></TouchableOpacity>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            </ScrollView>
          </View>
        ) : (
          <View style={styles.workspaceSplit}>
            {/* VIEWPORT B: TIMELINE HISTORY METRICS & MAP SEGMENT PLOTTER */}
            <View style={styles.historyPanel}>
              <Text style={styles.panelHeading}>📊 Logs: {selectedUser.name}</Text>
              
              <Text style={styles.sectionSubHeading}>Attendance Dashboard Tracker</Text>
              {renderCalendarGrid}
              
              <Text style={styles.sectionSubHeading}>Attendance History Logs</Text>
              <ScrollView style={styles.listBlock} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {attendanceLogs.map(l => (
                  <TouchableOpacity key={l.date} style={[styles.historyRow, selectedDate === l.date && styles.historyRowActive]} onPress={() => handleLoadRouteReplay(l.date)}>
                    <Text style={[styles.rowDate, selectedDate === l.date && styles.textWhite]}>📅 {l.date}</Text>
                    <Text style={[styles.rowHours, selectedDate === l.date && {color:'#BFDBFE'}]}>{l.hoursLogged.toFixed(2)} Hrs</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <Text style={styles.sectionSubHeading}>CRM Client Visit Summaries</Text>
              {/* 🟢 FIXED SPACE LAYOUT: Set to flex: 1 with an unconstrained maxHeight to lock cleanly with map boundaries */}
              <ScrollView style={[styles.listBlock, { flex: 1, maxHeight: undefined }]} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {visitNotes.map((n,i) => (
                  <View key={i} style={styles.noteCard}>
                    <Text style={{fontWeight:'700', fontSize:13, color:'#0F172A'}}>🏢 Client: {n.clientName}</Text>
                    <Text style={{fontSize:13, fontStyle:'italic', color:'#475569', marginVertical:4}}>"{n.summary}"</Text>
                  </View>
                ))}
                {visitNotes.length === 0 && <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: 12, fontStyle: 'italic' }}>No visits filed yet.</Text>}
              </ScrollView>
            </View>

            <View style={styles.mapFrame}>
              {isLoadingRoute ? (
                <View style={styles.mapCenteredMsg}><Text style={styles.msgText}>Processing path segments...</Text></View>
              ) : isClient && Platform.OS === 'web' && WebMap && Array.isArray(replayPoints) ? (
                <WebMap routePoints={replayPoints} employeeName={selectedUser.name} visitNotes={visitNotes} />
              ) : (
                <View style={styles.mapCenteredMsg}><Text style={styles.msgText}>Select a logged operational date node on the side-panel tracker matrix to project route segments mapping trajectories.</Text></View>
              )}
            </View>
          </View>
        )}
      </View>

      {/* NEW OPERATOR ACCOUNT REGISTRATION PANEL MODAL */}
      <Modal visible={isModalOpen} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalFormContent}>
            <Text style={{fontSize:15, fontWeight:'800', color:'#1E293B'}}>📝 Provision New Employee Profile</Text>
            <TextInput style={styles.formInput} placeholder="ID Number (e.g. 104)" placeholderTextColor="#64748B" value={formData.empId} onChangeText={(t)=>setFormData({...formData, empId:t})} />
            <TextInput style={styles.formInput} placeholder="First Name" placeholderTextColor="#64748B" value={formData.firstName} onChangeText={(t)=>setFormData({...formData, firstName:t})} />
            <TextInput style={styles.formInput} placeholder="Last Name" placeholderTextColor="#64748B" value={formData.lastName} onChangeText={(t)=>setFormData({...formData, lastName:t})} />
            <TextInput style={styles.formInput} placeholder="Assigned Territory Area" placeholderTextColor="#64748B" value={formData.area} onChangeText={(t)=>setFormData({...formData, area:t})} />
            <TextInput style={styles.formInput} placeholder="Email" placeholderTextColor="#64748B" value={formData.email} onChangeText={(t)=>setFormData({...formData, email:t})} autoCapitalize="none" />
            <TextInput style={styles.formInput} placeholder="Mobile Contact" placeholderTextColor="#64748B" value={formData.mobile} onChangeText={(t)=>setFormData({...formData, mobile:t})} />
            <Text style={{fontSize:11, color:'#64748B', backgroundColor:'#F1F5F9', padding:6, borderRadius:4}}>⚠️ Access key parameters initialized as: "employee".</Text>
            <View style={{flexDirection:'row', justifyContent:'flex-end', gap:8}}>
              <Button title="Cancel" onPress={() => setIsModalOpen(false)} color="#64748B" />
              <Button title={isSubmitting ? "Processing..." : "Register User"} onPress={handleAddEmployee} disabled={isSubmitting} color="#3B82F6" />
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, backgroundColor: '#0F172A' },
  title: { fontSize: 16, fontWeight: '900', color: '#F8FAFC' },
  backBtn: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  logoutButton: { backgroundColor: '#EF4444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  textWhite: { color: '#FFFFFF', fontWeight: '700' },
  mainContent: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 240, backgroundColor: '#FFFFFF', borderRightWidth: 1, borderColor: '#E2E8F0', padding: 14 },
  sidebarTitle: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: 10 },
  searchBarContainer: { backgroundColor: '#F8FAFC', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12, fontSize: 13, color: '#1E293B' },
  empCard: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#F8FAFC', borderRadius: 6, marginBottom: 6 },
  empCardActive: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#3B82F6' },
  empName: { fontSize: 13, flex: 1, color: '#334155' },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  statusDotLive: { backgroundColor: '#22C55E' },
  statusDotIdle: { backgroundColor: '#94A3B8' },
  liveLabel: { fontSize: 9, fontWeight: '900', color: '#15803D', backgroundColor: '#DCFCE7', paddingHorizontal: 4, borderRadius: 3 },
  workspace: { flex: 1, padding: 16, backgroundColor: '#FFFFFF' },
  workspaceSplit: { flex: 1, flexDirection: 'row' },
  controlBar: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  tableInputFilter: { flex: 1, backgroundColor: '#F8FAFC', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 13, color: '#1E293B' },
  primaryBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 14, borderRadius: 6, justifyContent: 'center' },
  btnText: { color: '#FFFFFF', fontWeight: '800' },
  tableScroll: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 2, borderColor: '#CBD5E1', paddingBottom: 8, backgroundColor: '#F8FAFC', paddingHorizontal: 4 },
  th: { fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#F1F5F9', alignItems: 'center', paddingHorizontal: 4 },
  rowAlternate: { backgroundColor: '#F8FAFC' },
  td: { fontSize: 13, color: '#334155' },
  inlineInput: { borderWidth: 1, borderColor: '#3B82F6', borderRadius: 4, padding: 4, backgroundColor: '#FFF', fontSize: 13 },
  badge: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8, alignSelf: 'flex-start' },
  badgeHome: { backgroundColor: '#DCFCE7' },
  badgeTravel: { backgroundColor: '#E0F2FE' },
  viewBtn: { backgroundColor: '#EFF6FF', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 4 },
  editBtn: { backgroundColor: '#F1F5F9', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 4 },
  saveBtn: { backgroundColor: '#22C55E', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 4 },
  cancelBtn: { backgroundColor: '#E2E8F0', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 4 },
  deleteBtn: { backgroundColor: '#EF4444', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 4 },
  historyPanel: { width: 320, borderRightWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', padding: 14, display: 'flex', flexDirection: 'column' },
  panelHeading: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  sectionSubHeading: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginTop: 12, marginBottom: 6 },
  listBlock: { maxHeight: 160, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', padding: 6 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 6, borderRadius: 4 },
  historyRowActive: { backgroundColor: '#3B82F6' },
  rowDate: { fontSize: 13, fontWeight: '600' },
  rowHours: { fontSize: 13 },
  noteCard: { backgroundColor: '#FFFFFF', padding: 10, borderRadius: 6, borderLeftWidth: 4, borderColor: '#0EA5E9', marginBottom: 6, borderWidth: 1, borderColor: '#E2E8F0' },
  mapFrame: { flex: 1, backgroundColor: '#F1F5F9' },
  mapCenteredMsg: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  msgText: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  calendarWrapper: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  selectHeaderRow: { display: 'flex', gap: '8px', justifyContent: 'center' },
  dropdownSelector: { padding: '4px 8px', borderRadius: '6px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', fontWeight: '700', outline: 'none' },
  calendarDayHeaderLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textAlign: 'center' },
  calendarDayCell: { backgroundColor: '#F8FAFC', borderRadius: 6, paddingVertical: 4, alignItems: 'center' },
  calendarDayCellSelected: { backgroundColor: '#3B82F6' },
  calendarDayEmpty: { backgroundColor: 'transparent' },
  calendarDayText: { fontSize: 11, fontWeight: '700' },
  indicatorDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  dotPresent: { backgroundColor: '#22C55E' },
  dotAbsent: { backgroundColor: '#EF4444' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalFormContent: { backgroundColor: '#FFF', padding: 20, borderRadius: 12, width: 360, gap: 10 },
  formInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', padding: 8, borderRadius: 6, fontSize: 13, color: '#1E293B' }
});