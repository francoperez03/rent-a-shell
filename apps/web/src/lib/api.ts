import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GatewayEvent, IntentView, RailManifest, SessionGrant, Shell, ShellState } from '@ras/shell-spec';

export const API = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
/** Marketplace hub: when set, the catalog comes from it and each shell is operated on its Forger's gateway. */
export const HUB = ((import.meta.env.VITE_HUB_URL as string | undefined) ?? '').replace(/\/$/, '');

// "Current" gateway (the one of the shell being rented). Persists in the tab for checkout and console.
const GW_KEY = 'ras:gateway';
let gateway = (() => {
  if (!HUB) return API; // without a hub there is a single gateway: never reuse one stored by a previous hub session
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
    /* no storage: keep it in memory */
  }
};
const gwById = new Map<string, string>();
/** API base for a shell: its gateway when it comes from the hub, otherwise the current gateway. */
const baseFor = (id?: string) => (HUB && id && gwById.get(id)) || gateway;
/** Link to the shell page that pins the shell's gateway (needed with a hub, harmless without one). */
export const shellHref = (s: Pick<Shell, 'id' | 'gateway'>) => (HUB && s.gateway ? `/shells/${s.id}?gw=${encodeURIComponent(s.gateway)}` : `/shells/${s.id}`);

/** Absolute URL against the gateway (gateway routes may come relative, e.g. camera.frame). */
export const apiUrl = (path: string, base = gateway) => (path.startsWith('http') ? path : `${base}${path}`);

export class ApiError extends Error {
  /** `code` is the gateway `error` (e.g. session_not_started); `message` its detail if sent. */
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Gateways behind a free ngrok domain answer browser requests with an interstitial unless this header is present. */
export const GW_HEADERS = { 'ngrok-skip-browser-warning': '1' } as const;

export async function api<T>(path: string, init: RequestInit & { token?: string; base?: string } = {}): Promise<T> {
  const { token, headers, base, ...rest } = init;
  const res = await fetch(apiUrl(path, base), {
    ...rest,
    headers: {
      ...GW_HEADERS,
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

// The paid session lives in sessionStorage: it survives a refresh, not another tab.
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
 * Subscription to /api/events (SSE). Calls `onEvent` for each GatewayEvent.
 * fetch instead of EventSource so GW_HEADERS can be sent; reconnects after 3 s on any error.
 */
export function useEvents(onEvent: (e: GatewayEvent) => void) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = async () => {
      try {
        const res = await fetch(apiUrl('/api/events'), { headers: GW_HEADERS, signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        setConnected(true);
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let i: number;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const data = buf.slice(0, i).split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
            buf = buf.slice(i + 2);
            if (!data) continue;
            try {
              onEvent(JSON.parse(data) as GatewayEvent);
            } catch {
              /* non-JSON message (keepalive): ignored */
            }
          }
        }
      } catch {
        /* dropped or refused: reconnect below */
      }
      if (ctrl.signal.aborted) return;
      setConnected(false);
      timer = setTimeout(connect, 3000);
    };
    void connect();
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
    // onEvent is read on each message via the first render's closure: callers use functional setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return connected;
}

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Clock that ticks every second (for countdowns). */
export function useNow(every = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}

/** epoch in ms even if the gateway sends seconds. */
export const toMs = (t: number) => (t < 1e12 ? t * 1000 : t);
