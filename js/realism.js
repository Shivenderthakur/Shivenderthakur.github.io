/* What makes the island read as real rather than drawn.

   - Light comes from a photographed workshop HDRI, so metal and glass reflect a
     real room instead of a flat colour.
   - Surfaces are scanned PBR sets (colour, normal, roughness) from Poly Haven.
   - The detailed tech props are photoreal CC0 scans, meshopt-compressed GLBs
     with WebP textures, scaled from their own measured bounds.
   - A post stack adds ambient occlusion, a restrained bloom for screens and
     LEDs, and SMAA edges. Phones get the light version. */

import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* ------------------------------------------------------------ environment */

export function loadEnvironment(renderer, scene, url = "assets/hdri/workshop_1k.hdr") {
  return new Promise((resolve) => {
    new RGBELoader().load(url, (hdr) => {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      pmrem.dispose();
      scene.environment = env;
      scene.environmentIntensity = 0.55;
      resolve(env);
    }, undefined, () => resolve(null));
  });
}

/* --------------------------------------------------------------- surfaces */

const texLoader = new THREE.TextureLoader();
const cache = new Map();

function tex(path, repeat, srgb) {
  const key = path + repeat.join(",");
  if (cache.has(key)) return cache.get(key);
  const t = texLoader.load(path);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/* A scanned material: colour, normal and roughness maps from one Poly Haven set. */
export function pbr(name, { repeat = [1, 1], color = 0xffffff, metalness = 0, roughness = 1, normalScale = 1 } = {}) {
  const base = `assets/tex/${name}`;
  return new THREE.MeshStandardMaterial({
    color,
    map: tex(`${base}_diff.webp`, repeat, true),
    normalMap: tex(`${base}_nor.webp`, repeat, false),
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughnessMap: tex(`${base}_rough.webp`, repeat, false),
    roughness,
    metalness
  });
}

/* ------------------------------------------------------------------ props */

const gltf = new GLTFLoader();
gltf.setMeshoptDecoder(MeshoptDecoder);

/* Load a glTF as it is, animations included (the hacker needs its clips). */
export function loadGLTF(url) {
  return new Promise((resolve) => gltf.load(url, resolve, undefined, (err) => { console.warn(url, err); resolve(null); }));
}

/* Load a photoreal prop and fit it: its largest dimension becomes `size`,
   it is centred on x and z, and it stands on y = 0. */
export function loadProp(name, size) {
  return new Promise((resolve) => {
    gltf.load(`assets/models/${name}.glb`, (g) => {
      const root = g.scene;
      const box = new THREE.Box3().setFromObject(root);
      const dim = box.getSize(new THREE.Vector3());
      const s = size / Math.max(dim.x, dim.y, dim.z);
      root.scale.setScalar(s);
      const fitted = new THREE.Box3().setFromObject(root);
      const c = fitted.getCenter(new THREE.Vector3());
      root.position.set(-c.x, -fitted.min.y, -c.z);
      root.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (o.material) o.material.envMapIntensity = 1.1;
        }
      });
      const holder = new THREE.Group();
      holder.add(root);
      resolve(holder);
    }, undefined, () => resolve(null));
  });
}

/* ------------------------------------------------------------ post stack */

export function makeComposer(renderer, scene, camera, { coarse }) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  /* The occlusion radius and thickness are in world units, and the world is in
     metres. Walking, a 35 cm radius darkens the ground where it meets walls,
     planters and the hacker's feet. At the bench the arm reaches 23 cm and the
     block is 2.4 cm across, so a radius that size would shade the whole desk;
     6 cm keeps the contact shadow under the block and the arm's joints. The
     default sits between the two so the pass is sensible before either is
     chosen. */
  const AO_NEAR = { radius: 0.06, thickness: 0.12 };
  const AO_FAR = { radius: 0.35, thickness: 0.7 };
  let ao = null;
  if (!coarse) {
    ao = new GTAOPass(scene, camera, size.x, size.y);
    ao.updateGtaoMaterial({ radius: 0.1, distanceExponent: 1.4, thickness: 0.2, scale: 1 });
    ao.blendIntensity = 0.85;
    composer.addPass(ao);
  }
  let aoNear = null;

  /* a high threshold: only true emitters (screens, LEDs, the beacon) bloom, never a lit scan */
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), coarse ? 0.28 : 0.35, 0.45, 0.97);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let smaa = null;
  if (!coarse) {
    smaa = new SMAAPass(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio());
    composer.addPass(smaa);
  }

  return {
    passes: composer.passes,
    render: () => composer.render(),
    /* near = true while seated at the bench or in a close-up, false while walking;
       call it where the shadow span switches */
    aoSpan(near) {
      if (!ao || aoNear === near) return;
      aoNear = near;
      ao.updateGtaoMaterial(near ? AO_NEAR : AO_FAR);
    },
    setSize(w, h) {
      composer.setSize(w, h);
      if (ao) ao.setSize(w, h);
      bloom.setSize(w, h);
    }
  };
}
