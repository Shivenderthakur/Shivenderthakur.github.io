/* Compress the skill icons without changing their shape: weld, dedup, WebP textures
   at most 512 px, quantised attributes, meshopt. */
import fs from "node:fs"; import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, weld, prune, reorder, quantize, textureCompress, flatten, join } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const [src, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
for (const f of fs.readdirSync(src).filter((n) => n.endsWith(".glb"))) {
  const doc = await io.read(path.join(src, f));
  await doc.transform(
    dedup(), flatten(), join(), weld(), prune(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512], quality: 82 }),
    reorder({ encoder: MeshoptEncoder }), quantize()
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(path.join(out, f), doc);
  console.log(f, (fs.statSync(path.join(src, f)).size / 1024).toFixed(0), "KB ->", (fs.statSync(path.join(out, f)).size / 1024).toFixed(0), "KB");
}
