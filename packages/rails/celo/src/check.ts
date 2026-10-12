// Preflight sin keys (patrón x402-celo-example/src/check.ts): facilitator soporta exact en la red y USDC tiene código.
import { celoNet, rpcUrl } from "./config.ts";
import { client } from "./watch.ts";

const env = process.env;
const net = celoNet(env);
const fac = env.CELO_X402_FACILITATOR_URL || net.facilitator;
const res = await fetch(`${fac}/supported`);
const sup = (await res.json().catch(() => ({}))) as { kinds?: { scheme: string; network: string }[] };
const ok = sup.kinds?.some((k) => k.scheme === "exact" && k.network === net.caip2);
console.log(`facilitator ${fac}/supported: ${res.status} ${ok ? `exact en ${net.caip2}` : "NO SOPORTADO"}`);
const code = await client(net, rpcUrl(net, env)).getCode({ address: net.usdc });
const hasCode = Boolean(code && code !== "0x");
console.log(`USDC ${net.usdc} en ${net.label}: ${hasCode ? "tiene código" : "SIN CÓDIGO"}`);
console.log(`X402_API_KEY: ${env.X402_API_KEY ? "presente" : "falta (sin ella /settle da 401)"}`);
console.log(`CELO_PAY_TO: ${env.CELO_PAY_TO ?? "falta"}`);
if (!ok || !hasCode) process.exit(1);
