import { View, Text, TextInput, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { router } from 'expo-router';
import { useAppTheme } from '../lib/ThemeContext';
import { useState } from 'react';

export default function LoginScreen() {
  const { theme, fonts, isDark, toggleTheme } = useAppTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { Alert.alert('Error', 'Please fill in all fields'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      const isUnconfirmed = error.message.toLowerCase().includes('confirm') || error.message.toLowerCase().includes('verify');
      Alert.alert(
        isUnconfirmed ? 'Verification Required' : 'Login Failed',
        isUnconfirmed ? 'Please verify your email address before logging in. Check your inbox for the link we sent you.' : error.message
      );
    }
  };

  const s = makeStyles(theme, fonts, isDark);

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={toggleTheme} style={s.themeBtn}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={24} color={theme.text} />
        </TouchableOpacity>

        <View style={s.logoSection}>
          <View style={[s.logoBox, { backgroundColor: theme.primaryBg, borderColor: theme.primaryBorder }]}>
            <Text style={s.logoIcon}>⬡</Text>
          </View>
          <Text style={s.logo}>PROXIMA</Text>
          <Text style={[s.tagline, { color: theme.textMuted }]}>Your campus. Your people.</Text>
        </View>

        <View style={s.form}>
          <Text style={[s.label, { color: theme.textSecondary }]}>UNIVERSITY EMAIL</Text>
          <TextInput style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]} placeholder="yourname@university.ac.ke" placeholderTextColor={theme.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

          <Text style={[s.label, { color: theme.textSecondary }]}>PASSWORD</Text>
          <TextInput style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]} placeholder="Enter your password" placeholderTextColor={theme.textMuted} value={password} onChangeText={setPassword} secureTextEntry />

          <TouchableOpacity onPress={handleLogin} disabled={loading} style={s.loginBtn}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.loginBtnText}>LOG IN →</Text>}
          </TouchableOpacity>

          <Text style={[s.signupText, { color: theme.textMuted }]}>
            New to Proxima?{' '}
            <Text style={s.signupLink} onPress={() => router.push('/signup')}>Create account</Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme: any, fonts: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, padding: 24, justifyContent: 'center', minHeight: 600 },
  themeBtn: { position: 'absolute', top: 60, right: 24, padding: 8 },
  themeBtnText: { fontSize: 24 },
  logoSection: { alignItems: 'center', marginBottom: 48, marginTop: 80 },
  logoBox: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 2 },
  logoIcon: { fontSize: 40, color: '#7C3AED' },
  logo: { fontSize: 42, fontFamily: fonts.black, color: '#7C3AED', letterSpacing: 3, textAlign: 'center' },
  tagline: { fontSize: 15, textAlign: 'center', marginTop: 8, letterSpacing: 1, fontFamily: fonts.medium },
  form: { gap: 8 },
  label: { fontSize: 12, fontFamily: fonts.bold, letterSpacing: 1, marginBottom: 6, marginTop: 8 },
  input: { borderRadius: 14, padding: 16, fontSize: 16, fontFamily: fonts.regular, borderWidth: 2, marginBottom: 4 },
  loginBtn: { backgroundColor: '#7C3AED', borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 24 },
  loginBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold, letterSpacing: 2 },
  signupText: { textAlign: 'center', marginTop: 24, fontSize: 14, fontFamily: fonts.regular },
  signupLink: { color: '#7C3AED', fontFamily: fonts.bold },
});