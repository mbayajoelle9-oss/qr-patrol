import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Linking, Platform, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { bus } from '@/lib/events';
import { fmtTime } from '@/lib/format';
import { colors } from '@/lib/theme';
import type { Intervention } from '@/lib/types';
import { Btn, Empty, Pill, styles } from '@/components/ui';

const ST: Record<string, { label: string; color: string }> = {
  dispatched: { label: 'À partir', color: colors.brand },
  en_route: { label: 'En route', color: colors.info },
  on_site: { label: 'Sur place', color: colors.info },
  completed: { label: 'Terminée', color: colors.success },
  cancelled: { label: 'Annulée', color: colors.muted },
};

function openMaps(lat: number, lng: number, label: string) {
  const url =
    Platform.OS === 'ios' ? `maps:0,0?q=${encodeURIComponent(label)}@${lat},${lng}` : `geo:0,0?q=${lat},${lng}(${encodeURIComponent(label)})`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`));
}

export default function Interventions() {
  const [items, setItems] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ items: Intervention[] }>('/interventions', { query: { limit: 30 } });
      setItems(r.items);
    } catch {
      /* hors-ligne */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useEffect(() => bus.on('intervention:new', () => load()), [load]);

  async function update(iv: Intervention, status: string, report?: string) {
    setBusy(iv.id + status);
    try {
      await api(`/interventions/${iv.id}`, { method: 'PATCH', body: { status, report } });
      load();
    } catch (e) {
      Alert.alert('Erreur', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function complete(iv: Intervention) {
    if (Platform.OS === 'ios') {
      Alert.prompt('Rapport d’intervention', 'Décrivez brièvement la situation et les mesures prises.', (text) => update(iv, 'completed', text));
    } else {
      Alert.alert('Terminer l’intervention ?', 'Vous pourrez compléter le rapport depuis l’incident.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Terminer', onPress: () => update(iv, 'completed') },
      ]);
    }
  }

  return (
    <FlatList
      style={styles.screen}
      data={items}
      keyExtractor={(i) => i.id}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
      ListEmptyComponent={<Empty>Aucune intervention.</Empty>}
      renderItem={({ item: iv }) => {
        const loc = iv.incident.location || (iv.incident.site?.location ? { lat: iv.incident.site.location.coordinates[1], lng: iv.incident.site.location.coordinates[0] } : null);
        const active = ['dispatched', 'en_route', 'on_site'].includes(iv.status);
        return (
          <View style={{ backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: active ? colors.brand : colors.line, padding: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.text, { fontWeight: '900', fontSize: 17, flex: 1 }]}>{iv.incident.title || iv.incident.type}</Text>
              <Pill label={ST[iv.status].label} color={ST[iv.status].color} />
            </View>
            <Text style={[styles.muted, { marginTop: 4 }]}>
              {iv.incident.reference} · envoyée à {fmtTime(iv.dispatchedAt)} · {iv.team?.name || ''}
            </Text>
            {iv.incident.site && (
              <Text style={[styles.text, { marginTop: 6 }]}>
                📍 {iv.incident.site.name}
                {iv.incident.site.address ? ` — ${iv.incident.site.address}` : ''}
              </Text>
            )}
            {!!iv.instructions && <Text style={[styles.text, { marginTop: 6, color: '#FDE68A' }]}>Consigne : {iv.instructions}</Text>}
            {active && (
              <View style={{ gap: 8, marginTop: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {loc && <Btn title="Itinéraire" icon="🧭" variant="secondary" style={{ flex: 1 }} onPress={() => openMaps(loc.lat, loc.lng, iv.incident.reference)} />}
                  {iv.incident.reportedBy?.phone && (
                    <Btn title="Appeler le rondier" icon="📞" variant="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${iv.incident.reportedBy?.phone}`)} />
                  )}
                </View>
                {iv.status === 'dispatched' && <Btn title="Je suis en route" onPress={() => update(iv, 'en_route')} loading={busy === `${iv.id}en_route`} />}
                {iv.status !== 'on_site' && <Btn title="Arrivé sur place" variant="secondary" onPress={() => update(iv, 'on_site')} loading={busy === `${iv.id}on_site`} />}
                <Btn title="Intervention terminée" variant="success" onPress={() => complete(iv)} loading={busy === `${iv.id}completed`} />
              </View>
            )}
          </View>
        );
      }}
    />
  );
}
