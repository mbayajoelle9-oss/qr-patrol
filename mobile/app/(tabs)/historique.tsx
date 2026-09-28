import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { colors } from '@/lib/theme';
import { Empty, Pill, styles } from '@/components/ui';
import { PendingBanner } from '@/components/PendingBanner';

interface Scan {
  id: string;
  scannedAt: string;
  status: 'valid' | 'suspicious' | 'rejected';
  offline: boolean;
  distanceMeters?: number;
  checkpoint?: { name: string; code?: string };
  site?: { name: string };
  flagLabels?: string[];
}

const ST = {
  valid: { label: 'Validé', color: colors.success },
  suspicious: { label: 'À vérifier', color: colors.warning },
  rejected: { label: 'Refusé', color: colors.brand },
};

export default function Historique() {
  const [items, setItems] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ items: Scan[] }>('/scans', { query: { limit: 100 } });
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

  return (
    <View style={styles.screen}>
      <PendingBanner />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={<Empty>Aucun passage enregistré.</Empty>}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.text, { fontWeight: '700', flex: 1 }]}>
                {item.checkpoint ? `${item.checkpoint.code || ''} ${item.checkpoint.name}` : 'QR inconnu'}
              </Text>
              <Pill label={ST[item.status].label} color={ST[item.status].color} />
            </View>
            <Text style={[styles.muted, { marginTop: 4 }]}>
              {fmtDateTime(item.scannedAt)} · {item.site?.name || ''}
              {item.distanceMeters != null ? ` · ${item.distanceMeters} m` : ''}
              {item.offline ? ' · hors-ligne' : ''}
            </Text>
            {!!item.flagLabels?.length && <Text style={{ color: colors.warning, fontSize: 12, marginTop: 4 }}>{item.flagLabels.join(' · ')}</Text>}
          </View>
        )}
      />
    </View>
  );
}
