import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  Alert, TouchableOpacity, TextInput, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAppTheme } from '../../lib/ThemeContext';

type NearbyUser = {
  id: string; full_name: string; university: string;
  course: string; year_of_study: number; distance: number;
  linkStatus: 'none' | 'pending' | 'accepted' | 'sent';
  avatar_url: string | null;
};

export default function NearbyScreen() {
  const { theme, fonts, isDark, toggleTheme } = useAppTheme();
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [sendingLink, setSendingLink] = useState<string | null>(null);
  const [introModal, setIntroModal] = useState(false);
  const [introMessage, setIntroMessage] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [distanceFilter, setDistanceFilter] = useState<'all' | '100m' | '500m' | '1km' | '5km'>('all');

  useEffect(() => { getCurrentUser(); }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) { setCurrentUserId(user.id); requestLocationAndScan(user.id); }
  };

  const requestLocationAndScan = async (userId: string) => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location Required', 'Proxima needs your location to find peers near you.');
      setLoading(false); return;
    }
    const location = await Location.getCurrentPositionAsync({});
    await supabase.from('location_logs').insert({ user_id: userId, latitude: location.coords.latitude, longitude: location.coords.longitude });
    await findNearbyUsers(userId, location.coords.latitude, location.coords.longitude);
  };

  const findNearbyUsers = async (userId: string, latitude: number, longitude: number) => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('location_logs')
      .select(`user_id, latitude, longitude, users (id, full_name, university, course, year_of_study, avatar_url)`)
      .gte('recorded_at', thirtyMinutesAgo)
      .neq('user_id', userId);
    if (error) { setLoading(false); return; }

    const { data: sentLinks } = await supabase.from('links').select('receiver_id, status').eq('requester_id', userId);
    const { data: receivedLinks } = await supabase.from('links').select('requester_id, status').eq('receiver_id', userId);

    const nearby = (data || []).map((log: any) => {
      const distance = getDistance(latitude, longitude, log.latitude, log.longitude);
      const sentLink = sentLinks?.find((l: any) => l.receiver_id === log.users?.id);
      const receivedLink = receivedLinks?.find((l: any) => l.requester_id === log.users?.id);
      let linkStatus: 'none' | 'pending' | 'accepted' | 'sent' = 'none';
      if (sentLink?.status === 'accepted' || receivedLink?.status === 'accepted') linkStatus = 'accepted';
      else if (sentLink?.status === 'pending') linkStatus = 'sent';
      else if (receivedLink?.status === 'pending') linkStatus = 'pending';
      return { ...log.users, distance: Math.round(distance), linkStatus };
    }).sort((a: any, b: any) => a.distance - b.distance);

    const unique = nearby.filter((u: any, i: number, self: any[]) => i === self.findIndex((x) => x.id === u.id));
    setNearbyUsers(unique);
    setLoading(false);
  };

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const handleSendLink = async () => {
    if (!introMessage.trim()) { alert('Please write an introduction message'); return; }
    if (!currentUserId || !selectedUserId) return;
    setSendingLink(selectedUserId);
    setIntroModal(false);
    await supabase.from('intro_messages').insert({ sender_id: currentUserId, receiver_id: selectedUserId, message: introMessage.trim() });
    const { error } = await supabase.from('links').insert({ requester_id: currentUserId, receiver_id: selectedUserId, status: 'pending' });
    if (!error) {
      await supabase.from('notifications').insert({ user_id: selectedUserId, title: 'New Link Request', body: 'Someone wants to connect with you on Proxima', type: `link_request:${currentUserId}` });
      setNearbyUsers(prev => prev.map(u => u.id === selectedUserId ? { ...u, linkStatus: 'sent' } : u));
    }
    setSendingLink(null);
  };

  const s = makeStyles(theme, fonts, isDark);

  const filteredUsers = nearbyUsers.filter(u => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      u.full_name?.toLowerCase().includes(q) ||
      u.course?.toLowerCase().includes(q) ||
      u.university?.toLowerCase().includes(q);
    const matchesDistance =
      distanceFilter === 'all' ||
      (distanceFilter === '100m' && u.distance <= 100) ||
      (distanceFilter === '500m' && u.distance <= 500) ||
      (distanceFilter === '1km' && u.distance <= 1000) ||
      (distanceFilter === '5km' && u.distance <= 5000);
    return matchesSearch && matchesDistance;
  });

  const FILTERS: { key: typeof distanceFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: '100m', label: '< 100m' },
    { key: '500m', label: '< 500m' },
    { key: '1km', label: '< 1km' },
    { key: '5km', label: '< 5km' },
  ];

  const renderUser = ({ item }: { item: NearbyUser }) => (
    <View style={[s.userCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <TouchableOpacity onPress={() => router.push(`/user/${item.id}`)} style={s.userTappable} activeOpacity={0.7}>
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
        </View>
      </TouchableOpacity>
      <View style={s.rightSection}>
        <View style={s.distanceBadge}>
          <Text style={s.distanceText}>{item.distance > 1000 ? (item.distance / 1000).toFixed(1) + 'km' : item.distance + 'm'}</Text>
        </View>
        {item.linkStatus === 'none' && (
          <TouchableOpacity
            onPress={() => { setSelectedUserId(item.id); setIntroMessage(''); setIntroModal(true); }}
            disabled={sendingLink === item.id}
            style={s.linkBtn}
          >
            <Text style={s.linkBtnText}>+ Link</Text>
          </TouchableOpacity>
        )}
        {item.linkStatus === 'sent' && (
          <View style={[s.statusBadge, { borderColor: theme.border }]}>
            <Text style={[s.statusText, { color: theme.textMuted }]}>Sent</Text>
          </View>
        )}
        {item.linkStatus === 'accepted' && (
          <View style={[s.statusBadge, { borderColor: '#4CAF50' }]}>
            <Text style={[s.statusText, { color: '#4CAF50' }]}>Linked ✓</Text>
          </View>
        )}
        {item.linkStatus === 'pending' && (
          <View style={[s.statusBadge, { borderColor: '#FF9500' }]}>
            <Text style={[s.statusText, { color: '#FF9500' }]}>Respond</Text>
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
          <Text style={[s.headerSub, { color: theme.textMuted }]}>People Nearby</Text>
        </View>
        <TouchableOpacity onPress={toggleTheme} style={s.themeBtn}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      {!loading && (
        <View style={[s.searchSection, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <View style={[s.searchBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="search-outline" size={18} color={theme.textMuted} />
            <TextInput
              style={[s.searchInput, { color: theme.text }]}
              placeholder="Search by name, course, university..."
              placeholderTextColor={theme.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={{ color: theme.textMuted, fontSize: 16, paddingHorizontal: 4 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={s.filterRow}>
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f.key}
                onPress={() => setDistanceFilter(f.key)}
                style={[s.filterChip, distanceFilter === f.key && s.filterChipActive, { borderColor: theme.border }]}
              >
                <Text style={[s.filterChipText, distanceFilter === f.key && s.filterChipTextActive, { color: distanceFilter === f.key ? '#fff' : theme.textSecondary }]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color="#7C3AED" size="large" />
          <Text style={[s.loadingText, { color: theme.textMuted }]}>Scanning campus...</Text>
        </View>
      ) : filteredUsers.length === 0 ? (
        <View style={s.centered}>
          <Ionicons 
            name={nearbyUsers.length === 0 ? "people-outline" : "search-outline"} 
            size={60} 
            color={theme.textMuted} 
            style={{ marginBottom: 16 }} 
          />
          <Text style={[s.emptyTitle, { color: theme.text }]}>{nearbyUsers.length === 0 ? 'No one nearby' : 'No results found'}</Text>
          <Text style={[s.emptySubtitle, { color: theme.textMuted }]}>{nearbyUsers.length === 0 ? "When other Proxima users are active on campus, they'll appear here." : 'Try a different name, course, or distance filter.'}</Text>
        </View>
      ) : (
        <FlatList data={filteredUsers} renderItem={renderUser} keyExtractor={(item) => item.id} contentContainerStyle={s.list} showsVerticalScrollIndicator={false} />
      )}

      {/* Intro Modal */}
      {introModal && (
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[s.modalTitle, { color: theme.text }]}>Send Introduction</Text>
            <Text style={[s.modalSubtitle, { color: theme.textMuted }]}>
              Write one message to introduce yourself.
            </Text>
            <TextInput
              style={[s.introInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
              placeholder="Hi! I noticed we're both at TUK. Would love to connect..."
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingText: { marginTop: 16, fontSize: 14, fontFamily: fonts.regular },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontFamily: fonts.bold, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22, fontFamily: fonts.regular },
  list: { padding: 16 },
  userCard: { borderRadius: 20, padding: 16, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  userTappable: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarNoBorder: { borderWidth: 0 },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontFamily: fonts.bold, fontSize: 20 },
  userInfo: { flex: 1 },
  userName: { fontFamily: fonts.bold, fontSize: 15 },
  userDetails: { fontSize: 13, marginTop: 2, fontFamily: fonts.regular },
  userUniversity: { fontSize: 12, marginTop: 2, fontFamily: fonts.medium },
  rightSection: { alignItems: 'center', gap: 6 },
  distanceBadge: { backgroundColor: theme.primaryBg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: theme.primaryBorder },
  distanceText: { color: '#7C3AED', fontSize: 11, fontFamily: fonts.bold },
  linkBtn: { backgroundColor: '#7C3AED', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 },
  linkBtnText: { color: '#fff', fontSize: 12, fontFamily: fonts.bold },
  statusBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1.5 },
  statusText: { fontSize: 11, fontFamily: fonts.bold },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
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
  searchSection: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, gap: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.regular },
  filterRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1.5, backgroundColor: 'transparent' },
  filterChipActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  filterChipText: { fontSize: 13, fontFamily: fonts.medium },
  filterChipTextActive: { color: '#fff' },
});