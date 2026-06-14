import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii } from '../theme';
import { api } from '../api/client';
import { timeAgo, confirmAsync } from '../utils';
import Avatar from './Avatar';
import Reactions from './Reactions';

// Hilo de comentarios con un nivel de respuestas, reacciones por comentario y
// composer. Sirve para WODs y publicaciones (targetType).
export default function CommentsThread({ targetType, targetId, user }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // comentario raíz al que respondo

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await api.getComments(targetType, targetId);
        if (alive) setComments(list);
      } catch {
        if (alive) setError('No se pudieron cargar los comentarios.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [targetId]);

  async function send() {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await api.addComment(targetType, targetId, value, replyTo?._id || null);
      setComments((prev) => [...prev, created]);
      setText('');
      setReplyTo(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function remove(comment) {
    const ok = await confirmAsync('Eliminar comentario', '¿Seguro que quieres borrarlo?');
    if (!ok) return;
    try {
      await api.deleteComment(comment._id);
      // Quita el comentario y sus respuestas.
      setComments((prev) => prev.filter((c) => c._id !== comment._id && c.parentId !== comment._id));
    } catch (err) {
      setError(err.message);
    }
  }

  const roots = comments.filter((c) => !c.parentId);
  const repliesOf = (id) => comments.filter((c) => String(c.parentId) === String(id));

  function CommentRow({ c, isReply }) {
    const own = String(c.member?._id) === String(user?._id);
    return (
      <View style={[styles.row, isReply && styles.replyRow]}>
        <Avatar uri={c.member?.avatar} name={c.member?.name} size={isReply ? 28 : 34} />
        <View style={{ flex: 1 }}>
          <View style={styles.meta}>
            <Text style={styles.name}>{c.member?.name || 'Atleta'}</Text>
            <Text style={styles.time}>{timeAgo(c.createdAt)}</Text>
          </View>
          <Text style={styles.text}>{c.text}</Text>
          <View style={styles.actions}>
            <Reactions targetType="comment" targetId={c._id} />
            {!isReply && (
              <Pressable onPress={() => { setReplyTo(c); setText(''); }} hitSlop={6}>
                <Text style={styles.replyBtn}>Responder</Text>
              </Pressable>
            )}
          </View>
        </View>
        {(own || isAdmin) && (
          <Pressable onPress={() => remove(c)} hitSlop={8} style={styles.delete}>
            <Ionicons name="trash-outline" size={15} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.accent} />
        <Text style={styles.title}>COMENTARIOS</Text>
        {comments.length > 0 && <Text style={styles.count}>{comments.length}</Text>}
      </View>

      {loading && <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.md }} />}
      {!loading && comments.length === 0 && (
        <Text style={styles.empty}>Sé el primero en comentar 💬</Text>
      )}

      {roots.map((c) => (
        <View key={c._id}>
          <CommentRow c={c} isReply={false} />
          {repliesOf(c._id).map((r) => <CommentRow key={r._id} c={r} isReply />)}
        </View>
      ))}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.composerWrap}>
        {replyTo && (
          <View style={styles.replyingTo}>
            <Text style={styles.replyingToText} numberOfLines={1}>
              Respondiendo a {replyTo.member?.name || 'Atleta'}
            </Text>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        )}
        <View style={styles.composer}>
          <Avatar uri={user?.avatar} name={user?.name} size={32} />
          <TextInput
            style={styles.input}
            placeholder={replyTo ? 'Escribe tu respuesta…' : 'Comenta…'}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            maxLength={500}
            multiline
          />
          <Pressable
            onPress={send}
            disabled={!text.trim() || sending}
            style={[styles.send, (!text.trim() || sending) && styles.sendDisabled]}
          >
            {sending
              ? <ActivityIndicator size="small" color="#05230b" />
              : <Ionicons name="arrow-up" size={18} color="#05230b" />}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: spacing.sm },
  title: { color: colors.accent, fontSize: 11, letterSpacing: 2, fontWeight: '800' },
  count: {
    color: colors.accent, backgroundColor: 'rgba(70,226,42,0.12)',
    fontSize: 11, fontWeight: '800', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 1, overflow: 'hidden'
  },
  empty: { color: colors.textMuted, fontSize: 13, paddingVertical: spacing.sm },

  row: { flexDirection: 'row', gap: spacing.sm + 2, paddingVertical: spacing.sm + 2 },
  replyRow: { marginLeft: spacing.xl, paddingVertical: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  name: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  time: { color: colors.textMuted, fontSize: 11 },
  text: { color: colors.textPrimary, fontSize: 14, lineHeight: 20, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  replyBtn: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: spacing.sm },
  delete: { paddingTop: 4 },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.xs },

  composerWrap: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  replyingTo: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(70,226,42,0.08)', borderRadius: radii.sm,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 6, marginBottom: spacing.sm
  },
  replyingToText: { color: colors.accent, fontSize: 12, fontWeight: '700', flex: 1 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1, color: colors.textPrimary, backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1, borderColor: colors.border, borderRadius: 18,
    paddingHorizontal: spacing.md, paddingVertical: 9, fontSize: 14, maxHeight: 110
  },
  send: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center'
  },
  sendDisabled: { opacity: 0.4 }
});
