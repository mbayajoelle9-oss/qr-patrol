import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import { api, NetworkError } from './api';
import { enqueue } from './offline';
import { uuid } from './device';

/*
 * Suivi de position pendant le service.
 * Android : service de premier plan (notification permanente « En service »),
 * la position continue d'être envoyée écran verrouillé.
 * Cette tâche doit être définie au chargement de l'application (import dans app/_layout).
 */
export const TRACKING_TASK = 'qrp-duty-tracking';

TaskManager.defineTask(TRACKING_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = (data || {}) as { locations?: Location.LocationObject[] };
  if (!locations?.length) return;
  let battery: number | null = null;
  try {
    battery = await Battery.getBatteryLevelAsync();
  } catch {
    battery = null;
  }
  const positions = locations.map((l) => ({
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy: l.coords.accuracy,
    speed: l.coords.speed,
    heading: l.coords.heading,
    mocked: (l as Location.LocationObject & { mocked?: boolean }).mocked === true,
    battery,
    capturedAt: new Date(l.timestamp).toISOString(),
  }));
  try {
    await api('/presence/positions', { body: { positions } });
  } catch (e) {
    if (e instanceof NetworkError) {
      await enqueue({ id: uuid(), kind: 'positions', payload: { positions }, createdAt: new Date().toISOString(), attempts: 0 });
    }
  }
});

export async function startTracking(intervalSeconds = 60): Promise<{ ok: boolean; background: boolean }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return { ok: false, background: false };
  let background = false;
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    background = bg.granted;
  } catch {
    background = false;
  }
  const already = await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK).catch(() => false);
  if (already) await Location.stopLocationUpdatesAsync(TRACKING_TASK).catch(() => {});
  await Location.startLocationUpdatesAsync(TRACKING_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: Math.max(intervalSeconds, 15) * 1000,
    distanceInterval: 15,
    deferredUpdatesInterval: Math.max(intervalSeconds, 15) * 1000,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.Fitness,
    foregroundService: {
      notificationTitle: 'QR Patrol — En service',
      notificationBody: 'Votre position est partagée avec la centrale pendant votre service.',
      notificationColor: '#E92026',
      killServiceOnDestroy: false,
    },
  });
  return { ok: true, background };
}

export async function stopTracking() {
  const started = await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK).catch(() => false);
  if (started) await Location.stopLocationUpdatesAsync(TRACKING_TASK).catch(() => {});
}

export async function isTracking() {
  return Location.hasStartedLocationUpdatesAsync(TRACKING_TASK).catch(() => false);
}
