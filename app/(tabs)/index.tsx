import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

type Post = {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  users: {
    full_name: string;
    university: string;
    course: string;
  }[];
};

export default function FeedScreen() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPost, setNewPost] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    const { data, error } = await supabase
      .from("posts")
      .select("id, content, created_at, author_id")
      .order("created_at", { ascending: false });

    if (error) {
      console.log("Error fetching posts:", error.message);
      setLoading(false);
      return;
    }

    // Fetch user data for each post
    const postsWithUsers = await Promise.all(
      data.map(async (post) => {
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("full_name, university, course")
          .eq("id", post.author_id)
          .single();

        if (userError) {
          console.log("Error fetching user:", userError);
        }

        return {
          ...post,
          users: userData ? [userData] : [],
        };
      }),
    );

    setPosts(postsWithUsers as Post[]);
    setLoading(false);
  };

  const handlePost = async () => {
    if (!newPost.trim()) {
      Alert.alert("Error", "Please write something first");
      return;
    }

    setPosting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert("Error", "You must be logged in to post");
      setPosting(false);
      return;
    }

    const { error } = await supabase.from("posts").insert({
      author_id: user.id,
      content: newPost.trim(),
    });

    setPosting(false);

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setNewPost("");
      await fetchPosts();
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const renderPost = ({ item }: { item: Post }) => {
    const user = item.users?.[0];

    return (
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.full_name?.charAt(0).toUpperCase() || "?"}
            </Text>
          </View>
          <View style={styles.postMeta}>
            <Text style={styles.authorName}>
              {user?.full_name || "Unknown"}
            </Text>
            <Text style={styles.authorDetails}>
              {user?.course || "Course"} · {user?.university || "University"}
            </Text>
          </View>
          <Text style={styles.postTime}>{formatTime(item.created_at)}</Text>
        </View>
        <Text style={styles.postContent}>{item.content}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>PROXIMA</Text>
        <Text style={styles.headerSub}>Campus Feed</Text>
      </View>

      {/* New Post Input */}
      <View style={styles.newPostContainer}>
        <TextInput
          style={styles.newPostInput}
          placeholder="What's happening on campus?"
          placeholderTextColor="#666"
          value={newPost}
          onChangeText={setNewPost}
          multiline
        />
        <TouchableOpacity
          style={styles.postButton}
          onPress={handlePost}
          disabled={posting}
        >
          {posting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.postButtonText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Posts List */}
      {loading ? (
        <ActivityIndicator color="#7C3AED" size="large" style={styles.loader} />
      ) : posts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>👋</Text>
          <Text style={styles.emptyTitle}>No posts yet</Text>
          <Text style={styles.emptySubtitle}>
            Be the first to post something on campus!
          </Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.postsList}
          showsVerticalScrollIndicator={false}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  logo: {
    fontSize: 24,
    fontWeight: "900",
    color: "#7C3AED",
    letterSpacing: 6,
  },
  headerSub: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  newPostContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-end",
  },
  newPostInput: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 12,
    color: "#fff",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    minHeight: 48,
    maxHeight: 120,
  },
  postButton: {
    backgroundColor: "#7C3AED",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  postButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  loader: {
    marginTop: 60,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
  postsList: {
    padding: 16,
    gap: 12,
  },
  postCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  postMeta: {
    flex: 1,
  },
  authorName: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  authorDetails: {
    color: "#666",
    fontSize: 12,
    marginTop: 2,
  },
  postTime: {
    color: "#666",
    fontSize: 12,
  },
  postContent: {
    color: "#ddd",
    fontSize: 15,
    lineHeight: 22,
  },
});
