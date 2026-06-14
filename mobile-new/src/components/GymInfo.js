import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, type } from '../theme';

const FALLBACK = {
  schedule: [
    { day: 'Lunes – Viernes', hours: '06:00 – 22:00' },
    { day: 'Sábado', hours: '08:00 – 14:00' },
    { day: 'Domingo', hours: 'Cerrado' }
  ],
  address: 'Av. Principal 123, Centro',
  phone: '833 000 0000',
  instagram: '@inrage.crossfit'
};

function instagramUrl(handle) {
  const h = String(handle || '').trim();
  if (!h) return null;
  if (/^https?:\/\//i.test(h)) return h;
  return `https://instagram.com/${h.replace(/^@/, '')}`;
}

// Fila de contacto: ícono en círculo + etiqueta + valor; tocable cuando aplica.
function ContactRow({ icon, label, value, onPress }) {
  if (!value) return null;
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper style={styles.contactRow} onPress={onPress} hitSlop={6}>
      <View style={styles.contactIcon}>
        <Ionicons name={icon} size={17} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.contactLabel}>{label}</Text>
        <Text style={styles.contactValue}>{value}</Text>
      </View>
      {onPress && <Ionicons name="open-outline" size={16} color={colors.textMuted} />}
    </Wrapper>
  );
}

// Información del gimnasio (la edita el admin). Horarios + contacto tocable.
export default function GymInfo({ info }) {
  const data = info || FALLBACK;
  const schedule = data.schedule?.length ? data.schedule : FALLBACK.schedule;
  const ig = instagramUrl(data.instagram);
  const tel = (data.phone || '').replace(/[^\d+]/g, '');
  const maps = data.address ? `https://maps.google.com/?q=${encodeURIComponent(data.address)}` : null;

  return (
    <View style={{ marginTop: spacing.md }}>
      <View style={styles.sectionRow}>
        <View style={styles.sectionAccent} />
        <Text style={styles.section}>INFORMACIÓN DEL GIMNASIO</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Horarios</Text>
        {schedule.map((s, i) => (
          <View key={i} style={[styles.row, i === schedule.length - 1 && styles.rowLast]}>
            <Text style={styles.day}>{s.day}</Text>
            <Text style={styles.hours}>{s.hours}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Contacto</Text>
        <ContactRow icon="location-outline" label="Dirección" value={data.address}
          onPress={maps ? () => Linking.openURL(maps) : null} />
        <ContactRow icon="call-outline" label="Teléfono" value={data.phone}
          onPress={tel ? () => Linking.openURL(`tel:${tel}`) : null} />
        <ContactRow icon="logo-instagram" label="Instagram" value={data.instagram}
          onPress={ig ? () => Linking.openURL(ig) : null} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  sectionAccent: { width: 4, height: 18, borderRadius: 2, backgroundColor: colors.accent },
  section: { color: colors.textPrimary, fontFamily: type.display, fontSize: 22, letterSpacing: 1.5 },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md
  },
  cardTitle: {
    color: colors.textMuted, fontSize: 11, fontWeight: '800',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: spacing.md
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  rowLast: { borderBottomWidth: 0 },
  day: { color: colors.textMuted, fontSize: 14 },
  hours: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },

  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10
  },
  contactIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(70,226,42,0.12)',
    alignItems: 'center', justifyContent: 'center'
  },
  contactLabel: { color: colors.textMuted, fontSize: 11, letterSpacing: 0.5 },
  contactValue: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', marginTop: 1 }
});
