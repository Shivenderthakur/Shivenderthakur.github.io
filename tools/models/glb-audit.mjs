import fs from "node:fs"; import path from "node:path";
const root = process.argv[2]; const rows = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith(".glb")) rows.push(p); } };
walk(root);
let total = 0;
for (const f of rows) {
  const buf = fs.readFileSync(f); total += buf.length;
  const len = buf.readUInt32LE(12); const json = JSON.parse(buf.slice(20, 20 + len).toString());
  const ext = (json.extensionsUsed || []).map((e) => e.replace(/^(KHR_|EXT_)/, "")).join("+") || "-";
  const imgs = (json.images || []).map((i) => (i.mimeType || "").replace("image/", "")).join(",") || "-";
  let tris = 0;
  for (const m of json.meshes || []) for (const p of m.primitives) { const a = json.accessors[p.indices ?? p.attributes.POSITION]; tris += p.indices !== undefined ? a.count / 3 : a.count / 3; }
  console.log(`${(buf.length / 1024).toFixed(0).padStart(6)} KB  ${String(Math.round(tris / 1000) + "k").padStart(5)} tris  ext:${ext.padEnd(30)} img:${imgs.padEnd(14)} ${path.relative(root, f)}`);
}
console.log(`TOTAL ${(total / 1e6).toFixed(1)} MB in ${rows.length} files`);
