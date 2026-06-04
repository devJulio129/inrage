import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';
import HomeScreen from './HomeScreen';
import ProfileScreen from './ProfileScreen';

const TABS = [
  { key: 'home', label: 'Inicio', glyph: '⌂' },
  { key: 'profile', label: 'Perfil', glyph: '◍' }
];

export default function MainApp({ user, onUserUpdate, onLogout }) {
  const [tab, setTab] = useState('home');

  return (
    <View style={styles.container}>
      <View style={styles.screen}>
        {tab === 'home' ? (
          <HomeScreen user={user} onUserUpdate={onUserUpdate} />
        ) : (
          <ProfileScreen user={user} onLogout={onLogout} />
        )}
      </View>

      <View style={styles.tabbar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
              <Text style={[styles.glyph, active && styles.glyphActive]}>{t.glyph}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.base },
  screen: { flex: 1 },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  glyph: { fontSize: 22, color: colors.textMuted, lineHeight: 26 },
  glyphActive: { color: colors.accent, textShadowColor: colors.accent, textShadowRadius: 12 },
  tabLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2, letterSpacing: 0.5 },
  tabLabelActive: { color: colors.accent, fontWeight: '700' }
});
