/* The rigged hacker for the web: base colour at 2048, normal and metal/rough at 1024,
   all WebP; weld, quantise (skin-safe) and meshopt.

   node optimise-character.mjs SRC.glb OUT.glb

   Animation clean-up before compression:
   - every clip keeps rotations for its bones and the Hips translation (the in-place bob);
     the exporter's constant translation and scale tracks on the other bones are dropped,
     after checking they equal the rest pose, so three.js falls back to the bind pose;
   - Point keeps only the rotations of Chest, Neck, Head and the right arm, so it can be
     layered over any other clip.
   It then writes OUT.json from SRC.json (the numbers rig.py measured) plus the clip list. */
import fs from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, prune, reorder, quantize, textureCompress, resample, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
await MeshoptEncoder.ready;
const [src, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(src);
const mat = doc.getRoot().listMaterials()[0];
const base = mat.getBaseColorTexture();

const POINT_BONES = new Set(["Chest", "Neck", "Head", "Shoulder.R", "UpperArm.R", "LowerArm.R", "Hand.R"]);
const restOf = (node, path) => (path === "translation" ? node.getTranslation() : node.getScale());
let dropped = 0;
for (const anim of doc.getRoot().listAnimations()) {
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode();
    const name = node?.getName() ?? "";
    const path = ch.getTargetPath();
    let keep = path === "rotation" || (path === "translation" && name === "Hips");
    if (anim.getName() === "Point") keep = path === "rotation" && POINT_BONES.has(name);
    if (keep) continue;
    if (path === "translation" || path === "scale") {
      const values = ch.getSampler().getOutput().getArray();
      const rest = restOf(node, path);
      for (let i = 0; i < values.length; i++) {
        if (Math.abs(values[i] - rest[i % 3]) > 1e-4 && anim.getName() !== "Point") {
          throw new Error(`${anim.getName()} ${name}.${path} is not constant at the rest value; not dropping it`);
        }
      }
    }
    const sampler = ch.getSampler();
    ch.dispose();
    sampler.dispose();
    dropped++;
  }
}

await doc.transform(
  dedup(), weld(), resample(), prune(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [2048, 2048], quality: 84, slots: /^baseColor/ }),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 86, slots: /^(normal|metallicRoughness)/ }),
  reorder({ encoder: MeshoptEncoder }),
  quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 })
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
fs.mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true });
await io.write(out, doc);

const root = doc.getRoot();
const clips = root.listAnimations().map((a) => {
  const ends = a.listSamplers().map((s) => { const t = s.getInput().getArray(); return t[t.length - 1]; });
  const bones = [...new Set(a.listChannels().map((c) => c.getTargetNode().getName()))];
  return { name: a.getName(), seconds: Math.max(...ends), bones: bones.length, channels: a.listChannels().length };
});
const metaSrc = src.replace(/\.glb$/, ".json");
if (fs.existsSync(metaSrc)) {
  const meta = JSON.parse(fs.readFileSync(metaSrc, "utf8"));
  const missing = meta.clips.filter((c) => !clips.some((k) => k.name === c));
  if (missing.length) throw new Error("clips missing from the GLB: " + missing.join(", "));
  fs.writeFileSync(out.replace(/\.glb$/, ".json"), JSON.stringify(meta, null, 2) + "\n");
}
console.log("dropped", dropped, "constant or unused channels");
for (const c of clips) console.log(`  ${c.name.padEnd(8)} ${c.seconds.toFixed(3)} s, ${c.bones} bones, ${c.channels} channels`);
console.log("joints:", root.listSkins()[0]?.listJoints().length,
  "| textures:", root.listTextures().map((t) => t.getSize()?.join("x") + " " + t.getMimeType()).join(", "),
  "|", (fs.statSync(src).size / 1e6).toFixed(2), "MB ->", (fs.statSync(out).size / 1e6).toFixed(2), "MB", base ? "" : "(no base texture!)");
