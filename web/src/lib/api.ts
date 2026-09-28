export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

const TOKEN_KEY = 'qrp_token';
const ORG_KEY = 'qrp_org';

function safeGet(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible */
  }
}

export const session = {
  getToken: () => safeGet(TOKEN_KEY),
  setToken: (t: string | null) => safeSet(TOKEN_KEY, t),
  getOrg: () => safeGet(ORG_KEY),
  setOrg: (id: string | null) => safeSet(ORG_KEY, id),
};

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: { path: string; message: string }[];
  constructor(status: number, message: string, code?: string, details?: { path: string; message: string }[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function buildQuery(q?: Query) {
  if (!q) return '';
  const p = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

function headers(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  const token = session.getToken();
  if (token) h.set('Authorization', `Bearer ${token}`);
  const org = session.getOrg();
  if (org) h.set('X-Org-Id', org);
  return h;
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; query?: Query } = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const res = await fetch(`${API_URL}/api${path}${buildQuery(opts.query)}`, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: headers(isForm || !opts.body ? undefined : { 'Content-Type': 'application/json' }),
    body: opts.body ? (isForm ? (opts.body as FormData) : JSON.stringify(opts.body)) : undefined,
  });
  if (res.status === 401 && onUnauthorized && !path.startsWith('/auth/login')) onUnauthorized();
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = data?.error || {};
    throw new ApiError(res.status, e.message || `Erreur ${res.status}`, e.code, e.details);
  }
  return data as T;
}

/** Télécharge un fichier protégé (PDF, CSV) et l'ouvre / l'enregistre. */
export async function downloadFile(path: string, query?: Query, filename?: string, open = false) {
  const res = await fetch(`${API_URL}/api${path}${buildQuery(query)}`, { headers: headers() });
  if (!res.ok) {
    let msg = `Erreur ${res.status}`;
    try {
      msg = (await res.json())?.error?.message || msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (open) {
    window.open(url, '_blank');
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export';
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
