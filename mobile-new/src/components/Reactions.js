import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { colors, spacing, radii, type } from '../theme';
import { api } from '../api/client';

// Las 7 reacciones de InRage. El emoji es grande y siempre va con su nombre
// para que se entienda qué significa cada una.
export const REACTIONS = [
  { type: 'power', emoji: '⚡', label: 'Con todo' },
  { type: 'goal', emoji: '🎯', label: 'Meta cumplida' },
  { type: 'train', emoji: '🏋️', label: 'A entrenar' },
  { type: 'pain', emoji: '🥵', label: 'Qué dolor' },
  { type: 'tempt', emoji: '🍫', label: 'Caí en la tentación' },
  { type: 'rain', emoji: '🌧️', label: 'Hoy no se pudo' },
  { type: 'doubt', emoji: '🤨', label: 'Dudo de eso' }
];

const BY_TYPE = Object.fromEntries(REACTIONS.map((r) => [r.type, r]));

// Reacciones de un elemento (post / comentario / WOD). Se carga sola su
// resumen; al tocar abre un selector con los 7 emojis grandes y sus nombres.
export default function Reactions({ targetType, targetId, initial = null, compact = false }) {
  const [summary, setSummary] = useState(initial); // { counts, total, mine }
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial) return;
    let alive = true;
    api.reactSummary(targetType, [targetId])
      .then((map) => { if (alive) setSummary(map[targetId] || { counts: {}, total: 0, mine: null }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [targetId]);

  async function toggle(rt) {
    setPicker(false);
    if (busy) return;
    setBusy(true);
    try {
      setSummary(await api.react(targetType, targetId, rt));
    } catch {} finally {
      setBusy(false);
    }
  }

  const counts = summary?.counts || {};
  const mine = summary?.mine || null;
  // Tipos presentes, ordenados por el orden canónico de REACTIONS.
  const present = REACTIONS.filter((r) => counts[r.type] > 0);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => setPicker(true)}
        style={[styles.addBtn, mine && styles.addBtnActive]}
        hitSlop={6}
      >
        {mine ? (
          <Text style={styles.addBtnEmoji}>{BY_TYPE[mine]?.emoji}</Text>
        ) : (
          <Text style={styles.addBtnPlus}>☺﹢</Text>
        )}
      </Pressable>

      {present.map((r) => (
        <Pressable
          key={r.type}
          onPress={() => toggle(r.type)}
          style={[styles.chip, mine === r.type && styles.chipMine]}
          hitSlop={4}
        >
          <Text style={styles.chipEmoji}>{r.emoji}</Text>
          <Text style={[styles.chipCount, mine === r.type && styles.chipCountMine]}>{counts[r.type]}</Text>
        </Pressable>
      ))}

      <Modal visible={picker} transparent animationType="fade" onRequestClose={() => setPicker(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>¿Cómo te late?</Text>
            <View style={styles.grid}>
              {REACTIONS.map((r) => (
                <Pressable
                  key={r.type}
                  onPress={() => toggle(r.type)}
                  style={[styles.option, mine === r.type && styles.optionMine]}
                >
                  <Text style={styles.optionEmoji}>{r.emoji}</Text>
                  <Text style={styles.optionLabel}>{r.label}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  addBtn: {
    width: 34, height: 30, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center', justifyContent: 'center'
  },
  addBtnActive: { borderColor: 'rgba(70,226,42,0.5)', backgroundColor: 'rgba(70,226,42,0.12)' },
  addBtnPlus: { color: colors.textMuted, fontSize: 13 },
  addBtnEmoji: { fontSize: 17 },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 16, paddingHorizontal: 9, paddingVertical: 5,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border
  },
  chipMine: { borderColor: 'rgba(70,226,42,0.5)', backgroundColor: 'rgba(70,226,42,0.12)' },
  chipEmoji: { fontSize: 16 },
  chipCount: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
  chipCountMine: { color: colors.accent },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: spacing.lg, paddingBottom: spacing.xl,
    borderTopWidth: 1, borderColor: 'rgba(70,226,42,0.3)'
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md
  },
  sheetTitle: {
    color: colors.textPrimary, fontFamily: type.display, fontSize: 24,
    letterSpacing: 1, marginBottom: spacing.md, textAlign: 'center'
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  option: {
    width: '30%', alignItems: 'center',
    paddingVertical: spacing.md, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt
  },
  optionMine: { borderColor: colors.accent, backgroundColor: 'rgba(70,226,42,0.12)' },
  optionEmoji: { fontSize: 34 },
  optionLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: '700', marginTop: 6, textAlign: 'center' }
});
