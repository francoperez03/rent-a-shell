// Contrato compartido entre gateway, rieles, sitio y agentes. Sin dependencias.

export type Joint = "base" | "shoulder" | "elbow" | "grip";
export type Angles = Record<Joint, number>;
export type ShellStatus = "online" | "busy" | "offline";

export interface Shell {
  id: string;
  name: string;
  kind: string;
  location: string;
  status: ShellStatus;
  camera: { hls: string | null; frame: string };
  joints: Record<Joint, [number, number]>;
  home: Angles;
  routines: string[];
  pricing: { block_minutes: number; usd: string };
  /** Forger: quien arma, publica y mantiene el shell, y cobra por su uso. */
  forger: { name: string; contact?: string; customizations: boolean };
  /** Lo que cuesta tenerlo propio, para comparar contra alquilarlo (estimado por el forger). */
  build: { parts_usd: number; lead_days: number; build_hours: number };
}

export interface ShellState {
  ok: boolean;
  moving: boolean;
  rutina: string | null;
  angles: Angles;
  uptime_ms?: number;
}

export type Command =
  | { cmd: "joint"; args: { joint: Joint; angle: number } }
  | { cmd: "dance"; args: { rutina: string } }
  | { cmd: "stop"; args?: Record<string, never> };

export interface Money { usd: string }

export type Instructions =
  | { kind: "x402"; url: string }
  | { kind: "solana-pay"; url: string; reference: string; to: string; amount: string; symbol: string }
  | { kind: "approval"; ref: string; note: string };

export interface Intent {
  id: string;
  rail: string;
  amount: string;        // en unidades humanas del asset, ej "1.00"
  asset: string;         // símbolo, ej "USDC"
  expiresAt: number;     // epoch ms
  instructions: Instructions;
  meta?: Record<string, unknown>; // datos privados del riel (reference, monto atómico)
}

export interface Payment {
  intentId: string;
  rail: string;
  payer: string;
  tx?: string;
  explorerUrl?: string;
  paidAt: number;
}

export interface ChainInfo { id: string; name: string; rpc: string; explorer: string; nativeSymbol: string }

export interface RailManifest {
  id: string;
  label: string;
  description: string;
  audience: ("human" | "agent")[];
  available: boolean;
  countries?: string[];
  wallet?: { chains: ChainInfo[] };
  assets: { symbol: string; decimals: number }[];
}

export type IntentStatus = "pending" | "paid" | "expired";

export interface SessionGrant {
  token: string;
  sid: string;
  shell: string;
  starts_at: number;
  expires_at: number;
  payment?: Payment;
}

export interface IntentView {
  intent: Omit<Intent, "meta">;
  status: IntentStatus;
  session?: SessionGrant;
}

export type GatewayEvent =
  | { type: "state"; shell: string; state: ShellState }
  | { type: "status"; shell: string; status: ShellStatus }
  | { type: "session_started"; shell: string; sid: string; rail: string; expires_at: number }
  | { type: "session_ended"; shell: string; sid: string; reason: "expired" | "ended" | "offline" }
  | { type: "payment_seen"; intentId: string; rail: string; tx?: string; explorerUrl?: string };
