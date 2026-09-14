const HOST = "http://127.0.0.1:9234";
const W = +(process.argv[2] || 1440), H = +(process.argv[3] || 900), MOBILE = W < 600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fs = await import("node:fs");
const list = await (await fetch(`${HOST}/json/list`)).json();
const ws = new WebSocket(list.find((x) => x.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const problems = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") problems.push("EXC " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 300));
  if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) problems.push(d.params.type + " " + d.params.args.map((a) => a.value || a.description).join(" ").slice(0, 300));
  if (d.method === "Network.loadingFailed") problems.push("NET " + d.params.errorText);
};
const send = (m, p = {}) => { const n = ++id; ws.send(JSON.stringify({ id: n, method: m, params: p })); return new Promise((r) => pend.set(n, r)); };
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.result?.value;
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(name, Buffer.from(r.result.data, "base64")); console.log("shot", name); };
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
const drag = async (x0, y0, x1, y1, steps = 14) => {
  await mouse("mousePressed", x0, y0);
  for (let i = 1; i <= steps; i++) { await mouse("mouseMoved", x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps); await sleep(30); }
  await mouse("mouseReleased", x1, y1);
};
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: MOBILE });
await send("Page.navigate", { url: "about:blank" });
await sleep(500);
await send("Page.navigate", { url: "http://127.0.0.1:8000/index.html?v=" + Date.now() + "#about" });
await sleep(12000);
const tag = MOBILE ? "m" : "d";
console.log("rig stats:", await ev(`["rig-reach","rig-top","rig-area","rig-volume"].map(i=>document.getElementById(i).textContent).join(" | ")`));
await shot(`v6-${tag}-bench.png`);

/* retune: long arm */
await ev(`(()=>{const s=document.getElementById("rig-l1");s.value=s.max;s.dispatchEvent(new Event("input"));const c=document.getElementById("rig-claw");c.value=c.max;c.dispatchEvent(new Event("input"));return 1})()`);
await sleep(600);
console.log("rig stats long:", await ev(`["rig-reach","rig-top","rig-area","rig-volume"].map(i=>document.getElementById(i).textContent).join(" | ")`));
await shot(`v6-${tag}-long.png`);
/* short arm */
await ev(`(()=>{for(const k of ["base","l1","l2","claw"]){const s=document.getElementById("rig-"+k);s.value=s.min;s.dispatchEvent(new Event("input"));}return 1})()`);
await sleep(600);
console.log("rig stats short:", await ev(`["rig-reach","rig-top","rig-area","rig-volume"].map(i=>document.getElementById(i).textContent).join(" | ")`));
await sleep(5000);
await shot(`v6-${tag}-short.png`);
await ev(`document.getElementById("rig-reset").click()`);
await sleep(8000);
console.log("hud:", await ev(`["mode","claw","hgt"].map(i=>document.getElementById(i).textContent).join(" / ")`));

/* orbit round the arm */
await drag(W * 0.2, H * 0.75, W * 0.05, H * 0.6);
await sleep(1500);
await shot(`v6-${tag}-orbit.png`);

/* the hall and its gallery */
await ev(`document.querySelector('[data-place="hall"]').click()`);
await sleep(4500);
await shot(`v6-${tag}-hall.png`);
await ev(`document.querySelector("#experience .wall a").click()`);
await sleep(900);
await ev(`document.getElementById("viewer-next").click()`);
await sleep(700);
console.log("viewer:", await ev(`document.getElementById("viewer").open`), await ev(`document.getElementById("viewer-count").textContent`), await ev(`document.getElementById("viewer-thumbs").children.length`));
await shot(`v6-${tag}-viewer.png`);
await ev(`document.getElementById("viewer").close()`);

/* the lab shelf */
await ev(`document.querySelector('#panel-next').click()`);
await ev(`location.hash="#work-attendance"`);
await sleep(7000);
await shot(`v6-${tag}-lab.png`);
console.log("overflow:", await ev(`document.documentElement.scrollWidth > innerWidth`));
console.log("problems:", problems.length ? [...new Set(problems)].join("\n  ") : "none");
ws.close();
