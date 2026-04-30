import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Image, Alert, FlatList, ScrollView, Modal, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../lib/supabase';
import { router, useFocusEffect } from 'expo-router';
import { useAppTheme } from '../../lib/ThemeContext';

const { width } = Dimensions.get('window');
const GRID_SIZE = width / 3 - 2;

type Profile = { full_name: string; email: string; university: string; course: string; year_of_study: number; age: number; avatar_url: string | null; };
type Post = { 
  id: string; 
  content: string; 
  image_url: string | null; 
  created_at: string; 
  is_private: boolean; 
  author_id: string; 
  users?: { full_name: string; avatar_url: string | null };
  likes?: { user_id: string }[];
  comments?: any[];
};

export default function ProfileScreen() {
  const { theme, fonts, isDark, toggleTheme } = useAppTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'hidden'>('posts');
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [hiddenPosts, setHiddenPosts] = useState<Post[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  useFocusEffect(
    useCallback(() => {
      init();
    }, [])
  );

  useEffect(() => {
    if (currentUserId) {
      if (activeTab === 'posts') fetchUserPosts();
      else fetchHiddenPosts();
    }
  }, [activeTab, currentUserId]);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);
    const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (data) setProfile(data);
    setLoading(false);
  };

  const fetchUserPosts = async () => {
    setLoadingContent(true);
    const { data } = await supabase
      .from('posts')
      .select('*, users(full_name, avatar_url), likes(user_id), comments(id)')
      .eq('author_id', currentUserId)
      .eq('is_private', false)
      .order('created_at', { ascending: false });
    if (data) setUserPosts(data as any[]);
    setLoadingContent(false);
  };

  const fetchHiddenPosts = async () => {
    setLoadingContent(true);
    try {
      const { data: privatePosts } = await supabase
        .from('posts')
        .select('*, users(full_name, avatar_url), likes(user_id), comments(id)')
        .eq('author_id', currentUserId)
        .eq('is_private', true);

      const { data: hiddenData } = await supabase
        .from('hidden_posts')
        .select('post_id')
        .eq('user_id', currentUserId);
      
      const hiddenIds = hiddenData?.map(h => h.post_id) || [];
      
      let othersHidden: any[] = [];
      if (hiddenIds.length > 0) {
        const { data } = await supabase
          .from('posts')
          .select('*, users(full_name, avatar_url), likes(user_id), comments(id)')
          .in('id', hiddenIds);
        othersHidden = data || [];
      }

      setHiddenPosts([...(privatePosts || []), ...othersHidden].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (err) {
      console.log("Error fetching hidden posts:", err);
    }
    setLoadingContent(false);
  };

  const handleEditAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow access to your photos'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      setUploadingAvatar(true);
      try {
        const uri = result.assets[0].uri;
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        const { decode } = require('base-64');
        const arrayBuffer = decode(base64);
        const uint8Array = new Uint8Array(arrayBuffer.length);
        for (let i = 0; i < arrayBuffer.length; i++) {
          uint8Array[i] = arrayBuffer.charCodeAt(i);
        }
        const fileName = `${currentUserId}_${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, uint8Array, { contentType: 'image/jpeg', upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
        const avatarUrl = urlData.publicUrl;
        const { error: updateError } = await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', currentUserId);
        if (updateError) throw updateError;
        setProfile(prev => prev ? { ...prev, avatar_url: avatarUrl } : null);
      } catch (err: any) {
        Alert.alert('Upload failed', err.message || 'Could not upload avatar');
      } finally {
        setUploadingAvatar(false);
      }
    }
  };

  const handleUnhide = async (post: Post) => {
    try {
      if (post.author_id === currentUserId) {
        await supabase.from('posts').update({ is_private: false }).eq('id', post.id);
      } else {
        await supabase.from('hidden_posts').delete().eq('user_id', currentUserId).eq('post_id', post.id);
      }
      Alert.alert("Success", "Post is now visible in your main feed.");
      setSelectedPost(null);
      fetchHiddenPosts();
      fetchUserPosts();
    } catch (err) {
      Alert.alert("Error", "Could not unhide post");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const s = makeStyles(theme, fonts, isDark);

  const renderHeader = () => (
    <View>
      <View style={[s.avatarSection, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={handleEditAvatar} style={s.avatarContainer}>
          <View style={[s.avatar, profile?.avatar_url && s.avatarNoBorder]}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={s.avatarImage} />
            ) : (
              <Text style={s.avatarText}>{profile?.full_name?.charAt(0).toUpperCase() || '?'}</Text>
            )}
            {uploadingAvatar && <View style={s.avatarUploadingOverlay}><ActivityIndicator color="#fff" /></View>}
          </View>
          <View style={s.editAvatarBadge}><Ionicons name="camera-outline" size={14} color="#7C3AED" /></View>
        </TouchableOpacity>
        <Text style={[s.fullName, { color: theme.text }]}>{profile?.full_name}</Text>
        <Text style={[s.email, { color: theme.textMuted }]}>{profile?.email}</Text>
        <View style={s.badge}>
          <Text style={s.badgeText}><Ionicons name="school-outline" size={14} color="#7C3AED" /> {profile?.university}</Text>
        </View>
      </View>

      <View style={[s.detailsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {[
          { label: 'Course', value: profile?.course },
          { label: 'Year', value: `Year ${profile?.year_of_study}` },
          { label: 'Age', value: `${profile?.age} years` },
        ].map((item, index, arr) => (
          <View key={item.label}>
            <View style={s.detailRow}>
              <Text style={[s.detailLabel, { color: theme.textMuted }]}>{item.label}</Text>
              <Text style={[s.detailValue, { color: theme.text }]}>{item.value}</Text>
            </View>
            {index < arr.length - 1 && <View style={[s.divider, { backgroundColor: theme.border }]} />}
          </View>
        ))}
      </View>

      <View style={s.tabContainer}>
        <TouchableOpacity onPress={() => setActiveTab('posts')} style={[s.tab, activeTab === 'posts' && s.activeTab]}>
          <Text style={[s.tabText, activeTab === 'posts' ? {color: '#fff'} : {color: theme.textMuted}]}>Posts</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('hidden')} style={[s.tab, activeTab === 'hidden' && s.activeTab]}>
          <Text style={[s.tabText, activeTab === 'hidden' ? {color: '#fff'} : {color: theme.textMuted}]}>Hidden</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPost = ({ item }: { item: Post }) => (
    <TouchableOpacity 
      key={item.id}
      style={s.gridItem} 
      onPress={() => setSelectedPost(item)}
    >
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={s.gridImage} />
      ) : (
        <View style={[s.gridTextFallback, {backgroundColor: theme.card}]}>
          <Text style={[s.gridText, {color: theme.text}]} numberOfLines={3}>{item.content}</Text>
        </View>
      )}
      {item.is_private && (
        <View style={s.privateBadge}>
          <Ionicons name="lock-closed" size={10} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );

  const renderFooter = () => (
    <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
      <Text style={s.logoutBtnText}>LOG OUT</Text>
    </TouchableOpacity>
  );

  if (loading) return <View style={[s.centered, { backgroundColor: theme.background }]}><ActivityIndicator color="#7C3AED" size="large" /></View>;

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <View style={[s.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View>
          <Text style={s.logo}>PROXIMA</Text>
          <Text style={[s.headerSub, { color: theme.textMuted }]}>Profile & Settings</Text>
        </View>
        <TouchableOpacity onPress={toggleTheme} style={s.themeBtn}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={activeTab === 'posts' ? userPosts : hiddenPosts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id}
        numColumns={3}
        key={`grid-${activeTab}`}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          loadingContent ? <ActivityIndicator style={{marginTop: 20}} color="#7C3AED" /> : 
          <Text style={[s.emptyText, {color: theme.textMuted}]}>No posts found.</Text>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      {/* Post Detail Modal */}
      <Modal 
        visible={!!selectedPost} 
        animationType="slide" 
        transparent 
        onRequestClose={() => setSelectedPost(null)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: theme.surface }]}>
            <View style={[s.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[s.modalTitle, { color: theme.text }]}>Post Detail</Text>
              <TouchableOpacity onPress={() => setSelectedPost(null)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={s.modalScroll}>
              <View style={s.modalUserRow}>
                <View style={s.modalAvatar}>
                  {selectedPost?.users?.avatar_url ? (
                    <Image source={{ uri: selectedPost.users.avatar_url }} style={s.modalAvatarImage} />
                  ) : (
                    <Text style={s.modalAvatarText}>{selectedPost?.users?.full_name?.charAt(0).toUpperCase() || '?'}</Text>
                  )}
                </View>
                <View>
                  <Text style={[s.modalUserName, { color: theme.text }]}>{selectedPost?.users?.full_name || 'You'}</Text>
                  <Text style={[s.modalDate, { color: theme.textMuted }]}>{selectedPost && new Date(selectedPost.created_at).toLocaleDateString()}</Text>
                </View>
              </View>

              <Text style={[s.modalText, { color: theme.text }]}>{selectedPost?.content}</Text>
              
              {selectedPost?.image_url && (
                <Image source={{ uri: selectedPost.image_url }} style={s.modalImage} resizeMode="contain" />
              )}

              <View style={[s.modalStats, { borderTopColor: theme.border }]}>
                <View style={s.modalStatItem}>
                  <Ionicons name="heart" size={18} color="#7C3AED" />
                  <Text style={[s.modalStatText, { color: theme.text }]}>{selectedPost?.likes?.length || 0} Likes</Text>
                </View>
                <View style={s.modalStatItem}>
                  <Ionicons name="chatbubble-outline" size={18} color={theme.textMuted} />
                  <Text style={[s.modalStatText, { color: theme.text }]}>{selectedPost?.comments?.length || 0} Comments</Text>
                </View>
              </View>

              {activeTab === 'hidden' && (
                <TouchableOpacity style={s.modalUnhideBtn} onPress={() => selectedPost && handleUnhide(selectedPost)}>
                  <Ionicons name="eye-outline" size={20} color="#fff" />
                  <Text style={s.modalUnhideText}>Unhide Post</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (theme: any, fonts: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { fontSize: 26, fontFamily: fonts.black, color: '#7C3AED', letterSpacing: 3 },
  headerSub: { fontSize: 12, marginTop: 2, letterSpacing: 1, fontFamily: fonts.medium },
  themeBtn: { padding: 8 },
  avatarSection: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20, borderBottomWidth: 1 },
  avatarContainer: { position: 'relative', marginBottom: 16 },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#9D5FF3', overflow: 'hidden' },
  avatarNoBorder: { borderWidth: 0 },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontFamily: fonts.black, fontSize: 36 },
  avatarUploadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  editAvatarBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#1A1A2E', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#7C3AED' },
  fullName: { fontSize: 24, fontFamily: fonts.black, marginBottom: 4 },
  email: { fontSize: 14, fontFamily: fonts.regular, marginBottom: 12 },
  badge: { backgroundColor: theme.primaryBg, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: theme.primaryBorder },
  badgeText: { color: '#7C3AED', fontSize: 13, fontFamily: fonts.bold },
  detailsCard: { borderRadius: 20, marginHorizontal: 20, marginTop: 20, borderWidth: 1.5, overflow: 'hidden' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  detailLabel: { fontSize: 13, fontFamily: fonts.semiBold },
  detailValue: { fontSize: 14, fontFamily: fonts.bold },
  divider: { height: 1, marginHorizontal: 16 },
  tabContainer: { flexDirection: 'row', margin: 20, backgroundColor: theme.card, borderRadius: 12, padding: 4, gap: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: '#7C3AED' },
  tabText: { fontSize: 14, fontFamily: fonts.bold },
  gridItem: { width: GRID_SIZE, height: GRID_SIZE, margin: 1, position: 'relative' },
  gridImage: { width: '100%', height: '100%', borderRadius: 4 },
  gridTextFallback: { width: '100%', height: '100%', borderRadius: 4, padding: 8, justifyContent: 'center' },
  gridText: { fontSize: 10, fontFamily: fonts.medium, textAlign: 'center' },
  privateBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.5)', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center', padding: 40, fontFamily: fonts.regular },
  logoutBtn: { margin: 20, borderRadius: 16, borderWidth: 2, borderColor: '#FF4444', padding: 16, alignItems: 'center' },
  logoutBtnText: { color: '#FF4444', fontSize: 15, fontFamily: fonts.bold, letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center' },
  modalContent: { margin: 20, borderRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, paddingBottom: 12 },
  modalTitle: { fontSize: 18, fontFamily: fonts.bold },
  modalScroll: { flex: 1 },
  modalUserRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  modalAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  modalAvatarImage: { width: '100%', height: '100%' },
  modalAvatarText: { color: '#fff', fontSize: 18, fontFamily: fonts.bold },
  modalUserName: { fontSize: 16, fontFamily: fonts.bold },
  modalDate: { fontSize: 12, fontFamily: fonts.regular },
  modalText: { fontSize: 15, fontFamily: fonts.regular, lineHeight: 22, marginBottom: 16 },
  modalImage: { width: '100%', height: 300, borderRadius: 16, marginBottom: 16 },
  modalStats: { flexDirection: 'row', gap: 20, borderTopWidth: 1, paddingTop: 16, marginBottom: 20 },
  modalStatItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalStatText: { fontSize: 14, fontFamily: fonts.medium },
  modalUnhideBtn: { backgroundColor: '#7C3AED', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  modalUnhideText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold },
});