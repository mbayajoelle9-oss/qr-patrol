import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api, uploadMedia } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { API_URL } from '@/lib/config';
import { getDeviceInfo, type DeviceInfo } from '@/lib/device';
import { isTracking } from '@/lib/tracking';
import { subscribePending, syncQueue } from '@/lib/offline';
import { secure } from '@/lib/storage';
import { colors } from '@/lib/theme';
import { Btn, Card, SectionTitle, styles } from '@/components/ui';

export default function Profil() {
  const { user, logout, refresh } = useAuth();
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [tracking, setTracking] = useState(false);
  const [pending, setPending] = useState(0);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    getDeviceInfo().then(setDevice);
    isTracking().then(setTracking);
    return subscribePending(setPending);
  }, []);

  async function changePhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsEditing: true, aspect: [1, 1] });
    if (picked.canceled || !picked.assets?.[0]) return;
    setPhotoBusy(true);
    try {
      const a = picked.assets[0];
      const mediaId = await uploadMedia(a.uri, a.mimeType || 'image/jpeg', 'avatar');
      await api('/auth/photo', { body: { photo: mediaId } });
      await refresh();
    } catch (e) {
      Alert.alert('Photo', (e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }

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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={changePhoto} disabled={photoBusy}>
            {user?.photo?.url ? (
              <Image source={{ uri: user.photo.url }} style={{ width: 64, height: 64, borderRadius: 32 }} />
            ) : (
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: colors.panel,
                  borderWidth: 1,
                  borderColor: colors.line,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 22, fontWeight: '900', color: colors.brand }}>
                  {(user?.firstName?.[0] || '') + (user?.lastName?.[0] || '')}
                </Text>
              </View>
            )}
            <Text style={{ color: colors.brand, fontSize: 11, fontWeight: '700', marginTop: 6, textAlign: 'center' }}>
              {photoBusy ? '...' : user?.photo ? 'Changer' : '+ Photo'}
            </Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>
              {user?.firstName} {user?.lastName}
            </Text>
            <Text style={styles.muted}>
              {user?.role === 'responder' ? 'Intervenant' : 'Rondier'} · {user?.matricule}
            </Text>
          </View>
        </View>
        <Text style={[styles.muted, { marginTop: 10 }]}>Société : {org?.name}</Text>
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
