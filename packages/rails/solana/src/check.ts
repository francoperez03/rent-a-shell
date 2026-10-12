// Keyless preflight: the facilitator supports exact on the network and the USDC mint exists.
import { createSolanaRpc } from "@solana/kit";
import { facilitatorUrl, rpcUrl, solNet } from "./config.ts";

const env = process.env;
const net = solNet(env);
const fac = facilitatorUrl(net, env);
const res = await fetch(`${fac}/supported`);
const sup = (await res.json().catch(() => ({}))) as { kinds?: { scheme: string; network: string }[] };
const ok = sup.kinds?.some((k) => k.scheme === "exact" && k.network === net.caip2);
console.log(`facilitator ${fac}/supported: ${res.status} ${ok ? `exact on ${net.caip2}` : "NOT SUPPORTED"}`);
const acc = await createSolanaRpc(rpcUrl(net, env)).getAccountInfo(net.usdc, { encoding: "base64" }).send();
console.log(`USDC ${net.usdc} on ${net.label}: ${acc.value ? "mint found" : "MISSING"}`);
console.log(`SOLANA_PAY_TO: ${env.SOLANA_PAY_TO ?? "missing"}`);
if (!ok || !acc.value) process.exit(1);
