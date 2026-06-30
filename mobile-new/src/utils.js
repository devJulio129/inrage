import { Alert, Platform } from 'react-native';

// "hace 5 min" — tiempo relativo legible. Math.max evita "hace -2 min" si el
// reloj del server va adelantado respecto al teléfono.
export function timeAgo(date) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60_000));
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

// Confirm multiplataforma (Alert.alert no hace nada en react-native-web).
export function confirmAsync(title, msg, action = 'Eliminar', cancelLabel = 'Cancelar') {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n${msg}`));
  }
  return new Promise((resolve) =>
    Alert.alert(title, msg, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) }
    ])
  );
}

export function youtubeId(url) {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}
