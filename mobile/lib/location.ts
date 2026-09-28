import * as Location from 'expo-location';
import type { CapturedLocation } from './types';

export async function ensureForegroundPermission() {
  const cur = await Location.getForegroundPermissionsAsync();
  if (cur.granted) return true;
  const req = await Location.requestForegroundPermissionsAsync();
  return req.granted;
}

function toCaptured(l: Location.LocationObject): CapturedLocation {
  return {
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy: l.coords.accuracy,
    altitude: l.coords.altitude,
    speed: l.coords.speed,
    heading: l.coords.heading,
    mocked: (l as Location.LocationObject & { mocked?: boolean }).mocked === true,
    capturedAt: new Date(l.timestamp).toISOString(),
  };
}

/**
 * Position précise pour un scan : on vise < 30 m de précision en 8 s maximum,
 * sinon on retourne la meilleure mesure obtenue (la centrale verra la précision).
 */
export async function getScanLocation(maxWaitMs = 8000): Promise<CapturedLocation | null> {
  if (!(await ensureForegroundPermission())) return null;
  let best: Location.LocationObject | null = null;
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 15000, requiredAccuracy: 30 });
    if (last) return toCaptured(last);
  } catch {
    /* ignore */
  }
  return new Promise((resolve) => {
    let sub: Location.LocationSubscription | null = null;
    const done = () => {
      sub?.remove();
      resolve(best ? toCaptured(best) : null);
    };
    const timer = setTimeout(done, maxWaitMs);
    Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 }, (loc) => {
      if (!best || (loc.coords.accuracy ?? 999) < (best.coords.accuracy ?? 999)) best = loc;
      if ((loc.coords.accuracy ?? 999) <= 20) {
        clearTimeout(timer);
        done();
      }
    })
      .then((s) => {
        sub = s;
      })
      .catch(() => {
        clearTimeout(timer);
        done();
      });
  });
}

export async function getQuickLocation(): Promise<CapturedLocation | null> {
  if (!(await ensureForegroundPermission())) return null;
  try {
    const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return toCaptured(l);
  } catch {
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    return last ? toCaptured(last) : null;
  }
}

export { toCaptured };
