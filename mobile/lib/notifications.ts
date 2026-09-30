import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

// Les notifications push distantes ne sont plus supportées dans Expo Go depuis le SDK 53 :
// le module `expo-notifications` lève une erreur dès son chargement dans cet environnement.
// On ne le charge donc jamais statiquement, uniquement à l'exécution, et seulement hors Expo Go.
function loadNotifications(): typeof import('expo-notifications') | null {
  if (Constants.appOwnership === 'expo') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-notifications');
  } catch {
    return null;
  }
}

const Notifications = loadNotifications();

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Demande l'autorisation et retourne le jeton Expo Push (ou null). */
export async function registerForPush(): Promise<string | null> {
  if (!Notifications) return null; // Expo Go, ou module indisponible
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('alerts', {
        name: 'Alertes de sécurité',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400],
        lightColor: '#E92026',
        sound: 'default',
      });
    }
    if (!Device.isDevice) return null;
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    if (!projectId) return null; // configurer via `eas init`
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
    return null;
  }
}
