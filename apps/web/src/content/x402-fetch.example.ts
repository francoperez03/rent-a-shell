/** x402 client example shown on /agents; {{ORIGIN}} is replaced with the site origin. */
export const X402_EXAMPLE = `import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { toClientSvmSigner } from "@x402/svm";
import { createKeyPairSignerFromBytes, getBase58Encoder } from "@solana/kit";

const GW = "{{ORIGIN}}";
// Solana wallet with USDC; the facilitator pays the fee, no SOL needed
const signer = await createKeyPairSignerFromBytes(getBase58Encoder().encode(process.env.AGENT_SOLANA_KEY));

// 1. Pay for five minutes (blocks=1): the 402 carries the requirement, the client signs and retries.
const client = new x402Client();
client.register("solana:*", new ExactSvmScheme(toClientSvmSigner(signer)));
const pay = wrapFetchWithPayment(fetch, client);
const res = await pay(\`\${GW}/api/sessions/x402?shell=el-tucu&blocks=1\`, { method: "POST" });
const { token, starts_at, expires_at } = await res.json();

// 2. Send commands with the token while the session lasts.
await fetch(\`\${GW}/api/cmd\`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: \`Bearer \${token}\` },
  body: JSON.stringify({ cmd: "joint", args: { joint: "base", angle: 130 } }),
});

// 3. End early (optional). When time runs out it returns to HOME on its own.
await fetch(\`\${GW}/api/sessions/end\`, { method: "POST", headers: { authorization: \`Bearer \${token}\` } });`;
