import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { bus } from '@/lib/events';
import { timeAgo } from '@/lib/format';
import { colors, INCIDENT_STATUS } from '@/lib/theme';
import type { Incident } from '@/lib/types';
import { Btn, Empty, Pill, styles } from '@/components/ui';
import { PendingBanner } from '@/components/PendingBanner';

export default function Incidents() {
  const router = useRouter();
  const [items, setItems] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ items: Incident[] }>('/incidents', { query: { limit: 50 } });
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
  useEffect(() => bus.on('incident:updated', () => load()), [load]);

  return (
    <View style={styles.screen}>
      <PendingBanner />
      <View style={{ padding: 16, paddingBottom: 4 }}>
        <Btn title="Déclarer un incident" icon="⚠️" onPress={() => router.push('/incident/new')} big />
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={<Empty>Aucun incident déclaré.</Empty>}
        renderItem={({ item }) => {
          const st = INCIDENT_STATUS[item.status] || { label: item.statusLabel, color: colors.muted };
          return (
            <Pressable
              onPress={() => router.push(`/incident/${item.id}`)}
              style={{ backgroundColor: colors.panel, borderRadius: 14, borderWidth: 1, borderColor: item.type === 'sos' ? colors.brand : colors.line, padding: 14 }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.text, { fontWeight: '800', flex: 1 }]}>{item.type === 'sos' ? '🆘 SOS' : item.typeLabel}</Text>
                <Pill label={st.label} color={st.color} />
              </View>
              <Text style={[styles.muted, { marginTop: 6 }]}>
                {item.reference} · {timeAgo(item.createdAt)}
                {item.media.length ? ` · ${item.media.length} média(s)` : ''}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
