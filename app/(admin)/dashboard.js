import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Button } from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../src/services/firebaseConfig';

export default function HRCombinedControlCenter() {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [liveEmployees, setLiveEmployees] = useState({});
  
  // 📁 Relational Dataset Inventory Indexes
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [dbmsSearch, setDbmsSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [roster, setRoster] = useState([]);
  
  // 📝 User Modal Registration Configuration States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    empId: '', firstName: '', lastName: '', area: '', email: '', mobile: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🔍 Fetch Data Index
  const fetchDBMSData = useCallback(async () => {
    try {
      const response = await fetch('https://fieldo.onrender.com/api/hr/employees');
      if (!response.ok) throw new Error();
      const data = await response.json();
      setRoster(data || []);
    } catch (err) {
      console.error("Failed to load master index roster dataset:", err);
    }
  }, []);

  useEffect(() => {
    setIsClient(true);
    fetchDBMSData();

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
  }, [fetchDBMSData]);

  // Account Provisioning Handlers
  const handleAddEmployee = async () => {
    if (!formData.empId || !formData.firstName || !formData.email || !formData.mobile) {
      alert("Please fill out all mandatory operational form configurations.");
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
        fetchDBMSData();
      } else {
        alert("Execution rejected. Double check field duplicates.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEmployee = async (id, userId) => {
    if (!confirm("Revoke workspace access parameters for this profile permanently?")) return;
    try {
      const response = await fetch(`https://fieldo.onrender.com/api/hr/employees/${id}?userId=${userId}`, { method: 'DELETE' });
      if (response.ok) fetchDBMSData();
    } catch (err) {
      console.error(err);
    }
  };

  // 📻 Sidebar filter mapping computation layer
  const filteredSidebarRoster = useMemo(() => {
    return roster.filter(emp => {
      const matchLabel = `${emp.firstName || ''} ${emp.lastName || ''}`.toLowerCase();
      return matchLabel.includes(sidebarSearch.toLowerCase());
    });
  }, [roster, sidebarSearch]);

  // 📊 Tabular main body grid mapping filter calculation
  const filteredGridRoster = useMemo(() => {
    return roster.filter(emp => {
      const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.toLowerCase();
      const idMatch = String(emp.empId || '').toLowerCase().includes(dbmsSearch.toLowerCase());
      const nameMatch = fullName.includes(dbmsSearch.toLowerCase());
      const areaMatch = areaFilter ? (emp.area || '').toLowerCase() === areaFilter.toLowerCase() : true;
      return (idMatch || nameMatch) && areaMatch;
    });
  }, [roster, dbmsSearch, areaFilter]);

  return (
    <View style={styles.container}>
      {/* NAVIGATION HEADER TOP BAR */}
      <View style={styles.header}>
        <Text style={styles.title}>Fieldo HR Portal Hub - Control Desk</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={async () => { await signOut(auth); router.replace('/login'); }}>
          <Text style={styles.textWhite}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.mainContent}>
        
        {/* 📋 SIDEBAR INDEX MATRIX COMPONENT RETURNED */}
        <View style={styles.sidebar}>
          <Text style={styles.sidebarTitle}>Employee Roster Index</Text>
          <TextInput 
            style={styles.searchBarContainer}
            placeholder="🔍 Quick filter list..."
            placeholderTextColor="#94A3B8"
            value={sidebarSearch}
            onChangeText={setSidebarSearch}
          />
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {filteredSidebarRoster.map((emp) => {
              const isLiveNow = !!liveEmployees[emp.userId];
              return (
                <TouchableOpacity
                  key={emp.userId}
                  style={styles.empCard}
                  onPress={() => router.push(`/admin/tracking?userId=${emp.userId}&name=${emp.firstName}`)}
                >
                  <View style={[styles.statusDot, isLiveNow ? styles.statusDotLive : styles.statusDotIdle]} />
                  <Text style={styles.empName} numberOfLines={1}>{emp.firstName}</Text>
                  {isLiveNow && <Text style={styles.liveLabel}>LIVE</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* 📊 CORE MAIN WRAPPER COMPONENT: DBMS AGGREGATES VIEWPORT */}
        <View style={styles.workspace}>
          <View style={styles.controlBar}>
            <TextInput 
              style={styles.tableInputFilter}
              placeholder="🔍 Search master records by name or index..."
              placeholderTextColor="#94A3B8"
              value={dbmsSearch}
              onChangeText={setDbmsSearch}
            />
            <TextInput 
              style={[styles.tableInputFilter, { width: 180, flex: 0 }]}
              placeholder="📍 Area Boundary..."
              placeholderTextColor="#94A3B8"
              value={areaFilter}
              onChangeText={setAreaFilter}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setIsModalOpen(true)}>
              <Text style={styles.btnText}>➕ Provision Profile</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScroll}>
            <View style={{ padding: 12 }}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.th, { width: 70 }]}>ID</Text>
                <Text style={[styles.th, { width: 110 }]}>First Name</Text>
                <Text style={[styles.th, { width: 110 }]}>Last Name</Text>
                <Text style={[styles.th, { width: 100 }]}>Area</Text>
                <Text style={[styles.th, { width: 130 }]}>Freq Client 1</Text>
                <Text style={[styles.th, { width: 130 }]}>Freq Client 2</Text>
                <Text style={[styles.th, { width: 130 }]}>Freq Client 3</Text>
                <Text style={[styles.th, { width: 180 }]}>Corporate Email</Text>
                <Text style={[styles.th, { width: 120 }]}>Mobile Phone</Text>
                <Text style={[styles.th, { width: 100, textAlign: 'center' }]}>Month Days</Text>
                <Text style={[styles.th, { width: 220, textAlign: 'center' }]}>Operations Control</Text>
              </View>

              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {filteredGridRoster.map((emp, idx) => (
                  <View key={emp._id || idx} style={[styles.tableRow, idx % 2 === 1 && styles.rowAlternate]}>
                    <Text style={[styles.td, { width: 70, fontWeight: '700' }]}>{emp.empId}</Text>
                    <Text style={[styles.td, { width: 110 }]}>{emp.firstName}</Text>
                    <Text style={[styles.td, { width: 110 }]}>{emp.lastName || '-'}</Text>
                    <Text style={[styles.td, { width: 100 }]}>{emp.area || '-'}</Text>
                    <Text style={[styles.td, { width: 130, color: '#0EA5E9', fontWeight: '700' }]}>{emp.freqClient1 || '-'}</Text>
                    <Text style={[styles.td, { width: 130 }]}>{emp.freqClient2 || '-'}</Text>
                    <Text style={[styles.td, { width: 130 }]}>{emp.freqClient3 || '-'}</Text>
                    <Text style={[styles.td, { width: 180, fontSize: 12 }]}>{emp.email}</Text>
                    <Text style={[styles.td, { width: 120 }]}>{emp.mobile || '-'}</Text>
                    <Text style={[styles.td, { width: 100, textAlign: 'center', fontWeight: '800', color: '#22C55E' }]}>{emp.daysPresent || 0} Present</Text>

                    <View style={[styles.td, { width: 220, flexDirection: 'row', gap: 6, justifyContent: 'center' }]}>
                      <TouchableOpacity style={styles.actionViewBtn} onPress={() => router.push(`/admin/tracking?userId=${emp.userId}&name=${emp.firstName}`)}>
                        <Text style={styles.actionBtnText}>🗺️ Track</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionDeleteBtn} onPress={() => handleDeleteEmployee(emp._id, emp.userId)}>
                        <Text style={styles.textWhite}>Revoke</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </ScrollView>
        </View>

      </View>

      {/* REGISTRATION MODAL CONFIG BLOCK */}
      <Modal visible={isModalOpen} animationType="fade" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalFormContent}>
            <Text style={styles.modalTitle}>📝 Provision New Employee Profile</Text>
            <TextInput style={styles.formInput} placeholder="ID Number (e.g. 104)" placeholderTextColor="#64748B" value={formData.empId} onChangeText={(t)=>setFormData({...formData, empId:t})} />
            <TextInput style={styles.formInput} placeholder="First Name" placeholderTextColor="#64748B" value={formData.firstName} onChangeText={(t)=>setFormData({...formData, firstName:t})} />
            <TextInput style={styles.formInput} placeholder="Last Name" placeholderTextColor="#64748B" value={formData.lastName} onChangeText={(t)=>setFormData({...formData, lastName:t})} />
            <TextInput style={styles.formInput} placeholder="Assigned Territory Area" placeholderTextColor="#64748B" value={formData.area} onChangeText={(t)=>setFormData({...formData, area:t})} />
            <TextInput style={styles.formInput} placeholder="Email" placeholderTextColor="#64748B" value={formData.email} onChangeText={(t)=>setFormData({...formData, email:t})} autoCapitalize="none" />
            <TextInput style={styles.formInput} placeholder="Mobile Contact" placeholderTextColor="#64748B" value={formData.mobile} onChangeText={(t)=>setFormData({...formData, mobile:t})} />
            <Text style={styles.infoCaption}>⚠️ Access key parameters initialized as: "employee".</Text>
            <View style={styles.formButtonRow}>
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
  logoutButton: { backgroundColor: '#EF4444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  textWhite: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  mainContent: { flex: 1, flexDirection: 'row' },
  
  // 📋 SIDEBAR LOOKUP GRID
  sidebar: { width: 240, backgroundColor: '#FFFFFF', borderRightWidth: 1, borderColor: '#E2E8F0', padding: 14 },
  sidebarTitle: { fontSize: 11, fontWeight: '800', color: '#64748B', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  searchBarContainer: { backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 13, color: '#1E293B', marginBottom: 12 },
  empCard: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#F8FAFC', borderRadius: 6, marginBottom: 6 },
  empName: { fontSize: 13, fontWeight: '600', color: '#334155', flex: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  statusDotLive: { backgroundColor: '#22C55E' },
  statusDotIdle: { backgroundColor: '#94A3B8' },
  liveLabel: { fontSize: 9, fontWeight: '900', color: '#15803D', backgroundColor: '#DCFCE7', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  
  // 📊 DBMS TABLE WORKSPACE
  workspace: { flex: 1, padding: 16, backgroundColor: '#FFFFFF' },
  controlBar: { flexDirection: 'row', gap: 10, marginBottom: 14, alignItems: 'center' },
  tableInputFilter: { flex: 1, backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 13, color: '#1E293B' },
  primaryBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 6 },
  btnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  tableScroll: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 2, borderColor: '#CBD5E1', paddingBottom: 8, backgroundColor: '#F8FAFC' },
  th: { fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#F1F5F9', alignItems: 'center' },
  rowAlternate: { backgroundColor: '#F8FAFC' },
  td: { fontSize: 13, color: '#334155' },
  actionViewBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  actionBtnText: { color: '#2563EB', fontWeight: '700', fontSize: 12 },
  actionDeleteBtn: { backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'center', alignItems: 'center' },
  modalFormContent: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20, width: 380, gap: 10 },
  modalTitle: { fontSize: 15, fontWeight: '800', color: '#1E293B', marginBottom: 4 },
  formInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', padding: 8, borderRadius: 6, fontSize: 13, color: '#1E293B' },
  infoCaption: { fontSize: 11, color: '#64748B', backgroundColor: '#F1F5F9', padding: 6, borderRadius: 4 },
  formButtonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }
});