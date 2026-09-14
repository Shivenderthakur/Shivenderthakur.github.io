const HOST = "http://127.0.0.1:9234";
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
};
const send = (m, p = {}) => { const n = ++id; ws.send(JSON.stringify({ id: n, method: m, params: p })); return new Promise((r) => pend.set(n, r)); };
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result.result?.value;
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(name, Buffer.from(r.result.data, "base64")); };
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "about:blank" });
await sleep(400);
await send("Page.navigate", { url: "http://127.0.0.1:8000/index.html?debug&v=" + Date.now() + "#about" });
await sleep(11000);
await ev(`dispatchEvent(new KeyboardEvent("keydown",{key:"x"}))`);

/* wait until the arm has put the block down and let go */
for (let i = 0; i < 30; i++) {
  const m = await ev(`document.getElementById("mode").textContent`);
  if (m === "AT REST") break;
  await sleep(500);
}
const p0 = await ev(`__blockScreen()`);
console.log("block before:", p0.world.map((v) => v.toFixed(2)).join(", "), "screen", Math.round(p0.x), Math.round(p0.y));

/* grab the block and drag it straight up the screen: in the camera-facing plane that is up into the air */
await mouse("mousePressed", p0.x, p0.y);
for (let i = 1; i <= 20; i++) { await mouse("mouseMoved", p0.x + i * 4, p0.y - i * 11); await sleep(30); }
await sleep(200);
const mid = await ev(`__blockScreen()`);
console.log("while dragging:", mid.world.map((v) => v.toFixed(2)).join(", "), "| mode", await ev(`document.getElementById("mode").textContent`));
await shot("drag-air.png");
await mouse("mouseReleased", p0.x + 80, p0.y - 220);
const rel = await ev(`__blockScreen()`);
console.log("released at:", rel.world.map((v) => v.toFixed(2)).join(", "));
await sleep(2600);
await shot("drag-fetch.png");
console.log("arm:", await ev(`["mode","claw","hgt"].map(i=>document.getElementById(i).textContent).join(" / ")`));
console.log("problems:", problems.length ? problems.join("\n  ") : "none");
ws.close();
