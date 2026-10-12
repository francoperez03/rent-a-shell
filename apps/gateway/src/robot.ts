// Cliente al ESP32 de El Tucu (API de robot-a/SPEC.md §4.4, sin cambios). Solo red local.
import type { Angles, Command, ShellState } from "@ras/shell-spec";

export class Robot {
  private cache: { at: number; state: ShellState } | null = null;
  fails = 0;
  constructor(private base: string, private home: Angles) {}

  get online() {
    return this.fails < 3;
  }

  private async call(method: "GET" | "POST", path: string, body?: unknown) {
    try {
      const r = await fetch(this.base + path, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(2000),
      });
      this.fails = 0;
      const data = await r.json().catch(() => ({}));
      return { status: r.status, data };
    } catch (e) {
      this.fails++;
      return { status: 503, data: { error: "robot_offline", message: (e as Error).message } };
    }
  }

  async state(): Promise<ShellState | null> {
    if (this.cache && Date.now() - this.cache.at < 500) return this.cache.state;
    const r = await this.call("GET", "/state");
    if (r.status !== 200) return null;
    this.cache = { at: Date.now(), state: r.data as ShellState };
    return this.cache.state;
  }

  /** Allowlist cerrada: joint, dance, stop. Nada más llega al ESP32. */
  async send(c: Command) {
    this.cache = null;
    switch (c.cmd) {
      case "joint":
        return this.call("POST", "/joint", { joint: c.args.joint, angle: c.args.angle });
      case "dance":
        return this.call("POST", "/dance", { rutina: c.args.rutina });
      case "stop":
        return this.call("POST", "/stop");
    }
  }

  async goHome() {
    await this.call("POST", "/stop");
    for (const [joint, angle] of Object.entries(this.home)) {
      await this.call("POST", "/joint", { joint, angle });
    }
    this.cache = null;
  }
}
