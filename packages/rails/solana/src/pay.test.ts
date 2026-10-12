import { test } from "node:test";
import assert from "node:assert/strict";
import { newReference, received, solanaPayUrl } from "./pay.ts";

test("received only sums the owner's token", () => {
  const b = (owner: string, mint: string, amount: string) => ({ owner, mint, uiTokenAmount: { amount } });
  const meta = {
    preTokenBalances: [b("OWNER", "USDC", "500"), b("PAYER", "USDC", "3000000")],
    postTokenBalances: [b("OWNER", "USDC", "1000500"), b("PAYER", "USDC", "2000000"), b("OWNER", "OTRO", "9")],
  };
  assert.equal(received(meta, "OWNER", "USDC"), 1_000_000n);
  assert.equal(received(meta, "PAYER", "USDC"), -1_000_000n);
  assert.equal(received({ postTokenBalances: [b("OWNER", "USDC", "7")] }, "OWNER", "USDC"), 7n); // ATA nueva
});

test("Solana Pay URL with reference", () => {
  const r = newReference();
  assert.match(r, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  const u = new URL(solanaPayUrl({ to: "DEST", amount: "1", mint: "MINT", reference: r, label: "Rent a Shell", message: "x" }));
  assert.equal(u.protocol, "solana:");
  assert.equal(u.searchParams.get("spl-token"), "MINT");
  assert.equal(u.searchParams.get("reference"), r);
  assert.ok(u.href.includes("label=Rent%20a%20Shell"));
});
