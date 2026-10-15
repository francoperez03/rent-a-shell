import { Redis } from '@upstash/redis';
import type { GatewayEntry, TokenEntry } from './hub';

const KEY = 'ras:forgers';
const TOKENS = 'ras:forger-tokens';

/** Registered Forger gateways, keyed by normalized URL. */
export interface Store {
  all(): Promise<GatewayEntry[]>;
  set(e: GatewayEntry): Promise<void>;
  del(url: string): Promise<boolean>;
  tokens(): Promise<Record<string, TokenEntry>>;
  setToken(token: string, e: TokenEntry): Promise<void>;
  delToken(token: string): Promise<boolean>;
}

// The Marketplace injects UPSTASH_REDIS_REST_* or KV_REST_API_* depending on the prefix chosen at install; accept both.
const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

function redis(): Store {
  const r = new Redis({ url: url!, token: token! }); // values are JSON-serialized by the client
  return {
    all: async () => Object.values((await r.hgetall<Record<string, GatewayEntry>>(KEY)) ?? {}),
    set: async (e) => { await r.hset(KEY, { [e.url]: e }); },
    del: async (u) => (await r.hdel(KEY, u)) > 0,
    tokens: async () => (await r.hgetall<Record<string, TokenEntry>>(TOKENS)) ?? {},
    setToken: async (t, e) => { await r.hset(TOKENS, { [t]: e }); },
    delToken: async (t) => (await r.hdel(TOKENS, t)) > 0,
  };
}

function memory(): Store {
  const m = new Map<string, GatewayEntry>();
  const t = new Map<string, TokenEntry>();
  return {
    all: async () => [...m.values()],
    set: async (e) => { m.set(e.url, e); },
    del: async (u) => m.delete(u),
    tokens: async () => Object.fromEntries(t),
    setToken: async (k, e) => { t.set(k, e); },
    delToken: async (k) => t.delete(k),
  };
}

// ponytail: in-memory when no Redis env (local dev and tests); nothing else to configure
export const store: Store = url && token ? redis() : memory();
