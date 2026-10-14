// Stateless MCP server (Streamable HTTP, standard Web transport). One server per request.
// rent_shell does not pay: it returns how to pay with x402 (MCP clients do not sign payments); on an escrow gateway
// it creates the intent so the answer is the URL bound to it. With the token, send_command and end_session behave
// like the HTTP API.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { PaymentRail } from "@ras/rails-core";
import type { Command, Money, Shell } from "@ras/shell-spec";
import type { IntentRec } from "./sessions.ts";
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
  createIntent: (railId: string | undefined, blocks: number) => Promise<{ rec?: IntentRec; error?: string }>;
  publicUrl: string;
}

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
const fail = (v: unknown) => ({ ...text(v), isError: true });

function build(d: Deps) {
  const s = new McpServer({ name: "rent-a-shell", version: "0.1.0" });

  s.registerTool("list_shells", { description: "Lists the available robot bodies with status, ranges, routines and price." }, async () =>
    text([d.shell()]),
  );

  s.registerTool(
    "get_state",
    { description: "Real robot angles and whether it is moving.", inputSchema: { shell: z.string().default("el-tucu") } },
    async () => {
      const st = await d.robot.state();
      return st ? text(st) : fail({ error: "robot_offline" });
    },
  );

  s.registerTool(
    "get_frame",
    { description: "Current photo from the shell camera (JPEG).", inputSchema: { shell: z.string().default("el-tucu") } },
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
        "How to rent a shell: returns the price and the x402 endpoint to pay. Pay with an x402 client (POST to the endpoint) and use the returned token in send_command. On gateways with escrow the URL is bound to an intent created for you (valid 15 min).",
      inputSchema: { shell: z.string().default("el-tucu"), blocks: z.number().int().min(1).max(6).default(1) },
    },
    async ({ shell, blocks }) => {
      const rails = d.rails.filter((r) => r.paywall && r.manifest().available);
      const x402 = rails.map((r) => r.manifest());
      let url = `${d.publicUrl}/api/sessions/x402?shell=${shell}&blocks=${blocks}`;
      let intent: string | undefined;
      // escrow mode (spec 14): the intent opens the escrow; its URL is the paywall bound to it
      const first = rails.find((r) => r.createIntent);
      if (first && shell === d.cfg.shell.id) {
        const r = await d.createIntent(first.id, blocks);
        if (r.rec?.intent.instructions.kind === "x402") {
          url = r.rec.intent.instructions.url;
          intent = r.rec.intent.id;
        }
      }
      return text({
        shell,
        blocks,
        minutes: blocks * d.cfg.shell.pricing.block_minutes,
        price: d.price(blocks),
        pay: { method: "POST", url, protocol: "x402", rails: x402, ...(intent && { intent, note: "This URL is bound to an intent whose escrow holds your payment until the session ends; it expires in 15 min. A new intent: POST /api/sessions/intent." }) },
        queue: { active: Boolean(d.sessions.active(shell)), waiting: d.sessions.waiting(shell).length },
        docs: `${d.publicUrl}/llms.txt`,
      });
    },
  );

  s.registerTool(
    "send_command",
    {
      description: "Sends a command to the robot during a paid session. cmd: joint (args joint and angle), dance (arg rutina) or stop.",
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
        if (!joint || angle === undefined) return fail({ error: "joint_and_angle_required" });
        c = { cmd, args: { joint, angle } };
      } else if (cmd === "dance") {
        if (!rutina || !d.cfg.shell.routines.includes(rutina)) return fail({ error: "invalid_routine", routines: d.cfg.shell.routines });
        c = { cmd, args: { rutina } };
      } else c = { cmd: "stop" };
      const r = await d.robot.send(c);
      return r.status < 300 ? text(r.data) : fail({ status: r.status, ...(r.data as object) });
    },
  );

  s.registerTool(
    "end_session",
    { description: "Ends the session early. The robot returns to HOME.", inputSchema: { token: z.string() } },
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
