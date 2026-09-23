/* Capture app screenshots via headless Chrome + CDP into docs/screenshots/. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const CHROME =
  process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.argv[2] || "http://localhost:4175";
const OUT = path.join(__dirname, "..", "..", "docs", "screenshots");

const SHOTS = [
  { file: "landing.png", url: "/", wait: 3500 },
  { file: "avatar-talk.png", url: "/avatar-talk", wait: 4500 },
  { file: "user-dashboard.png", url: "/user", wait: 3500 },
  { file: "text-to-sign.png", url: "/text-to-sign", wait: 4000 },
  { file: "sign-language.png", url: "/sign", wait: 7000 },
  { file: "voice-setup.png", url: "/voice-setup", wait: 3500 },
  { file: "database-viewer.png", url: "/database", wait: 4500 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--remote-debugging-port=9226",
      "--no-first-run",
      "--window-size=1360,860",
      "--user-data-dir=" + process.env.TEMP + "/chrome-shot-profile",
      "about:blank",
    ],
    { stdio: "ignore", detached: true }
  );
  proc.unref();

  let ok = false;
  for (let i = 0; i < 30 && !ok; i++) {
    try {
      await fetch("http://localhost:9226/json/version");
      ok = true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!ok) {
    console.error("CDP not reachable");
    process.exit(1);
  }

  const targets = await new Promise((res, rej) =>
    http.get("http://localhost:9226/json", (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => res(JSON.parse(d)));
    }).on("error", rej)
  );
  const page = targets.find((t) => t.type === "page");
  const { WebSocket } = await import("ws");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.on("open", r));

  let id = 0;
  const pending = new Map();
  ws.on("message", (data) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  await send("Page.enable");
  // Set a desktop viewport via Emulation.
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1360,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const shot of SHOTS) {
    await send("Page.navigate", { url: BASE + shot.url });
    await new Promise((r) => setTimeout(r, shot.wait));
    const res = await send("Page.captureScreenshot", { format: "png" });
    if (res.result?.data) {
      fs.writeFileSync(path.join(OUT, shot.file), Buffer.from(res.result.data, "base64"));
      console.log("saved", shot.file);
    } else {
      console.error("FAILED", shot.file);
    }
  }
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
