# 08 · Payment rails behind an adapter

Design rule: **no file outside `packages/rails/*` imports `@solana/*`, `@x402/*`, mints, CAIP-2 networks or facilitators.** The gateway and the website talk to an interface. Today there's a single implementation (Solana); another rail is added with a new package and the `RAILS` variable, without touching the gateway.

## Where it lives

```
packages/
  rails/
    core/      interface, amount helpers, registry, fakeRail for tests (no network dependencies)
    solana/    solana-x402 (agents) and solana-pay (people)
```

`apps/gateway` depends on `rails/core` and on the packages it loads by config. `apps/web` depends on no rail package: it reads the manifests from the gateway.

## Interface

```ts
// packages/rails/core/src/index.ts
interface PaymentRail {
  id: string                                          // "solana-x402", "solana-pay", "fake"
  manifest(): RailManifest                            // what the website needs to draw the checkout
  createIntent?(price: Money, opts: { id: string; asset?: string }): Promise<Intent>
  check?(intent: Intent): Promise<Payment | null>     // async rails: the gateway polls until paid or expired
  paywall?(path, priceFor, description): MiddlewareHandler  // sync rails (x402): charges before the handler
  clientExample?(url: string): string                 // snippet for llms.txt and /agents
  fetch?(req: Request): Promise<Response>             // own routes, mounted at /api/rails/:id/*
  finalize?(payment: Payment, outcome: "completed" | "refund"): Promise<{ tx?: string } | void>
}

// packages/shell-spec/src/index.ts
type Instructions =
  | { kind: "x402"; url: string }
  | { kind: "solana-pay"; url: string; reference: string; to: string; amount: string; symbol: string }
  | { kind: "approval"; ref: string; note: string }
```

Rules:
- The canonical price is USD. Each rail converts it to its asset and fixes it in the intent (15 min).
- A rail never touches sessions or the robot. It returns a `Payment` and the gateway issues the token.
- The payment reference and the on-chain matching live inside the rail.
- The gateway stores intents and payments with `rail` as data: switching rails doesn't break history.
- `fetch`: the gateway mounts the rail's routes at `/api/rails/:id/*` without knowing what they do. Today: the Solana Pay transaction request (`GET`/`POST /api/rails/solana-pay/tx/:intentId`) and its icon.
- `finalize`: the gateway calls it when each paid session closes. `completed` releases funds to the Forger (with the fee), `refund` returns them to the payer. It must be idempotent. Rails that charge directly (x402) don't implement it.

## Registry by configuration

```bash
RAILS=solana-x402,solana-pay   # production
RAILS=fake                     # development and tests, no network
```

Each rail reads its own variables (`SOLANA_*`, `X402_*`).

## Gateway API (rail-independent)

| Method | Path | What it does |
|---|---|---|
| GET | `/api/rails` | manifests of the active rails |
| POST | `/api/sessions/intent` | `{shell, blocks, rail, asset?}` → `Intent` |
| GET | `/api/sessions/intent/:id` | calls the rail's `check()`; with `paid` it returns the token |
| POST | `/api/sessions/x402` | mounts the `paywall()` of the active x402 rail |

## Website

- The checkout calls `GET /api/rails` and draws one option per manifest with a human `audience`. No hardcoded rails in the code.
- The payment step is drawn by `instructions.kind`: `solana-pay` (QR, "Open in wallet" button, copyable link), `approval` (text and wait), `x402` (agents only, documented in `/agents`).
- The Solscan link comes from the `Payment`'s `explorerUrl`.

## Tests and isolation

- `rails/core` ships a `fakeRail` that pays on the second `check()`. The gateway tests use that rail.
- `rails/solana` has tests for `received()` (sum of pre/postTokenBalances) and the Solana Pay link, plus an escrow e2e on a local validator (`pnpm --filter @ras/rails-solana e2e`).
- `scripts/check-isolation.sh` runs in `pnpm test`: it fails if `solana:<genesis>`, a USDC mint, `@x402/` or `@solana/` appears in `apps/` or `packages/shell-spec`. `apps/buyer` is exempt because it's an example external client.
