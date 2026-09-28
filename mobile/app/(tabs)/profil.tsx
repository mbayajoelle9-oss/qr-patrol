import { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, Text, TextInput, View } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { API_URL } from '@/lib/config';
import { getDeviceInfo, type DeviceInfo } from '@/lib/device';
import { isTracking } from '@/lib/tracking';
import { subscribePending, syncQueue } from '@/lib/offline';
import { secure } from '@/lib/storage';
import { colors } from '@/lib/theme';
import { Btn, Card, SectionTitle, styles } from '@/components/ui';

export default function Profil() {
  const { user, logout } = useAuth();
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [tracking, setTracking] = useState(false);
  const [pending, setPending] = useState(0);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getDeviceInfo().then(setDevice);
    isTracking().then(setTracking);
    return subscribePending(setPending);
  }, []);

  async function changePassword() {
    setBusy(true);
    try {
      const r = await api<{ token: string }>('/auth/change-password', { body: { currentPassword: pw.current, newPassword: pw.next } });
      await secure.setToken(r.token);
      setPw({ current: '', next: '' });
      Alert.alert('Mot de passe', 'Votre mot de passe a été modifié.');
    } catch (e) {
      Alert.alert('Erreur', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function confirmLogout() {
    if (user?.onDuty) {
      Alert.alert('Vous êtes en service', 'Terminez votre service avant de vous déconnecter.');
      return;
    }
    Alert.alert('Déconnexion', 'Se déconnecter de QR Patrol ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnexion', style: 'destructive', onPress: () => logout() },
    ]);
  }

  const org = user?.organization;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ alignItems: 'center', marginVertical: 12 }}>
        <Image source={require('../../assets/logo-fameco.png')} style={{ width: 220, height: 73 }} resizeMode="contain" />
      </View>
      <Card>
        <Text style={styles.h1}>
          {user?.firstName} {user?.lastName}
        </Text>
        <Text style={styles.muted}>
          {user?.role === 'responder' ? 'Intervenant' : 'Agent de sécurité'} · {user?.matricule}
        </Text>
        <Text style={[styles.muted, { marginTop: 6 }]}>Société : {org?.name}</Text>
        <Text style={styles.muted}>Sites : {user?.sites?.map((s) => s.name).join(', ') || '—'}</Text>
      </Card>

      <SectionTitle>Téléphone & synchronisation</SectionTitle>
      <Card>
        <Text style={styles.muted}>Appareil : {device?.model || '—'}</Text>
        <Text style={[styles.muted, { fontSize: 11 }]}>ID : {device?.deviceId}</Text>
        <Text style={[styles.muted, { marginTop: 6 }]}>Suivi GPS de service : {tracking ? '🟢 actif' : '⚪ inactif'}</Text>
        <Text style={styles.muted}>Éléments en attente de réseau : {pending}</Text>
        <Text style={[styles.muted, { fontSize: 11, marginTop: 6 }]}>Serveur : {API_URL}</Text>
        {pending > 0 && <Btn title="Synchroniser maintenant" variant="secondary" onPress={() => syncQueue()} style={{ marginTop: 10 }} />}
      </Card>

      <SectionTitle>Changer le mot de passe</SectionTitle>
      <Card>
        <TextInput
          value={pw.current}
          onChangeText={(v) => setPw({ ...pw, current: v })}
          secureTextEntry
          placeholder="Mot de passe actuel"
          placeholderTextColor="#52525B"
          style={[styles.input, { marginBottom: 10 }]}
        />
        <TextInput
          value={pw.next}
          onChangeText={(v) => setPw({ ...pw, next: v })}
          secureTextEntry
          placeholder="Nouveau (8 caractères min.)"
          placeholderTextColor="#52525B"
          style={[styles.input, { marginBottom: 10 }]}
        />
        <Btn title="Modifier" variant="secondary" onPress={changePassword} loading={busy} disabled={!pw.current || pw.next.length < 8} />
      </Card>

      <Btn title="Se déconnecter" variant="danger" onPress={confirmLogout} style={{ marginTop: 24 }} />
      <Text style={[styles.muted, { textAlign: 'center', marginTop: 16, fontSize: 11, color: colors.muted }]}>QR Patrol · ROOKSECURITY</Text>
    </ScrollView>
  );
}
