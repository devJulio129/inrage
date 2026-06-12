import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme';
import HomeScreen from './HomeScreen';
import ProfileScreen from './ProfileScreen';

const TABS = [
  { key: 'home', label: 'Inicio', icon: 'barbell-outline', iconActive: 'barbell' },
  { key: 'profile', label: 'Perfil', icon: 'person-outline', iconActive: 'person' }
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
              <View style={[styles.tabPill, active && styles.tabPillActive]}>
                <Ionicons
                  name={active ? t.iconActive : t.icon}
                  size={20}
                  color={active ? colors.accent : colors.textMuted}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
              </View>
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
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md
  },
  tab: { flex: 1, alignItems: 'center' },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 22
  },
  tabPillActive: { backgroundColor: 'rgba(70,226,42,0.12)' },
  tabLabel: { fontSize: 12, color: colors.textMuted, letterSpacing: 0.5, fontWeight: '600' },
  tabLabelActive: { color: colors.accent, fontWeight: '800' }
});
