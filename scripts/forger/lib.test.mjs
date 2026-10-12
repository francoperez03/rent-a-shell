import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cameraArgs, readEnvFile } from "./lib.mjs";

test(".env.local con CRLF y comentarios (Windows)", () => {
  const f = path.join(mkdtempSync(path.join(tmpdir(), "forger-")), ".env.local");
  writeFileSync(f, "# comentario\r\nESP32_URL=http://192.168.1.50   # el robot\r\nSOLANA_PAY_TO=\r\nCAMERA=HD Pro Webcam C920\r\n");
  const e = readEnvFile(f);
  assert.equal(e.ESP32_URL, "http://192.168.1.50");
  assert.equal(e.SOLANA_PAY_TO, "");
  assert.equal(e.CAMERA, "HD Pro Webcam C920");
});

test("cámara por sistema: dshow con nombre, avfoundation con índice, v4l2 con /dev", () => {
  const win = cameraArgs("win32", { CAMERA: "HD Pro Webcam C920", SHELL_ID: "tucu" });
  assert.deepEqual(win.slice(2, 7), ["-f", "dshow", "-rtbufsize", "100M", "-i"]);
  assert.equal(win[win.indexOf("-i") + 1], "video=HD Pro Webcam C920");
  assert.ok(win.includes("yuv420p"));
  assert.equal(win.at(-1), "rtsp://localhost:8554/tucu");
  assert.throws(() => cameraArgs("win32", {}), /CAMERA/);
  const mac = cameraArgs("darwin", {});
  assert.equal(mac[mac.indexOf("-i") + 1], "0");
  assert.equal(mac.at(-1), "rtsp://localhost:8554/el-tucu");
  const lin = cameraArgs("linux", { CAMERA_SIZE: "640x480" });
  assert.equal(lin[lin.indexOf("-i") + 1], "/dev/video0");
  assert.ok(lin.join(" ").includes("-video_size 640x480"));
  assert.ok(cameraArgs("win32", { CAMERA: "test" }).join(" ").includes("lavfi"));
});
