import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';
import { router } from 'expo-router';
import { useAppTheme } from '../lib/ThemeContext';

const universities = ['TU Kenya', 'University of Nairobi', 'Kenyatta University', 'Strathmore University', 'JKUAT', 'Moi University', 'Other'];

export default function SignupScreen() {
  const { theme, fonts, isDark } = useAppTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [university, setUniversity] = useState('');
  const [course, setCourse] = useState('');
  const [year, setYear] = useState('');
  const [age, setAge] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!fullName || !email || !password || !university || !course || !year || !age) { Alert.alert('Error', 'Please fill in all fields'); return; }
    if (!email.endsWith('.ac.ke') && !email.endsWith('.edu')) { Alert.alert('Error', 'Please use your university email (.ac.ke or .edu)'); return; }
    if (password.length < 6) { Alert.alert('Error', 'Password must be at least 6 characters'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, university, course, year_of_study: parseInt(year), age: parseInt(age) } } });
    setLoading(false);
    if (error) Alert.alert('Signup Failed', error.message);
    else Alert.alert(
      '🚀 Almost there!', 
      'Account created! Please check your university email and click the verification link to activate your account.', 
      [{ text: 'Go to Login', onPress: () => router.push('/login') }]
    );
  };

  const s = makeStyles(theme, fonts, isDark);

  return (
    <ScrollView style={[s.container, { backgroundColor: theme.background }]} contentContainerStyle={s.content}>
      <Text style={s.logo}>PROXIMA</Text>
      <Text style={[s.tagline, { color: theme.textMuted }]}>Connect with peers around you</Text>

      <Text style={[s.label, { color: theme.textSecondary }]}>FULL NAME</Text>
      <TextInput style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]} placeholder="Enter your full name" placeholderTextColor={theme.textMuted} value={fullName} onChangeText={setFullName} />

      <Text style={[s.label, { color: theme.textSecondary }]}>UNIVERSITY EMAIL</Text>
      <TextInput style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]} placeholder="yourname@university.ac.ke" placeholderTextColor={theme.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

      <Text style={[s.label, { color: theme.textSecondary }]}>PASSWORD</Text>
      <TextInput style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]} placeholder="Minimum 6 characters" placeholderTextColor={theme.textMuted} value={password} onChangeText={setPassword} secureTextEntry />

      <Text style={[s.label, { color: theme.textSecondary }]}>UNIVERSITY</Text>
      <View style={s.optionsRow}>
        {universities.map((uni) => (
          <TouchableOpacity key={uni} onPress={() => setUniversity(uni)} style={[s.optionBtn, { backgroundColor: theme.card, borderColor: theme.border }, university === uni && s.optionBtnActive]}>
            <Text style={[s.optionBtnText, { color: theme.textSecondary }, university === uni && s.optionBtnTextActive]}>{uni}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[s.label, { color: theme.textSecondary }]}>COURSE</Text>
      <TextInput style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]} placeholder="e.g. Computer Science" placeholderTextColor={theme.textMuted} value={course} onChangeText={setCourse} />

      <Text style={[s.label, { color: theme.textSecondary }]}>YEAR OF STUDY</Text>
      <View style={s.optionsRow}>
        {['1', '2', '3', '4'].map((y) => (
          <TouchableOpacity key={y} onPress={() => setYear(y)} style={[s.yearBtn, { backgroundColor: theme.card, borderColor: theme.border }, year === y && s.optionBtnActive]}>
            <Text style={[s.optionBtnText, { color: theme.textSecondary }, year === y && s.optionBtnTextActive]}>Year {y}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[s.label, { color: theme.textSecondary }]}>AGE</Text>
      <TextInput style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]} placeholder="Your age" placeholderTextColor={theme.textMuted} value={age} onChangeText={setAge} keyboardType="numeric" />

      <TouchableOpacity onPress={handleSignup} disabled={loading} style={s.signupBtn}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.signupBtnText}>Create Account</Text>}
      </TouchableOpacity>

      <Text style={[s.loginText, { color: theme.textMuted }]}>
        Already have an account?{' '}
        <Text style={s.loginLink} onPress={() => router.push('/login')}>Log in</Text>
      </Text>
    </ScrollView>
  );
}

const makeStyles = (theme: any, fonts: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  logo: { fontSize: 36, fontFamily: fonts.black, color: '#7C3AED', letterSpacing: 3, textAlign: 'center' },
  tagline: { fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 32, fontFamily: fonts.medium },
  label: { fontSize: 12, fontFamily: fonts.bold, letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  input: { borderRadius: 14, padding: 16, fontSize: 16, fontFamily: fonts.regular, borderWidth: 2, marginBottom: 4 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  optionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  optionBtnActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  optionBtnText: { fontSize: 13, fontFamily: fonts.medium },
  optionBtnTextActive: { color: '#fff' },
  yearBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  signupBtn: { backgroundColor: '#7C3AED', borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 32 },
  signupBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold, letterSpacing: 1 },
  loginText: { textAlign: 'center', marginTop: 20, marginBottom: 40, fontSize: 14, fontFamily: fonts.regular },
  loginLink: { color: '#7C3AED', fontFamily: fonts.bold },
});