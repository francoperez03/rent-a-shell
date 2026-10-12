// Riel Twin (ARGt, BOLt, BRAt, CHLt, COLt, MEXt, PERt en Arbitrum, Base, Polygon, Ethereum).
// ponytail: stub hasta después de la hackathon (plan F2b). Para implementarlo: copiar TOKENS/RPC_URLS de
// stables/twin/apps/faro/lib/config/tokens.ts y reusar findTransfer del riel celo con la chain elegida.
// Verificar antes las addresses repetidas de la tabla de Twin (spec 08).
import type { RailFactory } from "@ras/rails-core";

export const rails: Record<string, RailFactory> = {
  "twin-wallet": () => ({
    id: "twin-wallet",
    manifest: () => ({
      id: "twin-wallet",
      label: "Stablecoins Twin",
      description: "ARGt y otras monedas Twin en Arbitrum, Base, Polygon o Ethereum. Próximamente.",
      audience: ["human"],
      available: false,
      countries: ["AR", "BO", "BR", "CL", "CO", "MX", "PE"],
      assets: ["ARGt", "BOLt", "BRAt", "CHLt", "COLt", "MEXt", "PERt"].map((symbol) => ({ symbol, decimals: 18 })),
    }),
  }),
};
