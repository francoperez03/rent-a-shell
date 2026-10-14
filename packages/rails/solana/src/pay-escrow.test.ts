import { test } from "node:test";
import assert from "node:assert/strict";
import anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { acceptableDeposit } from "./pay-escrow.ts";

const { BN } = anchor;
const operator = Keypair.generate().publicKey;
const forger = Keypair.generate().publicKey;
const now = 1_800_000_000;
const holdSec = 6 * 3600;
const opts = { operator, forger, now, holdSec };
const dep = (o: Partial<{ operator: typeof operator; forger: typeof forger; expiresAt: number }> = {}) => ({
  operator: o.operator ?? operator,
  forger: o.forger ?? forger,
  expiresAt: new BN(o.expiresAt ?? now + holdSec),
});

test("accepts the deposit the rail builds", () => {
  assert.equal(acceptableDeposit(dep(), opts), true);
  // the intent lived 14 min before the wallet signed: still inside the window
  assert.equal(acceptableDeposit(dep({ expiresAt: now + holdSec - 14 * 60 }), opts), true);
});

test("rejects a wrong operator", () => {
  assert.equal(acceptableDeposit(dep({ operator: Keypair.generate().publicKey }), opts), false);
});

test("rejects a wrong forger", () => {
  assert.equal(acceptableDeposit(dep({ forger: Keypair.generate().publicKey }), opts), false);
});

test("rejects expires_at too early (a past deadline lets the renter reclaim)", () => {
  assert.equal(acceptableDeposit(dep({ expiresAt: now - 10 }), opts), false);
  assert.equal(acceptableDeposit(dep({ expiresAt: now + holdSec - 16 * 60 - 1 }), opts), false);
});

test("rejects expires_at too late", () => {
  assert.equal(acceptableDeposit(dep({ expiresAt: now + holdSec + 61 }), opts), false);
});

test("rejects a deposit bound to another shell record, accepts the expected one", () => {
  const shell = Keypair.generate().publicKey;
  assert.equal(acceptableDeposit({ ...dep(), shell: Keypair.generate().publicKey }, opts), false);
  assert.equal(acceptableDeposit({ ...dep(), shell }, { ...opts, shell }), true);
  assert.equal(acceptableDeposit({ ...dep(), shell }, opts), false, "bound while the rail expected unbound");
});
