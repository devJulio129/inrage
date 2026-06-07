import { View, Text, StyleSheet } from 'react-native';
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

// General gym information — managed by the admin, read here.
// Receives `info` from the parent; falls back to defaults while it loads.
export default function GymInfo({ info }) {
  const data = info || FALLBACK;
  const schedule = data.schedule?.length ? data.schedule : FALLBACK.schedule;

  return (
    <View>
      <Text style={styles.section}>INFORMACIÓN DEL GIMNASIO</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Horarios</Text>
        {schedule.map((s, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.day}>{s.day}</Text>
            <Text style={styles.hours}>{s.hours}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Contacto</Text>
        <InfoRow label="Dirección" value={data.address} />
        <InfoRow label="Teléfono" value={data.phone} />
        <InfoRow label="Instagram" value={data.instagram} />
      </View>
    </View>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.day}>{label}</Text>
      <Text style={styles.hours}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    color: colors.accent,
    fontFamily: type.mono,
    fontSize: 13,
    letterSpacing: 3,
    marginBottom: spacing.md
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.md
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  day: { color: colors.textMuted, fontSize: 14 },
  hours: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' }
});
