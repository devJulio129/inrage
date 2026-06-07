import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import Constants from 'expo-constants';
import { colors, spacing, radii, type } from '../theme';
import { api, saveSession } from '../api/client';

// Google only shows when a real client ID string is configured.
const GOOGLE_ENABLED = typeof Constants.expoConfig?.extra?.googleClientId === 'string'
  && Constants.expoConfig.extra.googleClientId.length > 0;

export default function LoginScreen({ onAuthed, googleAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birth, setBirth] = useState(''); // DD/MM/AAAA (masked)
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const isLogin = mode === 'login';

  // Auto-format the date as the user types: 12082004 -> 12/08/2004
  function onBirthChange(text) {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setBirth(out);
  }

  // DD/MM/AAAA -> ISO YYYY-MM-DD, or null if invalid.
  function birthToISO(v) {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    if (Number.isNaN(d.getTime()) || d.getFullYear() != yyyy || d.getMonth() + 1 != Number(mm)) return null;
    return `${yyyy}-${mm}-${dd}`;
  }

  function switchMode(next) {
    setMode(next);
    setError(null);
  }

  async function submit() {
    setError(null);

    if (!email.trim() || !password) {
      setError('Escribe tu correo y contraseña');
      return;
    }

    let payload;
    if (!isLogin) {
      if (!name.trim() || !phone.trim() || !birth.trim()) {
        setError('Completa nombre, teléfono y fecha de nacimiento');
        return;
      }
      const iso = birthToISO(birth);
      if (!iso) {
        setError('Fecha de nacimiento inválida (usa DD/MM/AAAA)');
        return;
      }
      payload = { name: name.trim(), email: email.trim(), password, phone: phone.trim(), birthDate: iso };
    }

    setLoading(true);
    try {
      const data = isLogin
        ? await api.login(email.trim(), password)
        : await api.register(payload);
      await saveSession(data.token, data.user);
      onAuthed(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    // Friendly message instead of a broken OAuth (error 400) when the gym
    // hasn't configured a Google Client ID yet.
    if (!GOOGLE_ENABLED || !googleAuth?.ready) {
      setError('El acceso con Google aún no está activado por el gimnasio.');
      return;
    }
    setLoading(true);
    try {
      const user = await googleAuth.signIn();
      if (user) onAuthed(user);
    } catch (err) {
      setError(err.message || 'No se pudo iniciar con Google');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand */}
        <View style={styles.brand}>
          <Text style={styles.brandName}>INRAGE</Text>
          <View style={styles.brandLine}>
            <View style={styles.line} />
            <Text style={styles.brandSub}>CROSSFIT</Text>
            <View style={styles.line} />
          </View>
        </View>

        <View style={styles.card}>
          {/* Segmented toggle */}
          <View style={styles.segment}>
            <Pressable
              style={[styles.segBtn, isLogin && styles.segBtnActive]}
              onPress={() => switchMode('login')}
            >
              <Text style={[styles.segText, isLogin && styles.segTextActive]}>Iniciar sesión</Text>
            </Pressable>
            <Pressable
              style={[styles.segBtn, !isLogin && styles.segBtnActive]}
              onPress={() => switchMode('register')}
            >
              <Text style={[styles.segText, !isLogin && styles.segTextActive]}>Crear cuenta</Text>
            </Pressable>
          </View>

          {!isLogin && (
            <Labeled label="Nombre completo">
              <TextInput
                style={styles.input}
                placeholder="Tu nombre"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
              />
            </Labeled>
          )}

          <Labeled label="Correo electrónico">
            <TextInput
              style={styles.input}
              placeholder="correo@ejemplo.com"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Labeled>

          <Labeled label="Contraseña">
            <View style={styles.passRow}>
              <TextInput
                style={[styles.input, styles.passInput]}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                autoCapitalize="none"
              />
              <Pressable onPress={() => setShowPass((s) => !s)} hitSlop={8} style={styles.eyeBtn}>
                <Text style={styles.eyeText}>{showPass ? 'Ocultar' : 'Ver'}</Text>
              </Pressable>
            </View>
          </Labeled>

          {!isLogin && (
            <>
              <Labeled label="Teléfono">
                <TextInput
                  style={styles.input}
                  placeholder="10 dígitos"
                  placeholderTextColor={colors.textMuted}
                  value={phone}
                  onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
                  keyboardType="phone-pad"
                />
              </Labeled>

              <Labeled label="Fecha de nacimiento">
                <TextInput
                  style={styles.input}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={colors.textMuted}
                  value={birth}
                  onChangeText={onBirthChange}
                  keyboardType="number-pad"
                />
              </Labeled>
            </>
          )}

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed, loading && styles.primaryDisabled]}
            onPress={submit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#05230b" />
            ) : (
              <Text style={styles.primaryText}>{isLogin ? 'INICIAR SESIÓN' : 'CREAR CUENTA'}</Text>
            )}
          </Pressable>

          {isLogin && (
            <Pressable onPress={() => {}} hitSlop={6}>
              <Text style={styles.link}>¿Olvidaste tu contraseña?</Text>
            </Pressable>
          )}

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.or}>o</Text>
            <View style={styles.line} />
          </View>
          <Pressable style={styles.google} onPress={handleGoogle} disabled={loading}>
            <Text style={styles.googleG}>G</Text>
            <Text style={styles.googleText}>Continuar con Google</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>
          {isLogin ? '¿Aún no eres miembro? ' : '¿Ya tienes cuenta? '}
          <Text style={styles.footerLink} onPress={() => switchMode(isLogin ? 'register' : 'login')}>
            {isLogin ? 'Crea tu cuenta' : 'Inicia sesión'}
          </Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Labeled({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    paddingVertical: spacing.xxl
  },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  brandName: {
    color: colors.accent,
    fontSize: 52,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 3,
    textShadowColor: 'rgba(70,226,42,0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 22
  },
  brandLine: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.sm },
  brandSub: { color: colors.accent, fontSize: 13, letterSpacing: 8, opacity: 0.9 },

  card: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg
  },

  segment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radii.md,
    padding: 4,
    marginBottom: spacing.lg
  },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: radii.sm, alignItems: 'center' },
  segBtnActive: { backgroundColor: colors.accent },
  segText: { color: colors.textMuted, fontWeight: '700', fontSize: 14 },
  segTextActive: { color: '#05230b' },

  field: { marginBottom: spacing.md },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginLeft: 2
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 16
  },
  passRow: { flexDirection: 'row', alignItems: 'center' },
  passInput: { flex: 1, paddingRight: 70 },
  eyeBtn: { position: 'absolute', right: spacing.md, paddingVertical: 6 },
  eyeText: { color: colors.accent, fontSize: 13, fontWeight: '600' },

  errorBanner: {
    backgroundColor: 'rgba(255,75,75,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,75,75,0.4)',
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  errorText: { color: '#FF8A8A', fontSize: 13, textAlign: 'center' },

  primary: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.xs,
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 }
  },
  primaryPressed: { opacity: 0.85 },
  primaryDisabled: { opacity: 0.6 },
  primaryText: { color: '#05230b', fontWeight: '800', fontSize: 16, letterSpacing: 1.5 },

  link: { color: colors.accent, textAlign: 'center', marginTop: spacing.md, fontSize: 13, opacity: 0.9 },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { color: colors.textMuted, marginHorizontal: spacing.md, fontSize: 12 },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  googleG: { color: '#4285F4', fontWeight: '900', fontSize: 18, marginRight: spacing.sm },
  googleText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },

  footer: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl, fontSize: 14 },
  footerLink: { color: colors.accent, fontWeight: '700' }
});
