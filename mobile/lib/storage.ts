import * as SecureStore from 'expo-secure-store';

const TOKEN = 'qrp_token';
const USER = 'qrp_user';
const DEVICE = 'qrp_device_id';

export const secure = {
  getToken: () => SecureStore.getItemAsync(TOKEN),
  setToken: (t: string | null) => (t ? SecureStore.setItemAsync(TOKEN, t) : SecureStore.deleteItemAsync(TOKEN)),
  getUser: async <T>() => {
    const s = await SecureStore.getItemAsync(USER);
    return s ? (JSON.parse(s) as T) : null;
  },
  setUser: (u: unknown) => (u ? SecureStore.setItemAsync(USER, JSON.stringify(u)) : SecureStore.deleteItemAsync(USER)),
  getDeviceId: () => SecureStore.getItemAsync(DEVICE),
  setDeviceId: (id: string) => SecureStore.setItemAsync(DEVICE, id),
};
