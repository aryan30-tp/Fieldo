import { useRouter } from 'expo-router';
import { onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { auth } from '../src/services/firebaseConfig';

export default function IndexScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isCheckingUser, setIsCheckingUser] = useState(true);
  
  // FORGOT PASSWORD RECOVERY STATE
  const [forgotModalVisible, setForgotPasswordVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace('/(employee)/tracker');
      } else {
        setIsCheckingUser(false);
      }
    });

    return unsubscribe;
  }, [router]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Input Missing', 'Please provide both email and password credentials.');
      return;
    }
    try {
      setLoading(true);
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const userInstance = userCredential.user;

      // 🟢 Generate a unique token identifier for this specific device session tracking lane
      const uniqueSessionId = `SESSION_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await AsyncStorage.setItem('@fieldo_device_session_id', uniqueSessionId);

      // Sync profile matrix to master cluster database roster
      await fetch("https://fieldo.onrender.com/api/employees/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userInstance.uid,
          name: userInstance.email.split('@')[0],
          email: userInstance.email,
          deviceId: uniqueSessionId // 🟢 Overwrites backend table with active fingerprint
        })
      });

      router.replace('/(employee)/tracker');
    } catch (error) {
      Alert.alert('Login Failed', error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  if (isCheckingUser) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={styles.loadingText}>Checking saved login...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} scrollEnabled={false}>
      <View style={styles.card}>
        <Text style={styles.kicker}>Employee Login</Text>
        <Text style={styles.title}>Sign in to start tracking</Text>

        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="employee@fieldo.com"
          placeholderTextColor="#64748B"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          autoCapitalize="none"
          autoComplete="password"
          placeholder="Password"
          placeholderTextColor="#64748B"
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />

        {/* FIXED ELEMENT: Properly styled and placed recovery hyperlink button */}
        <Pressable onPress={() => setForgotPasswordVisible(true)} style={styles.forgotLinkContainer}>
          <Text style={styles.forgotLinkText}>Forgot Password?</Text>
        </Pressable>

        <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Start Tracking'}</Text>
        </Pressable>
      </View>

      {/* MOUNTED LAYER: Floating Password Recovery Panel Sheet */}
      <ForgotPasswordModal 
        visible={forgotModalVisible} 
        onClose={() => setForgotPasswordVisible(false)} 
      />
    </ScrollView>
  );
}

function ForgotPasswordModal({ visible, onClose }) {
  const [resetEmail, setResetEmail] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handlePasswordReset = async () => {
    const formattedEmail = resetEmail.trim();
    if (!formattedEmail) {
      Alert.alert("Missing Input", "Please type in your registered email address.");
      return;
    }

    setIsSending(true);
    try {
      await sendPasswordResetEmail(auth, formattedEmail);
      Alert.alert(
        "Link Dispatched",
        "A secure password recovery email has been sent to your inbox!",
        [{ text: "OK", onPress: () => { setResetEmail(''); onClose(); } }]
      );
    } catch (error) {
      console.error("Reset Failure:", error);
      const err = error;
      if (err.code === 'auth/user-not-found') {
        Alert.alert("Account Missing", "No employee profile matches this email address.");
      } else if (err.code === 'auth/invalid-email') {
        Alert.alert("Invalid Format", "Please enter a properly formatted corporate email.");
      } else {
        Alert.alert("Request Failed", "Unable to contact verification servers.");
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>🔒 Reset Password</Text>
          <Text style={styles.modalSubtitle}>
            Enter your email below, and we'll send you a secure link to choose a new password.
          </Text>

          <TextInput
            style={styles.modalInput}
            placeholder="corporate-email@company.com"
            placeholderTextColor="#64748B"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={resetEmail}
            onChangeText={setResetEmail}
            editable={!isSending}
          />

          <View style={styles.buttonRow}>
            <Pressable style={[styles.modalButton, styles.cancelButton]} onPress={onClose} disabled={isSending}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>

            <Pressable style={[styles.modalButton, styles.submitButton]} onPress={handlePasswordReset} disabled={isSending}>
              {isSending ? <ActivityIndicator color="#06101D" /> : <Text style={styles.submitButtonText}>Send Link</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#06101D',
  },
  loadingContainer: {
    alignItems: 'center',
    gap: 14,
  },
  loadingText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    gap: 12,
    padding: 22,
    borderRadius: 20,
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
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  input: {
    height: 46,
    borderColor: '#334155',
    borderWidth: 1,
    backgroundColor: '#111C2E',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  forgotLinkContainer: {
    alignSelf: 'flex-end',
    paddingVertical: 2,
    marginTop: -4,
    marginBottom: 2,
  },
  forgotLinkText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 13,
  },
  button: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: '#38BDF8',
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#06101D',
    fontWeight: '900',
    fontSize: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 16, 29, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#0F1B2E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#223248',
    padding: 24,
    width: '100%',
    maxWidth: 360,
    gap: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  modalInput: {
    height: 46,
    borderColor: '#334155',
    borderWidth: 1,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#111C2E',
    color: '#FFFFFF',
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 85,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cancelButtonText: {
    color: '#94A3B8',
    fontWeight: '700',
    fontSize: 13,
  },
  submitButton: {
    backgroundColor: '#38BDF8',
  },
  submitButtonText: {
    color: '#06101D',
    fontWeight: '900',
    fontSize: 13,
  },
});