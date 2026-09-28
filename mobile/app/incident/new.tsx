import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, NetworkError, uploadMedia } from '@/lib/api';
import { uuid } from '@/lib/device';
import { getQuickLocation } from '@/lib/location';
import { enqueue } from '@/lib/offline';
import { bus } from '@/lib/events';
import { colors, INCIDENT_TYPES, SEVERITIES } from '@/lib/theme';
import type { CapturedLocation } from '@/lib/types';
import { Btn, styles } from '@/components/ui';

interface LocalMedia {
  uri: string;
  mimeType: string;
  kind: 'photo' | 'video';
}

export default function NewIncident() {
  const router = useRouter();
  const { checkpointId } = useLocalSearchParams<{ checkpointId?: string }>();
  const [type, setType] = useState<string>('intrusion');
  const [severity, setSeverity] = useState<string>('medium');
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<LocalMedia[]>([]);
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [locating, setLocating] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    getQuickLocation()
      .then(setLocation)
      .finally(() => setLocating(false));
  }, []);

  async function capture(kind: 'photo' | 'video', fromLibrary = false) {
    const perm = fromLibrary ? await ImagePicker.requestMediaLibraryPermissionsAsync() : await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Autorisation requise', 'Autorisez l’accès dans les réglages du téléphone.');
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: kind === 'video' ? ['videos'] : ['images'],
      quality: 0.6,
      videoMaxDuration: 30,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      allowsMultipleSelection: fromLibrary,
      selectionLimit: 5,
    };
    const r = fromLibrary ? await ImagePicker.launchImageLibraryAsync(opts) : await ImagePicker.launchCameraAsync(opts);
    if (r.canceled) return;
    const added = r.assets.map((a) => ({
      uri: a.uri,
      mimeType: a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      kind: (a.type === 'video' ? 'video' : 'photo') as 'photo' | 'video',
    }));
    setMedia((m) => [...m, ...added].slice(0, 8));
  }

  async function submit() {
    setBusy(true);
    const clientId = uuid();
    const payload = {
      type,
      severity,
      description: description || undefined,
      checkpointId: checkpointId || undefined,
      location: location || undefined,
      clientId,
    };
    try {
      const mediaIds: string[] = [];
      for (let i = 0; i < media.length; i += 1) {
        setProgress(`Envoi des médias ${i + 1}/${media.length}…`);
        // eslint-disable-next-line no-await-in-loop
        mediaIds.push(await uploadMedia(media[i].uri, media[i].mimeType, 'incident'));
      }
      setProgress('Envoi du rapport…');
      const r = await api<{ incident: { id: string; reference: string } }>('/incidents', { body: { ...payload, mediaIds } });
      bus.emit('incident:created');
      Alert.alert('Incident transmis', `La centrale a reçu l’incident ${r.incident.reference}.`, [
        { text: 'OK', onPress: () => router.replace(`/incident/${r.incident.id}`) },
      ]);
    } catch (e) {
      if (e instanceof NetworkError) {
        await enqueue({ id: clientId, kind: 'incident', payload, media: media.map((m) => ({ uri: m.uri, mimeType: m.mimeType })), createdAt: new Date().toISOString(), attempts: 0 });
        Alert.alert('Enregistré hors-ligne', 'L’incident sera transmis automatiquement dès le retour du réseau.', [{ text: 'OK', onPress: () => router.back() }]);
      } else {
        Alert.alert('Erreur', (e as Error).message);
      }
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Type d’incident</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {INCIDENT_TYPES.map((t) => (
          <Pressable
            key={t.value}
            onPress={() => setType(t.value)}
            style={{
              width: '31.5%',
              paddingVertical: 12,
              paddingHorizontal: 6,
              borderRadius: 12,
              alignItems: 'center',
              borderWidth: 2,
              borderColor: type === t.value ? colors.brand : colors.line,
              backgroundColor: type === t.value ? '#E9202622' : colors.panel,
            }}
          >
            <Text style={{ fontSize: 22 }}>{t.icon}</Text>
            <Text style={{ color: colors.text, fontSize: 11, textAlign: 'center', marginTop: 4, fontWeight: '600' }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.label, { marginTop: 18 }]}>Gravité</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {SEVERITIES.map((s) => (
          <Pressable
            key={s.value}
            onPress={() => setSeverity(s.value)}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 10,
              alignItems: 'center',
              borderWidth: 2,
              borderColor: severity === s.value ? s.color : colors.line,
              backgroundColor: severity === s.value ? `${s.color}33` : colors.panel,
            }}
          >
            <Text style={{ color: severity === s.value ? '#fff' : colors.muted, fontWeight: '800', fontSize: 13 }}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.label, { marginTop: 18 }]}>Description</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="Ce que vous avez constaté, où, personnes impliquées…"
        placeholderTextColor="#52525B"
        style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]}
      />

      <Text style={[styles.label, { marginTop: 18 }]}>Photos & vidéos ({media.length})</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn title="Photo" icon="📸" variant="secondary" onPress={() => capture('photo')} style={{ flex: 1 }} />
        <Btn title="Vidéo" icon="🎥" variant="secondary" onPress={() => capture('video')} style={{ flex: 1 }} />
        <Btn title="Galerie" icon="🖼️" variant="secondary" onPress={() => capture('photo', true)} style={{ flex: 1 }} />
      </View>
      {media.length > 0 && (
        <ScrollView horizontal style={{ marginTop: 10 }} contentContainerStyle={{ gap: 8 }}>
          {media.map((m, i) => (
            <Pressable key={m.uri} onLongPress={() => setMedia((l) => l.filter((_, j) => j !== i))}>
              {m.kind === 'photo' ? (
                <Image source={{ uri: m.uri }} style={{ width: 90, height: 90, borderRadius: 10 }} />
              ) : (
                <View style={{ width: 90, height: 90, borderRadius: 10, backgroundColor: colors.panel2, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 30 }}>🎥</Text>
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}
      {media.length > 0 && <Text style={[styles.muted, { marginTop: 4, fontSize: 11 }]}>Appui long pour retirer un média</Text>}

      <View style={{ marginTop: 18, padding: 12, borderRadius: 12, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line }}>
        <Text style={styles.muted}>
          📍 Localisation :{' '}
          {locating ? 'en cours…' : location ? `enregistrée (±${Math.round(location.accuracy || 0)} m)` : 'indisponible — activez le GPS'}
        </Text>
      </View>

      <Btn title={progress || 'Transmettre à la centrale'} onPress={submit} loading={busy} big style={{ marginTop: 20 }} />
    </ScrollView>
  );
}
