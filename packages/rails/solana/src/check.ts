// Preflight sin keys: el facilitator soporta exact en la red y el mint de USDC existe.
import { createSolanaRpc } from "@solana/kit";
import { facilitatorUrl, rpcUrl, solNet } from "./config.ts";

const env = process.env;
const net = solNet(env);
const fac = facilitatorUrl(net, env);
const res = await fetch(`${fac}/supported`);
const sup = (await res.json().catch(() => ({}))) as { kinds?: { scheme: string; network: string }[] };
const ok = sup.kinds?.some((k) => k.scheme === "exact" && k.network === net.caip2);
console.log(`facilitator ${fac}/supported: ${res.status} ${ok ? `exact en ${net.caip2}` : "NO SOPORTADO"}`);
const acc = await createSolanaRpc(rpcUrl(net, env)).getAccountInfo(net.usdc, { encoding: "base64" }).send();
console.log(`USDC ${net.usdc} en ${net.label}: ${acc.value ? "mint encontrado" : "NO EXISTE"}`);
console.log(`SOLANA_PAY_TO: ${env.SOLANA_PAY_TO ?? "falta"}`);
if (!ok || !acc.value) process.exit(1);
