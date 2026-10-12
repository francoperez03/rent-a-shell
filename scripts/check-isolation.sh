#!/usr/bin/env bash
# Spec 08: nada de redes, mints ni x402 fuera de packages/rails/*.
set -e
cd "$(dirname "$0")/.."
hits=$(grep -rnE 'solana:[1-9A-HJ-NP-Za-km-z]{20,}|EPjFWdd5|4zMMC9sr|@x402/|@solana/' apps packages/shell-spec \
  --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=dist || true)
# el buyer es un cliente de ejemplo: paga con @x402/* y @solana/kit como cualquier agente externo
hits=$(echo "$hits" | grep -v '^apps/buyer/' || true)
if [ -n "$hits" ]; then echo "Fuga de infra de pagos fuera de packages/rails:"; echo "$hits"; exit 1; fi
echo "aislamiento ok"
