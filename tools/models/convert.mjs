/* OBJ parts -> one categorised, decimated, meshopt-compressed GLB per model.

   The source archives split every model into model_N.obj parts, reference
   material files that were never included, and mostly carry no UVs. So each
   part is coloured either from its own vertex colours, when the OBJ has them,
   or from its shape: the largest flat part is the board, thin tall parts are
   pins, small boxy parts are connectors, and so on. Matte by design. */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, weld, join, simplify, prune, normals, reorder, quantize, flatten } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const ROOT = path.resolve(process.argv[2] || "../raw");
const OUT = path.resolve(process.argv[3] || "../../assets/models");
const ONLY = process.argv[4] || null;

const CATEGORY = {
  "robotic-arm": "robotics",
  "arduino-mega-2560-rev3": "boards", "arduino-nano-every": "boards", "arduino-uno": "boards",
  "nodemcu-esp32": "boards", "raspberry-pi-4-model-b": "boards", "raspberry-pi-5": "boards",
  "raspberry-pi-zero": "boards",
  "3-axis-accelerometer-and-gyroscope-sensor": "sensors", "infrared-sensor-ir-sensor": "sensors",
  "luchtkwaliteit-sensor-mq-135-gas-sensor-mq-135": "sensors", "mq2-lpg-co-smoke-gas-sensor": "sensors",
  "modulo-ldr": "sensors", "pir-sensor": "sensors", "sensor-de-chuva": "sensors",
  "temperature-and-humidity-sensor-dht11": "sensors", "touch-sensor": "sensors", "ultrasonic-sensor": "sensors"
};

const NICE = {
  "robotic-arm": ["robotic-arm", "Robotic arm"],
  "arduino-mega-2560-rev3": ["arduino-mega-2560", "Arduino Mega 2560 Rev3"],
  "arduino-nano-every": ["arduino-nano-every", "Arduino Nano Every"],
  "arduino-uno": ["arduino-uno", "Arduino Uno"],
  "nodemcu-esp32": ["esp32-nodemcu", "NodeMCU ESP32"],
  "raspberry-pi-4-model-b": ["raspberry-pi-4b", "Raspberry Pi 4 Model B"],
  "raspberry-pi-5": ["raspberry-pi-5", "Raspberry Pi 5"],
  "raspberry-pi-zero": ["raspberry-pi-zero", "Raspberry Pi Zero"],
  "3-axis-accelerometer-and-gyroscope-sensor": ["imu-accelerometer-gyroscope", "3-axis accelerometer and gyroscope"],
  "infrared-sensor-ir-sensor": ["ir-sensor", "Infrared sensor"],
  "luchtkwaliteit-sensor-mq-135-gas-sensor-mq-135": ["mq135-air-quality", "MQ-135 air quality sensor"],
  "mq2-lpg-co-smoke-gas-sensor": ["mq2-gas-smoke", "MQ-2 gas and smoke sensor"],
  "modulo-ldr": ["ldr-light-sensor", "LDR light sensor module"],
  "pir-sensor": ["pir-motion", "PIR motion sensor"],
  "sensor-de-chuva": ["rain-sensor", "Rain sensor"],
  "temperature-and-humidity-sensor-dht11": ["dht11-temperature-humidity", "DHT11 temperature and humidity"],
  "touch-sensor": ["touch-sensor", "Capacitive touch sensor"],
  "ultrasonic-sensor": ["hc-sr04-ultrasonic", "Ultrasonic distance sensor"]
};

/* triangle budget per category, for a page that must still run on a phone */
const BUDGET = { boards: 140000, sensors: 45000, robotics: 90000 };

const BOARD_COLOUR = (slug) =>
  slug.includes("raspberry") ? [0.13, 0.43, 0.24] :
  slug.includes("arduino") ? [0.0, 0.47, 0.62] :
  slug.includes("esp32") || slug.includes("nodemcu") ? [0.1, 0.1, 0.11] :
  slug.includes("dht11") ? [0.18, 0.45, 0.78] :
  [0.08, 0.22, 0.52];

