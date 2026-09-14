/* Opens the Skills place, waits for the hardware cabinet to load, screenshots it.
   usage: node tools/test/skills.mjs [width] [height]   (Chromium on :9234, site on :8000) */
const HOST = "http://127.0.0.1:9234";
const W = +(process.argv[2] || 1440), H = +(process.argv[3] || 900), MOBILE = W < 600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fs = await import("node:fs");
const list = await (await fetch(`${HOST}/json/list`)).json();
const ws = new WebSocket(list.find((x) => x.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const problems = []; const models = new Set();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") problems.push("EXC " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 300));
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") problems.push("error " + d.params.args.map((a) => a.value || a.description).join(" ").slice(0, 300));
  if (d.method === "Network.loadingFailed") problems.push("NET " + d.params.errorText);
  if (d.method === "Network.responseReceived" && /\/assets\/models\/(boards|sensors)\//.test(d.params.response.url)) models.add(d.params.response.url.split("/models/")[1] + " " + d.params.response.status);
};
const send = (m, p = {}) => { const n = ++id; ws.send(JSON.stringify({ id: n, method: m, params: p })); return new Promise((r) => pend.set(n, r)); };
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(name, Buffer.from(r.result.data, "base64")); console.log("shot", name); };
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: MOBILE });
await send("Page.navigate", { url: "about:blank" });
await sleep(400);
await send("Page.navigate", { url: "http://127.0.0.1:8000/index.html?v=" + Date.now() + "#stack" });
await sleep(25000);
await shot(`skills-${MOBILE ? "m" : "d"}.png`);
console.log("models fetched:", models.size, [...models].join(", "));
console.log("problems:", problems.length ? [...new Set(problems)].join("\n  ") : "none");
ws.close();
