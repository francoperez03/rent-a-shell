import type { GatewayEvent } from "@ras/shell-spec";

type Listener = (e: GatewayEvent) => void;
const listeners = new Set<Listener>();

export const bus = {
  emit(e: GatewayEvent) {
    for (const l of listeners) l(e);
  },
  on(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
