import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Modal, ActivityIndicator } from 'react-native';

import { auth } from '../src/services/firebaseConfig';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotModalVisible, setForgotPasswordVisible] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Input Error", "Please provide both an email and password.");
      return;
    }
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      
      // Routes right into your single-page dashboard control hub
      router.replace('/(admin)/dashboard');
    } catch (error) {
      Alert.alert('Login Failed', error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} scrollEnabled={false}>
      <View style={styles.card}>
        <Text style={styles.kicker}>EMPLOYEE LOGIN</Text>
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

        {/* 🟢 EMBEDDED BUTTON: Placed inside your active dark container wrapper */}
        <Pressable onPress={() => setForgotPasswordVisible(true)} style={styles.forgotLinkContainer}>
          <Text style={styles.forgotLinkText}>Forgot Password?</Text>
        </Pressable>

        <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Start Tracking'}</Text>
        </Pressable>
      </View>

      {/* MODAL SHEET PORTAL OVERLAY */}
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
        "A secure password reset link has been sent to your inbox!",
        [{ text: "OK", onPress: () => { setResetEmail(''); onClose(); } }]
      );
    } catch (error) {
      console.error("Reset Email Failure:", error);
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
            placeholderTextColor="#475569"
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
              {isSending ? <ActivityIndicator color="#03A9F4" /> : <Text style={styles.submitButtonText}>Send Link</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#06101D', // Matched app background tone
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    backgroundColor: '#0F1B2E', // Matched card wrapper tone
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 12,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    color: '#00B0FF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderColor: '#1E293B',
    borderWidth: 1,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#06101D',
    color: '#FFFFFF',
    fontSize: 14,
  },
  forgotLinkContainer: {
    alignSelf: 'flex-end',
    paddingVertical: 2,
    marginTop: -2,
  },
  forgotLinkText: {
    color: '#00B0FF',
    fontWeight: '700',
    fontSize: 13,
  },
  button: {
    backgroundColor: '#00B0FF',
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#06101D',
    fontWeight: '900',
    fontSize: 15,
  },
  
  // Modal Backdrop Styles Array
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
    borderColor: '#1E293B',
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
    borderColor: '#1E293B',
    borderWidth: 1,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#06101D',
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
    backgroundColor: '#00B0FF',
  },
  submitButtonText: {
    color: '#06101D',
    fontWeight: '900',
    fontSize: 13,
  },
});