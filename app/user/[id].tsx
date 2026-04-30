import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Image, ScrollView, Modal, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAppTheme } from '../../lib/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

type UserProfile = {
  id: string;
  full_name: string;
  university: string;
  course: string;
  year_of_study: number;
  age: number;
  avatar_url: string | null;
};

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams();
  const { theme, fonts, isDark } = useAppTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<'none' | 'sent' | 'accepted' | 'pending'>('none');
  const [introModal, setIntroModal] = useState(false);
  const [introMessage, setIntroMessage] = useState('');
  const [sendingLink, setSendingLink] = useState(false);
  const [postCount, setPostCount] = useState(0);

  useEffect(() => { init(); }, [id]);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      await Promise.all([
        fetchProfile(),
        fetchLinkStatus(user.id),
        fetchPostCount(),
      ]);
    }
    setLoading(false);
  };

  const fetchProfile = async () => {
    const { data } = await supabase.from('users').select('*').eq('id', id).single();
    if (data) setProfile(data);
  };

  const fetchLinkStatus = async (userId: string) => {
    const { data: sent } = await supabase.from('links').select('status').eq('requester_id', userId).eq('receiver_id', id).single();
    const { data: received } = await supabase.from('links').select('status').eq('requester_id', id).eq('receiver_id', userId).single();
    if (sent?.status === 'accepted' || received?.status === 'accepted') setLinkStatus('accepted');
    else if (sent?.status === 'pending') setLinkStatus('sent');
    else if (received?.status === 'pending') setLinkStatus('pending');
    else setLinkStatus('none');
  };

  const fetchPostCount = async () => {
    const { count } = await supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', id);
    setPostCount(count || 0);
  };

  const handleSendLink = async () => {
    if (!introMessage.trim()) { Alert.alert('Error', 'Please write an introduction message'); return; }
    if (!currentUserId || !profile) return;
    setSendingLink(true);
    setIntroModal(false);
    try {
      await supabase.from('intro_messages').insert({ sender_id: currentUserId, receiver_id: profile.id, message: introMessage.trim() });
      const { error } = await supabase.from('links').insert({ requester_id: currentUserId, receiver_id: profile.id, status: 'pending' });
      if (!error) {
        await supabase.from('notifications').insert({ 
          user_id: profile.id, 
          title: 'New Link Request', 
          body: 'Someone wants to connect with you on Proxima', 
          type: `link_request:${currentUserId}` 
        });
        setLinkStatus('sent');
        Alert.alert("Success", "Link request sent!");
      }
    } catch (err) {
      Alert.alert("Error", "Could not send link request");
    } finally {
      setSendingLink(false);
    }
  };

  const s = makeStyles(theme, fonts, isDark);

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#7C3AED" size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[s.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: theme.text }}>User not found.</Text>
      </View>
    );
  }

  const isOwnProfile = profile.id === currentUserId;

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>Profile</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* Avatar & Name */}
        <View style={s.heroSection}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={s.avatar} />
          ) : (
            <View style={s.avatarFallback}>
              <Text style={s.avatarFallbackText}>{profile.full_name?.charAt(0).toUpperCase() || '?'}</Text>
            </View>
          )}
          <Text style={[s.fullName, { color: theme.text }]}>{profile.full_name}</Text>
          <Text style={[s.university, { color: '#7C3AED' }]}>{profile.university}</Text>
        </View>

        {/* Stats Row */}
        <View style={[s.statsRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={s.statItem}>
            <Text style={[s.statNumber, { color: theme.text }]}>{postCount}</Text>
            <Text style={[s.statLabel, { color: theme.textMuted }]}>Posts</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: theme.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statNumber, { color: theme.text }]}>{profile.year_of_study}</Text>
            <Text style={[s.statLabel, { color: theme.textMuted }]}>Year</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: theme.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statNumber, { color: theme.text }]}>{profile.age || '—'}</Text>
            <Text style={[s.statLabel, { color: theme.textMuted }]}>Age</Text>
          </View>
        </View>

        {/* Info Cards */}
        <View style={[s.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={s.infoRow}>
            <Ionicons name="school-outline" size={18} color="#7C3AED" />
            <View style={s.infoText}>
              <Text style={[s.infoLabel, { color: theme.textMuted }]}>Course</Text>
              <Text style={[s.infoValue, { color: theme.text }]}>{profile.course}</Text>
            </View>
          </View>
          <View style={[s.infoSeparator, { backgroundColor: theme.border }]} />
          <View style={s.infoRow}>
            <Ionicons name="business-outline" size={18} color="#7C3AED" />
            <View style={s.infoText}>
              <Text style={[s.infoLabel, { color: theme.textMuted }]}>University</Text>
              <Text style={[s.infoValue, { color: theme.text }]}>{profile.university}</Text>
            </View>
          </View>
          <View style={[s.infoSeparator, { backgroundColor: theme.border }]} />
          <View style={s.infoRow}>
            <Ionicons name="layers-outline" size={18} color="#7C3AED" />
            <View style={s.infoText}>
              <Text style={[s.infoLabel, { color: theme.textMuted }]}>Year of Study</Text>
              <Text style={[s.infoValue, { color: theme.text }]}>Year {profile.year_of_study}</Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        {!isOwnProfile && (
          <View style={s.actionButtons}>
            {linkStatus === 'accepted' && (
              <TouchableOpacity style={s.messageBtn} onPress={() => router.push(`/chat/${profile.id}`)}>
                <Ionicons name="chatbubble-outline" size={18} color="#fff" />
                <Text style={s.messageBtnText}>Send Message</Text>
              </TouchableOpacity>
            )}
            {linkStatus === 'none' && (
              <TouchableOpacity 
                style={s.linkRequestBtn} 
                onPress={() => { setIntroMessage(''); setIntroModal(true); }}
                disabled={sendingLink}
              >
                {sendingLink ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="people-outline" size={18} color="#fff" />
                    <Text style={s.linkRequestBtnText}>Send Link Request</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {linkStatus === 'sent' && (
              <View style={[s.statusNote, { backgroundColor: theme.card, borderColor: '#FF9500' }]}>
                <Text style={[s.statusNoteText, { color: '#FF9500' }]}>
                  <Ionicons name="time-outline" size={16} color="#FF9500" /> Link request sent — waiting for a response.
                </Text>
              </View>
            )}
            {linkStatus === 'pending' && (
              <View style={[s.statusNote, { backgroundColor: theme.card, borderColor: '#7C3AED' }]}>
                <Text style={[s.statusNoteText, { color: '#7C3AED' }]}>
                  <Ionicons name="people-outline" size={16} color="#7C3AED" /> This person sent you a Link request! Check your Links tab.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Intro Modal */}
      {introModal && (
        <Modal transparent animationType="fade" visible={introModal}>
          <View style={s.modalOverlay}>
            <View style={[s.modalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[s.modalTitle, { color: theme.text }]}>Send Introduction</Text>
              <Text style={[s.modalSubtitle, { color: theme.textMuted }]}>
                Write a message to introduce yourself to {profile.full_name}.
              </Text>
              <TextInput
                style={[s.introInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
                placeholder="Hi! I noticed we're both in the same course..."
                placeholderTextColor={theme.textMuted}
                value={introMessage}
                onChangeText={setIntroMessage}
                multiline
                maxLength={200}
              />
              <Text style={[s.charCount, { color: theme.textMuted }]}>{introMessage.length}/200</Text>
              <View style={s.modalButtons}>
                <TouchableOpacity onPress={() => setIntroModal(false)} style={[s.cancelBtn, { borderColor: theme.border }]}>
                  <Text style={[s.cancelBtnText, { color: theme.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSendLink} style={s.sendLinkBtn}>
                  <Ionicons name="link-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={s.sendLinkBtnText}>Send Link</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const makeStyles = (theme: any, fonts: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: fonts.bold },
  content: { padding: 20, paddingBottom: 60 },
  heroSection: { alignItems: 'center', marginBottom: 24, marginTop: 8 },
  avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 14 },
  avatarFallback: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarFallbackText: { color: '#fff', fontSize: 40, fontFamily: fonts.black },
  fullName: { fontSize: 24, fontFamily: fonts.black, marginBottom: 4 },
  university: { fontSize: 14, fontFamily: fonts.bold },
  statsRow: { flexDirection: 'row', borderRadius: 18, borderWidth: 1.5, marginBottom: 16, overflow: 'hidden' },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statNumber: { fontSize: 22, fontFamily: fonts.black },
  statLabel: { fontSize: 12, marginTop: 2, fontFamily: fonts.medium },
  statDivider: { width: 1.5 },
  infoCard: { borderRadius: 18, borderWidth: 1.5, padding: 4, marginBottom: 20 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 11, fontFamily: fonts.semiBold, marginBottom: 2 },
  infoValue: { fontSize: 15, fontFamily: fonts.bold },
  infoSeparator: { height: 1, marginHorizontal: 14 },
  actionButtons: { gap: 12 },
  messageBtn: { backgroundColor: '#7C3AED', borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  messageBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold },
  linkRequestBtn: { backgroundColor: '#7C3AED', borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  linkRequestBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold },
  statusNote: { borderRadius: 14, borderWidth: 1.5, padding: 16 },
  statusNoteText: { fontSize: 14, textAlign: 'center', fontFamily: fonts.medium },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { borderRadius: 24, padding: 24, width: '100%', borderWidth: 1.5 },
  modalTitle: { fontSize: 20, fontFamily: fonts.bold, marginBottom: 8 },
  modalSubtitle: { fontSize: 13, lineHeight: 20, marginBottom: 12, fontFamily: fonts.regular },
  introInput: { borderRadius: 14, padding: 14, fontSize: 14, fontFamily: fonts.regular, borderWidth: 1.5, minHeight: 100, maxHeight: 150, textAlignVertical: 'top' },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: 4, marginBottom: 16, fontFamily: fonts.regular },
  modalButtons: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, borderRadius: 12, borderWidth: 1.5, padding: 12, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontFamily: fonts.bold },
  sendLinkBtn: { flex: 1, backgroundColor: '#7C3AED', borderRadius: 12, padding: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  sendLinkBtnText: { color: '#fff', fontSize: 14, fontFamily: fonts.bold },
});
