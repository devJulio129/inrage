import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { colors, spacing, radii, type } from '../theme';

function formatNotificationDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function notificationIcon(type) {
  if (type === 'payment_confirmed') return 'checkmark-circle-outline';
  if (type === 'membership_expired') return 'alert-circle-outline';
  if (String(type).includes('membership')) return 'calendar-outline';
  return 'notifications-outline';
}

export default function NotificationsScreen({ onBack, onUnreadChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [readingId, setReadingId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getNotifications();
      setItems(data.notifications || []);
      onUnreadChange?.(data.unread || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onUnreadChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(item) {
    if (item.status === 'read' || readingId) return;
    setReadingId(item._id);
    try {
      await api.markNotificationRead(item._id);
      setItems((current) => {
        const next = current.map((row) => row._id === item._id
          ? { ...row, status: 'read', readAt: new Date().toISOString() }
          : row);
        onUnreadChange?.(next.filter((row) => row.status === 'unread').length);
        return next;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setReadingId(null);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={onBack} hitSlop={8}>
          <Ionicons name="chevron-back" size={21} color={colors.textPrimary} />
          <Text style={styles.backText}>Ajustes</Text>
        </Pressable>
        <Text style={styles.title}>NOTIFICACIONES</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.accent}
          />
        }
      >
        {loading && <ActivityIndicator color={colors.accent} style={styles.loader} />}
        {error && <Text style={styles.error}>{error}</Text>}

        {!loading && items.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Sin notificaciones</Text>
            <Text style={styles.emptyText}>Los avisos del gimnasio apareceran aqui.</Text>
          </View>
        )}

        {items.map((item) => {
          const unread = item.status === 'unread';
          return (
            <Pressable
              key={item._id}
              style={[styles.item, unread && styles.itemUnread]}
              onPress={() => markRead(item)}
              disabled={readingId === item._id}
            >
              <View style={[styles.icon, unread && styles.iconUnread]}>
                <Ionicons
                  name={notificationIcon(item.type)}
                  size={20}
                  color={unread ? colors.accent : colors.textMuted}
                />
              </View>
              <View style={styles.body}>
                <View style={styles.itemHead}>
                  <Text style={[styles.itemTitle, unread && styles.itemTitleUnread]}>{item.title}</Text>
                  {unread && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.itemText}>{item.body}</Text>
                <Text style={styles.itemDate}>{formatNotificationDate(item.sentAt || item.createdAt)}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  back: { width: 92, flexDirection: 'row', alignItems: 'center' },
  backText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  title: { color: colors.textPrimary, fontFamily: type.display, fontSize: 21, letterSpacing: 1.5 },
  headerSpacer: { width: 92 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  loader: { marginTop: spacing.xl },
  error: {
    color: colors.danger,
    borderWidth: 1,
    borderColor: 'rgba(255,75,75,0.35)',
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radii.lg
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', marginTop: spacing.sm },
  emptyText: { color: colors.textMuted, fontSize: 13, marginTop: 4, textAlign: 'center' },
  item: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg
  },
  itemUnread: {
    borderColor: 'rgba(70,226,42,0.38)',
    backgroundColor: 'rgba(70,226,42,0.06)'
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt
  },
  iconUnread: { backgroundColor: 'rgba(70,226,42,0.12)' },
  body: { flex: 1 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemTitle: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  itemTitleUnread: { color: colors.accent },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  itemText: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  itemDate: { color: colors.textMuted, opacity: 0.7, fontSize: 10, marginTop: spacing.sm }
});
