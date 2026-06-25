import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, type } from '../theme';

export function extractQrToken(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return typeof parsed.token === 'string' && parsed.token.trim() ? parsed.token.trim() : null;
    }
  } catch {
    // Not JSON: treat it as the token itself.
  }

  return value;
}

function friendlyQrError(message) {
  const text = String(message || '').toLowerCase();
  if (text.includes('expir')) return 'Este QR ya expiro. Escanea el nuevo codigo.';
  if (text.includes('inval')) return 'QR invalido.';
  if (text.includes('no tienes reserva')) return 'No tienes reserva para esta clase.';
  if (text.includes('cancel')) return 'Tu reserva esta cancelada.';
  if (text.includes('lista de espera') || text.includes('waitlist')) return 'Estas en lista de espera.';
  if (text.includes('ya hiciste') || text.includes('already')) return 'Ya hiciste check-in.';
  return 'No pudimos confirmar tu check-in. Intenta de nuevo.';
}

export default function QrCheckInScanner({ visible, onClose, onSubmit }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const scanLock = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setScanned(false);
    setSubmitting(false);
    setResult(null);
    setError(null);
    scanLock.current = false;
  }, [visible]);

  async function handleScan({ data }) {
    if (scanLock.current || scanned || submitting || result) return;
    scanLock.current = true;
    setScanned(true);
    setSubmitting(true);
    setError(null);

    const token = extractQrToken(data);
    if (!token) {
      setSubmitting(false);
      setError('QR invalido.');
      return;
    }

    try {
      const response = await onSubmit(token);
      setResult(response);
    } catch (err) {
      setError(friendlyQrError(err.message));
      setScanned(true);
    } finally {
      setSubmitting(false);
    }
  }

  function retry() {
    setScanned(false);
    setSubmitting(false);
    setResult(null);
    setError(null);
    scanLock.current = false;
  }

  const hasPermission = permission?.granted;
  const denied = permission && !permission.granted && permission.canAskAgain === false;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>CHECK-IN</Text>
            <Text style={styles.title}>Escanear QR</Text>
          </View>
        </View>

        {!permission ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.muted}>Revisando permiso de camara...</Text>
          </View>
        ) : !hasPermission ? (
          <View style={styles.center}>
            <View style={styles.permissionIcon}>
              <Ionicons name="camera-outline" size={32} color={colors.accent} />
            </View>
            <Text style={styles.permissionTitle}>Permiso de camara</Text>
            <Text style={styles.muted}>
              Necesitamos la camara para escanear el QR que muestra el box.
            </Text>
            {denied ? (
              <Text style={styles.error}>Activa el permiso de camara desde ajustes del telefono.</Text>
            ) : (
              <Pressable style={styles.primaryBtn} onPress={requestPermission}>
                <Text style={styles.primaryText}>PERMITIR CAMARA</Text>
              </Pressable>
            )}
            <Pressable style={styles.secondaryBtn} onPress={onClose}>
              <Text style={styles.secondaryText}>Volver</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.scannerWrap}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanned || submitting || result ? undefined : handleScan}
            >
              <View style={styles.overlay}>
                <View style={styles.scanBox}>
                  <View style={[styles.corner, styles.cornerTl]} />
                  <View style={[styles.corner, styles.cornerTr]} />
                  <View style={[styles.corner, styles.cornerBl]} />
                  <View style={[styles.corner, styles.cornerBr]} />
                </View>
              </View>
            </CameraView>

            <View style={styles.sheet}>
              {submitting ? (
                <>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.sheetTitle}>Confirmando check-in...</Text>
                  <Text style={styles.muted}>No cierres esta pantalla.</Text>
                </>
              ) : result ? (
                <>
                  <Ionicons name="checkmark-circle" size={42} color={colors.accent} />
                  <Text style={styles.sheetTitle}>Check-in confirmado</Text>
                  <Text style={styles.muted}>
                    {result.alreadyCheckedIn ? 'Ya estabas registrado en esta clase.' : 'Listo, tu asistencia quedo registrada.'}
                  </Text>
                  <Pressable style={styles.primaryBtn} onPress={onClose}>
                    <Text style={styles.primaryText}>LISTO</Text>
                  </Pressable>
                </>
              ) : error ? (
                <>
                  <Ionicons name="alert-circle-outline" size={42} color={colors.danger} />
                  <Text style={styles.sheetTitle}>No se pudo confirmar</Text>
                  <Text style={styles.error}>{error}</Text>
                  <View style={styles.row}>
                    <Pressable style={[styles.secondaryBtn, styles.rowBtn]} onPress={onClose}>
                      <Text style={styles.secondaryText}>Volver</Text>
                    </Pressable>
                    <Pressable style={[styles.primaryBtn, styles.rowBtn]} onPress={retry}>
                      <Text style={styles.primaryText}>INTENTAR DE NUEVO</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.sheetTitle}>Apunta al QR del box</Text>
                  <Text style={styles.muted}>El codigo cambia rapido, usa el que este visible en pantalla.</Text>
                </>
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  kicker: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.textPrimary, fontFamily: type.display, fontSize: 34, letterSpacing: 1.2 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md
  },
  permissionIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong
  },
  permissionTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  scannerWrap: { flex: 1 },
  camera: { flex: 1 },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)'
  },
  scanBox: {
    width: 250,
    height: 250,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)'
  },
  corner: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderColor: colors.accent
  },
  cornerTl: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: radii.md },
  cornerTr: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: radii.md },
  cornerBl: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: radii.md },
  cornerBr: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: radii.md },
  sheet: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm
  },
  sheetTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm
  },
  primaryText: { color: '#05230b', fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm
  },
  secondaryText: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
  row: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  rowBtn: { flex: 1 }
});
