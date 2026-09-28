import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { subscribePending, syncQueue } from '@/lib/offline';
import { colors } from '@/lib/theme';

/** Bandeau affiché quand des données attendent le réseau. */
export function PendingBanner() {
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  useEffect(() => subscribePending(setCount), []);
  if (!count) return null;
  return (
    <Pressable
      onPress={async () => {
        setSyncing(true);
        await syncQueue().catch(() => {});
        setSyncing(false);
      }}
      style={{ backgroundColor: '#78350F', paddingVertical: 8, paddingHorizontal: 16 }}
    >
      <Text style={{ color: '#FDE68A', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
        {syncing ? 'Synchronisation…' : `📡 ${count} élément(s) en attente de réseau — toucher pour renvoyer`}
      </Text>
    </Pressable>
  );
}

export const pendingColor = colors.warning;
