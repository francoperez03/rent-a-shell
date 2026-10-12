// Agente comprador de ejemplo (caso de demo, docs/specs/05-agentes.md): alquila El Tucu por x402,
// prueba una secuencia de movimientos en hardware real y devuelve un reporte con ángulos y tx.
//   BUYER_PRIVATE_KEY=0x... GATEWAY_URL=http://localhost:8787 pnpm buyer
// Wallet descartable con un poco de USDC en la red del gateway. No necesita CELO: el facilitator paga el gas.
// Patrón de pagos-placa/spike.mjs (pagar) y celo-org/x402-celo-example/src/buyer.ts.
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const GW = (process.env.GATEWAY_URL ?? "http://localhost:8787").replace(/\/$/, "");
const SHELL = process.env.SHELL_ID ?? "el-tucu";
const raw = process.env.BUYER_PRIVATE_KEY;
if (!raw) {
  console.error("Falta BUYER_PRIVATE_KEY (wallet descartable con USDC).");
  process.exit(1);
}
const account = privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`);

// La rutina a probar: lo que un agente de robótica querría validar en hardware real.
const SECUENCIA: { joint: "base" | "shoulder" | "elbow" | "grip"; angle: number }[] = [
  { joint: "base", angle: 130 },
  { joint: "shoulder", angle: 110 },
  { joint: "elbow", angle: 70 },
  { joint: "grip", angle: 100 },
  { joint: "grip", angle: 50 },
  { joint: "base", angle: 60 },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const get = (p: string) => fetch(GW + p).then((r) => r.json());

const shells = await get("/api/shells");
const shell = shells.find((s: { id: string }) => s.id === SHELL);
console.log(`Shell ${shell.name} (${shell.status}) · USD ${shell.pricing.usd} por ${shell.pricing.block_minutes} min`);

const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(account));
const pay = wrapFetchWithPayment(fetch, client);

console.log(`Pagando 1 bloque como ${account.address}…`);
const res = await pay(`${GW}/api/sessions/x402?shell=${SHELL}&blocks=1`, { method: "POST" });
if (!res.ok) {
  const pr = res.headers.get("payment-required");
  const why = pr ? JSON.parse(Buffer.from(pr, "base64").toString("utf8")).error : await res.text();
  console.error("Pago rechazado:", res.status, why);
  process.exit(1);
}
const grant = (await res.json()) as { token: string; starts_at: number; expires_at: number; payment?: { tx?: string; explorerUrl?: string } };
console.log("Pago:", grant.payment?.explorerUrl ?? grant.payment?.tx ?? "(sin tx)");
if (grant.starts_at > Date.now()) {
  console.log(`El robot está ocupado. Arranco en ${Math.ceil((grant.starts_at - Date.now()) / 1000)} s.`);
  await sleep(grant.starts_at - Date.now() + 200);
}

const cmd = (body: unknown) =>
  fetch(`${GW}/api/cmd`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${grant.token}` },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, data: await r.json() }));

const reporte = [];
for (const paso of SECUENCIA) {
  const r = await cmd({ cmd: "joint", args: paso });
  // el firmware mueve a 2° cada 20 ms: esperar a que llegue antes de medir
  let st;
  for (let i = 0; i < 30; i++) {
    await sleep(100);
    st = await get(`/api/shells/${SHELL}/state`);
    if (!st.moving && st.angles?.[paso.joint] === (r.data.angle ?? paso.angle)) break;
  }
  const medido = st?.angles?.[paso.joint];
  reporte.push({ ...paso, aceptado: r.data.angle ?? null, recortado: Boolean(r.data.clamped), medido, ok: r.status === 200 && medido === (r.data.angle ?? paso.angle) });
  console.log(`  ${paso.joint} → ${paso.angle}°: ${r.status} medido ${medido}°${r.data.clamped ? " (recortado)" : ""}`);
}

await fetch(`${GW}/api/sessions/end`, { method: "POST", headers: { authorization: `Bearer ${grant.token}` } });
const okN = reporte.filter((p) => p.ok).length;
console.log(`\nReporte: ${okN}/${reporte.length} pasos llegaron a la posición pedida. Sesión cerrada, El Tucu vuelve a HOME.`);
console.log(JSON.stringify({ shell: SHELL, pago: grant.payment, pasos: reporte }, null, 2));
