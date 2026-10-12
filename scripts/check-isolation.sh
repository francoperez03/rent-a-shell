#!/usr/bin/env bash
# Spec 08: no networks, mints or x402 outside packages/rails/*.
set -e
cd "$(dirname "$0")/.."
hits=$(grep -rnE 'solana:[1-9A-HJ-NP-Za-km-z]{20,}|EPjFWdd5|4zMMC9sr|@x402/|@solana/' apps packages/shell-spec \
  --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=dist || true)
# the buyer is an example client: it pays with @x402/* and @solana/kit like any external agent
hits=$(echo "$hits" | grep -v '^apps/buyer/' || true)
if [ -n "$hits" ]; then echo "Payment infra leaked outside packages/rails:"; echo "$hits"; exit 1; fi
echo "isolation ok"
