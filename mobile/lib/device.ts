import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import { secure } from './storage';

export interface DeviceInfo {
  deviceId: string;
  model?: string;
  os?: string;
  osVersion?: string;
  appVersion?: string;
}

let cached: DeviceInfo | null = null;

/** Identifiant stable du téléphone (lié à l'agent pour l'anti-fraude). */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  if (cached) return cached;
  let id: string | null = null;
  try {
    if (Platform.OS === 'android') id = Application.getAndroidId();
    else if (Platform.OS === 'ios') id = await Application.getIosIdForVendorAsync();
  } catch {
    id = null;
  }
  if (!id) {
    id = await secure.getDeviceId();
    if (!id) {
      id = Crypto.randomUUID();
      await secure.setDeviceId(id);
    }
  }
  cached = {
    deviceId: `${Platform.OS}:${id}`,
    model: [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || undefined,
    os: Platform.OS,
    osVersion: Device.osVersion || String(Platform.Version),
    appVersion: Application.nativeApplicationVersion || undefined,
  };
  return cached;
}

export const uuid = () => Crypto.randomUUID();
