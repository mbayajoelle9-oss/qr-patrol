import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, NetworkError, uploadMedia } from '@/lib/api';
import { getDeviceInfo, uuid } from '@/lib/device';
import { getScanLocation } from '@/lib/location';
import { enqueue } from '@/lib/offline';
import { bus } from '@/lib/events';
import { fmtTime } from '@/lib/format';
import { colors } from '@/lib/theme';
import type { CapturedLocation, ScanResult } from '@/lib/types';
import { Btn, styles } from '@/components/ui';

type Phase = 'scanning' | 'locating' | 'sending' | 'result';

interface LocalResult {
  kind: 'server' | 'offline';
  result?: ScanResult;
  scannedAt: string;
  location: CapturedLocation | null;
}

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<Phase>('scanning');
  const [torch, setTorch] = useState(false);
  const [res, setRes] = useState<LocalResult | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoDone, setPhotoDone] = useState(false);
  const lock = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, [])
  );

  function reset() {
    lock.current = false;
    setRes(null);
    setPhotoDone(false);
    setPhase('scanning');
  }

  async function onScanned(e: BarcodeScanningResult) {
    if (lock.current || phase !== 'scanning') return;
    lock.current = true;
    const scannedAt = new Date().toISOString();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setPhase('locating');
    const [location, device] = await Promise.all([getScanLocation(8000), getDeviceInfo()]);
    setPhase('sending');
    const payload = {
      payload: e.data,
      scannedAt,
      clientId: uuid(),
      location: location || undefined,
      device,
    };
    try {
      const r = await api<ScanResult>('/scans', { body: payload, timeoutMs: 15000 });
      Haptics.notificationAsync(
        r.status === 'valid' ? Haptics.NotificationFeedbackType.Success : r.status === 'suspicious' ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Error
      ).catch(() => {});
      setRes({ kind: 'server', result: r, scannedAt, location });
      bus.emit('scan:done');
    } catch (err) {
      if (err instanceof NetworkError) {
        await enqueue({ id: payload.clientId, kind: 'scan', payload: { ...payload, offline: true }, createdAt: scannedAt, attempts: 0 });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setRes({ kind: 'offline', scannedAt, location });
      } else {
        Alert.alert('Scan', (err as Error).message);
        lock.current = false;
        setPhase('scanning');
        return;
      }
    }
    setPhase('result');
  }

  async function addPhoto() {
    const scanId = res?.result?.scan.id;
    if (!scanId) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (shot.canceled || !shot.assets?.[0]) return;
    setPhotoBusy(true);
    try {
      const a = shot.assets[0];
      const mediaId = await uploadMedia(a.uri, a.mimeType || 'image/jpeg', 'scan');
      await api(`/scans/${scanId}/photo`, { body: { mediaId } });
      setPhotoDone(true);
    } catch (e) {
      Alert.alert('Photo', (e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }

  if (!permission) return <View style={styles.screen} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.screen, { justifyContent: 'center', padding: 24 }]}>
        <Text style={[styles.h1, { textAlign: 'center' }]}>Caméra requise</Text>
        <Text style={[styles.muted, { textAlign: 'center', marginVertical: 16 }]}>
          L’application a besoin de la caméra pour scanner les QR Codes des points de contrôle.
        </Text>
        <Btn title="Autoriser la caméra" onPress={requestPermission} />
      </SafeAreaView>
    );
  }

  // ---- Résultat ---------------------------------------------------------------
  if (phase === 'result' && res) {
    const r = res.result;
    const status = res.kind === 'offline' ? 'offline' : r!.status;
    const theme = {
      valid: { bg: '#064E3B', fg: '#6EE7B7', icon: '✅', title: 'Point de contrôle validé' },
      suspicious: { bg: '#78350F', fg: '#FCD34D', icon: '⚠️', title: 'Passage enregistré — à vérifier' },
      rejected: { bg: '#450A0A', fg: '#FCA5A5', icon: '⛔', title: 'Scan refusé' },
      offline: { bg: '#1E3A5F', fg: '#93C5FD', icon: '📡', title: 'Enregistré hors-ligne' },
    }[status];
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={[s.result, { backgroundColor: theme.bg }]}>
            <Text style={{ fontSize: 56 }}>{theme.icon}</Text>
            <Text style={[s.resultTitle, { color: theme.fg }]}>{theme.title}</Text>
            {r?.checkpoint && (
              <Text style={s.cpName}>
                {r.checkpoint.code} {r.checkpoint.name}
              </Text>
            )}
          </View>

          <View style={s.details}>
            <Row k="Heure" v={fmtTime(res.scannedAt)} />
            <Row
              k="GPS"
              v={res.location ? `enregistré (±${Math.round(res.location.accuracy || 0)} m)` : 'indisponible'}
              warn={!res.location}
            />
            {r?.scan.distanceMeters != null && <Row k="Distance au point" v={`${r.scan.distanceMeters} m`} />}
            {r?.patrol && <Row k="Ronde" v={`${r.patrol.stats.done}/${r.patrol.stats.total} points`} />}
            {res.kind === 'offline' && <Row k="Envoi" v="automatique au retour du réseau" />}
          </View>

          {!!r?.flags.length && (
            <View style={[s.details, { borderColor: '#78350F' }]}>
              <Text style={{ color: '#FCD34D', fontWeight: '800', marginBottom: 6 }}>Anomalies signalées à la centrale</Text>
              {r.flags.map((f) => (
                <Text key={f.code} style={{ color: '#FDE68A', marginVertical: 2 }}>
                  • {f.label}
                </Text>
              ))}
            </View>
          )}

          {!!r?.checkpoint?.instructions && (
            <View style={[s.details, { borderColor: colors.brand }]}>
              <Text style={{ color: colors.brand, fontWeight: '800', marginBottom: 4 }}>Consigne</Text>
              <Text style={styles.text}>{r.checkpoint.instructions}</Text>
            </View>
          )}

          {r?.checkpoint?.requirePhoto && r.status !== 'rejected' && (
            <Btn
              title={photoDone ? 'Photo envoyée ✓' : 'Prendre la photo obligatoire'}
              icon="📸"
              variant={photoDone ? 'success' : 'primary'}
              onPress={addPhoto}
              loading={photoBusy}
              disabled={photoDone}
              style={{ marginTop: 12 }}
            />
          )}

          {r?.patrol?.status === 'completed' && (
            <View style={[s.details, { borderColor: colors.success, alignItems: 'center' }]}>
              <Text style={{ color: colors.success, fontWeight: '900', fontSize: 16 }}>🎉 Ronde terminée — tous les points sont contrôlés</Text>
            </View>
          )}

          <Btn title="Scanner le point suivant" icon="📷" onPress={reset} big style={{ marginTop: 16 }} />
          <Btn
            title="Signaler un incident ici"
            icon="⚠️"
            variant="secondary"
            style={{ marginTop: 10 }}
            onPress={() => {
              const cp = r?.checkpoint?.id;
              reset();
              router.push(cp ? `/incident/new?checkpointId=${cp}` : '/incident/new');
            }}
          />
          <Btn title="Retour à ma ronde" variant="ghost" style={{ marginTop: 6 }} onPress={() => { reset(); router.navigate('/'); }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- Caméra -------------------------------------------------------------------
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {active && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={phase === 'scanning' ? onScanned : undefined}
        />
      )}
      <SafeAreaView style={{ flex: 1 }} pointerEvents="box-none">
        <View style={s.topBar}>
          <Text style={s.topText}>Visez le QR Code du point de contrôle</Text>
        </View>
        <View style={s.frameWrap} pointerEvents="none">
          <View style={s.frame}>
            <View style={[s.corner, { top: -2, left: -2, borderRightWidth: 0, borderBottomWidth: 0 }]} />
            <View style={[s.corner, { top: -2, right: -2, borderLeftWidth: 0, borderBottomWidth: 0 }]} />
            <View style={[s.corner, { bottom: -2, left: -2, borderRightWidth: 0, borderTopWidth: 0 }]} />
            <View style={[s.corner, { bottom: -2, right: -2, borderLeftWidth: 0, borderTopWidth: 0 }]} />
          </View>
        </View>
        <View style={s.bottomBar}>
          <Pressable onPress={() => setTorch((t) => !t)} style={s.torch}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{torch ? '🔦 Éteindre la lampe' : '🔦 Lampe'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
      {(phase === 'locating' || phase === 'sending') && (
        <View style={s.overlay}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={{ color: '#fff', marginTop: 14, fontSize: 16, fontWeight: '700' }}>
            {phase === 'locating' ? 'Localisation GPS…' : 'Enregistrement du passage…'}
          </Text>
        </View>
      )}
    </View>
  );
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={styles.muted}>{k}</Text>
      <Text style={[styles.text, warn && { color: colors.warning }]}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  topBar: { margin: 16, backgroundColor: '#000000aa', borderRadius: 12, padding: 12 },
  topText: { color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: 15 },
  frameWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 250, height: 250 },
  corner: { position: 'absolute', width: 44, height: 44, borderColor: colors.brand, borderWidth: 5, borderRadius: 6 },
  bottomBar: { alignItems: 'center', paddingBottom: 30 },
  torch: { backgroundColor: '#000000aa', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 30 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000cc', alignItems: 'center', justifyContent: 'center' },
  result: { borderRadius: 20, alignItems: 'center', padding: 24 },
  resultTitle: { fontSize: 20, fontWeight: '900', marginTop: 8, textAlign: 'center' },
  cpName: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  details: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, marginTop: 12 },
});
