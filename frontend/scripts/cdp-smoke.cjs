/* CDP smoke test: loads a URL in headless Chrome, reports root fill + console errors. */
const http = require("http");
const { spawn } = require("child_process");

const CHROME =
  process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe";
const URL_TO_TEST = process.argv[2] || "http://localhost:4173/";

(async () => {
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--remote-debugging-port=9222",
      "--no-first-run",
      "--user-data-dir=" + process.env.TEMP + "/chrome-debug-profile",
      "about:blank",
    ],
    { stdio: "ignore", detached: true }
  );
  proc.unref();

  // Wait for the DevTools endpoint to come up.
  let ok = false;
  for (let i = 0; i < 30 && !ok; i++) {
    try {
      await fetch("http://localhost:9222/json/version");
      ok = true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!ok) {
    console.error("CDP not reachable");
    process.exit(1);
  }

  // Lazy-load ws only if the browser fetch path is unavailable.
  const targets = await new Promise((res, rej) =>
    http.get("http://localhost:9222/json", (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => res(JSON.parse(d)));
    }).on("error", rej)
  );
  const page = targets.find((t) => t.type === "page");
  if (!page) {
    console.error("no page target");
    process.exit(1);
  }

  const { WebSocket } = await import("ws");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.on("message", (data) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (msg.method === "Runtime.consoleAPICalled") {
      logs.push(
        msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")
      );
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      logs.push(
        "EXCEPTION: " +
          (d.exception?.description ?? JSON.stringify(d)).slice(0, 1200)
      );
    }
  });
  await new Promise((r) => ws.on("open", r));

  const send = (method, params) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: URL_TO_TEST });
  await new Promise((r) => setTimeout(r, 6000));

  const evalRes = await send("Runtime.evaluate", {
    expression:
      'document.getElementById("root").children.length + "|" + document.body.innerText.length',
    returnByValue: true,
  });
  console.log("ROOT-CHILDREN|TEXT-LEN:", evalRes.result?.result?.value);
  console.log("--- console/exceptions ---");
  logs.slice(0, 20).forEach((l) => console.log(l.slice(0, 400)));
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
