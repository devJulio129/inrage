import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, type } from '../theme';
import { api } from '../api/client';
import Avatar from './Avatar';

const LEVEL_LABELS = {
  inactive: 'Inactivo',
  starting: 'Empezando',
  consistent: 'Constante',
  strong: 'Fuerte',
  elite: 'Elite'
};

function fmtPr(pr) {
  if (!pr) return '';
  if (pr.unit === 'time') {
    const mins = Math.floor((pr.value || 0) / 60);
    const secs = Math.round((pr.value || 0) % 60);
    return `${mins}:${String(secs).padStart(2, '0')} min`;
  }
  return `${pr.value} ${pr.unit || ''}`.trim();
}

export default function PublicAthleteModal({ slug, onClose }) {
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    setLoading(true);
    setError(null);
    api.getPublicAthlete(slug)
      .then((data) => {
        if (alive) setAthlete(data.athlete);
      })
      .catch(() => {
        if (alive) setError('Este perfil no esta disponible.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [slug]);

  const consistency = athlete?.consistency;

  return (
    <Modal visible={!!slug} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.topbar}>
            <Text style={styles.kicker}>PERFIL PUBLICO</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.xl }} />
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : athlete && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.hero}>
                <Avatar uri={athlete.avatarUrl} name={athlete.name} size={72} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name}>{athlete.name}</Text>
                  {!!athlete.bio && <Text style={styles.bio}>{athlete.bio}</Text>}
                </View>
              </View>

              {consistency && (
                <View style={styles.statsGrid}>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{LEVEL_LABELS[consistency.level] || consistency.level}</Text>
                    <Text style={styles.statLabel}>Nivel</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{consistency.score}</Text>
                    <Text style={styles.statLabel}>Score</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{consistency.visitsLast30Days}</Text>
                    <Text style={styles.statLabel}>30 dias</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{consistency.currentStreak}</Text>
                    <Text style={styles.statLabel}>Racha</Text>
                  </View>
                </View>
              )}

              {athlete.badges?.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Badges</Text>
                  <View style={styles.badgeRow}>
                    {athlete.badges.map((badge) => (
                      <Text key={badge.id} style={styles.badge}>{badge.label}</Text>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>PRs destacados</Text>
                {athlete.featuredPrs?.length ? athlete.featuredPrs.map((pr) => (
                  <View key={pr.id || pr.movement} style={styles.prRow}>
                    <Text style={styles.prName}>{pr.movement || pr.name}</Text>
                    <Text style={styles.prValue}>{fmtPr(pr)}</Text>
                  </View>
                )) : (
                  <Text style={styles.empty}>Sin PRs publicos destacados.</Text>
                )}
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderColor: 'rgba(70,226,42,0.32)'
  },
  sheetHandle: {
    width: 42, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md
  },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  hero: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginTop: spacing.md },
  name: { color: colors.textPrimary, fontFamily: type.display, fontSize: 34, letterSpacing: 1 },
  bio: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  stat: {
    width: '48%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md
  },
  statValue: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', marginTop: 4 },
  section: { marginTop: spacing.lg },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '900', marginBottom: spacing.sm },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.35)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '800'
  },
  prRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  prName: { color: colors.textPrimary, fontSize: 14, flex: 1 },
  prValue: { color: colors.accent, fontSize: 14, fontWeight: '900' },
  empty: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, textAlign: 'center', marginVertical: spacing.xl }
});