/* matte palette: the user asked for no shine */
const PAL = {
  board: (slug) => ({ c: BOARD_COLOUR(slug), m: 0.0, r: 0.72 }),
  pin: { c: [0.78, 0.63, 0.3], m: 0.6, r: 0.5 },
  metal: { c: [0.72, 0.74, 0.76], m: 0.55, r: 0.55 },
  plastic: { c: [0.1, 0.1, 0.11], m: 0.0, r: 0.68 },
  ivory: { c: [0.86, 0.85, 0.8], m: 0.0, r: 0.65 },
  armLight: { c: [0.9, 0.9, 0.88], m: 0.0, r: 0.6 },
  armDark: { c: [0.16, 0.17, 0.19], m: 0.2, r: 0.58 }
};

async function parseObj(file) {
  const pos = [], col = [], nor = [], uv = [];
  const outP = [], outN = [], outC = [], outT = [];
  let hasColour = false, hasNormals = false, allUV = true;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    const c0 = line.charCodeAt(0), c1 = line.charCodeAt(1);
    if (c0 === 118 && c1 === 32) {                    // "v "
      const t = line.split(/\s+/);
      pos.push(+t[1], +t[2], +t[3]);
      if (t.length >= 7) { col.push(+t[4], +t[5], +t[6]); hasColour = true; }
    } else if (c0 === 118 && c1 === 116) {            // "vt"
      const t = line.split(/\s+/);
      uv.push(+t[1], +t[2]);
    } else if (c0 === 118 && c1 === 110) {            // "vn"
      const t = line.split(/\s+/);
      nor.push(+t[1], +t[2], +t[3]);
    } else if (c0 === 102 && c1 === 32) {             // "f "
      const t = line.trim().split(/\s+/).slice(1).map((s) => s.split("/"));
      const vi = t.map((p) => { const i = +p[0]; return i < 0 ? pos.length / 3 + i : i - 1; });
      const ni = t.map((p) => { if (!p[2]) return -1; const i = +p[2]; return i < 0 ? nor.length / 3 + i : i - 1; });
      const ti = t.map((p) => { if (!p[1]) return -1; const i = +p[1]; return i < 0 ? uv.length / 2 + i : i - 1; });
      for (let k = 1; k + 1 < vi.length; k++) {
        for (const j of [0, k, k + 1]) {
          const v = vi[j];
          outP.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
          /* OBJ counts v from the bottom of the image, glTF from the top */
          if (ti[j] >= 0) outT.push(uv[ti[j] * 2], 1 - uv[ti[j] * 2 + 1]); else allUV = false;
          if (hasColour) outC.push(col[v * 3] ?? 1, col[v * 3 + 1] ?? 1, col[v * 3 + 2] ?? 1);
          const n = ni[j];
          if (n >= 0) { outN.push(nor[n * 3], nor[n * 3 + 1], nor[n * 3 + 2]); hasNormals = true; }
        }
      }
    }
  }
  const P = new Float32Array(outP);
  const N = hasNormals && outN.length === outP.length ? new Float32Array(outN) : null;
  const C = hasColour && outC.length === outP.length ? new Float32Array(outC) : null;
  const T = allUV && outT.length && outT.length / 2 === outP.length / 3 ? new Float32Array(outT) : null;
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], P[i + a]); max[a] = Math.max(max[a], P[i + a]); }
  return { P, N, C, T, min, max, tris: P.length / 9 };
}

function signature(p) {
  if (!p.tris) return "empty";
  const r = (v) => v.toPrecision(6);
  const probe = [];
  for (let k = 0; k < 12; k++) {
    const i = Math.floor((k / 12) * (p.P.length / 3)) * 3;
    probe.push(r(p.P[i]), r(p.P[i + 1]), r(p.P[i + 2]));
  }
  return [p.tris, ...p.min.map(r), ...p.max.map(r), ...probe].join("|");
}

/* Connected pieces of one triangle soup: corners are joined when their
   positions coincide, then triangles are grouped by union-find. */
