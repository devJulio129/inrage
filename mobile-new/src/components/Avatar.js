import { View, Text, Image, StyleSheet } from 'react-native';
import { colors } from '../theme';

// Foto del miembro (base64/url) o sus iniciales sobre el verde de la marca.
export default function Avatar({ uri, name, size = 36 }) {
  const initials = (name || 'A').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={round} />;
  return (
    <View style={[round, styles.fallback]}>
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#05230b', fontWeight: '900' }
});
