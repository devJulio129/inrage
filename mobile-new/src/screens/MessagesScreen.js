import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { colors, spacing, radii, type } from '../theme';
import { api } from '../api/client';

function timeShort(date) {
  return new Date(date).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Attachment({ a }) {
  const isImg = (a.mime || '').startsWith('image/');
  if (isImg) {
    return <Image source={{ uri: a.data }} style={styles.attImg} />;
  }
  return (
    <Pressable style={styles.attFile} onPress={() => Linking.openURL(a.data)}>
      <Ionicons name="document-outline" size={16} color={colors.beige} />
      <Text style={styles.attFileText} numberOfLines={1}>{a.name || 'archivo'}</Text>
    </Pressable>
  );
}

// Bandeja del atleta: conversación con el gimnasio. Puede responder con texto
// y/o una foto (las imágenes se reducen antes de subir).
export default function MessagesScreen({ user, onBack, onReadAll }) {
  const [thread, setThread] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null); // { data, mime, name }
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  async function load() {
    try {
      const data = await api.getMyMessages();
      setThread(data);
      onReadAll?.(); // ya quedaron leídos en el server
    } catch {
      setError('No se pudieron cargar los mensajes.');
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
    }
  }

  useEffect(() => { load(); }, []);

  async function attachPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const small = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 1000 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    setPhoto({ data: `data:image/jpeg;base64,${small.base64}`, mime: 'image/jpeg', name: 'foto.jpg' });
  }

  async function send() {
    if ((!text.trim() && !photo) || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await api.sendMyMessage({
        body: text.trim(),
        attachments: photo ? [photo] : []
      });
      setThread((prev) => [...prev, created]);
      setText('');
      setPhoto(null);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View>
          <Text style={styles.title}>MENSAJES</Text>
          <Text style={styles.sub}>Chat con el gimnasio</Text>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.thread}>
        {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />}
        {!loading && thread.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={34} color={colors.textMuted} />
            <Text style={styles.emptyText}>Aún no hay mensajes. Aquí verás lo que te escriba el gimnasio.</Text>
          </View>
        )}
        {thread.map((m) => (
          <View key={m._id} style={[styles.bubble, m.fromAdmin ? styles.theirs : styles.mine]}>
            {m.fromAdmin && <Text style={styles.fromLabel}>INRAGE</Text>}
            {m.body ? <Text style={styles.bubbleText}>{m.body}</Text> : null}
            {m.attachments?.map((a, i) => <Attachment key={i} a={a} />)}
            <Text style={styles.bubbleTime}>{timeShort(m.createdAt)}</Text>
          </View>
        ))}
      </ScrollView>

      {error && <Text style={styles.error}>{error}</Text>}
      {photo && (
        <View style={styles.photoTray}>
          <Image source={{ uri: photo.data }} style={styles.photoPreview} />
          <Pressable onPress={() => setPhoto(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      )}
      <View style={styles.composer}>
        <Pressable onPress={attachPhoto} style={styles.attachBtn} hitSlop={6}>
          <Ionicons name="image-outline" size={22} color={colors.accent} />
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="Escribe un mensaje…"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
        />
        <Pressable
          onPress={send}
          disabled={(!text.trim() && !photo) || sending}
          style={[styles.send, (!text.trim() && !photo) && styles.sendDisabled]}
        >
          {sending ? <ActivityIndicator size="small" color="#05230b" /> : <Ionicons name="arrow-up" size={20} color="#05230b" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.base },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border
  },
  back: { padding: 2 },
  title: { color: colors.textPrimary, fontFamily: type.display, fontSize: 26, letterSpacing: 1.5 },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: -2 },

  thread: { padding: spacing.lg, gap: spacing.sm + 2 },
  empty: { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  bubble: { maxWidth: '82%', padding: spacing.md, borderRadius: 18, gap: 6 },
  mine: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(70,226,42,0.14)',
    borderWidth: 1, borderColor: 'rgba(70,226,42,0.4)',
    borderBottomRightRadius: 5
  },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderBottomLeftRadius: 5
  },
  fromLabel: { color: colors.accent, fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
  bubbleText: { color: colors.textPrimary, fontSize: 15, lineHeight: 21 },
  bubbleTime: { color: colors.textMuted, fontSize: 10, alignSelf: 'flex-end' },
  attImg: { width: 200, height: 200, borderRadius: radii.md, backgroundColor: colors.surfaceAlt },
  attFile: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm,
    paddingVertical: 8, paddingHorizontal: 10
  },
  attFileText: { color: colors.beige, fontSize: 13, maxWidth: 160 },

  error: { color: colors.danger, fontSize: 13, textAlign: 'center', marginBottom: spacing.sm },
  photoTray: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm
  },
  photoPreview: { width: 54, height: 54, borderRadius: radii.sm },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border
  },
  attachBtn: { padding: 8 },
  input: {
    flex: 1, color: colors.textPrimary, backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1, borderColor: colors.border, borderRadius: 20,
    paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, maxHeight: 120
  },
  send: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center'
  },
  sendDisabled: { opacity: 0.4 }
});
