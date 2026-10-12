// llms.txt y agent card ERC-8004. Todo sale de la ficha y de los manifiestos: sin datos de chain fijos acá.
import type { PaymentRail } from "@ras/rails-core";
import type { Shell } from "@ras/shell-spec";
import type { Config } from "./config.ts";

export function llmsTxt(cfg: Config, shell: Shell, rails: PaymentRail[]): string {
  const u = cfg.publicUrl;
  const m = rails.map((r) => r.manifest());
  const agentRails = m.filter((r) => r.audience.includes("agent") && r.available);
  const j = shell.joints;
  const payUrl = `${u}/api/sessions/x402?shell=${shell.id}&blocks=1`;
  const examples = rails
    .filter((r) => r.clientExample && r.manifest().available)
    .map((r) => `Ejemplo (${r.id}):\n\n${r.clientExample!(payUrl)}`)
    .join("\n\n");
  return `# Rent a Shell

> Alquilá un cuerpo robótico real por bloques de ${shell.pricing.block_minutes} minutos. Pagás, recibís un token de sesión, movés el robot y lo ves por cámara. Al vencer vuelve solo a HOME.

## Shell disponible

- id: ${shell.id} (${shell.name}), ${shell.kind}, ${shell.location}, estado: ${shell.status}
- Articulaciones y rango seguro en grados: base ${j.base[0]} a ${j.base[1]}, shoulder ${j.shoulder[0]} a ${j.shoulder[1]}, elbow ${j.elbow[0]} a ${j.elbow[1]}, grip ${j.grip[0]} a ${j.grip[1]}. Fuera de rango se recorta.
- HOME: ${JSON.stringify(shell.home)}
- Rutinas: ${shell.routines.join(", ")}
- Precio: USD ${shell.pricing.usd} por bloque de ${shell.pricing.block_minutes} min, máximo ${cfg.maxBlocks} bloques
- Cámara: HLS ${shell.camera.hls ?? "(no publicada)"} · último frame JPEG ${shell.camera.frame}

## Medios de pago para agentes

${agentRails.length ? agentRails.map((r) => `- ${r.id}: ${r.label}. ${r.description}`).join("\n") : "- Ninguno activo ahora."}

## Cómo alquilar (x402)

1. POST ${u}/api/sessions/x402?shell=${shell.id}&blocks=1 responde 402 con el requerimiento de pago (header PAYMENT-REQUIRED).
2. Firmá el pago con un cliente x402 y reintentá con el header PAYMENT-SIGNATURE.

${examples}

3. La respuesta es { token, sid, starts_at, expires_at, payment }. Si el robot está ocupado, starts_at es futuro: esperá hasta esa hora.

## Controlar

- POST ${u}/api/cmd con Authorization: Bearer <token> y JSON:
  - {"cmd":"joint","args":{"joint":"base","angle":120}}
  - {"cmd":"dance","args":{"rutina":"saludo"}}
  - {"cmd":"stop"}
- GET ${u}/api/shells/${shell.id}/state: ángulos reales y si se mueve.
- GET ${u}/api/shells/${shell.id}/frame: foto actual.
- POST ${u}/api/sessions/end con el token: cierra antes y vuelve a HOME.
- Límite: 10 comandos por segundo. 409 si el robot está ejecutando una rutina.

## Otras entradas

- MCP (Streamable HTTP): ${u}/mcp, tools list_shells, get_state, get_frame, rent_shell, send_command, end_session
- Agent card ERC-8004: ${u}/.well-known/agent.json
- Personas: ${cfg.allowedOrigin !== "*" ? cfg.allowedOrigin : u}
`;
}

export function agentCard(cfg: Config, rails: PaymentRail[], registrations: { agentId: number; agentRegistry: string }[]) {
  const u = cfg.publicUrl;
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Rent a Shell",
    description: `Alquiler por tiempo de cuerpos robóticos reales para agentes y personas. Shell #1: ${cfg.shell.name}, brazo de 4 ejes con cámara en vivo. USD ${cfg.shell.pricing.usd} por ${cfg.shell.pricing.block_minutes} min.`,
    image: `${cfg.allowedOrigin !== "*" ? cfg.allowedOrigin : u}/og.png`,
    services: [
      { name: "web", endpoint: cfg.allowedOrigin !== "*" ? cfg.allowedOrigin : u },
      { name: "MCP", endpoint: `${u}/mcp`, version: "2025-06-18" },
      { name: "x402", endpoint: `${u}/api/sessions/x402` },
      { name: "llms.txt", endpoint: `${u}/llms.txt` },
    ],
    x402Support: rails.some((r) => r.paywall && r.manifest().available),
    active: true,
    supportedTrust: ["reputation"],
    ...(registrations.length ? { registrations } : {}),
  };
}