function splitComponents(p) {
  const n = p.tris;
  const ext = Math.max(...p.max.map((v, i) => v - p.min[i])) || 1;
  const q = 1e5 / ext;
  const ids = new Map();
  const corner = new Int32Array(n * 3);
  for (let c = 0; c < n * 3; c++) {
    const key = `${Math.round(p.P[c * 3] * q)},${Math.round(p.P[c * 3 + 1] * q)},${Math.round(p.P[c * 3 + 2] * q)}`;
    let id = ids.get(key);
    if (id === undefined) { id = ids.size; ids.set(key, id); }
    corner[c] = id;
  }
  const parent = new Int32Array(ids.size).map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < n; t++) {
    const a = find(corner[t * 3]), b = find(corner[t * 3 + 1]), c = find(corner[t * 3 + 2]);
    parent[b] = a; parent[find(c)] = a;
  }
  const groups = new Map();
  for (let t = 0; t < n; t++) {
    const g = find(corner[t * 3]);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  }
  if (groups.size < 2) return [p];

  const out = [];
  for (const tris of groups.values()) {
    const P = new Float32Array(tris.length * 9);
    const C = p.C ? new Float32Array(tris.length * 9) : null;
    const T = p.T ? new Float32Array(tris.length * 6) : null;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    tris.forEach((t, k) => {
      if (T) for (let j = 0; j < 6; j++) T[k * 6 + j] = p.T[t * 6 + j];
      for (let j = 0; j < 9; j++) {
        const v = p.P[t * 9 + j];
        P[k * 9 + j] = v;
        if (C) C[k * 9 + j] = p.C[t * 9 + j];
        const a = j % 3;
        if (v < min[a]) min[a] = v;
        if (v > max[a]) max[a] = v;
      }
    });
    out.push({ P, N: null, C, T, min, max, tris: tris.length });
  }
  /* specks from the split (a stray triangle or two) are merged back as plastic */
  return out;
}

function classify(part, model, slug, isBoard) {
  const d = part.max.map((v, i) => v - part.min[i]);
  const md = model.max.map((v, i) => v - model.min[i]);
  const big = Math.max(...md);
  /* up axis: the model's smallest overall extent for flat boards, else y */
  const up = md.indexOf(Math.min(...md));
  const h = d[up];
  const across = d.filter((_, i) => i !== up);
  const span = Math.max(...across);

  if (slug === "robotic-arm") return part.volRank < 0.45 ? PAL.armLight : PAL.armDark;
  if (isBoard) return PAL.board(slug);
  if (span < big * 0.035 && h > span * 1.8) return PAL.pin;
  if (span < big * 0.02) return PAL.plastic;
  const [a0, a1] = across;
  const round = Math.abs(a0 - a1) < 0.2 * Math.max(a0, a1);
  if (slug.includes("ultrasonic") && round && span > big * 0.15) return PAL.metal;
  if (slug.includes("ultrasonic") && span > big * 0.15) return PAL.metal;
  if (slug.includes("pir") && h > big * 0.25) return PAL.ivory;
  if (slug.includes("dht11") && h > big * 0.2) return { c: [0.12, 0.35, 0.7], m: 0, r: 0.7 };
  if (span > big * 0.12 && h > big * 0.12) return PAL.metal;
  return PAL.plastic;
}

