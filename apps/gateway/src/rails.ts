// Registro de rieles por RAILS (spec 08). El gateway solo conoce PaymentRail.
import { fakeRail, type PaymentRail, type RailFactory } from "@ras/rails-core";
import { rails as solana } from "@ras/rails-solana";
import type { Env } from "./config.ts";

const FACTORIES: Record<string, RailFactory> = { fake: () => fakeRail(), ...solana };

export function loadRails(ids: string[], env: Env): PaymentRail[] {
  return ids.map((id) => {
    const f = FACTORIES[id];
    if (!f) throw new Error(`Riel desconocido: ${id}. Disponibles: ${Object.keys(FACTORIES).join(", ")}`);
    const r = f(env);
    return Array.isArray(r) ? r[0] : r;
  });
}
