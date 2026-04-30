import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAppTheme } from '../../lib/ThemeContext';
import { router } from 'expo-router';

type Notification = {
  id: string; title: string; body: string;
  type: string; read: boolean; created_at: string;
};

export default function NotificationsScreen() {
  const { theme, fonts, isDark, toggleTheme } = useAppTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchNotifications(); }, []);

  const fetchNotifications = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (!error) {
      setNotifications(data || []);
      await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    }
    setLoading(false);
  };

  const formatTime = (timestamp: string) => {
    // Append 'Z' to ensure it's treated as UTC, fixing timezone offsets
    const safeTimestamp = timestamp.endsWith('Z') ? timestamp : `${timestamp}Z`;
    const diff = Math.floor((Date.now() - new Date(safeTimestamp).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const parseType = (rawType: string) => rawType.split(':')[0];
  const parseRef = (rawType: string) => rawType.split(':')[1] || null;

  const getIcon = (rawType: string) => {
    const type = parseType(rawType);
    return { link_request: 'people-outline', link_accepted: 'checkmark-circle-outline', like: 'heart', comment: 'chatbubble-outline', message: 'chatbubble-ellipses-outline' }[type] || 'notifications-outline';
  };
  const getIconBg = (rawType: string) => {
    const type = parseType(rawType);
    return { link_request: theme.primaryBg, link_accepted: theme.successBg, like: theme.primaryBg, comment: theme.infoBg, message: theme.primaryBg }[type] || theme.primaryBg;
  };

  const handleNotificationPress = (item: Notification) => {
    const type = parseType(item.type);
    const refId = parseRef(item.type);
    
    if (refId) {
      if (type === 'like' || type === 'comment') {
        router.push(`/post/${refId}` as any);
      } else if (type === 'link_request' || type === 'link_accepted' || type === 'message') {
        router.push(`/user/${refId}` as any);
      }
    }
  };

  const s = makeStyles(theme, fonts, isDark);

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity 
      style={[s.card, { backgroundColor: item.read ? theme.card : theme.surface, borderColor: item.read ? theme.border : '#7C3AED' }]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={[s.iconBox, { backgroundColor: getIconBg(item.type) }]}>
        <Ionicons name={getIcon(item.type) as any} size={22} color="#7C3AED" />
      </View>
      <View style={s.content}>
        <Text style={[s.title, { color: theme.text }]}>{item.title}</Text>
        <Text style={[s.body, { color: theme.textSecondary }]}>{item.body}</Text>
        <Text style={[s.time, { color: theme.textMuted }]}>{formatTime(item.created_at)}</Text>
      </View>
      {!item.read && <View style={s.unreadDot} />}
    </TouchableOpacity>
  );

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <View style={[s.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View>
          <Text style={s.logo}>PROXIMA</Text>
          <Text style={[s.headerSub, { color: theme.textMuted }]}>Notifications</Text>
        </View>
        <TouchableOpacity onPress={toggleTheme} style={s.themeBtn}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={24} color={theme.text} />
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color="#7C3AED" size="large" style={{ marginTop: 40 }} />
      ) : notifications.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="notifications-outline" size={60} color={theme.textMuted} style={{ marginBottom: 16 }} />
          <Text style={[s.emptyTitle, { color: theme.text }]}>No notifications yet</Text>
          <Text style={[s.emptySubtitle, { color: theme.textMuted }]}>Likes, comments and link requests will appear here.</Text>
        </View>
      ) : (
        <FlatList data={notifications} renderItem={renderNotification} keyExtractor={(item) => item.id} contentContainerStyle={s.list} showsVerticalScrollIndicator={false} />
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
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontFamily: fonts.bold, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22, fontFamily: fonts.regular },
  list: { padding: 16 },
  card: { borderRadius: 20, padding: 16, borderWidth: 1.5, flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  iconBox: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 22 },
  content: { flex: 1 },
  title: { fontFamily: fonts.bold, fontSize: 14, marginBottom: 4 },
  body: { fontSize: 13, lineHeight: 18, marginBottom: 6, fontFamily: fonts.regular },
  time: { fontSize: 11, fontFamily: fonts.regular },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7C3AED', marginTop: 4 },
});