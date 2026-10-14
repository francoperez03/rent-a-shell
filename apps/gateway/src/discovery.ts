// llms.txt and agent card. Everything comes from the spec sheet and the rail manifests: no hardcoded chain data here.
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
    .map((r) => `Example (${r.id}):\n\n${r.clientExample!(payUrl)}`)
    .join("\n\n");
  return `# Rent a Shell

> Rent a real robot body in ${shell.pricing.block_minutes}-minute blocks. Pay, get a session token, move the robot and watch it on camera. When time runs out it returns to HOME on its own.

## Available shell

- id: ${shell.id} (${shell.name}), ${shell.kind}, ${shell.location}, status: ${shell.status}
- Joints and safe range in degrees: base ${j.base[0]} to ${j.base[1]}, shoulder ${j.shoulder[0]} to ${j.shoulder[1]}, elbow ${j.elbow[0]} to ${j.elbow[1]}, grip ${j.grip[0]} to ${j.grip[1]}. Out-of-range values are clamped.
- HOME: ${JSON.stringify(shell.home)}
- Routines: ${shell.routines.join(", ")}
- Sensors in /state: ${shell.sensors.join(", ")}${shell.sensors.includes("current_ma") ? " (current_ma = total mA on the servo bus; use it to measure how much your motion draws)" : ""}
- Price: USD ${shell.pricing.usd} per ${shell.pricing.block_minutes}-minute block, up to ${cfg.maxBlocks} blocks
- Platform fee: 10 % of each session, taken when the escrow settles (fee_bps in the shell_escrow config)${cfg.escrow ? "; the rest goes to the Forger" : ". This gateway runs without escrow: x402 pays the Forger directly and no fee applies"}
- Camera: HLS ${shell.camera.hls ?? "(not published)"} · latest JPEG frame ${shell.camera.frame}
- Forger (who builds and maintains it): ${shell.forger.name}${shell.forger.contact ? `, contact ${shell.forger.contact}` : ""}${shell.forger.customizations ? ". Takes customization requests." : ""}
- Owning one: about USD ${shell.build.parts_usd} in parts, ${shell.build.lead_days} days of waiting and ${shell.build.build_hours} h of assembly. Here: USD ${shell.pricing.usd} per ${shell.pricing.block_minutes} min, starting now.

## Payment rails for agents

${agentRails.length ? agentRails.map((r) => `- ${r.id}: ${r.label}. ${r.description}`).join("\n") : "- None active right now."}

## How to rent (x402)

1. POST ${u}/api/sessions/x402?shell=${shell.id}&blocks=1 answers 402 with the payment requirement (PAYMENT-REQUIRED header).
2. Sign the payment with an x402 client and retry with the PAYMENT-SIGNATURE header.

${examples}

3. The response is { token, sid, starts_at, expires_at, payment }. If the robot is busy, starts_at is in the future: wait until then.

## Control

- POST ${u}/api/cmd with Authorization: Bearer <token> and JSON:
  - {"cmd":"joint","args":{"joint":"base","angle":120}}
  - {"cmd":"dance","args":{"rutina":"saludo"}}
  - {"cmd":"stop"}
- GET ${u}/api/shells/${shell.id}/state: real angles and whether it is moving.
- GET ${u}/api/shells/${shell.id}/frame: current photo.
- POST ${u}/api/sessions/end with the token: ends early and returns to HOME.
- Limit: 10 commands per second. 409 while the robot runs a routine.

## Other entry points

- MCP (Streamable HTTP): ${u}/mcp, tools list_shells, get_state, get_frame, rent_shell, send_command, end_session
- Agent card: ${u}/.well-known/agent.json
- Humans: ${cfg.allowedOrigin !== "*" ? cfg.allowedOrigin : u}
`;
}

export function agentCard(cfg: Config, rails: PaymentRail[]) {
  const u = cfg.publicUrl;
  return {
    name: "Rent a Shell",
    description: `Time-based rental of real robot bodies for agents and humans. Shell #1: ${cfg.shell.name}, a 4-axis arm with a live camera. USD ${cfg.shell.pricing.usd} per ${cfg.shell.pricing.block_minutes} min.`,
    image: `${cfg.allowedOrigin !== "*" ? cfg.allowedOrigin : u}/og.png`,
    services: [
      { name: "web", endpoint: cfg.allowedOrigin !== "*" ? cfg.allowedOrigin : u },
      { name: "MCP", endpoint: `${u}/mcp`, version: "2025-06-18" },
      { name: "x402", endpoint: `${u}/api/sessions/x402` },
      { name: "llms.txt", endpoint: `${u}/llms.txt` },
    ],
    x402Support: rails.some((r) => r.paywall && r.manifest().available),
    active: true,
    payments: rails.map((r) => r.manifest()).filter((m) => m.available).map((m) => ({ id: m.id, network: m.wallet?.chains[0]?.id, assets: m.assets.map((a) => a.symbol) })),
  };
}
