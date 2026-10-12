// Riel belo (agentic.belo.app, en waitlist al 2026-10-11): MCP v1 donde el agente propone y una persona aprueba.
// ponytail: stub hasta que belo publique API y confirme si paga a una address on-chain externa (spec 08).
import type { RailFactory } from "@ras/rails-core";

export const rails: Record<string, RailFactory> = {
  belo: () => ({
    id: "belo",
    manifest: () => ({
      id: "belo",
      label: "belo",
      description: "Tu agente propone el pago en belo y vos lo aprobás. Próximamente.",
      audience: ["agent", "human"],
      available: false,
      countries: ["AR", "BR", "BO", "CO", "CL", "EC", "MX", "PA", "PY", "PE", "UY", "VE"],
      assets: [{ symbol: "USD", decimals: 2 }],
    }),
  }),
};
