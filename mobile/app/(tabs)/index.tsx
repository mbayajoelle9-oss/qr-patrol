import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bus } from '@/lib/events';
import { duration, fmtTime } from '@/lib/format';
import { colors } from '@/lib/theme';
import type { Patrol } from '@/lib/types';
import { Btn, Card, Empty, Pill, SectionTitle, styles } from '@/components/ui';
import { SosButton } from '@/components/SosButton';
import { PendingBanner } from '@/components/PendingBanner';

interface Mine {
  current: Patrol | null;
  upcoming: Patrol[];
  done: Patrol[];
}
interface RouteItem {
  id: string;
  name: string;
  site: { id: string; name: string };
  checkpoints: unknown[];
}

const CP_STATUS: Record<string, { glyph: string; color: string }> = {
  pending: { glyph: '○', color: colors.muted },
  done: { glyph: '✓', color: colors.success },
  suspicious: { glyph: '!', color: colors.warning },
  missed: { glyph: '✕', color: colors.brand },
};

export default function Home() {
  const router = useRouter();
  const { user, setOnDuty } = useAuth();
  const [data, setData] = useState<Mine | null>(null);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [, tick] = useState(0);
  const isAgent = user?.role === 'agent';

  const load = useCallback(async () => {
    if (!isAgent) return;
    setLoading(true);
    try {
      const [m, r] = await Promise.all([api<Mine>('/patrols/mine'), api<{ items: RouteItem[] }>('/routes')]);
      setData(m);
      setRoutes(r.items);
    } catch {
      /* hors-ligne : on garde l'affichage précédent */
    } finally {
      setLoading(false);
    }
  }, [isAgent]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useEffect(() => bus.on('patrol:updated', () => load()), [load]);
  useEffect(() => bus.on('scan:done', () => load()), [load]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  async function toggleDuty() {
    setBusy('duty');
    try {
      const r = await setOnDuty(!user?.onDuty);
      if (!user?.onDuty && r.background === false) {
        Alert.alert(
          'Localisation en arrière-plan',
          'Autorisez la localisation « Toujours » dans les réglages pour que la centrale vous voie même écran verrouillé.'
        );
      }
    } catch (e) {
      Alert.alert('Service', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function start(body: { patrolId?: string; routeId?: string }) {
    setBusy(body.patrolId || body.routeId || 'start');
    try {
      await api('/patrols/start', { body });
      await load();
      router.push('/scan');
    } catch (e) {
      Alert.alert('Ronde', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function end(p: Patrol) {
    const missing = p.checkpoints.filter((c) => c.status === 'pending' && !c.optional).length;
    Alert.alert(
      'Terminer la ronde ?',
      missing ? `${missing} point(s) n’ont pas été contrôlés. Ils seront signalés comme manqués.` : 'Tous les points ont été contrôlés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Terminer',
          style: missing ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await api(`/patrols/${p.id}/end`, { body: {} });
              load();
            } catch (e) {
              Alert.alert('Ronde', (e as Error).message);
            }
          },
        },
      ]
    );
  }

  const p = data?.current;
  const pct = p && p.stats.total ? p.stats.done / p.stats.total : 0;

  return (
    <View style={styles.screen}>
      <PendingBanner />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}>
        {/* Service */}
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>
              {user?.firstName} {user?.lastName}
            </Text>
            <Text style={styles.muted}>
              {user?.matricule} · {user?.sites?.map((s) => s.name).join(', ') || 'Aucun site affecté'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: user?.onDuty ? colors.success : '#52525B' }} />
              <Text style={{ color: user?.onDuty ? colors.success : colors.muted, fontWeight: '700' }}>
                {user?.onDuty ? `En service · ${duration(user.dutyStartedAt)}` : 'Hors service'}
              </Text>
            </View>
          </View>
          <Btn
            title={user?.onDuty ? 'Fin de service' : 'Prendre service'}
            variant={user?.onDuty ? 'secondary' : 'success'}
            onPress={toggleDuty}
            loading={busy === 'duty'}
          />
        </Card>

        <View style={{ marginTop: 14 }}>
          <SosButton />
        </View>

        {user?.role === 'responder' && (
          <Pressable onPress={() => router.push('/interventions')}>
            <Card style={{ marginTop: 14, borderColor: colors.info }}>
              <Text style={[styles.text, { fontWeight: '800' }]}>🚓 Mes interventions</Text>
              <Text style={styles.muted}>Missions envoyées par la centrale</Text>
            </Card>
          </Pressable>
        )}

        {isAgent && p && (
          <>
            <SectionTitle>Ronde en cours</SectionTitle>
            <Card style={{ borderColor: colors.brand }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.text, { fontSize: 18, fontWeight: '800' }]}>{p.route?.name}</Text>
                  <Text style={styles.muted}>
                    {p.site?.name} · depuis {fmtTime(p.startedAt)} ({duration(p.startedAt)})
                  </Text>
                </View>
                <Text style={{ color: colors.text, fontSize: 22, fontWeight: '900' }}>
                  {p.stats.done}/{p.stats.total}
                </Text>
              </View>
              <View style={{ height: 8, backgroundColor: '#27272A', borderRadius: 4, marginTop: 12, overflow: 'hidden' }}>
                <View style={{ width: `${Math.round(pct * 100)}%`, height: 8, backgroundColor: p.stats.suspicious ? colors.warning : colors.success }} />
              </View>
              {p.dueBy && <Text style={[styles.muted, { marginTop: 6 }]}>À terminer avant {fmtTime(p.dueBy)}</Text>}
              {p.route?.strictOrder && <Text style={[styles.muted, { color: colors.info }]}>Ordre des points imposé</Text>}

              <View style={{ marginTop: 12 }}>
                {[...p.checkpoints]
                  .sort((a, b) => a.order - b.order)
                  .map((c) => {
                    const st = CP_STATUS[c.status];
                    return (
                      <View key={c.checkpoint.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.line }}>
                        <Text style={{ width: 28, color: st.color, fontSize: 18, fontWeight: '900', textAlign: 'center' }}>{st.glyph}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.text, c.status !== 'pending' && { color: colors.muted }]}>
                            {c.checkpoint.code} {c.checkpoint.name}
                            {c.optional ? ' (facultatif)' : ''}
                          </Text>
                        </View>
                        <Text style={styles.muted}>{c.scannedAt ? fmtTime(c.scannedAt) : ''}</Text>
                      </View>
                    );
                  })}
              </View>
              <Btn title="Scanner un point" icon="📷" onPress={() => router.push('/scan')} style={{ marginTop: 14 }} big />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <Btn title="Incident" icon="⚠️" variant="secondary" onPress={() => router.push('/incident/new')} style={{ flex: 1 }} />
                <Btn title="Terminer" variant="secondary" onPress={() => end(p)} style={{ flex: 1 }} />
              </View>
            </Card>
          </>
        )}

        {isAgent && !p && (
          <>
            <SectionTitle>Rondes à effectuer</SectionTitle>
            {!data?.upcoming.length ? (
              <Card>
                <Empty>Aucune ronde planifiée pour le moment.</Empty>
              </Card>
            ) : (
              data.upcoming.map((u) => {
                const late = u.scheduledStart && new Date(u.scheduledStart) < new Date();
                return (
                  <Card key={u.id} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.text, { fontWeight: '800' }]}>{u.route?.name}</Text>
                        <Text style={styles.muted}>
                          {u.site?.name} · {u.checkpoints.length} points · {fmtTime(u.scheduledStart)} → {fmtTime(u.dueBy)}
                        </Text>
                      </View>
                      {late ? <Pill label="À faire maintenant" color={colors.warning} /> : <Pill label={fmtTime(u.scheduledStart)} color={colors.muted} />}
                    </View>
                    <Btn title="Démarrer la ronde" onPress={() => start({ patrolId: u.id })} loading={busy === u.id} style={{ marginTop: 12 }} />
                  </Card>
                );
              })
            )}

            {routes.length > 0 && (
              <>
                <SectionTitle>Ronde libre</SectionTitle>
                {routes.map((r) => (
                  <Pressable key={r.id} onPress={() => start({ routeId: r.id })} disabled={!!busy}>
                    <Card style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.text}>{r.name}</Text>
                        <Text style={styles.muted}>
                          {r.site?.name} · {r.checkpoints.length} points
                        </Text>
                      </View>
                      <Text style={{ color: colors.brand, fontWeight: '800' }}>{busy === r.id ? '…' : 'Démarrer ›'}</Text>
                    </Card>
                  </Pressable>
                ))}
              </>
            )}
          </>
        )}

        {isAgent && !!data?.done.length && (
          <>
            <SectionTitle>Terminées aujourd’hui ({data.done.length})</SectionTitle>
            {data.done.map((d) => (
              <View key={d.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                <Text style={styles.text}>
                  {d.route?.name} · {fmtTime(d.endedAt)}
                </Text>
                <Pill label={d.status === 'completed' ? 'Complète' : 'Incomplète'} color={d.status === 'completed' ? colors.success : colors.warning} />
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
