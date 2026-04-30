import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Share,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { colors } from "../../lib/theme";
import { useAppTheme } from "../../lib/ThemeContext";

type Comment = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  users: { full_name: string; avatar_url: string | null };
};
type Post = {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  author_id: string;
  users: { full_name: string; university: string; course: string; avatar_url: string | null };
  likes: { user_id: string }[];
  comments: Comment[];
};

export default function FeedScreen() {
  const { theme, fonts, isDark, toggleTheme } = useAppTheme();
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPost, setNewPost] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [commentModal, setCommentModal] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [optionsMenuPostId, setOptionsMenuPostId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void; confirmText?: string; danger?: boolean } | null>(null);

  useEffect(() => {
    getCurrentUser();
    fetchPosts();

    // Set up real-time subscription for auto-refresh
    // Use a unique channel name to prevent "already subscribed" errors in React Strict Mode
    const channelId = `feed_posts_${Date.now()}`;
    const postsSubscription = supabase
      .channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        fetchPosts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(postsSubscription);
    };
  }, []);

  const getCurrentUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserId(session.user.id);
        const { data } = await supabase.from('users').select('avatar_url, full_name').eq('id', session.user.id).single();
        setCurrentUser(data);
      }
    } catch (e) {
      console.log("Auth lock error (safe to ignore in dev):", e);
    }
  };

  const fetchPosts = async () => {
    try {
      // 1. Fetch posts that are either public OR owned by the current user
      let query = supabase
        .from("posts")
        .select(
          `id, content, image_url, created_at, author_id, is_private,
          users (full_name, university, course, avatar_url),
          likes (user_id),
          comments (id, user_id, content, created_at, users (full_name, avatar_url))`
        );

      // Apply privacy filter: (is_private is false) OR (author_id is current user)
      if (currentUserId) {
        query = query.or(`is_private.eq.false,author_id.eq.${currentUserId}`);
      } else {
        query = query.eq('is_private', false);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      
      if (error) throw error;

      // 2. If logged in, filter out posts the user has explicitly hidden
      if (currentUserId && data) {
        const { data: hiddenData } = await supabase
          .from('hidden_posts')
          .select('post_id')
          .eq('user_id', currentUserId);
        
        const hiddenIds = new Set(hiddenData?.map(h => h.post_id) || []);
        const filteredPosts = data.filter(post => !hiddenIds.has(post.id));
        setPosts(filteredPosts as any[]);
      } else {
        setPosts(data as any[] || []);
      }
    } catch (err) {
      console.log("Fetch posts error:", err);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please allow access to your photo library.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      const fileName = `post_${Date.now()}.jpg`;

      // Most reliable way to upload in React Native/Android: ArrayBuffer via Base64
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const { decode } = require('base-64');
      const arrayBuffer = decode(base64);
      const uint8Array = new Uint8Array(arrayBuffer.length);
      for (let i = 0; i < arrayBuffer.length; i++) {
        uint8Array[i] = arrayBuffer.charCodeAt(i);
      }

      // Use Supabase SDK to upload
      const { data, error } = await supabase.storage
        .from("posts")
        .upload(fileName, uint8Array, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (error) {
        console.log("Upload error:", error);
        Alert.alert("Upload Error", "Could not upload image. Please ensure the 'posts' storage bucket exists in Supabase and is public.");
        return null;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("posts")
        .getPublicUrl(fileName);
      return urlData?.publicUrl || null;
    } catch (err: any) {
      console.log("Image upload error:", err);
      Alert.alert("Upload Error", "An error occurred while uploading the image.");
      return null;
    }
  };

  const handlePost = async () => {
    if (!newPost.trim() && !selectedImage) {
      Alert.alert("Error", "Write something or add a photo");
      return;
    }
    setPosting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setPosting(false);
        return;
      }
      let imageUrl = null;
      if (selectedImage) {
        imageUrl = await uploadImage(selectedImage);
        if (!imageUrl) {
          // Stop posting if image upload failed
          setPosting(false);
          return;
        }
      }
      const { error } = await supabase.from("posts").insert({
        author_id: user.id,
        content: newPost.trim(),
        image_url: imageUrl,
      });
      setPosting(false);
      if (!error) {
        setNewPost("");
        setSelectedImage(null);
        fetchPosts();
      } else {
        Alert.alert("Post Error", error.message || "Failed to create post");
      }
    } catch (err: any) {
      console.log("Handle post error:", err);
      Alert.alert("Error", err.message || "An unexpected error occurred while posting.");
      setPosting(false);
    }
  };

  const handleLike = async (postId: string) => {
    if (!currentUserId) return;
    const post = posts.find((p) => p.id === postId);
    const alreadyLiked = post?.likes?.some(
      (l: any) => l.user_id === currentUserId,
    );
    if (alreadyLiked) {
      await supabase
        .from("likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", currentUserId);
    } else {
      await supabase
        .from("likes")
        .insert({ post_id: postId, user_id: currentUserId });
      if (post && post.author_id !== currentUserId) {
        const { data: liker } = await supabase
          .from("users")
          .select("full_name")
          .eq("id", currentUserId)
          .single();
        await supabase.from("notifications").insert({
          user_id: post.author_id,
          title: "New Like",
          body: `${liker?.full_name || "Someone"} liked your post`,
          type: `like:${post.id}`,
        });
      }
    }
    fetchPosts();
  };

  const handleComment = async () => {
    if (!commentText.trim() || !activePostId || !currentUserId) return;
    setSubmittingComment(true);
    const { error } = await supabase.from("comments").insert({
      post_id: activePostId,
      user_id: currentUserId,
      content: commentText.trim(),
    });
    if (!error) {
      const post = posts.find((p) => p.id === activePostId);
      if (post && post.author_id !== currentUserId) {
        const { data: commenter } = await supabase
          .from("users")
          .select("full_name")
          .eq("id", currentUserId)
          .single();
        await supabase.from("notifications").insert({
          user_id: post.author_id,
          title: "New Comment",
          body: `${commenter?.full_name || "Someone"} commented on your post`,
          type: `comment:${post.id}`,
        });
      }
      setCommentText("");
      fetchPosts();
    }
    setSubmittingComment(false);
  };

  const handleDeletePost = (postId: string) => {
    setOptionsMenuPostId(null);
    setConfirmModal({
      title: 'Delete Post',
      message: 'Are you sure you want to delete this post? This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('posts').delete().eq('id', postId);
          if (error) throw error;
          
          // Optimistically remove from UI
          setPosts(prev => prev.filter(p => p.id !== postId));
          setConfirmModal(null);
          // Optional: re-fetch to be 100% sure
          fetchPosts();
        } catch (error: any) {
          setConfirmModal({ 
            title: 'Error', 
            message: 'Failed to delete post: ' + error.message, 
            confirmText: 'OK', 
            onConfirm: () => setConfirmModal(null) 
          });
        }
      }
    });
  };

  const handleHidePost = async (postId: string) => {
    setOptionsMenuPostId(null);
    const post = posts.find(p => p.id === postId);
    if (!post || !currentUserId) return;

    const isOwnPost = post.author_id === currentUserId;

    try {
      if (isOwnPost) {
        // Rule 1: Hiding your own post makes it private (only you see it)
        const { error } = await supabase.from('posts').update({ is_private: true }).eq('id', postId);
        if (error) throw error;
        Alert.alert("Post Hidden", "This post is now private. Only you can see it in your feed.");
      } else {
        // Rule 2: Hiding someone else's post hides it from your view only
        const { error } = await supabase.from('hidden_posts').insert({ user_id: currentUserId, post_id: postId });
        if (error) throw error;
        Alert.alert("Post Hidden", "You won't see this post again.");
      }
      
      // Optimistically remove from current view
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (error: any) {
      Alert.alert("Error", "Could not hide post: " + error.message);
    }
  };

  const handleShare = async (post: Post) => {
    try {
      const message = post.image_url 
        ? `${post.content}\n\nCheck out this post on Proxima: ${post.image_url}`
        : `${post.content}\n\nShared from Proxima Campus App`;
        
      await Share.share({
        message,
        title: 'Proxima Post',
      });
    } catch (error: any) {
      console.log('Share error:', error.message);
    }
  };

  const handleReportPost = (postId: string) => {
    setOptionsMenuPostId(null);
    setTimeout(() => {
      setConfirmModal({
        title: 'Report Post',
        message: 'Thank you for keeping Proxima safe. Our team will review this post.',
        confirmText: 'OK',
        onConfirm: () => setConfirmModal(null),
      });
    }, 300);
  };

  const handleDeleteComment = (commentId: string) => {
    setConfirmModal({
      title: 'Delete Comment',
      message: 'Are you sure you want to delete this comment?',
      confirmText: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('comments').delete().eq('id', commentId);
          if (error) throw error;
          fetchPosts(); // Reload posts to reflect deleted comment
          setConfirmModal(null);
        } catch (error: any) {
          setConfirmModal({ 
            title: 'Error', 
            message: 'Failed to delete comment: ' + error.message, 
            confirmText: 'OK', 
            onConfirm: () => setConfirmModal(null) 
          });
        }
      }
    });
  };

  const formatTime = (timestamp: string) => {
    // Append 'Z' to force UTC parsing if Supabase returns timestamp without timezone
    const safeTimestamp = timestamp.endsWith('Z') ? timestamp : `${timestamp}Z`;
    const diff = Math.floor(
      (Date.now() - new Date(safeTimestamp).getTime()) / 1000,
    );
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  const activePost = posts.find((p) => p.id === activePostId);
  const s = makeStyles(theme, fonts, isDark);

  const renderPost = useCallback(({ item }: { item: Post }) => {
    const liked = item.likes?.some((l: any) => l.user_id === currentUserId);
    const likeCount = item.likes?.length || 0;
    const commentCount = item.comments?.length || 0;
    return (
      <View
        style={[
          s.postCard,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <TouchableOpacity style={s.postHeader} activeOpacity={0.7} onPress={() => router.push(`/user/${item.author_id}`)}>
          <View style={[s.avatar, item.users?.avatar_url && s.avatarNoBorder]}>
            {item.users?.avatar_url ? (
              <Image source={{ uri: item.users.avatar_url }} style={s.avatarImage} />
            ) : (
              <Text style={s.avatarText}>
                {item.users?.full_name?.charAt(0).toUpperCase() || "?"}
              </Text>
            )}
          </View>
          <View style={s.postMeta}>
            <Text style={[s.authorName, { color: theme.text }]}>
              {item.users?.full_name || "Unknown"}
            </Text>
            <Text style={[s.authorDetails, { color: theme.textMuted }]}>
              {item.users?.course} · {item.users?.university}
            </Text>
          </View>
          <View style={s.headerRight}>
            <Text style={[s.postTime, { color: theme.textMuted }]}>
              {formatTime(item.created_at)}
            </Text>
            <TouchableOpacity onPress={() => setOptionsMenuPostId(item.id)} style={s.optionsBtn}>
              <Ionicons name="ellipsis-vertical" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
        {item.content ? (
          <Text style={[s.postContent, { color: theme.textSecondary }]}>
            {item.content}
          </Text>
        ) : null}
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={s.postImage}
            resizeMode="cover"
          />
        ) : null}
        <View style={[s.actions, { borderTopColor: theme.border }]}>
          <TouchableOpacity
            onPress={() => handleLike(item.id)}
            style={[
              s.actionBtn,
              liked && { backgroundColor: theme.primaryBg },
            ]}
          >
            <Ionicons 
              name={liked ? "heart" : "heart-outline"} 
              size={18} 
              color={liked ? "#7C3AED" : theme.textMuted} 
            />
            <Text
              style={[
                s.actionText,
                { color: liked ? "#7C3AED" : theme.textMuted, marginLeft: 6 },
              ]}
            >
              {likeCount}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setActivePostId(item.id);
              setCommentModal(true);
            }}
            style={s.actionBtn}
          >
            <Ionicons name="chatbubble-outline" size={18} color={theme.textMuted} />
            <Text style={[s.actionText, { color: theme.textMuted, marginLeft: 6 }]}>
              {commentCount}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleShare(item)}
            style={s.actionBtn}
          >
            <Ionicons name="share-social-outline" size={18} color={theme.textMuted} />
            <Text style={[s.actionText, { color: theme.textMuted, marginLeft: 6 }]}>
              Share
            </Text>
          </TouchableOpacity>
        </View>
        {item.comments?.length > 0 && (
          <View
            style={[
              s.commentPreview,
              { borderTopColor: theme.border, backgroundColor: theme.surface },
            ]}
          >
            {item.comments[0].users?.avatar_url && (
              <Image source={{ uri: item.comments[0].users.avatar_url }} style={s.commentAvatarSmall} />
            )}
            <Text style={[s.commentAuthor, { color: colors.primary }]}>
              {item.comments[0].users?.full_name}:{" "}
            </Text>
            <Text style={[s.commentText, { color: theme.textSecondary }]}>
              {item.comments[0].content}
            </Text>
          </View>
        )}
      </View>
    );
  }, [currentUserId, theme, fonts, isDark, optionsMenuPostId]);

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          s.header,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <View>
          <Text style={s.logo}>PROXIMA</Text>
          <Text style={[s.headerSub, { color: theme.textMuted }]}>
            Campus Feed
          </Text>
        </View>
        <View style={s.headerIcons}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/links')} style={s.headerIconBtn}>
            <Ionicons name="people-outline" size={22} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(tabs)/notifications')} style={s.headerIconBtn}>
            <Ionicons name="notifications-outline" size={22} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleTheme} style={s.headerIconBtn}>
            <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={22} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={[
          s.newPostContainer,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <View style={s.postInputRow}>
          <View style={[s.postAvatar, currentUser?.avatar_url && s.avatarNoBorder]}>
            {currentUser?.avatar_url ? (
              <Image source={{ uri: currentUser.avatar_url }} style={s.avatarImage} />
            ) : (
              <Text style={s.postAvatarText}>{currentUser?.full_name?.charAt(0).toUpperCase() || "U"}</Text>
            )}
          </View>
          <TextInput
            style={[
              s.newPostInput,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            placeholder="What's happening on campus?"
            placeholderTextColor={theme.textMuted}
            value={newPost}
            onChangeText={setNewPost}
            multiline
          />
        </View>
        {selectedImage && (
          <View style={s.previewContainer}>
            <Image
              source={{ uri: selectedImage }}
              style={s.previewImage}
              resizeMode="cover"
            />
            <TouchableOpacity 
              style={s.removePhotoBtn} 
              onPress={() => setSelectedImage(null)}
            >
              <Ionicons name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
        <View style={s.postActions}>
            <TouchableOpacity
              onPress={pickImage}
              style={[
                s.photoBtn,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
                <Ionicons name="camera-outline" size={20} color={theme.textSecondary} style={{ marginRight: 6 }} />
                <Text style={[s.photoBtnText, { color: theme.textSecondary }]}>
                  {selectedImage ? "Change" : "Photo"}
                </Text>
            </TouchableOpacity>
            {(newPost.trim().length > 0 || selectedImage) && (
              <TouchableOpacity
                onPress={() => {
                  setNewPost('');
                  setSelectedImage(null);
                }}
                style={s.discardBtn}
              >
                <Text style={[s.discardBtnText, { color: theme.textMuted }]}>Discard</Text>
              </TouchableOpacity>
            )}
          <TouchableOpacity
            onPress={handlePost}
            disabled={posting}
            style={s.postBtn}
          >
            <Text style={s.postBtnText}>{posting ? "Posting..." : "Post"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator
          color="#7C3AED"
          size="large"
          style={{ marginTop: 60 }}
        />
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.postsList}
          showsVerticalScrollIndicator={false}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={7}
          removeClippedSubviews={true}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Ionicons name="planet-outline" size={60} color={theme.textMuted} style={{ marginBottom: 16 }} />
              <Text style={[s.emptyTitle, { color: theme.text }]}>
                No posts yet
              </Text>
              <Text style={[s.emptySubtitle, { color: theme.textMuted }]}>
                Be the first to post on campus!
              </Text>
            </View>
          }
        />
      )}

      {/* Post Options Menu Modal */}
      <Modal
        visible={!!optionsMenuPostId}
        animationType="slide"
        transparent
        onRequestClose={() => setOptionsMenuPostId(null)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          {/* Backdrop - tapping it closes the menu */}
          <TouchableOpacity 
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} 
            activeOpacity={1} 
            onPress={() => setOptionsMenuPostId(null)} 
          />
          {/* Menu container - separate from backdrop so touches don't propagate up */}
          <View style={[s.optionsMenuContainer, { backgroundColor: theme.surface }]}>
            <View style={s.optionsMenuHandle} />
            
            {posts.find(p => p.id === optionsMenuPostId)?.author_id === currentUserId && (
              <TouchableOpacity onPress={() => handleDeletePost(optionsMenuPostId!)} style={s.optionItem}>
                <Ionicons name="trash-outline" size={20} color="#FF4444" />
                <Text style={[s.optionItemText, { color: '#FF4444' }]}>Delete Post</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity onPress={() => handleHidePost(optionsMenuPostId!)} style={s.optionItem}>
              <Ionicons name="eye-off-outline" size={20} color={theme.text} />
              <Text style={[s.optionItemText, { color: theme.text }]}>Hide Post</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => handleReportPost(optionsMenuPostId!)} style={s.optionItem}>
              <Ionicons name="flag-outline" size={20} color={theme.text} />
              <Text style={[s.optionItemText, { color: theme.text }]}>Report Post</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Custom Confirm Modal */}
      <Modal visible={!!confirmModal} animationType="fade" transparent onRequestClose={() => setConfirmModal(null)}>
        <View style={s.confirmOverlay}>
          <View style={[s.confirmBox, { backgroundColor: theme.surface }]}>
            <Text style={[s.confirmTitle, { color: theme.text }]}>{confirmModal?.title}</Text>
            <Text style={[s.confirmMessage, { color: theme.textSecondary }]}>{confirmModal?.message}</Text>
            <View style={s.confirmButtons}>
              {confirmModal?.confirmText !== 'OK' && (
                <TouchableOpacity style={[s.confirmBtn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => setConfirmModal(null)}>
                  <Text style={[s.confirmBtnText, { color: theme.text }]}>Cancel</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={[s.confirmBtn, { backgroundColor: confirmModal?.danger ? '#FF4444' : '#7C3AED', flex: 1 }]} 
                onPress={async () => { 
                  if (confirmModal?.onConfirm) {
                    await confirmModal.onConfirm();
                  }
                  // Only close if it's not a persistent error message
                  if (confirmModal?.confirmText !== 'OK') {
                    setConfirmModal(null);
                  }
                }}
              >
                <Text style={[s.confirmBtnText, { color: '#fff' }]}>{confirmModal?.confirmText || 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={commentModal}
        animationType="slide"
        transparent
        onRequestClose={() => setCommentModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: theme.surface }]}>
            <View style={[s.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[s.modalTitle, { color: theme.text }]}>
                Comments
              </Text>
              <TouchableOpacity onPress={() => setCommentModal(false)}>
                <Text style={[s.closeBtn, { color: theme.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.commentsList}>
              {activePost?.comments?.length === 0 ? (
                <Text style={[s.noComments, { color: theme.textMuted }]}>
                  No comments yet. Be the first!
                </Text>
              ) : (
                activePost?.comments?.map((comment) => (
                  <View
                    key={comment.id}
                    style={[
                      s.commentItem,
                      {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <View style={s.commentItemHeader}>
                      {comment.users?.avatar_url && (
                        <Image source={{ uri: comment.users.avatar_url }} style={s.commentAvatarSmall} />
                      )}
                      <Text
                        style={[s.commentItemAuthor, { color: colors.primary }]}
                      >
                        {comment.users?.full_name}
                      </Text>
                    </View>
                    <Text
                      style={[
                        s.commentItemText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {comment.content}
                    </Text>
                    <View style={s.commentItemFooter}>
                      <Text
                        style={[s.commentItemTime, { color: theme.textMuted }]}
                      >
                        {formatTime(comment.created_at)}
                      </Text>
                      {comment.user_id === currentUserId && (
                        <TouchableOpacity onPress={() => handleDeleteComment(comment.id)} style={s.deleteCommentBtn}>
                          <Text style={s.deleteCommentText}>Delete</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <View style={[s.commentInput, { borderTopColor: theme.border }]}>
                <TextInput
                  style={[
                    s.commentTextInput,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  placeholder="Write a comment..."
                  placeholderTextColor={theme.textMuted}
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                />
                <TouchableOpacity
                  onPress={handleComment}
                  disabled={submittingComment}
                  style={s.sendBtn}
                >
                  <Text style={s.sendBtnText}>
                    {submittingComment ? "..." : "Send"}
                  </Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (theme: any, fonts: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    logo: {
      fontSize: 26,
      fontFamily: fonts.black,
      color: "#7C3AED",
      letterSpacing: 3,
    },
    headerSub: { fontSize: 12, marginTop: 2, letterSpacing: 1, fontFamily: fonts.medium },
    themeBtn: { padding: 8 },
    themeBtnText: { fontSize: 24 },
    headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    headerIconBtn: { padding: 8 },
    newPostContainer: { padding: 16, borderBottomWidth: 1, gap: 10 },
    postInputRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
    postAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "#7C3AED",
      alignItems: "center",
      justifyContent: "center",
      overflow: 'hidden',
    },
    postAvatarText: { color: "#fff", fontFamily: fonts.bold, fontSize: 16 },
    newPostInput: {
      flex: 1,
      borderRadius: 16,
      padding: 12,
      fontSize: 15,
      fontFamily: fonts.regular,
      borderWidth: 1.5,
      minHeight: 44,
      maxHeight: 120,
    },
    previewContainer: { position: 'relative', marginTop: 8 },
    previewImage: { width: "100%", height: 200, borderRadius: 16 },
    removePhotoBtn: { 
      position: 'absolute', 
      top: 10, 
      right: 10, 
      backgroundColor: 'rgba(0,0,0,0.6)', 
      width: 28, 
      height: 28, 
      borderRadius: 14, 
      alignItems: 'center', 
      justifyContent: 'center' 
    },
    postActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingLeft: 52,
    },
    photoBtn: {
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    photoBtnText: { fontSize: 13, fontFamily: fonts.medium },
    postBtn: {
      backgroundColor: "#7C3AED",
      borderRadius: 20,
      paddingHorizontal: 24,
      paddingVertical: 8,
    },
    discardBtn: { paddingHorizontal: 12, paddingVertical: 8 },
    discardBtnText: { fontSize: 13, fontFamily: fonts.medium },
    postBtnText: { color: "#fff", fontFamily: fonts.bold, fontSize: 14 },
    postsList: { paddingVertical: 0 },
    postCard: {
      padding: 16,
      borderBottomWidth: 1.5,
    },
    postHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
      gap: 12,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "#7C3AED",
      alignItems: "center",
      justifyContent: "center",
      overflow: 'hidden',
    },
    avatarNoBorder: { borderWidth: 0 },
    avatarImage: { width: "100%", height: "100%" },
    commentAvatarSmall: { width: 16, height: 16, borderRadius: 8, marginRight: 6 },
    commentItemHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    avatarText: { color: "#fff", fontFamily: fonts.bold, fontSize: 17 },
    postMeta: { flex: 1 },
    authorName: { fontFamily: fonts.bold, fontSize: 15 },
    authorDetails: { fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    postTime: { fontSize: 12, fontFamily: fonts.regular },
    optionsBtn: { padding: 4 },
    postContent: { fontSize: 15, lineHeight: 22, marginBottom: 12, fontFamily: fonts.regular },
    postImage: {
      width: "100%",
      height: 220,
      borderRadius: 16,
      marginBottom: 12,
    },
    actions: {
      flexDirection: "row",
      gap: 4,
      marginTop: 8,
      borderTopWidth: 1,
      paddingTop: 8,
    },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
    },
    actionText: { fontSize: 14, fontFamily: fonts.bold },
    commentPreview: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 8,
      paddingTop: 8,
      paddingHorizontal: 12,
      paddingBottom: 8,
      borderTopWidth: 1,
      borderRadius: 12,
    },
    commentAuthor: { fontSize: 13, fontFamily: fonts.bold },
    commentText: { fontSize: 13, flex: 1, fontFamily: fonts.regular },
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      padding: 40,
      marginTop: 60,
    },
    emptyEmoji: { fontSize: 48, marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontFamily: fonts.bold, marginBottom: 8 },
    emptySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 22, fontFamily: fonts.regular },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      justifyContent: "flex-end",
    },
    modalContent: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      height: "70%" as any,
      padding: 20,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
      paddingBottom: 16,
      borderBottomWidth: 1,
    },
    modalTitle: { fontSize: 18, fontFamily: fonts.bold },
    closeBtn: { fontSize: 20, padding: 4 },
    commentsList: { flex: 1 },
    noComments: { textAlign: "center", marginTop: 40, fontSize: 14, fontFamily: fonts.regular },
    commentItem: {
      marginBottom: 12,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
    },
    commentItemAuthor: { fontFamily: fonts.bold, fontSize: 13 },
    commentItemText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
    commentItemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    commentItemTime: { fontSize: 11, fontFamily: fonts.regular },
    deleteCommentBtn: { paddingHorizontal: 4, paddingVertical: 2 },
    deleteCommentText: { color: '#FF4444', fontSize: 11, fontFamily: fonts.bold },
    commentInput: {
      flexDirection: "row",
      gap: 8,
      alignItems: "flex-end",
      paddingTop: 12,
      borderTopWidth: 1,
    },
    commentTextInput: {
      flex: 1,
      borderRadius: 14,
      padding: 12,
      fontSize: 14,
      fontFamily: fonts.regular,
      borderWidth: 1.5,
      minHeight: 44,
      maxHeight: 100,
    },
    sendBtn: {
      backgroundColor: "#7C3AED",
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    sendBtnText: { color: "#fff", fontFamily: fonts.bold, fontSize: 13 },
    optionsModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    optionsMenuContainer: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
    },
    optionsMenuHandle: {
      width: 40,
      height: 4,
      backgroundColor: "#ccc",
      borderRadius: 2,
      alignSelf: "center",
      marginBottom: 20,
    },
    optionItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 16,
      gap: 12,
    },
    optionItemText: { fontSize: 16, fontFamily: fonts.bold },
    confirmOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    confirmBox: {
      borderRadius: 20,
      padding: 24,
      width: "100%",
      maxWidth: 380,
    },
    confirmTitle: { fontSize: 18, fontFamily: fonts.bold, marginBottom: 10 },
    confirmMessage: { fontSize: 14, lineHeight: 22, marginBottom: 24, fontFamily: fonts.regular },
    confirmButtons: { flexDirection: "row", gap: 10 },
    confirmBtn: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "transparent",
    },
    confirmBtnText: { fontSize: 15, fontFamily: fonts.bold },
  });
