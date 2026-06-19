import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Button, Platform, TouchableOpacity, ScrollView } from 'react-native';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'expo-router';

import { auth, db } from '../../src/services/firebaseConfig';

let WebMap = null;
if (Platform.OS === 'web') {
  WebMap = require('../../src/components/WebMap').default;
}

export default function Dashboard() {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [employeesData, setEmployeesData] = useState({});
  const [selectedEmpId, setSelectedEmpId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    setIsClient(true);

    const unsubscribe = onSnapshot(collection(db, 'daily_routes'), (snapshot) => {
      const groupedData = {};
      const today = new Date().toISOString().split('T')[0];

      snapshot.forEach((routeDoc) => {
        const data = routeDoc.data();
        const { userId, name, date, points, isActive } = data;
        const formattedPoints = points ? points.map((point) => [point.lat, point.lng]) : [];

        if (!groupedData[userId]) {
          groupedData[userId] = { name, history: {}, isLiveToday: false };
        }

        groupedData[userId].history[date] = formattedPoints;

        if (date === today && isActive) {
          groupedData[userId].isLiveToday = true;
        }
      });

      setEmployeesData(groupedData);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  const activeRoute = selectedEmpId && selectedDate 
    ? employeesData[selectedEmpId]?.history[selectedDate] 
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Fieldo HR Portal</Text>
        <Button title="Logout" onPress={handleLogout} color="#111" />
      </View>

      <View style={styles.mainContent}>
        <View style={styles.sidebar}>
          <Text style={styles.sidebarTitle}>Live Employees</Text>
          <ScrollView>
            {Object.keys(employeesData).map((empId) => (
              <View key={empId}>
                <TouchableOpacity
                  style={[styles.empCard, selectedEmpId === empId && styles.empCardActive]}
                  onPress={() => {
                    setSelectedEmpId(empId);
                    setSelectedDate(null);
                  }}
                >
                  <View
                    style={[
                      styles.statusDot,
                      employeesData[empId].isLiveToday ? styles.statusDotLive : styles.statusDotIdle,
                    ]}
                  />
                  <Text style={styles.empName}>{employeesData[empId].name}</Text>
                </TouchableOpacity>

                {selectedEmpId === empId && (
                  <View style={styles.dateContainer}>
                    {Object.keys(employeesData[empId].history).map((date) => (
                      <TouchableOpacity
                        key={date}
                        style={[styles.dateCard, selectedDate === date && styles.dateCardActive]}
                        onPress={() => setSelectedDate(date)}
                      >
                        <Text style={[styles.dateText, selectedDate === date && styles.dateTextActive]}>
                          📅 {date}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))}
            {Object.keys(employeesData).length === 0 && (
              <Text style={styles.placeholderText}>Waiting for GPS data...</Text>
            )}
          </ScrollView>
        </View>

        <View style={styles.mapContainer}>
          {!selectedEmpId ? (
            <View style={styles.placeholderContainer}>
              <Text style={styles.placeholderText}>Select an employee and date to view their live route.</Text>
            </View>
          ) : !selectedDate ? (
            <View style={styles.placeholderContainer}>
              <Text style={styles.placeholderText}>Select a date to view the route.</Text>
            </View>
          ) : isClient && Platform.OS === 'web' && WebMap ? (
            <WebMap 
              routePoints={activeRoute} 
              employeeName={employeesData[selectedEmpId].name} 
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#111',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 280,
    backgroundColor: 'white',
    borderRightWidth: 1,
    borderColor: '#ddd',
    padding: 15,
  },
  sidebarTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 15,
    textTransform: 'uppercase',
  },
  empCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderColor: 'transparent',
  },
  empCardActive: {
    backgroundColor: '#e6f2ff',
    borderColor: '#007bff',
  },
  empName: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  statusDotLive: {
    backgroundColor: '#22C55E',
  },
  statusDotIdle: {
    backgroundColor: '#EF4444',
  },
  dateContainer: {
    paddingLeft: 20,
    marginBottom: 15,
  },
  dateCard: {
    padding: 10,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  dateCardActive: {
    backgroundColor: '#007bff',
    borderRadius: 4,
  },
  dateText: {
    fontSize: 14,
    color: '#333',
  },
  dateTextActive: {
    color: 'white',
    fontWeight: 'bold',
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#e0e0e0',
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  placeholderText: {
    fontSize: 18,
    color: '#888',
    textAlign: 'center',
  },
});