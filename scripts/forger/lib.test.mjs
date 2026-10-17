import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cameraArgs, readEnvFile, validateSheet } from "./lib.mjs";

test(".env.local with CRLF and comments ", () => {
  const f = path.join(mkdtempSync(path.join(tmpdir(), "forger-")), ".env.local");
  writeFileSync(f, "# comment\r\nESP32_URL=http://192.168.1.50   # the robot\r\nSOLANA_PAY_TO=\r\nCAMERA=HD Pro Webcam C920\r\n");
  const e = readEnvFile(f);
  assert.equal(e.ESP32_URL, "http://192.168.1.50");
  assert.equal(e.SOLANA_PAY_TO, "");
  assert.equal(e.CAMERA, "HD Pro Webcam C920");
});

test("camera: avfoundation by index on macOS, v4l2 mjpeg by /dev on Linux, lavfi for test", () => {
  const mac = cameraArgs("darwin", {});
  assert.equal(mac[mac.indexOf("-i") + 1], "0");
  assert.equal(mac.at(-1), "rtsp://localhost:8554/el-tucu");
  const lin = cameraArgs("linux", { CAMERA_SIZE: "640x480", SHELL_ID: "tucu" });
  assert.equal(lin[lin.indexOf("-i") + 1], "/dev/video0");
  assert.ok(lin.join(" ").includes("-f v4l2 -input_format mjpeg"));
  assert.ok(lin.join(" ").includes("-video_size 640x480"));
  assert.ok(lin.includes("yuv420p"));
  assert.equal(lin.at(-1), "rtsp://localhost:8554/tucu");
  assert.ok(cameraArgs("linux", { CAMERA_INPUT_FORMAT: "yuyv422" }).join(" ").includes("-input_format yuyv422"));
  assert.ok(cameraArgs("linux", { CAMERA: "test" }).join(" ").includes("lavfi"));
});

test("shell.json validation: a good sheet passes, HOME outside a range and a bad price fail", () => {
  const good = JSON.parse(readFileSync(new URL("../../apps/gateway/shell.example.json", import.meta.url), "utf8"));
  assert.deepEqual(validateSheet(good), []);
  const bad = { ...good, home: { ...good.home, base: 10 }, pricing: { block_minutes: 5, usd: "0.055" } };
  const problems = validateSheet(bad);
  assert.ok(problems.some((p) => p.startsWith("home.base")));
  assert.ok(problems.some((p) => p.startsWith("pricing.usd")));
  assert.ok(validateSheet({}).length > 10);
});
