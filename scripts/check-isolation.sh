#!/usr/bin/env bash
# Spec 08: nada de chains, addresses ni x402 fuera de packages/rails/*.
# apps/web puede usar viem/wagmi solo para firmar lo que describe instructions (sin addresses ni chain IDs).
set -e
cd "$(dirname "$0")/.."
hits=$(grep -rnE '0x[0-9a-fA-F]{40}|42220|11142220|@x402/|x402\.celo' apps packages/shell-spec \
  --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=dist || true)
hits2=$(grep -rnE "from ['\"]viem" apps/gateway apps/buyer packages/shell-spec --include='*.ts' --exclude-dir=node_modules || true)
# el buyer es un cliente de ejemplo: puede usar @x402/fetch y viem para pagar como cualquier agente externo
hits=$(echo "$hits" | grep -v '^apps/buyer/' || true)
hits2=$(echo "$hits2" | grep -v '^apps/buyer/' || true)
if [ -n "$hits$hits2" ]; then echo "Fuga de infra de pagos fuera de packages/rails:"; echo "$hits"; echo "$hits2"; exit 1; fi
echo "aislamiento ok"
