import { useRef, useState } from 'react';
import { Alert, Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { api, NetworkError } from '@/lib/api';
import { getQuickLocation } from '@/lib/location';
import { enqueue } from '@/lib/offline';
import { uuid } from '@/lib/device';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

const HOLD_MS = 1800;

/**
 * Bouton SOS : maintenir appuyé ~2 secondes (évite les déclenchements accidentels).
 * Envoie immédiatement la position à la centrale ; hors-ligne, l'alerte est mise
 * en file et l'agent peut appeler directement la centrale.
 */
export function SosButton({ compact }: { compact?: boolean }) {
  const { user } = useAuth();
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sending, setSending] = useState(false);

  function start() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, useNativeDriver: false }).start();
    timer.current = setTimeout(trigger, HOLD_MS);
  }
  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  }

  async function trigger() {
    timer.current = null;
    setSending(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    const clientId = uuid();
    const location = await getQuickLocation();
    const payload = { location, clientId };
    try {
      await api('/incidents/sos', { body: payload, timeoutMs: 12000 });
      Alert.alert('🚨 SOS envoyé', 'La centrale a reçu votre alerte et votre position. Restez en sécurité.');
    } catch (e) {
      if (e instanceof NetworkError) {
        await enqueue({ id: clientId, kind: 'sos', payload, createdAt: new Date().toISOString(), attempts: 0 });
        const phone = (user?.organization as { contactPhone?: string } | null)?.contactPhone;
        Alert.alert(
          'Pas de réseau',
          'L’alerte sera envoyée dès le retour du réseau. Appelez la centrale si possible.',
          phone ? [{ text: 'Appeler la centrale', onPress: () => Linking.openURL(`tel:${phone}`) }, { text: 'OK' }] : [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Erreur', (e as Error).message);
      }
    } finally {
      setSending(false);
      progress.setValue(0);
    }
  }

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <Pressable onPressIn={start} onPressOut={cancel} disabled={sending} style={[s.btn, compact && s.compact]}>
      <Animated.View style={[s.fill, { width }]} />
      <View style={s.content}>
        <Text style={[s.title, compact && { fontSize: 16 }]}>{sending ? 'ENVOI…' : '🆘  SOS'}</Text>
        {!compact && <Text style={s.hint}>Maintenir appuyé pour alerter la centrale</Text>}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    backgroundColor: colors.brand,
    borderRadius: 18,
    overflow: 'hidden',
    minHeight: 76,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff33',
  },
  compact: { minHeight: 48, borderRadius: 12 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.brandDark },
  content: { alignItems: 'center' },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  hint: { color: '#ffffffcc', fontSize: 12, marginTop: 2 },
});
