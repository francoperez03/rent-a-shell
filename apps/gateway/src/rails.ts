// Registro de rieles por RAILS (spec 08). El gateway solo conoce PaymentRail.
import { fakeRail, type PaymentRail, type RailFactory } from "@ras/rails-core";
import { rails as celo, identity as celoIdentity } from "@ras/rails-celo";
import { rails as twin } from "@ras/rails-twin";
import { rails as belo } from "@ras/rails-belo";
import type { Env } from "./config.ts";

const FACTORIES: Record<string, RailFactory> = { fake: () => fakeRail(), ...celo, ...twin, ...belo };

export function loadRails(ids: string[], env: Env): PaymentRail[] {
  return ids.map((id) => {
    const f = FACTORIES[id];
    if (!f) throw new Error(`Riel desconocido: ${id}. Disponibles: ${Object.keys(FACTORIES).join(", ")}`);
    const r = f(env);
    return Array.isArray(r) ? r[0] : r;
  });
}

/** Registros ERC-8004 para la agent card, de los rieles que tengan identidad on-chain. */
export function identities(ids: string[], env: Env) {
  return ids.some((id) => id.startsWith("celo")) ? celoIdentity(env).registrations : [];
}
