import { useEffect, useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { useFonts } from 'expo-font';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import LoginScreen from './src/screens/LoginScreen';
import MainApp from './src/screens/MainApp';
import { useGoogleAuth } from './src/auth/useGoogleAuth';
import { getToken, getStoredUser, clearSession, saveSession } from './src/api/client';
import { colors } from './src/theme';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const googleAuth = useGoogleAuth(setUser);
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });

  // Restore an existing session on launch.
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) setUser(await getStoredUser());
      setBooting(false);
    })();
  }, []);

  async function handleLogout() {
    await clearSession();
    setUser(null);
  }

  // Keep the stored user in sync when the profile/status refreshes.
  async function handleUserUpdate(fresh) {
    setUser(fresh);
    const token = await getToken();
    if (token) await saveSession(token, fresh);
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style="light" />
        {booting || !fontsLoaded ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : user ? (
          <MainApp user={user} onUserUpdate={handleUserUpdate} onLogout={handleLogout} />
        ) : (
          <LoginScreen onAuthed={setUser} googleAuth={googleAuth} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.base },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' }
});