async function convert(dir) {
  const slug = path.basename(dir);
  const cat = CATEGORY[slug];
  const [file, label] = NICE[slug];
  const objs = [];
  const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const q = path.join(p, e.name); if (e.isDirectory()) walk(q); else if (/\.obj$/i.test(e.name)) objs.push(q); } };
  walk(dir);
  objs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  /* Several exports repeat the same part in the same place dozens of times
     (the ESP32 has 780 parts and 30 distinct ones). Copies add nothing but
     triangles, and they force the simplifier to wreck the parts that remain. */
  let parts = [];
  const seen = new Set();
  let dupes = 0;
  for (const o of objs) {
    const p = await parseObj(o);
    const sig = signature(p);
    if (seen.has(sig)) { dupes++; continue; }
    seen.add(sig);
    parts.push(p);
  }

  /* A model exported as one or two meshes cannot be coloured part by part, so
     split those into their connected pieces first. */
  const hasColourImages = fs.readdirSync(dir).some((n) => /\.png$/i.test(n) && !/(normal|rough|metal|_ao|ao_|displacement|emissive|^img_)/i.test(n));
  if (parts.length <= 3 && !hasColourImages) parts = parts.flatMap((p) => (p.tris < 600000 ? splitComponents(p) : [p]));
  if (dupes) console.log(`  ${slug}: dropped ${dupes} duplicate parts, ${parts.length} left`);
  const model = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const p of parts) for (let a = 0; a < 3; a++) { model.min[a] = Math.min(model.min[a], p.min[a]); model.max[a] = Math.max(model.max[a], p.max[a]); }

  /* Some exports bundle every component on the board into one mesh that spans
     the whole footprint (the Pi 4B has several). Coloured as one part, that
     bundle paints the board a single colour, so split it into its pieces. */
  if (cat !== "robotics") {
    const mdA = model.max.map((v, i) => v - model.min[i]);
    const upA = mdA.indexOf(Math.min(...mdA));
    const modelFoot = mdA.filter((_, i) => i !== upA).reduce((a, b) => a * b, 1);
    parts = parts.flatMap((p) => {
      const d = p.max.map((v, i) => v - p.min[i]);
      const across = d.filter((_, i) => i !== upA);
      const flat = d[upA] < Math.max(...across) * 0.12;
      const foot = across.reduce((a, b) => a * b, 1);
      return !flat && !p.T && foot > modelFoot * 0.5 && p.tris < 400000 ? splitComponents(p) : [p];
    });
  }

  const vols =parts.map((p) => p.max.reduce((s, v, i) => s * Math.max(v - p.min[i], 1e-6), 1));
  const sorted = [...vols].sort((a, b) => b - a);
  parts.forEach((p, i) => { p.volRank = sorted.indexOf(vols[i]) / Math.max(parts.length - 1, 1); });

  /* the board is the part with the widest footprint across the model's two long axes */
  const md = model.max.map((v, i) => v - model.min[i]);
  const up = md.indexOf(Math.min(...md));
  const foot = parts.map((p) => { const d = p.max.map((v, i) => v - p.min[i]); return d.filter((_, i) => i !== up).reduce((a, b) => a * b, 1); });
  const flatness = parts.map((p) => {
    const d = p.max.map((v, i) => v - p.min[i]);
    const span = Math.max(...d.filter((_, i) => i !== up));
    return d[up] < span * 0.12;
  });
  /* A PCB is often exported as several flat layers (edge, top mask, bottom
     mask), so every flat part nearly as wide as the widest one is board. */
  let bestFoot = 0;
  if (cat !== "robotics") parts.forEach((p, i) => { if (flatness[i] && foot[i] > bestFoot) bestFoot = foot[i]; });
  const boardParts = new Set();
  if (bestFoot > 0) parts.forEach((p, i) => { if (flatness[i] && foot[i] >= bestFoot * 0.85) boardParts.add(i); });

  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(label);
  const root = doc.createNode(file);
  scene.addChild(root);
  const mats = new Map();
  const matFor = (spec, vertexColour) => {
    const key = vertexColour ? "vc" : JSON.stringify(spec);
    if (mats.has(key)) return mats.get(key);
    const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const m = doc.createMaterial(key).setBaseColorFactor(vertexColour ? [1, 1, 1, 1] : [...spec.c.map(lin), 1])
      .setMetallicFactor(vertexColour ? 0 : spec.m).setRoughnessFactor(vertexColour ? 0.66 : spec.r);
    mats.set(key, m);
    return m;
  };

  /* The archives ship texture images but no .mtl files to say which part uses
     which. The silkscreen art is matched by name: a top or front image goes on
     the highest flat board layer that carries UVs, a bottom or back image on
     the lowest, a board or base-colour atlas on every UV board layer, and a
     component or fabric image on the largest UV part that is not flat. */
  const images = fs.readdirSync(dir).filter((n) => /\.png$/i.test(n) && !/(normal|rough|metal|_ao|ao_|displacement|emissive|^img_)/i.test(n));
  const pick = (re) => images.find((n) => re.test(n));
  const topImg = pick(/top|front/i), bottomImg = pick(/bott?om|buttom|back/i);
  const atlasImg = pick(/board_albedo|basecolor/i), otherImg = pick(/comp_albedo|fabric/i);
  const centreUp = (p) => (p.min[up] + p.max[up]) / 2;
  const uvBoards = [...boardParts].filter((i) => parts[i].T).sort((a, b) => centreUp(parts[b]) - centreUp(parts[a]));
  if (uvBoards.length && (topImg || atlasImg)) {
    uvBoards.forEach((i, k) => {
      parts[i].tex = topImg && bottomImg && uvBoards.length > 1 && k === uvBoards.length - 1 ? bottomImg : topImg || atlasImg;
    });
  }
  const uvOthers = parts.map((p, i) => i).filter((i) => parts[i].T && !boardParts.has(i)).sort((a, b) => parts[b].tris - parts[a].tris);
  if (otherImg && uvOthers.length) parts[uvOthers[0]].tex = otherImg;
  if (!uvBoards.length && atlasImg && uvOthers.length === 1) parts[uvOthers[0]].tex = atlasImg;

  const texMats = new Map();
  for (const name of new Set(parts.map((p) => p.tex).filter(Boolean))) {
    const [r, g, b] = BOARD_COLOUR(slug).map((v) => Math.round(v * 255));
    const jpg = await sharp(path.join(dir, name))
      .resize(cat === "boards" ? 2048 : 1024, cat === "boards" ? 2048 : 1024, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: { r, g, b } })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
    const texture = doc.createTexture(name).setImage(jpg).setMimeType("image/jpeg");
    texMats.set(name, doc.createMaterial("tex:" + name).setBaseColorTexture(texture).setMetallicFactor(0).setRoughnessFactor(0.72));
    console.log(`  texture ${name} -> ${parts.filter((p) => p.tex === name).length} part(s), ${(jpg.length / 1024).toFixed(0)} KB`);
  }

  let sourceTris = 0;
  parts.forEach((p, i) => {
    if (!p.tris) return;
    sourceTris += p.tris;
    const prim = doc.createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(p.P).setBuffer(buffer));
    if (p.C) prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(p.C).setBuffer(buffer));
    if (p.tex) {
      prim.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(p.T).setBuffer(buffer));
      prim.setMaterial(texMats.get(p.tex));
    } else {
      prim.setMaterial(matFor(classify(p, model, slug, boardParts.has(i)), !!p.C));
    }
    const node = doc.createNode(`part_${i}`).setMesh(doc.createMesh(`part_${i}`).addPrimitive(prim));
    root.addChild(node);
  });

  const ratio = Math.min(1, BUDGET[cat] / Math.max(sourceTris, 1));
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;
  const error = ratio < 0.08 ? 0.02 : ratio < 0.3 ? 0.01 : 0.004;
  /* Simplify each part on its own before merging: the error bound is relative
     to the mesh being simplified, so a pin keeps the shape of a pin instead of
     being judged against the size of the whole board and collapsing to a spike. */
  await doc.transform(
    flatten(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: false })
  );
  /* many small closed parts (SMD parts, pin rows) refuse to collapse at a tight
     error bound, so widen the bound until the model fits its budget */
  const countTris = () => {
    let n = 0;
    for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      n += idx ? idx.getCount() / 3 : prim.getAttribute("POSITION").getCount() / 3;
    }
    return n;
  };
  for (let e = error * 2; countTris() > BUDGET[cat] * 1.25 && e <= 0.16; e *= 2) {
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: BUDGET[cat] / countTris(), error: e, lockBorder: false }));
  }
  await doc.transform(
    join(),
    normals({ overwrite: true }),
    dedup(),
    prune(),
    reorder({ encoder: MeshoptEncoder }),
    quantize()
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  let outTris = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices();
    outTris += idx ? idx.getCount() / 3 : prim.getAttribute("POSITION").getCount() / 3;
  }

  const outDir = path.join(OUT, cat);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${file}.glb`);
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  await io.write(outFile, doc);

  const entry = {
    id: file, name: label, category: cat, file: `assets/models/${cat}/${file}.glb`,
    parts: parts.length, sourceTriangles: sourceTris, triangles: Math.round(outTris),
    bytes: fs.statSync(outFile).size, upAxis: "xyz"[up],
    size: md.map((v) => +v.toFixed(4))
  };
  console.log(`${cat}/${file}.glb  ${parts.length} parts  ${(sourceTris / 1e6).toFixed(2)}M -> ${(outTris / 1e3).toFixed(0)}k tris  ${(entry.bytes / 1e6).toFixed(2)} MB  up=${entry.upAxis}`);
  return entry;
}

const dirs = fs.readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory() && CATEGORY[e.name] && (!ONLY || e.name === ONLY)).map((e) => path.join(ROOT, e.name));
const catalogPath = path.join(OUT, "catalog.json");
const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, "utf8")) : { models: [] };
for (const d of dirs) {
  try {
    const e = await convert(d);
    catalog.models = catalog.models.filter((m) => m.id !== e.id).concat(e);
  } catch (err) {
    console.log(`FAILED ${path.basename(d)}: ${err.message}`);
  }
}
catalog.models.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
catalog.source = "Converted from the OBJ archives in '3d models/' by data/tools/convert.mjs";
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
console.log(`catalog: ${catalog.models.length} models`);
