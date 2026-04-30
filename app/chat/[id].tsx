import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Image, ActionSheetIOS, Alert, Modal } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAppTheme } from '../../lib/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  image_url?: string | null;
};

export default function ChatScreen() {
  const { id } = useLocalSearchParams(); // Other user's ID
  const { theme, isDark } = useAppTheme();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState<any>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    let interval: any;
    initChat().then((i) => { interval = i; });
    return () => { if (interval) clearInterval(interval); };
  }, [id]);

  const initChat = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      await fetchOtherUser();
      await fetchMessages(user.id);
      
      const interval = setInterval(() => fetchMessages(user.id), 3000);
      return interval;
    }
  };

  const fetchOtherUser = async () => {
    const { data } = await supabase.from('users').select('full_name, avatar_url').eq('id', id).single();
    setOtherUser(data);
  };

  const fetchMessages = async (userId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${userId},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${userId})`)
      .order('created_at', { ascending: true });
      
    if (!error && data) {
      setMessages(data);
    }
    setLoading(false);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      const fileName = `chat_${Date.now()}.jpg`;
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const { decode } = require('base-64');
      const arrayBuffer = decode(base64);
      const uint8Array = new Uint8Array(arrayBuffer.length);
      for (let i = 0; i < arrayBuffer.length; i++) {
        uint8Array[i] = arrayBuffer.charCodeAt(i);
      }
      const { data, error } = await supabase.storage.from("posts").upload(fileName, uint8Array, { contentType: "image/jpeg", upsert: true });
      if (error) { alert(`Upload failed: ${error.message}`); return null; }
      const { data: urlData } = supabase.storage.from("posts").getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (e: any) {
      alert(`Upload error: ${e.message || e}`);
      return null;
    }
  };

  const handleImageLongPress = (imageUrl: string, item: Message) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Save to Gallery', 'Reply'], cancelButtonIndex: 0 },
        async (index) => {
          if (index === 1) await saveImage(imageUrl);
          if (index === 2) setReplyTo(item);
        }
      );
    } else {
      // Android: use an Alert as action sheet
      Alert.alert('Image Options', '', [
        { text: 'Save to Gallery', onPress: () => saveImage(imageUrl) },
        { text: 'Reply', onPress: () => setReplyTo(item) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const saveImage = async (imageUrl: string) => {
    try {
      const fileName = `proxima_${Date.now()}.jpg`;
      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.downloadAsync(imageUrl, fileUri);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'image/jpeg', dialogTitle: 'Save or share image' });
      } else {
        Alert.alert('Sharing not available', 'Your device does not support sharing.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not download the image.');
    }
  };

  const handleSend = async () => {
    if ((!newMessage.trim() && !selectedImage) || !currentUserId) return;
    setSending(true);
    
    let uploadedImageUrl = null;
    if (selectedImage) {
      uploadedImageUrl = await uploadImage(selectedImage);
    }

    const messageText = newMessage.trim();
    const replyRef = replyTo ? `↩ ${replyTo.content || 'Photo'}\n` : '';
    setNewMessage('');
    setSelectedImage(null);
    setReplyTo(null);
    
    // Optimistic UI update
    const optimisticMessage: Message = {
      id: Math.random().toString(),
      sender_id: currentUserId,
      receiver_id: id as string,
      content: replyRef + messageText,
      created_at: new Date().toISOString(),
      image_url: uploadedImageUrl
    };
    setMessages(prev => [...prev, optimisticMessage]);

    await supabase.from('messages').insert({
      sender_id: currentUserId,
      receiver_id: id,
      content: replyRef + messageText,
      image_url: uploadedImageUrl
    });
    
    await supabase.from('notifications').insert({
      user_id: id,
      title: 'New Message 💬',
      body: `You received a new message`,
      type: 'message'
    });

    setSending(false);
    fetchMessages(currentUserId);
  };

  const s = makeStyles(theme, isDark);

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUserId;
    return (
      <View style={[s.messageWrapper, isMe ? s.messageWrapperRight : s.messageWrapperLeft]}>
        {!isMe && otherUser?.avatar_url && (
          <Image source={{ uri: otherUser.avatar_url }} style={s.tinyAvatar} />
        )}
        <View style={[
          s.messageBubble, 
          isMe ? s.messageBubbleRight : [s.messageBubbleLeft, { backgroundColor: theme.card, borderColor: theme.border }]
        ]}>
          {item.image_url && (
            <TouchableOpacity
              onPress={() => setImageModalUrl(item.image_url!)}
              onLongPress={() => handleImageLongPress(item.image_url!, item)}
              activeOpacity={0.85}
            >
              <Image source={{ uri: item.image_url }} style={s.messageImage} />
            </TouchableOpacity>
          )}
          {item.content ? (
            <Text style={[s.messageText, isMe ? s.messageTextRight : { color: theme.text }]}>{item.content}</Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={[s.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
    >
      <View style={[s.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={s.headerTitleContainer}>
          {otherUser?.avatar_url ? (
            <Image source={{ uri: otherUser.avatar_url }} style={s.headerAvatar} />
          ) : (
            <View style={s.headerAvatarFallback}>
              <Text style={s.headerAvatarFallbackText}>{otherUser?.full_name?.charAt(0).toUpperCase() || '?'}</Text>
            </View>
          )}
          <Text style={[s.headerName, { color: theme.text }]}>{otherUser?.full_name || 'Chat'}</Text>
        </View>
        <View style={s.placeholder} />
      </View>

      {loading ? (
        <ActivityIndicator color="#7C3AED" size="large" style={{ flex: 1 }} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      <View style={{ backgroundColor: theme.surface }}>
        {/* Full image viewer modal */}
        <Modal visible={!!imageModalUrl} transparent animationType="fade" onRequestClose={() => setImageModalUrl(null)}>
          <TouchableOpacity style={s.imageModal} activeOpacity={1} onPress={() => setImageModalUrl(null)}>
            {imageModalUrl && <Image source={{ uri: imageModalUrl }} style={s.imageModalImg} resizeMode="contain" />}
          </TouchableOpacity>
        </Modal>

        {replyTo && (
          <View style={[s.replyBanner, { backgroundColor: theme.card, borderLeftColor: '#7C3AED' }]}>
            <Ionicons name="return-down-forward-outline" size={14} color="#7C3AED" />
            <Text style={[s.replyText, { color: theme.textMuted }]} numberOfLines={1}>
              {replyTo.image_url && !replyTo.content ? '📷 Photo' : replyTo.content}
            </Text>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={{ marginLeft: 'auto' }}>
              <Ionicons name="close" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        )}
        {selectedImage && (
          <View style={s.previewContainer}>
            <Image source={{ uri: selectedImage }} style={s.previewImage} />
            <TouchableOpacity style={s.removePreviewBtn} onPress={() => setSelectedImage(null)}>
              <Ionicons name="close" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
        <View style={[s.inputContainer, { borderTopColor: theme.border }]}>
          <TouchableOpacity onPress={pickImage} style={s.attachBtn}>
            <Ionicons name="image-outline" size={24} color={theme.textMuted} />
          </TouchableOpacity>
          <TextInput
            style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
            placeholder="Type a message..."
            placeholderTextColor={theme.textMuted}
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
          />
          <TouchableOpacity 
            style={[s.sendBtn, (!newMessage.trim() && !selectedImage || sending) && s.sendBtnDisabled]} 
            onPress={handleSend}
            disabled={(!newMessage.trim() && !selectedImage) || sending}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { padding: 4 },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerAvatar: { width: 32, height: 32, borderRadius: 16 },
  headerAvatarFallback: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
  headerAvatarFallbackText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  headerName: { fontSize: 18, fontWeight: '700' },
  placeholder: { width: 32 },
  list: { padding: 16, paddingBottom: 32 },
  messageWrapper: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
  messageWrapperLeft: { justifyContent: 'flex-start' },
  messageWrapperRight: { justifyContent: 'flex-end' },
  tinyAvatar: { width: 24, height: 24, borderRadius: 12, marginRight: 8 },
  messageBubble: { maxWidth: '75%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  messageBubbleLeft: { borderBottomLeftRadius: 4, borderWidth: 1 },
  messageBubbleRight: { backgroundColor: '#7C3AED', borderBottomRightRadius: 4 },
  messageText: { fontSize: 15, lineHeight: 22 },
  messageTextRight: { color: '#fff' },
  messageImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 4 },
  previewContainer: { padding: 12, paddingBottom: 0 },
  previewImage: { width: 100, height: 100, borderRadius: 12 },
  removePreviewBtn: { position: 'absolute', top: 16, right: 'auto', left: 16, backgroundColor: 'rgba(0,0,0,0.6)', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, gap: 8 },
  attachBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  input: { flex: 1, borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, maxHeight: 100, minHeight: 44 },
  sendBtn: { backgroundColor: '#7C3AED', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  sendBtnDisabled: { opacity: 0.5 },
  imageModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  imageModalImg: { width: '95%', height: '80%' },
  replyBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderLeftWidth: 3, gap: 8 },
  replyText: { flex: 1, fontSize: 13 },
});
