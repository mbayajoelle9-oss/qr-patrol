import '@/lib/tracking'; // enregistre la tâche de suivi GPS en arrière-plan
import { useEffect } from 'react';
import Constants from 'expo-constants';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { startAutoSync } from '@/lib/offline';
import { colors } from '@/lib/theme';

function Gate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inLogin = segments[0] === 'login';
    if (!user && !inLogin) router.replace('/login');
    else if (user && inLogin) router.replace('/');
  }, [user, loading, segments, router]);

  useEffect(() => startAutoSync(), []);

  // Ouvrir l'écran concerné quand on touche une notification.
  // Les notifications push distantes ne sont plus supportées dans Expo Go (SDK 53+) :
  // on ne charge/écoute le module que dans un vrai build (APK), jamais dans Expo Go.
  useEffect(() => {
    if (Constants.appOwnership === 'expo') return; // tourne dans Expo Go : on saute
    let sub: { remove: () => void } | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Notifications = require('expo-notifications');
      sub = Notifications.addNotificationResponseReceivedListener((resp: any) => {
        const data = resp.notification.request.content.data as { type?: string; incidentId?: string };
        if (data?.type === 'intervention') router.push('/interventions');
        else if (data?.type === 'incident' && data.incidentId) router.push(`/incident/${data.incidentId}`);
        else if (data?.type === 'patrol' || data?.type === 'patrol_late') router.push('/');
      });
    } catch {
      // ignore : notifications indisponibles dans cet environnement
    }
    return () => sub?.remove();
  }, [router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#000' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="incident/new" options={{ title: 'Déclarer un incident', presentation: 'modal' }} />
      <Stack.Screen name="incident/[id]" options={{ title: 'Incident' }} />
      <Stack.Screen name="interventions" options={{ title: 'Mes interventions' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
