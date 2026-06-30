import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

function projectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    null
  );
}

export async function registerForPushNotificationsAsync() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'InRage',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#46E22A'
      });
    }

    const current = await Notifications.getPermissionsAsync();
    let finalStatus = current.status;
    if (finalStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }

    if (finalStatus !== 'granted') {
      return {
        status: 'denied',
        token: null,
        platform: Platform.OS,
        message: 'Permiso denegado'
      };
    }

    const id = projectId();
    const tokenResult = await Notifications.getExpoPushTokenAsync(id ? { projectId: id } : {});
    return {
      status: 'granted',
      token: tokenResult.data,
      platform: Platform.OS,
      deviceName: Constants.deviceName || ''
    };
  } catch (err) {
    return {
      status: 'error',
      token: null,
      platform: Platform.OS,
      message: 'No pudimos activar notificaciones. Intenta de nuevo.'
    };
  }
}

export function addNotificationTapListener(handler) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data || {};
    handler?.(data);
  });
}
