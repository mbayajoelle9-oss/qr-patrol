import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { bus } from '@/lib/events';
import { fmtDateTime } from '@/lib/format';
import { colors, INCIDENT_STATUS } from '@/lib/theme';
import type { Incident } from '@/lib/types';
import { Btn, Card, Pill, SectionTitle, styles } from '@/components/ui';

const ACTIONS: Record<string, string> = {
  created: 'Incident déclaré',
  comment: 'Commentaire',
  media: 'Média ajouté',
  dispatch: 'Intervention envoyée',
  updated: 'Modifié par la centrale',
};

export default function IncidentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inc, setInc] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ incident: Incident }>(`/incidents/${id}`);
      setInc(r.incident);
    } catch (e) {
      Alert.alert('Incident', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(
    () =>
      bus.on('incident:updated', (p) => {
        if ((p as { id?: string })?.id === id) setInc(p as Incident);
      }),
    [id]
  );

  async function send() {
    if (!note.trim()) return;
    setSending(true);
    try {
      const r = await api<{ incident: Incident }>(`/incidents/${id}/notes`, { body: { note } });
      setInc(r.incident);
      setNote('');
    } catch (e) {
      Alert.alert('Erreur', (e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (!inc) return <View style={styles.screen} />;
  const st = INCIDENT_STATUS[inc.status] || { label: inc.statusLabel, color: colors.muted };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}>
      <Card>
        <Text style={[styles.muted, { fontFamily: 'monospace' }]}>{inc.reference}</Text>
        <Text style={[styles.h1, { marginTop: 4 }]}>{inc.type === 'sos' ? '🆘 SOS' : inc.typeLabel}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Pill label={st.label} color={st.color} />
          <Pill label={inc.severityLabel} color={inc.severity === 'critical' || inc.severity === 'high' ? colors.brand : colors.warning} />
        </View>
        <Text style={[styles.muted, { marginTop: 10 }]}>
          {fmtDateTime(inc.createdAt)}
          {inc.site ? ` · ${inc.site.name}` : ''}
        </Text>
        {!!inc.description && <Text style={[styles.text, { marginTop: 10 }]}>{inc.description}</Text>}
      </Card>

      {inc.media.length > 0 && (
        <>
          <SectionTitle>Médias</SectionTitle>
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
            {inc.media.map((m) => (
              <Pressable key={m.id} onPress={() => Linking.openURL(m.url)}>
                {m.kind === 'photo' ? (
                  <Image source={{ uri: m.url }} style={{ width: 110, height: 110, borderRadius: 10 }} />
                ) : (
                  <View style={{ width: 110, height: 110, borderRadius: 10, backgroundColor: colors.panel2, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 32 }}>🎥</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      <SectionTitle>Suivi</SectionTitle>
      <Card>
        {inc.timeline.map((t, i) => {
          const label = t.action.startsWith('status:')
            ? INCIDENT_STATUS[t.action.slice(7)]?.label || t.action
            : t.action.startsWith('intervention:')
              ? 'Intervention mise à jour'
              : ACTIONS[t.action] || t.action;
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 6 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.text, { fontWeight: '700' }]}>{label}</Text>
                <Text style={styles.muted}>
                  {fmtDateTime(t.at)}
                  {t.by ? ` · ${t.by.firstName} ${t.by.lastName}` : ''}
                </Text>
                {!!t.note && <Text style={[styles.text, { marginTop: 2 }]}>{t.note}</Text>}
              </View>
            </View>
          );
        })}
      </Card>

      <SectionTitle>Ajouter une information</SectionTitle>
      <TextInput
        value={note}
        onChangeText={setNote}
        multiline
        placeholder="Complément pour la centrale…"
        placeholderTextColor="#52525B"
        style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
      />
      <Btn title="Envoyer" onPress={send} loading={sending} disabled={!note.trim()} style={{ marginTop: 10 }} />
    </ScrollView>
  );
}
