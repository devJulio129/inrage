export default {
  expo: {
    name: 'InRage',
    slug: 'inrage',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    backgroundColor: '#0D0D0D',
    splash: {
      backgroundColor: '#0D0D0D',
      resizeMode: 'contain'
    },
    ios: { supportsTablet: false },
    android: {
      adaptiveIcon: { backgroundColor: '#0D0D0D' }
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000'
    }
  }
};
