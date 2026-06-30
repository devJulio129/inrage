import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl
} from 'react-native';
import { colors, spacing, radii, type, useAppTheme } from '../theme';
import { api } from '../api/client';

export default function TodayWorkoutScreen() {
  const palette = useAppTheme();
  styles = useMemo(() => createStyles(palette), [palette]);
  const [workout, setWorkout] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setError(null);
    try {
      const data = await api.getTodayWorkout();
      setWorkout(data);
    } catch (err) {
      setError(err.message);
      setWorkout(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.label}>WOD</Text>
        <Text style={styles.date}>{formatDate(new Date())}</Text>
      </View>

      {loading && (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      )}

      {error && !loading && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>No workout today</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {workout && !loading && (
        <View style={styles.card}>
          <Text style={styles.title}>{workout.title}</Text>
          <View style={styles.divider} />
          <Text style={styles.description}>{workout.description}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function formatDate(d) {
  return d
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    })
    .toUpperCase();
}

function createStyles(colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.base
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xxl
  },
  header: {
    marginBottom: spacing.xl
  },
  label: {
    color: colors.accent,
    fontFamily: type.mono,
    fontSize: 14,
    letterSpacing: 4,
    marginBottom: spacing.xs
  },
  date: {
    color: colors.textPrimary,
    fontFamily: type.mono,
    fontSize: 12,
    letterSpacing: 2,
    opacity: 0.6
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent
  },
  title: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.md
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.md
  },
  description: {
    color: colors.textPrimary,
    fontFamily: type.mono,
    fontSize: 16,
    lineHeight: 26
  },
  errorBox: {
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.sm
  },
  errorText: {
    color: colors.textMuted,
    fontFamily: type.mono,
    fontSize: 13
  }
  });
}

let styles = createStyles(colors);
