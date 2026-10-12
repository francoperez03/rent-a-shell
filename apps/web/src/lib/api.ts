import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GatewayEvent, IntentView, RailManifest, SessionGrant, Shell, ShellState } from '@ras/shell-spec';

export const API = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
/** Hub del marketplace: si está, el catálogo sale de ahí y cada shell se opera en el gateway de su Forger. */
export const HUB = ((import.meta.env.VITE_HUB_URL as string | undefined) ?? '').replace(/\/$/, '');

// Gateway "actual" (el del shell que se está alquilando). Persiste en la pestaña para checkout y consola.
const GW_KEY = 'ras:gateway';
let gateway = (() => {
  try {
    return sessionStorage.getItem(GW_KEY) ?? API;
  } catch {
    return API;
  }
})();
export const setGateway = (url: string) => {
  gateway = url.replace(/\/$/, '');
  try {
    sessionStorage.setItem(GW_KEY, gateway);
  } catch {
    /* sin storage: queda en memoria */
  }
};
const gwById = new Map<string, string>();
/** Base de API para un shell: su gateway si viene del hub, si no el gateway actual. */
const baseFor = (id?: string) => (HUB && id && gwById.get(id)) || gateway;
/** Link a la ficha que fija el gateway del shell (necesario con hub, inocuo sin él). */
export const shellHref = (s: Pick<Shell, 'id' | 'gateway'>) => (HUB && s.gateway ? `/shells/${s.id}?gw=${encodeURIComponent(s.gateway)}` : `/shells/${s.id}`);

/** URL absoluta contra el gateway (las rutas del gateway pueden venir relativas, ej. camera.frame). */
export const apiUrl = (path: string, base = gateway) => (path.startsWith('http') ? path : `${base}${path}`);

export class ApiError extends Error {
  /** `code` es el `error` del gateway (ej. session_not_started); `message` su detalle si lo manda. */
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { token?: string; base?: string } = {}): Promise<T> {
  const { token, headers, base, ...rest } = init;
  const res = await fetch(apiUrl(path, base), {
    ...rest,
    headers: {
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const b = body as { error?: string; message?: string };
    throw new ApiError(res.status, b.error ?? `http_${res.status}`, b.message ?? b.error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export interface Queue {
  active: { sid: string; rail: string; expires_at: number } | null;
  waiting: number;
}

export interface SessionInfo {
  sid: string;
  shell: string;
  starts_at: number;
  expires_at: number;
  active: boolean;
  ended: 'expired' | 'ended' | 'offline' | null;
}

export const useShells = () =>
  useQuery({
    queryKey: ['shells'],
    queryFn: async () => {
      const list = HUB ? await api<Shell[]>('/api/catalog', { base: HUB }) : await api<Shell[]>('/api/shells');
      for (const s of list) if (s.gateway) gwById.set(s.id, s.gateway.replace(/\/$/, ''));
      return list;
    },
    refetchInterval: 10_000,
  });

export const useShell = (id: string | undefined) => {
  const q = useShells();
  return { ...q, data: q.data?.find((s) => s.id === id) };
};

export const useShellState = (id: string | undefined, every = 2_000) =>
  useQuery({
    queryKey: ['state', id],
    queryFn: () => api<ShellState>(`/api/shells/${id}/state`, { base: baseFor(id) }),
    enabled: !!id,
    refetchInterval: every,
    retry: false,
  });

export const useQueue = (id: string | undefined) =>
  useQuery({
    queryKey: ['queue', id],
    queryFn: () => api<Queue>(`/api/shells/${id}/queue`, { base: baseFor(id) }),
    enabled: !!id,
    refetchInterval: 5_000,
  });

export const useRails = () => useQuery({ queryKey: ['rails'], queryFn: () => api<RailManifest[]>('/api/rails') });

export const createIntent = (body: { shell: string; blocks: number; rail: string; asset?: string }) =>
  api<IntentView>('/api/sessions/intent', { method: 'POST', body: JSON.stringify(body) });

export const getIntent = (id: string) => api<IntentView>(`/api/sessions/intent/${id}`);

// La sesión pagada vive en sessionStorage: sobrevive un refresh, no otra pestaña.
const GRANT_KEY = 'ras:session';
export const saveGrant = (g: SessionGrant) => sessionStorage.setItem(GRANT_KEY, JSON.stringify(g));
export const loadGrant = (): SessionGrant | null => {
  try {
    return JSON.parse(sessionStorage.getItem(GRANT_KEY) ?? 'null');
  } catch {
    return null;
  }
};
export const clearGrant = () => sessionStorage.removeItem(GRANT_KEY);

/**
 * Suscripción a /api/events (SSE). Llama `onEvent` por cada GatewayEvent.
 * EventSource reconecta solo; acá solo parseamos.
 */
export function useEvents(onEvent: (e: GatewayEvent) => void) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const es = new EventSource(apiUrl('/api/events'));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      try {
        onEvent(JSON.parse(m.data) as GatewayEvent);
      } catch {
        /* mensaje que no es JSON (keepalive): se ignora */
      }
    };
    return () => es.close();
    // onEvent se lee en cada mensaje vía closure del primer render: los callers usan setState funcional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return connected;
}

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Reloj que avanza cada segundo (para countdowns). */
export function useNow(every = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}

/** epoch en ms aunque el gateway mande segundos. */
export const toMs = (t: number) => (t < 1e12 ? t * 1000 : t);
