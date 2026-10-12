// Servidor MCP sin estado (Streamable HTTP, transporte Web estándar). Un server por request.
// rent_shell no paga: devuelve cómo pagar por x402 (el cliente MCP no firma pagos). Con el token,
// send_command y end_session operan igual que la API HTTP.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { PaymentRail } from "@ras/rails-core";
import type { Command, Money, Shell } from "@ras/shell-spec";
import type { Config } from "./config.ts";
import type { Robot } from "./robot.ts";
import type { Sessions } from "./sessions.ts";
import type { Frames } from "./frame.ts";

interface Deps {
  cfg: Config;
  shell: () => Shell;
  rails: PaymentRail[];
  robot: Robot;
  sessions: Sessions;
  frames: Frames;
  price: (blocks: number) => Money;
  publicUrl: string;
}

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
const fail = (v: unknown) => ({ ...text(v), isError: true });

function build(d: Deps) {
  const s = new McpServer({ name: "rent-a-shell", version: "0.1.0" });

  s.registerTool("list_shells", { description: "Lista los cuerpos robóticos disponibles con estado, rangos, rutinas y precio." }, async () =>
    text([d.shell()]),
  );

  s.registerTool(
    "get_state",
    { description: "Ángulos reales del robot y si se está moviendo.", inputSchema: { shell: z.string().default("el-tucu") } },
    async () => {
      const st = await d.robot.state();
      return st ? text(st) : fail({ error: "robot_offline" });
    },
  );

  s.registerTool(
    "get_frame",
    { description: "Foto actual de la cámara del shell (JPEG).", inputSchema: { shell: z.string().default("el-tucu") } },
    async () => {
      const jpg = await d.frames.latest();
      if (!jpg) return fail({ error: "no_camera" });
      return { content: [{ type: "image" as const, data: jpg.toString("base64"), mimeType: "image/jpeg" }] };
    },
  );

  s.registerTool(
    "rent_shell",
    {
      description:
        "Cómo alquilar un shell: devuelve el precio y el endpoint x402 a pagar. Pagá con un cliente x402 (POST al endpoint) y usá el token que devuelve en send_command.",
      inputSchema: { shell: z.string().default("el-tucu"), blocks: z.number().int().min(1).max(6).default(1) },
    },
    async ({ shell, blocks }) => {
      const x402 = d.rails.filter((r) => r.paywall && r.manifest().available).map((r) => r.manifest());
      return text({
        shell,
        blocks,
        minutes: blocks * d.cfg.shell.pricing.block_minutes,
        price: d.price(blocks),
        pay: { method: "POST", url: `${d.publicUrl}/api/sessions/x402?shell=${shell}&blocks=${blocks}`, protocol: "x402", rails: x402 },
        queue: { active: Boolean(d.sessions.active(shell)), waiting: d.sessions.waiting(shell).length },
        docs: `${d.publicUrl}/llms.txt`,
      });
    },
  );

  s.registerTool(
    "send_command",
    {
      description: "Manda un comando al robot durante una sesión pagada. cmd: joint (args joint y angle), dance (args rutina) o stop.",
      inputSchema: {
        token: z.string(),
        cmd: z.enum(["joint", "dance", "stop"]),
        joint: z.enum(["base", "shoulder", "elbow", "grip"]).optional(),
        angle: z.number().optional(),
        rutina: z.string().optional(),
      },
    },
    async ({ token, cmd, joint, angle, rutina }) => {
      const v = await d.sessions.validate(token, d.cfg.shell.id);
      if (!v.s) return fail({ error: v.error });
      let c: Command;
      if (cmd === "joint") {
        if (!joint || angle === undefined) return fail({ error: "joint y angle son obligatorios" });
        c = { cmd, args: { joint, angle } };
      } else if (cmd === "dance") {
        if (!rutina || !d.cfg.shell.routines.includes(rutina)) return fail({ error: "rutina inválida", rutinas: d.cfg.shell.routines });
        c = { cmd, args: { rutina } };
      } else c = { cmd: "stop" };
      const r = await d.robot.send(c);
      return r.status < 300 ? text(r.data) : fail({ status: r.status, ...(r.data as object) });
    },
  );

  s.registerTool(
    "end_session",
    { description: "Termina la sesión antes de tiempo. El robot vuelve a HOME.", inputSchema: { token: z.string() } },
    async ({ token }) => {
      const v = await d.sessions.validate(token);
      if (!v.s) return fail({ error: v.error });
      d.sessions.end(v.s.sid, "ended");
      await d.robot.goHome();
      return text({ ok: true });
    },
  );

  return s;
}

export async function mcpHandler(req: Request, d: Deps): Promise<Response> {
  const server = build(d);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}
