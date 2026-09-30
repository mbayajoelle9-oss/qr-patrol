import { API_URL } from './config';
import { secure } from './storage';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Erreur réseau (pas de connexion) : l'action peut être mise en file d'attente. */
export class NetworkError extends Error {}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(q?: Query) {
  if (!q) return '';
  const parts = Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query; timeoutMs?: number } = {}
): Promise<T> {
  const token = await secure.getToken();
  const isForm = opts.body instanceof FormData;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body && !isForm) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? (isForm ? 120000 : 20000));
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}${qs(opts.query)}`, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers,
      body: opts.body ? (isForm ? (opts.body as FormData) : JSON.stringify(opts.body)) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new NetworkError('Pas de connexion au serveur');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: { error?: { message?: string; code?: string } } & Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* réponse non JSON */
  }
  if (res.status === 401 && token && onUnauthorized) onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, data?.error?.message || `Erreur ${res.status}`, data?.error?.code);
  return data as T;
}

/** Envoi d'un fichier (photo / vidéo) — retourne l'id du média. */
export async function uploadMedia(uri: string, mimeType: string, context: 'incident' | 'scan' | 'intervention' | 'avatar', capturedAt?: string) {
  const ext = mimeType.split('/')[1]?.replace('quicktime', 'mov').replace('jpeg', 'jpg') || 'bin';
  const fd = new FormData();
  // Format attendu par React Native pour l'envoi de fichiers
  fd.append('file', { uri, name: `media-${Date.now()}.${ext}`, type: mimeType } as unknown as Blob);
  fd.append('context', context);
  if (capturedAt) fd.append('capturedAt', capturedAt);
  const r = await api<{ media: { id: string } }>('/media', { body: fd });
  return r.media.id;
}
