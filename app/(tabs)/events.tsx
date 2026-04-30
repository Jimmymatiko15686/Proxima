import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TextInput, StyleSheet,
  ActivityIndicator, TouchableOpacity, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../lib/supabase';
import { useAppTheme } from '../../lib/ThemeContext';

type Event = {
  id: string; title: string; description: string; location: string;
  university: string; event_date: string; creator_id: string; poster_url: string | null;
  users: { full_name: string; avatar_url: string | null } | null;
  attendees: { user_id: string; users: { full_name: string; avatar_url: string | null } }[];
};

export default function EventsScreen() {
  const { theme, fonts, isDark, toggleTheme } = useAppTheme();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [posterImage, setPosterImage] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => { 
    getCurrentUser();
    fetchEvents(); 
  }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
  };

  const fetchEvents = async () => {
    const { data, error } = await supabase.from('events').select(`
      id, title, description, location, university, event_date, creator_id, poster_url,
      event_attendees (user_id, users (full_name, avatar_url))
    `).order('event_date', { ascending: false });
    if (error) { setLoading(false); return; }
    const eventsWithNames = await Promise.all((data || []).map(async (event: any) => {
      const { data: u } = await supabase.from('users').select('full_name, avatar_url').eq('id', event.creator_id).single();
      return { ...event, users: u || { full_name: 'Unknown', avatar_url: null }, attendees: event.event_attendees || [] };
    }));
    setEvents(eventsWithNames);
    setLoading(false);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      setPosterImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      const fileName = `event_${Date.now()}.jpg`;
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const { decode } = require('base-64');
      const arrayBuffer = decode(base64);
      const uint8Array = new Uint8Array(arrayBuffer.length);
      for (let i = 0; i < arrayBuffer.length; i++) {
        uint8Array[i] = arrayBuffer.charCodeAt(i);
      }
      const { data, error } = await supabase.storage.from("posts").upload(fileName, uint8Array, { contentType: "image/jpeg", upsert: true });
      if (error) { 
        console.log(error); 
        alert(`Upload failed: ${error.message}`); 
        return null; 
      }
      const { data: urlData } = supabase.storage.from("posts").getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (e: any) {
      console.log(e);
      alert(`Upload error: ${e.message || e}`);
      return null;
    }
  };

  const handleCreateEvent = async () => {
    if (!title || !description || !location) { alert('Please fill in all fields'); return; }
    setPosting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPosting(false); return; }
    
    let uploadedPosterUrl = null;
    if (posterImage) {
      uploadedPosterUrl = await uploadImage(posterImage);
    }

    const { data: profile } = await supabase.from('users').select('university').eq('id', user.id).single();
    const { error } = await supabase.from('events').insert({ 
      creator_id: user.id, title, description, location, 
      university: profile?.university || 'Unknown', 
      event_date: new Date().toISOString(),
      poster_url: uploadedPosterUrl
    });
    
    setPosting(false);
    if (!error) { setTitle(''); setDescription(''); setLocation(''); setPosterImage(null); fetchEvents(); }
    else alert(error.message);
  };

  const handleRSVP = async (eventId: string, isGoing: boolean) => {
    if (!currentUserId) return;
    if (isGoing) {
      await supabase.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', currentUserId);
    } else {
      await supabase.from('event_attendees').insert({ event_id: eventId, user_id: currentUserId });
    }
    fetchEvents();
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const s = makeStyles(theme, fonts, isDark);

  const renderEvent = ({ item }: { item: Event }) => {
    const isGoing = item.attendees?.some(a => a.user_id === currentUserId);
    const attendees = item.attendees || [];
    return (
      <View style={[s.eventCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={s.eventCardHeader}>
        <View style={s.eventIconBox}>
          <Ionicons name="calendar-outline" size={24} color="#7C3AED" />
        </View>
        <View style={s.eventTitleSection}>
          <Text style={[s.eventTitle, { color: theme.text }]}>{item.title}</Text>
          <Text style={[s.eventDate, { color: '#7C3AED' }]}>{formatDate(item.event_date)}</Text>
        </View>
      </View>
      {item.poster_url && (
        <Image source={{ uri: item.poster_url }} style={s.eventPosterImage} resizeMode="cover" />
      )}
      <Text style={[s.eventDescription, { color: theme.textSecondary }]}>{item.description}</Text>
      
      <View style={[s.eventMetaRow, { borderTopColor: theme.border }]}>
        <View style={s.metaItem}>
          <Ionicons name="location-outline" size={16} color={theme.textMuted} />
          <Text style={[s.eventLocation, { color: theme.textMuted }]}>{item.location}</Text>
        </View>
        <View style={s.organizerInfo}>
          <Text style={[s.eventOrganizer, { color: theme.textMuted }]}>by {item.users?.full_name}</Text>
          {item.users?.avatar_url ? (
            <Image source={{ uri: item.users.avatar_url }} style={s.organizerAvatar} />
          ) : (
            <View style={s.organizerAvatarFallback}>
              <Text style={s.organizerAvatarText}>{item.users?.full_name?.charAt(0).toUpperCase() || '?'}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={s.attendeesSection}>
        <View style={s.attendeesList}>
          {attendees.slice(0, 3).map((attendee, index) => (
            <View key={attendee.user_id} style={[s.attendeeAvatarContainer, { marginLeft: index > 0 ? -12 : 0 }]}>
              {attendee.users?.avatar_url ? (
                <Image source={{ uri: attendee.users.avatar_url }} style={s.attendeeAvatar} />
              ) : (
                <View style={s.attendeeAvatarFallback}>
                  <Text style={s.attendeeAvatarText}>{attendee.users?.full_name?.charAt(0).toUpperCase() || '?'}</Text>
                </View>
              )}
            </View>
          ))}
          {attendees.length > 0 && (
            <Text style={[s.attendeeCount, { color: theme.textMuted }]}>{attendees.length} going</Text>
          )}
        </View>
        <TouchableOpacity 
          style={[s.rsvpBtn, isGoing && { backgroundColor: 'transparent', borderColor: '#7C3AED', borderWidth: 1.5 }]}
          onPress={() => handleRSVP(item.id, !!isGoing)}
        >
          <Text style={[s.rsvpBtnText, isGoing && { color: '#7C3AED' }]}>
            {isGoing ? 'Going' : "I'm Going!"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )};

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <View style={[s.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View>
          <Text style={s.logo}>PROXIMA</Text>
          <Text style={[s.headerSub, { color: theme.textMuted }]}>Campus Events</Text>
        </View>
        <TouchableOpacity onPress={toggleTheme} style={s.themeBtn}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <View style={[s.createForm, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Text style={[s.createTitle, { color: theme.text }]}>Post an Event</Text>
        <TextInput style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]} placeholder="Event title" placeholderTextColor={theme.textMuted} value={title} onChangeText={setTitle} />
        <TextInput style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]} placeholder="Description" placeholderTextColor={theme.textMuted} value={description} onChangeText={setDescription} multiline />
        <TextInput style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]} placeholder="Location (e.g. Main Hall, Block C)" placeholderTextColor={theme.textMuted} value={location} onChangeText={setLocation} />
        
        {posterImage ? (
          <View style={s.posterPreviewContainer}>
            <Image source={{ uri: posterImage }} style={s.posterPreview} />
            <TouchableOpacity onPress={() => setPosterImage(null)} style={s.removePosterBtn}>
              <Ionicons name="close" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={pickImage} style={[s.addPosterBtn, { borderColor: theme.border }]}>
            <Ionicons name="image-outline" size={20} color={theme.textMuted} />
            <Text style={[s.addPosterText, { color: theme.textMuted }]}>Add Event Poster</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={handleCreateEvent} disabled={posting} style={s.postBtn}>
          <Ionicons name="calendar-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.postBtnText}>{posting ? 'Posting...' : 'Post Event'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#7C3AED" size="large" style={{ marginTop: 40 }} />
      ) : events.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="calendar-outline" size={60} color={theme.textMuted} style={{ marginBottom: 16 }} />
          <Text style={[s.emptyTitle, { color: theme.text }]}>No events yet</Text>
          <Text style={[s.emptySubtitle, { color: theme.textMuted }]}>Be the first to post a campus event!</Text>
        </View>
      ) : (
        <FlatList data={events} renderItem={renderEvent} keyExtractor={(item) => item.id} contentContainerStyle={s.list} showsVerticalScrollIndicator={false} />
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
  createForm: { padding: 16, borderBottomWidth: 1, gap: 8 },
  createTitle: { fontFamily: fonts.bold, fontSize: 16, marginBottom: 4 },
  input: { borderRadius: 14, padding: 12, fontSize: 14, fontFamily: fonts.regular, borderWidth: 1.5, marginBottom: 4 },
  postBtn: { backgroundColor: '#7C3AED', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 4, flexDirection: 'row', justifyContent: 'center' },
  postBtnText: { color: '#fff', fontSize: 15, fontFamily: fonts.bold },
  addPosterBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, gap: 8, marginVertical: 4 },
  addPosterText: { fontSize: 14, fontFamily: fonts.medium },
  posterPreviewContainer: { position: 'relative', marginVertical: 8, borderRadius: 14, overflow: 'hidden' },
  posterPreview: { width: '100%', height: 150, borderRadius: 14 },
  removePosterBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontFamily: fonts.bold, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22, fontFamily: fonts.regular },
  list: { padding: 16 },
  eventCard: { borderRadius: 20, padding: 16, borderWidth: 1.5, marginBottom: 12 },
  eventPosterImage: { width: '100%', height: 200, borderRadius: 12, marginBottom: 12 },
  eventCardHeader: { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'flex-start' },
  eventIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: theme.primaryBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.primaryBorder },
  eventIcon: { fontSize: 22 },
  eventTitleSection: { flex: 1 },
  eventTitle: { fontFamily: fonts.bold, fontSize: 16, marginBottom: 4 },
  eventDate: { fontSize: 12, fontFamily: fonts.semiBold },
  eventDescription: { fontSize: 14, lineHeight: 22, marginBottom: 16, fontFamily: fonts.regular },
  eventMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 12, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventLocation: { fontSize: 13, fontFamily: fonts.medium },
  organizerInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventOrganizer: { fontSize: 12, fontFamily: fonts.medium },
  organizerAvatar: { width: 24, height: 24, borderRadius: 12 },
  organizerAvatarFallback: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
  organizerAvatarText: { color: '#fff', fontSize: 10, fontFamily: fonts.bold },
  attendeesSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  attendeesList: { flexDirection: 'row', alignItems: 'center' },
  attendeeAvatarContainer: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: theme.card, backgroundColor: '#7C3AED', overflow: 'hidden' },
  attendeeAvatar: { width: '100%', height: '100%' },
  attendeeAvatarFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  attendeeAvatarText: { color: '#fff', fontSize: 13, fontFamily: fonts.bold },
  attendeeCount: { fontSize: 13, marginLeft: 10, fontFamily: fonts.semiBold },
  rsvpBtn: { backgroundColor: '#7C3AED', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 18 },
  rsvpBtnText: { color: '#fff', fontSize: 14, fontFamily: fonts.bold },
});