import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Image, ScrollView, TextInput, KeyboardAvoidingView, Platform, Alert, Share } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAppTheme } from '../../lib/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

type Post = {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  author_id: string;
  is_private: boolean;
  users: { full_name: string; university: string; course: string; avatar_url: string | null };
  likes: { user_id: string }[];
  comments: { id: string; user_id: string; content: string; created_at: string; users: { full_name: string; avatar_url: string | null } }[];
};

export default function SinglePostScreen() {
  const { id } = useLocalSearchParams();
  const { theme, fonts, isDark } = useAppTheme();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => { init(); }, [id]);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      const { data } = await supabase.from('users').select('avatar_url, full_name').eq('id', user.id).single();
      setCurrentUser(data);
    }
    await fetchPost();
  };

  const fetchPost = async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id, content, image_url, created_at, author_id, is_private,
          users (full_name, university, course, avatar_url),
          likes (user_id),
          comments (id, user_id, content, created_at, users (full_name, avatar_url))
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      setPost(data as any);
    } catch (err) {
      console.log('Error fetching post:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!currentUserId || !post) return;
    const alreadyLiked = post.likes?.some((l: any) => l.user_id === currentUserId);
    
    // Optimistic update
    if (alreadyLiked) {
      setPost({ ...post, likes: post.likes.filter(l => l.user_id !== currentUserId) });
      await supabase.from("likes").delete().eq("post_id", post.id).eq("user_id", currentUserId);
    } else {
      setPost({ ...post, likes: [...(post.likes || []), { user_id: currentUserId }] });
      await supabase.from("likes").insert({ post_id: post.id, user_id: currentUserId });
      
      if (post.author_id !== currentUserId) {
        await supabase.from("notifications").insert({
          user_id: post.author_id,
          title: "New Like",
          body: `${currentUser?.full_name || "Someone"} liked your post`,
          type: `like:${post.id}`,
        });
      }
    }
    fetchPost();
  };

  const handleComment = async () => {
    if (!commentText.trim() || !post || !currentUserId) return;
    setSubmittingComment(true);
    const { error } = await supabase.from("comments").insert({
      post_id: post.id,
      user_id: currentUserId,
      content: commentText.trim(),
    });
    
    if (!error) {
      if (post.author_id !== currentUserId) {
        await supabase.from("notifications").insert({
          user_id: post.author_id,
          title: "New Comment",
          body: `${currentUser?.full_name || "Someone"} commented on your post`,
          type: `comment:${post.id}`,
        });
      }
      setCommentText("");
      fetchPost();
    }
    setSubmittingComment(false);
  };

  const formatTime = (timestamp: string) => {
    const safeTimestamp = timestamp.endsWith('Z') ? timestamp : `${timestamp}Z`;
    const diff = Math.floor((Date.now() - new Date(safeTimestamp).getTime()) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  const s = makeStyles(theme, fonts, isDark);

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#7C3AED" size="large" />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[s.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: theme.text }}>Post not found or unavailable.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, padding: 12, backgroundColor: '#7C3AED', borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontFamily: fonts.bold }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const liked = post.likes?.some((l: any) => l.user_id === currentUserId);
  const likeCount = post.likes?.length || 0;
  const commentCount = post.comments?.length || 0;

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>Post</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Post Content */}
        <View style={[s.postCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TouchableOpacity style={s.postHeader} activeOpacity={0.7} onPress={() => router.push(`/user/${post.author_id}`)}>
            <View style={[s.avatar, post.users?.avatar_url && s.avatarNoBorder]}>
              {post.users?.avatar_url ? (
                <Image source={{ uri: post.users.avatar_url }} style={s.avatarImage} />
              ) : (
                <Text style={s.avatarText}>{post.users?.full_name?.charAt(0).toUpperCase() || "?"}</Text>
              )}
            </View>
            <View style={s.postMeta}>
              <Text style={[s.authorName, { color: theme.text }]}>{post.users?.full_name || "Unknown"}</Text>
              <Text style={[s.authorDetails, { color: theme.textMuted }]}>{post.users?.course} · {post.users?.university}</Text>
            </View>
            <View style={s.headerRight}>
              <Text style={[s.postTime, { color: theme.textMuted }]}>{formatTime(post.created_at)}</Text>
            </View>
          </TouchableOpacity>

          <Text style={[s.postText, { color: theme.text }]}>{post.content}</Text>

          {post.image_url && (
            <Image source={{ uri: post.image_url }} style={s.postImage} resizeMode="cover" />
          )}

          <View style={[s.postActions, { borderTopColor: theme.border }]}>
            <TouchableOpacity style={s.actionBtn} onPress={handleLike}>
              <Ionicons name={liked ? "heart" : "heart-outline"} size={22} color={liked ? "#FF4B4B" : theme.textSecondary} />
              <Text style={[s.actionText, { color: liked ? "#FF4B4B" : theme.textSecondary }]}>{likeCount}</Text>
            </TouchableOpacity>
            <View style={s.actionBtn}>
              <Ionicons name="chatbubble-outline" size={20} color={theme.textSecondary} />
              <Text style={[s.actionText, { color: theme.textSecondary }]}>{commentCount}</Text>
            </View>
          </View>
        </View>

        {/* Comments Section */}
        <Text style={[s.commentsTitle, { color: theme.text }]}>Comments ({commentCount})</Text>
        
        {post.comments?.map((comment) => (
          <View key={comment.id} style={[s.commentItem, { borderBottomColor: theme.border }]}>
            <View style={[s.commentAvatar, comment.users?.avatar_url && s.avatarNoBorder]}>
              {comment.users?.avatar_url ? (
                <Image source={{ uri: comment.users.avatar_url }} style={s.avatarImage} />
              ) : (
                <Text style={s.commentAvatarText}>{comment.users?.full_name?.charAt(0).toUpperCase() || "?"}</Text>
              )}
            </View>
            <View style={s.commentBody}>
              <View style={s.commentHeader}>
                <Text style={[s.commentAuthor, { color: theme.text }]}>{comment.users?.full_name || "Unknown"}</Text>
                <Text style={[s.commentTime, { color: theme.textMuted }]}>{formatTime(comment.created_at)}</Text>
              </View>
              <Text style={[s.commentContent, { color: theme.textSecondary }]}>{comment.content}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Add Comment Input */}
      <View style={[s.inputContainer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <TextInput
          style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
          placeholder="Write a comment..."
          placeholderTextColor={theme.textMuted}
          value={commentText}
          onChangeText={setCommentText}
          multiline
        />
        <TouchableOpacity 
          style={[s.sendBtn, (!commentText.trim() || submittingComment) && s.sendBtnDisabled]} 
          onPress={handleComment}
          disabled={!commentText.trim() || submittingComment}
        >
          {submittingComment ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme: any, fonts: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: fonts.bold },
  content: { padding: 16, paddingBottom: 40 },
  postCard: { borderRadius: 20, padding: 16, borderWidth: 1.5, marginBottom: 20 },
  postHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarNoBorder: { borderWidth: 0 },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { color: "#fff", fontFamily: fonts.bold, fontSize: 18 },
  postMeta: { flex: 1, marginLeft: 12 },
  authorName: { fontFamily: fonts.bold, fontSize: 15 },
  authorDetails: { fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
  headerRight: { alignItems: "flex-end" },
  postTime: { fontSize: 11, fontFamily: fonts.regular, marginBottom: 4 },
  postText: { fontSize: 15, lineHeight: 22, marginBottom: 12, fontFamily: fonts.regular },
  postImage: { width: "100%", height: 300, borderRadius: 16, marginBottom: 12 },
  postActions: { flexDirection: "row", paddingTop: 12, borderTopWidth: 1, gap: 20 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionText: { fontSize: 13, fontFamily: fonts.medium },
  commentsTitle: { fontSize: 16, fontFamily: fonts.bold, marginBottom: 12 },
  commentItem: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 12 },
  commentAvatarText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
  commentBody: { flex: 1 },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  commentAuthor: { fontSize: 14, fontFamily: fonts.bold },
  commentTime: { fontSize: 11, fontFamily: fonts.regular },
  commentContent: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, gap: 10 },
  input: { flex: 1, borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 14, maxHeight: 100, minHeight: 44, fontFamily: fonts.regular },
  sendBtn: { backgroundColor: '#7C3AED', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  sendBtnDisabled: { opacity: 0.5 },
});
