import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAppTheme } from '../../lib/ThemeContext';

type ChatUser = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  last_message?: string;
  last_message_time?: string;
};

export default function MessagesScreen() {
  const { theme, fonts, isDark, toggleTheme } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [chatUsers, setChatUsers] = useState<ChatUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser();
  }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      fetchChatUsers(user.id);
    }
  };

  const fetchChatUsers = async (userId: string) => {
    // Get all accepted links
    const { data: sent } = await supabase.from('links').select('receiver_id').eq('requester_id', userId).eq('status', 'accepted');
    const { data: received } = await supabase.from('links').select('requester_id').eq('receiver_id', userId).eq('status', 'accepted');
    
    const friendIds = [
      ...(sent?.map(l => l.receiver_id) || []),
      ...(received?.map(l => l.requester_id) || [])
    ];

    if (friendIds.length === 0) {
      setChatUsers([]);
      setLoading(false);
      return;
    }

    const { data: friends } = await supabase
      .from('users')
      .select('id, full_name, avatar_url')
      .in('id', friendIds);

    const friendsWithMessages = await Promise.all((friends || []).map(async (friend) => {
      const { data: messages } = await supabase
        .from('messages')
        .select('content, created_at')
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${friend.id}),and(sender_id.eq.${friend.id},receiver_id.eq.${userId})`)
        .order('created_at', { ascending: false })
        .limit(1);

      return {
        ...friend,
        last_message: messages && messages.length > 0 ? messages[0].content : 'Tap to chat...',
        last_message_time: messages && messages.length > 0 ? messages[0].created_at : null
      };
    }));

    friendsWithMessages.sort((a, b) => {
      if (!a.last_message_time) return 1;
      if (!b.last_message_time) return -1;
      return new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime();
    });

    setChatUsers(friendsWithMessages);
    setLoading(false);
  };

  const s = makeStyles(theme, fonts, isDark);

  const renderItem = ({ item }: { item: ChatUser }) => (
    <TouchableOpacity 
      style={[s.userCard, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={() => router.push(`/chat/${item.id}`)}
    >
      <View style={[s.avatar, item.avatar_url && s.avatarNoBorder]}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={s.avatarImage} />
        ) : (
          <Text style={s.avatarText}>{item.full_name?.charAt(0).toUpperCase() || '?'}</Text>
        )}
      </View>
      <View style={s.userInfo}>
        <Text style={[s.userName, { color: theme.text }]}>{item.full_name}</Text>
        <Text style={[s.previewText, { color: theme.textMuted }]} numberOfLines={1}>
          {item.last_message}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <View style={[s.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View>
          <Text style={s.logo}>PROXIMA</Text>
          <Text style={[s.headerSub, { color: theme.textMuted }]}>Messages</Text>
        </View>
        <TouchableOpacity onPress={toggleTheme} style={s.themeBtn}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#7C3AED" size="large" style={{ marginTop: 40 }} />
      ) : chatUsers.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="chatbubbles-outline" size={60} color={theme.textMuted} style={{ marginBottom: 16 }} />
          <Text style={[s.emptyTitle, { color: theme.text }]}>No chats yet</Text>
          <Text style={[s.emptySubtitle, { color: theme.textMuted }]}>
            Link with people nearby to start messaging!
          </Text>
        </View>
      ) : (
        <FlatList
          data={chatUsers}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
        />
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
  list: { padding: 16 },
  userCard: { borderRadius: 16, padding: 16, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarNoBorder: { borderWidth: 0 },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontFamily: fonts.bold, fontSize: 20 },
  userInfo: { flex: 1 },
  userName: { fontFamily: fonts.bold, fontSize: 16, marginBottom: 4 },
  previewText: { fontSize: 13, fontFamily: fonts.regular },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontFamily: fonts.bold, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22, fontFamily: fonts.regular },
});
