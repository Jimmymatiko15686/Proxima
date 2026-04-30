import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { router } from 'expo-router';
import { useAppTheme } from '../../lib/ThemeContext';

type LinkUser = {
  id: string; full_name: string; university: string; course: string;
  year_of_study: number; status: string; link_id: string;
  direction: 'sent' | 'received'; intro_message: string | null; avatar_url: string | null;
};

export default function LinksScreen() {
  const { theme, fonts, isDark, toggleTheme } = useAppTheme();
  const [links, setLinks] = useState<LinkUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'linked' | 'pending' | 'requests'>('linked');

  useEffect(() => { getCurrentUser(); }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) { setCurrentUserId(user.id); fetchLinks(user.id); }
  };

  const fetchLinks = async (userId: string) => {
    setLoading(true);
    const { data: sent } = await supabase.from('links').select('id, status, receiver_id').eq('requester_id', userId);
    const { data: received } = await supabase.from('links').select('id, status, requester_id').eq('receiver_id', userId);
    const allLinks: LinkUser[] = [];
    for (const link of sent || []) {
      const { data: u } = await supabase.from('users').select('id, full_name, university, course, year_of_study, avatar_url').eq('id', link.receiver_id).single();
      if (u) allLinks.push({ ...u, status: link.status, link_id: link.id, direction: 'sent', intro_message: null });
    }
    for (const link of received || []) {
      const { data: u } = await supabase.from('users').select('id, full_name, university, course, year_of_study, avatar_url').eq('id', link.requester_id).single();
      const { data: intro } = await supabase.from('intro_messages').select('message').eq('sender_id', link.requester_id).eq('receiver_id', userId).single();
      if (u) allLinks.push({ ...u, status: link.status, link_id: link.id, direction: 'received', intro_message: intro?.message || null });
    }
    setLinks(allLinks);
    setLoading(false);
  };

  const handleAccept = async (link: LinkUser) => {
    const { error } = await supabase.from('links').update({ status: 'accepted' }).eq('id', link.link_id);
    if (!error) {
      // Notify the requester that their link was accepted
      await supabase.from('notifications').insert({
        user_id: link.id,
        title: 'Link Accepted!',
        body: `Someone accepted your link request. You can now chat!`,
        type: `link_accepted:${currentUserId}`
      });
    }
    if (currentUserId) fetchLinks(currentUserId);
  };
  const handleDecline = async (linkId: string) => {
    await supabase.from('links').delete().eq('id', linkId);
    if (currentUserId) fetchLinks(currentUserId);
  };
  const handleUnlink = async (linkId: string) => {
    await supabase.from('links').delete().eq('id', linkId);
    if (currentUserId) fetchLinks(currentUserId);
  };

  const linked = links.filter(l => l.status === 'accepted');
  const pending = links.filter(l => l.status === 'pending' && l.direction === 'sent');
  const requests = links.filter(l => l.status === 'pending' && l.direction === 'received');
  const activeData = activeTab === 'linked' ? linked : activeTab === 'pending' ? pending : requests;
  const s = makeStyles(theme, fonts, isDark);

  const renderUser = ({ item }: { item: LinkUser }) => (
    <View style={[s.userCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[s.avatar, item.avatar_url && s.avatarNoBorder]}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={s.avatarImage} />
        ) : (
          <Text style={s.avatarText}>{item.full_name?.charAt(0).toUpperCase() || '?'}</Text>
        )}
      </View>
      <View style={s.userInfo}>
        <Text style={[s.userName, { color: theme.text }]}>{item.full_name}</Text>
        <Text style={[s.userDetails, { color: theme.textSecondary }]}>{item.course} · Year {item.year_of_study}</Text>
        <Text style={[s.userUniversity, { color: theme.textMuted }]}>{item.university}</Text>
        {activeTab === 'requests' && item.intro_message && (
          <View style={[s.introBox, { backgroundColor: theme.surface, borderColor: '#7C3AED' }]}>
            <Text style={[s.introText, { color: theme.textSecondary }]}>"{item.intro_message}"</Text>
          </View>
        )}
      </View>
      <View style={s.cardActions}>
        {activeTab === 'linked' && (
          <View style={{ gap: 6 }}>
            <TouchableOpacity onPress={() => router.push(`/chat/${item.id}`)} style={s.messageBtn}>
              <Text style={s.messageBtnText}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleUnlink(item.link_id)} style={s.unlinkBtn}>
              <Text style={s.unlinkBtnText}>Unlink</Text>
            </TouchableOpacity>
          </View>
        )}
        {activeTab === 'pending' && (
          <View style={s.pendingBadge}>
            <Text style={s.pendingText}>Pending</Text>
          </View>
        )}
        {activeTab === 'requests' && (
          <View style={s.requestButtons}>
            <TouchableOpacity onPress={() => handleAccept(item)} style={s.acceptBtn}>
              <Text style={s.acceptBtnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDecline(item.link_id)} style={[s.declineBtn, { borderColor: theme.border }]}>
              <Text style={[s.declineBtnText, { color: theme.textMuted }]}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <View style={[s.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View>
          <Text style={s.logo}>PROXIMA</Text>
          <Text style={[s.headerSub, { color: theme.textMuted }]}>My Links</Text>
        </View>
        <TouchableOpacity onPress={toggleTheme} style={s.themeBtn}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <View style={[s.tabs, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {[
          { key: 'linked', label: `Linked (${linked.length})` },
          { key: 'requests', label: `Requests (${requests.length})` },
          { key: 'pending', label: `Pending (${pending.length})` },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key as any)}
            style={[s.tabBtn, activeTab === tab.key && s.tabBtnActive]}
          >
            <Text style={[s.tabBtnText, activeTab === tab.key && s.tabBtnTextActive, { color: activeTab === tab.key ? '#fff' : theme.textMuted }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#7C3AED" size="large" style={{ marginTop: 40 }} />
      ) : activeData.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons 
            name={activeTab === 'linked' ? 'people-outline' : activeTab === 'requests' ? 'mail-outline' : 'time-outline'} 
            size={60} 
            color={theme.textMuted} 
            style={{ marginBottom: 16 }} 
          />
          <Text style={[s.emptyTitle, { color: theme.text }]}>
            {activeTab === 'linked' ? 'No links yet' : activeTab === 'requests' ? 'No requests' : 'No pending'}
          </Text>
          <Text style={[s.emptySubtitle, { color: theme.textMuted }]}>
            {activeTab === 'linked' ? 'Visit Nearby to find peers around you' : activeTab === 'requests' ? 'Link requests will appear here' : 'Requests you send will appear here'}
          </Text>
        </View>
      ) : (
        <FlatList data={activeData} renderItem={renderUser} keyExtractor={(item) => item.id} contentContainerStyle={s.list} showsVerticalScrollIndicator={false} />
      )}
    </View>
  );
}

const makeStyles = (theme: any, fonts: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { fontSize: 26, fontFamily: fonts.black, color: '#7C3AED', letterSpacing: 3 },
  headerSub: { fontSize: 12, marginTop: 2, letterSpacing: 1, fontFamily: fonts.medium },
  themeBtn: { padding: 8 },
  themeBtnText: { fontSize: 24 },
  tabs: { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1 },
  tabBtn: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#7C3AED' },
  tabBtnText: { fontSize: 11, fontFamily: fonts.semiBold },
  tabBtnTextActive: { },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontFamily: fonts.bold, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22, fontFamily: fonts.regular },
  list: { padding: 16 },
  userCard: { borderRadius: 20, padding: 16, borderWidth: 1.5, flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarNoBorder: { borderWidth: 0 },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontFamily: fonts.bold, fontSize: 20 },
  userInfo: { flex: 1 },
  userName: { fontFamily: fonts.bold, fontSize: 15 },
  userDetails: { fontSize: 13, marginTop: 2, fontFamily: fonts.regular },
  userUniversity: { fontSize: 12, marginTop: 2, fontFamily: fonts.medium },
  introBox: { borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1.5 },
  introText: { fontSize: 12, fontStyle: 'italic', lineHeight: 18, fontFamily: fonts.regular },
  cardActions: { alignItems: 'flex-end', minWidth: 90 },
  messageBtn: { backgroundColor: '#7C3AED', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  messageBtnText: { color: '#fff', fontSize: 12, fontFamily: fonts.bold },
  unlinkBtn: { borderRadius: 10, borderWidth: 1.5, borderColor: '#FF4444', paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  unlinkBtnText: { color: '#FF4444', fontSize: 12, fontFamily: fonts.bold },
  pendingBadge: { backgroundColor: theme.warningBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1.5, borderColor: '#FF9500' },
  pendingText: { color: '#FF9500', fontSize: 11, fontFamily: fonts.bold },
  requestButtons: { gap: 6, alignItems: 'stretch', width: 90 },
  acceptBtn: { backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  acceptBtnText: { color: '#fff', fontSize: 12, fontFamily: fonts.bold },
  declineBtn: { borderRadius: 10, borderWidth: 1.5, paddingVertical: 6, alignItems: 'center' },
  declineBtnText: { fontSize: 12, fontFamily: fonts.medium },
});