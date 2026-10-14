// Example buyer agent (demo case, docs/specs/05-agents.md): rents El Tucu over x402,
// tests a motion sequence on real hardware and returns a report with angles and the tx.
//   BUYER_SOLANA_KEY=<secret key base58> GATEWAY_URL=http://localhost:8787 pnpm buyer
// Throwaway wallet with a little USDC on the gateway network. No SOL needed: the facilitator pays the fee.
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { toClientSvmSigner } from "@x402/svm";
import { createKeyPairSignerFromBytes, getBase58Encoder } from "@solana/kit";

const GW = (process.env.GATEWAY_URL ?? "http://localhost:8787").replace(/\/$/, "");
const SHELL = process.env.SHELL_ID ?? "el-tucu";
const raw = process.env.BUYER_SOLANA_KEY;
if (!raw) {
  console.error("Missing BUYER_SOLANA_KEY (64-byte base58 secret key of a throwaway wallet with USDC).");
  process.exit(1);
}
const account = await createKeyPairSignerFromBytes(getBase58Encoder().encode(raw.trim()));

// The routine under test: what a robotics agent would want to validate on real hardware.
const SEQUENCE: { joint: "base" | "shoulder" | "elbow" | "grip"; angle: number }[] = [
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
console.log(`Shell ${shell.name} (${shell.status}) · USD ${shell.pricing.usd} per ${shell.pricing.block_minutes} min`);

const client = new x402Client();
client.register("solana:*", new ExactSvmScheme(toClientSvmSigner(account)));
const pay = wrapFetchWithPayment(fetch, client);

// Gateways with escrow (spec 14) bind the payment to an intent: its URL is the x402 endpoint for this session.
// Gateways without escrow answer 400 (unknown_rail) and the direct URL stays.
let payUrl = `${GW}/api/sessions/x402?shell=${SHELL}&blocks=1`;
const it = await fetch(`${GW}/api/sessions/intent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shell: SHELL, blocks: 1, rail: "solana-x402" }) });
if (it.ok) {
  const v = (await it.json()) as { intent: { id: string; instructions: { kind: string; url?: string } } };
  if (v.intent.instructions.url) {
    payUrl = v.intent.instructions.url;
    console.log(`Intent ${v.intent.id}: the payment goes to an escrow and comes back if the robot drops.`);
  }
}
console.log(`Paying 1 block as ${account.address}…`);
const res = await pay(payUrl, { method: "POST" });
if (!res.ok) {
  const pr = res.headers.get("payment-required");
  const why = pr ? JSON.parse(Buffer.from(pr, "base64").toString("utf8")).error : await res.text();
  console.error("Payment rejected:", res.status, why);
  process.exit(1);
}
const grant = (await res.json()) as { token: string; starts_at: number; expires_at: number; payment?: { tx?: string; explorerUrl?: string } };
console.log("Payment:", grant.payment?.explorerUrl ?? grant.payment?.tx ?? "(no tx)");
if (grant.starts_at > Date.now()) {
  console.log(`The robot is busy. Starting in ${Math.ceil((grant.starts_at - Date.now()) / 1000)} s.`);
  await sleep(grant.starts_at - Date.now() + 200);
}

const cmd = (body: unknown) =>
  fetch(`${GW}/api/cmd`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${grant.token}` },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, data: await r.json() }));

const report = [];
for (const step of SEQUENCE) {
  const r = await cmd({ cmd: "joint", args: step });
  // the firmware moves 2° every 20 ms: wait until it arrives before measuring
  let st;
  let peakMa: number | null = null; // peak bus current while moving (if the shell has an INA219)
  for (let i = 0; i < 30; i++) {
    await sleep(100);
    st = await get(`/api/shells/${SHELL}/state`);
    if (typeof st.current_ma === "number") peakMa = Math.max(peakMa ?? 0, st.current_ma);
    if (!st.moving && st.angles?.[step.joint] === (r.data.angle ?? step.angle)) break;
  }
  const measured = st?.angles?.[step.joint];
  report.push({ ...step, accepted: r.data.angle ?? null, clamped: Boolean(r.data.clamped), measured, peak_ma: peakMa, ok: r.status === 200 && measured === (r.data.angle ?? step.angle) });
  console.log(`  ${step.joint} → ${step.angle}°: ${r.status} measured ${measured}°${peakMa != null ? ` · peak ${peakMa} mA` : ""}${r.data.clamped ? " (clamped)" : ""}`);
}

await fetch(`${GW}/api/sessions/end`, { method: "POST", headers: { authorization: `Bearer ${grant.token}` } });
const okN = report.filter((p) => p.ok).length;
console.log(`\nReport: ${okN}/${report.length} steps reached the requested position. Session closed, El Tucu returns to HOME.`);
console.log(JSON.stringify({ shell: SHELL, payment: grant.payment, steps: report }, null, 2));
