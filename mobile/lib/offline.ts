import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api, ApiError, NetworkError, uploadMedia } from './api';

/*
 * File d'attente hors-ligne.
 * Sur un site sans réseau, les scans, incidents et positions sont enregistrés
 * sur le téléphone puis envoyés automatiquement au retour de la connexion.
 * Le serveur les reçoit avec leur heure réelle de capture et un identifiant
 * unique (clientId) qui évite les doublons.
 */

const KEY = 'qrp_offline_queue_v1';

export type QueueItem =
  | { id: string; kind: 'scan'; payload: Record<string, unknown>; createdAt: string; attempts: number }
  | {
      id: string;
      kind: 'incident' | 'sos';
      payload: Record<string, unknown>;
      media?: { uri: string; mimeType: string }[];
      createdAt: string;
      attempts: number;
    }
  | { id: string; kind: 'positions'; payload: { positions: Record<string, unknown>[] }; createdAt: string; attempts: number };

type Listener = (count: number) => void;
const listeners = new Set<Listener>();
let syncing = false;

async function read(): Promise<QueueItem[]> {
  try {
    const s = await AsyncStorage.getItem(KEY);
    return s ? (JSON.parse(s) as QueueItem[]) : [];
  } catch {
    return [];
  }
}
async function write(items: QueueItem[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((l) => l(items.length));
}

export async function enqueue(item: QueueItem) {
  const items = await read();
  // Les positions sont regroupées pour limiter la taille de la file
  if (item.kind === 'positions') {
    const existing = items.find((i) => i.kind === 'positions') as Extract<QueueItem, { kind: 'positions' }> | undefined;
    if (existing) {
      existing.payload.positions = [...existing.payload.positions, ...item.payload.positions].slice(-1000);
      await write(items);
      return;
    }
  }
  items.push(item);
  await write(items);
}

export async function pendingCount() {
  return (await read()).length;
}

export function subscribePending(fn: Listener) {
  listeners.add(fn);
  read().then((i) => fn(i.length));
  return () => {
    listeners.delete(fn);
  };
}

/** Envoie tout ce qui est en attente. Retourne le nombre d'éléments synchronisés. */
export async function syncQueue(): Promise<number> {
  if (syncing) return 0;
  const net = await NetInfo.fetch();
  if (!net.isConnected) return 0;
  syncing = true;
  let sent = 0;
  try {
    let items = await read();
    if (!items.length) return 0;

    // 1) Scans en lot, dans l'ordre chronologique
    const scans = items.filter((i) => i.kind === 'scan');
    if (scans.length) {
      try {
        await api('/scans/batch', { body: { scans: scans.map((s) => s.payload) } });
        const ids = new Set(scans.map((s) => s.id));
        items = items.filter((i) => !ids.has(i.id));
        sent += scans.length;
        await write(items);
      } catch (e) {
        if (e instanceof NetworkError) return sent;
      }
    }

    // 2) Incidents / SOS (avec leurs médias)
    for (const it of [...items]) {
      if (it.kind !== 'incident' && it.kind !== 'sos') continue;
      try {
        const mediaIds: string[] = [];
        for (const m of it.media || []) {
          // eslint-disable-next-line no-await-in-loop
          mediaIds.push(await uploadMedia(m.uri, m.mimeType, 'incident', it.createdAt));
        }
        const path = it.kind === 'sos' ? '/incidents/sos' : '/incidents';
        // eslint-disable-next-line no-await-in-loop
        await api(path, { body: it.kind === 'sos' ? it.payload : { ...it.payload, mediaIds } });
        items = items.filter((x) => x.id !== it.id);
        sent += 1;
        // eslint-disable-next-line no-await-in-loop
        await write(items);
      } catch (e) {
        if (e instanceof NetworkError) return sent;
        // Erreur de validation définitive : on abandonne après 5 tentatives
        it.attempts += 1;
        if (e instanceof ApiError && e.status < 500 && it.attempts >= 5) items = items.filter((x) => x.id !== it.id);
        // eslint-disable-next-line no-await-in-loop
        await write(items);
      }
    }

    // 3) Positions
    const pos = items.find((i) => i.kind === 'positions') as Extract<QueueItem, { kind: 'positions' }> | undefined;
    if (pos) {
      try {
        for (let i = 0; i < pos.payload.positions.length; i += 500) {
          // eslint-disable-next-line no-await-in-loop
          await api('/presence/positions', { body: { positions: pos.payload.positions.slice(i, i + 500) } });
        }
        items = items.filter((x) => x.id !== pos.id);
        sent += 1;
        await write(items);
      } catch (e) {
        if (!(e instanceof NetworkError)) {
          items = items.filter((x) => x.id !== pos.id);
          await write(items);
        }
      }
    }
  } finally {
    syncing = false;
  }
  return sent;
}

/** Synchronise automatiquement dès que le réseau revient. */
export function startAutoSync() {
  const unsub = NetInfo.addEventListener((state) => {
    if (state.isConnected) syncQueue().catch(() => {});
  });
  const timer = setInterval(() => syncQueue().catch(() => {}), 60000);
  return () => {
    unsub();
    clearInterval(timer);
  };
}
