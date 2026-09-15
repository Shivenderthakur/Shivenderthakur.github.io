/* The hacker you walk around as.

   The model is the owner's sculpt, rigged and animated by tools/character/rig.py:
   a 19-bone skeleton with Idle, Walk, Run, Point, Sit and SitType loops played in
   place, 1.75 m tall at scale 1. This module moves it. Input arrives as a direction
   on the ground already turned into world space by the camera; the body turns
   toward it, the clip's playback rate follows the actual speed so the planted foot
   does not skate, and the body is pushed back out of walls, plinths and desks.

   At the workbench it also sits down. It walks round the desk to the spot behind
   the chair, steps in and lowers onto the seat, and gets up the other way round.
   While it points, the Point clip is laid over whatever the body is doing, in two
   ways. The right arm takes the clip's own pose, so it comes up to point from any
   base clip. The chest, neck and head take only the difference between Point and
   the first frame of Idle, added on top of the base clip, so a seated hunch stays a
   hunch. The chest and upper arm are then turned a little further so the hand lines
   up with the spot it is pointing at. With the hands on the keyboard the chest takes
   none of that turn, because the left hand hangs from the chest and would come off
   the keys. */

import * as THREE from "three";
import { loadGLTF } from "./realism.js";

const HEIGHT = 1.75;          // metres, as exported
const RADIUS = 0.3;           // shoulder half-width plus a little room
const WALK = 1.6;             // m/s, an unhurried walk
const RUN = 4.5;              // m/s, crosses the 48 m campus in about ten seconds
/* the ground speed each clip covers at timeScale 1, used until hacker.json arrives
   or if it cannot be read; the same numbers tools/character/rig.py measured and wrote there */
const FALLBACK = { walkSpeed: 1.1591, runSpeed: 3.1298, seatHeight: 0.46, keyboardReach: 0.46 };

const SIT_TIME = 1.35;        // seconds from the spot behind the chair to seated
const STAND_TIME = 1.15;
const POINT_WEIGHT = 9;       // against a base clip at weight 1 the pointing arm gets nine tenths of the right arm's bones
const POINT_IN = 0.3;
const POINT_OUT = 0.45;
const POINT_HOLD = 2.4;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const smooth = (u) => { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x); };

/* is a ground point inside an oriented rectangle { x, z, hw, hd, c, s }? */
export function inRect(r, x, z) {
  const dx = x - r.x, dz = z - r.z;
  const lx = dx * r.c - dz * r.s, lz = dx * r.s + dz * r.c;
  return Math.abs(lx) <= r.hw && Math.abs(lz) <= r.hd;
}

/* ------------------------------------------------------------ path finding
   Only used for the short walk to the chair. The straight line is taken when
   it is clear; otherwise the walk goes by the corners of whatever is in the way,
   the shortest chain of clear straight legs through the corners of the nearby
   colliders grown by the body's radius. */

const toLocal = (k, x, z) => {
  const dx = x - k.x, dz = z - k.z;
  return [dx * k.c - dz * k.s, dx * k.s + dz * k.c];
};

/* does the segment a-b pass through a collider grown by g? */
function blocks(k, ax, az, bx, bz, g) {
  if (k.r !== undefined) {
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((k.x - ax) * dx + (k.z - az) * dz) / (dx * dx + dz * dz || 1e-9), 0, 1);
    return Math.hypot(ax + dx * t - k.x, az + dz * t - k.z) < k.r + g;
  }
  const [pax, paz] = toLocal(k, ax, az);
  const [pbx, pbz] = toLocal(k, bx, bz);
  let t0 = 0, t1 = 1;
  for (const [p, q, h] of [[pax, pbx, k.hw + g], [paz, pbz, k.hd + g]]) {
    const d = q - p;
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(p) >= h) return false;
      continue;
    }
    let ta = (-h - p) / d, tb = (h - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 >= t1) return false;
  }
  return true;
}

function insideGrown(k, x, z, g) {
  if (k.r !== undefined) return Math.hypot(x - k.x, z - k.z) < k.r + g;
  const [lx, lz] = toLocal(k, x, z);
  return Math.abs(lx) < k.hw + g && Math.abs(lz) < k.hd + g;
}

function corners(k, g) {
  if (k.r !== undefined) {
    /* an octagon whose sides stand g clear of the circle */
    const r = (k.r + g) / Math.cos(Math.PI / 8);
    return Array.from({ length: 8 }, (_, i) => ({ x: k.x + Math.cos(i * Math.PI / 4) * r, z: k.z + Math.sin(i * Math.PI / 4) * r }));
  }
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const lx = u * (k.hw + g), lz = v * (k.hd + g);
    return { x: k.x + lx * k.c + lz * k.s, z: k.z - lx * k.s + lz * k.c };
  });
}

export function route(colliders, from, to) {
  const span = Math.hypot(to.x - from.x, to.z - from.z);
  const mx = (from.x + to.x) / 2, mz = (from.z + to.z) / 2;
  const near = colliders.filter((k) => Math.hypot(k.x - mx, k.z - mz) < span / 2 + 3 + (k.r !== undefined ? k.r : Math.hypot(k.hw, k.hd)));
  /* a leg may graze a collider by a few centimetres; the walk's own collision
     pushes the body along the surface there */
  const clear = (a, b) => !near.some((k) => blocks(k, a.x, a.z, b.x, b.z, RADIUS - 0.03));
  if (clear(from, to)) return [{ x: to.x, z: to.z }];

  const nodes = [{ x: from.x, z: from.z }, { x: to.x, z: to.z }];
  near.forEach((k) => corners(k, RADIUS + 0.1).forEach((c) => {
    if (!near.some((q) => insideGrown(q, c.x, c.z, RADIUS))) nodes.push(c);
  }));

  const n = nodes.length;
  const dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  dist[0] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity || u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v]) continue;
      const w = dist[u] + Math.hypot(nodes[v].x - nodes[u].x, nodes[v].z - nodes[u].z);
      if (w < dist[v] && clear(nodes[u], nodes[v])) { dist[v] = w; prev[v] = u; }
    }
  }
  if (prev[1] < 0) return [{ x: to.x, z: to.z }];
  const path = [];
  for (let v = 1; v > 0; v = prev[v]) path.unshift({ x: nodes[v].x, z: nodes[v].z });
  return path;
}

/* ------------------------------------------------------------------ player */

export function createPlayer({ scene, ground, colliders, heightAt, start, bound = 21.5 }) {
  const root = new THREE.Group();
  scene.add(root);
  let solids = colliders || [];

  /* the clips' natural speeds and the seat they were posed on, measured by the rig script */
  const meta = { ...FALLBACK };
  fetch("assets/models/character/hacker.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (!json) return;
      for (const k of Object.keys(FALLBACK)) if (Number.isFinite(json[k]) && json[k] > 0) meta[k] = json[k];
    })
    .catch(() => {});

  const pos = new THREE.Vector3(start.x, ground + heightAt(start.x, start.z), start.z);
  let heading = start.heading;
  let speed = 0;

  /* walk: free; approach: walking to the spot behind the chair; sitting-down and
     standing-up: the scripted moves between that spot and the seat; seated */
  let state = "walk";
  let phase = 0;
  let seat = null, spot = null, path = [];
  let from = { x: 0, z: 0, heading: 0 };
  let typing = false;
  let turnTo = null;

  let mixer = null;
  const actions = {};
  let base = null;
  const bones = {};
  /* Point split into layers: arm (the clip's right arm, blended over the base),
     chest and look (Chest, and Neck with Head, as differences added to the base) */
  const pointing = { arm: null, chest: null, look: null };
  const pointLayers = () => [pointing.arm, pointing.chest, pointing.look].filter(Boolean);
  const aim = {
    target: new THREE.Vector3(), pending: false, t: -1, w: 0,
    /* free: how much the chest may turn, 0 while the hands are on the keyboard */
    free: 1,
    applied: false, chest: new THREE.Quaternion(), arm: new THREE.Quaternion()
  };

  /* a soft contact shadow, so the feet read as on the ground even at dusk */
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 1;
  scene.add(blob);

  loadGLTF("assets/models/character/hacker.glb").then((gltf) => {
    if (!gltf) return;
    const model = gltf.scene;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      /* a skinned mesh keeps its rest-pose bounds, which a stride can step outside */
      o.frustumCulled = false;
      if (o.material) o.material.envMapIntensity = 0.9;
    });
    root.add(model);
    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) if (clip.name !== "Point") actions[clip.name] = mixer.clipAction(clip);

    const point = gltf.animations.find((c) => c.name === "Point");
    const idle = gltf.animations.find((c) => c.name === "Idle");
    if (point) {
      /* track names are "<bone>.quaternion", the bone name without Blender's dot */
      const part = (name, keep) => new THREE.AnimationClip(name, point.duration,
        point.tracks.filter((t) => keep(t.name.split(".")[0])).map((t) => t.clone()));
      pointing.arm = mixer.clipAction(part("PointArm", (b) => /^(Shoulder|UpperArm|LowerArm|Hand)_?R$/.test(b)));
      if (idle) {
        /* measured against the first frame of Idle: over SitType the left wrist stays
           where the typing pose put it, where the whole clip at nine tenths lifted it 10 cm */
        const added = (name, keep) => mixer.clipAction(THREE.AnimationUtils.makeClipAdditive(part(name, keep), 0, idle));
        pointing.chest = added("PointChest", (b) => b === "Chest");
        pointing.look = added("PointLook", (b) => b === "Neck" || b === "Head");
      }
    }

    /* GLTFLoader drops the dot from Blender's "UpperArm.R", so look for both spellings */
    const find = (name) => model.getObjectByName(name.replace(".", "")) || model.getObjectByName(name) || model.getObjectByName(name.replace(".", "_"));
    bones.chest = find("Chest");
    bones.arm = find("UpperArm.R");
    bones.hand = find("Hand.R");

    play(state === "seated" || state === "sitting-down" ? seatedClip() : "Idle", 0);
  });

  function play(name, fade = 0.25) {
    const next = actions[name] || actions.Idle;
    if (!next || next === base) return;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    next.timeScale = 1;
    if (base) base.fadeOut(fade);
    base = next;
  }

  const rate = (name, v) => { if (actions[name]) actions[name].timeScale = v; };
  const seatedClip = () => (typing && actions.SitType ? "SitType" : actions.Sit ? "Sit" : "Idle");
  /* the clip was posed on a seat of meta.seatHeight; a different seat moves the whole body */
  const seatFloor = () => ground + heightAt(seat.x, seat.z) + ((seat.height ?? meta.seatHeight) - meta.seatHeight);

  function collide(p) {
    for (let pass = 0; pass < 2; pass++) {
      for (const k of solids) {
        if (k.r !== undefined) {
          const dx = p.x - k.x, dz = p.z - k.z;
          const d = Math.hypot(dx, dz), m = k.r + RADIUS;
          if (d < m && d > 1e-5) { p.x = k.x + (dx / d) * m; p.z = k.z + (dz / d) * m; }
          continue;
        }
        const dx = p.x - k.x, dz = p.z - k.z;
        let lx = dx * k.c - dz * k.s, lz = dx * k.s + dz * k.c;
        const qx = clamp(lx, -k.hw, k.hw), qz = clamp(lz, -k.hd, k.hd);
        const ox = lx - qx, oz = lz - qz;
        const d = Math.hypot(ox, oz);
        if (d >= RADIUS) continue;
        if (d > 1e-5) {
          lx = qx + (ox / d) * RADIUS;
          lz = qz + (oz / d) * RADIUS;
        } else if (k.hw - Math.abs(lx) < k.hd - Math.abs(lz)) {
          lx = Math.sign(lx || 1) * (k.hw + RADIUS);
        } else {
          lz = Math.sign(lz || 1) * (k.hd + RADIUS);
        }
        p.x = k.x + lx * k.c + lz * k.s;
        p.z = k.z - lx * k.s + lz * k.c;
      }
    }
    const r = Math.hypot(p.x, p.z);
    if (r > bound) { p.x *= bound / r; p.z *= bound / r; }
  }

  function stride(dt) {
    pos.x += Math.sin(heading) * speed * dt;
    pos.z += Math.cos(heading) * speed * dt;
    collide(pos);
    const floor = ground + heightAt(pos.x, pos.z);
    pos.y += (floor - pos.y) * damp(16, dt);
  }

  /* Idle, Walk or Run by the speed actually covered, played at the rate whose
     planted foot moves at that speed */
  function gaitClip() {
    if (!mixer) return;
    if (speed < 0.25) play("Idle");
    else if (speed < (WALK + RUN) / 2) { play("Walk"); rate("Walk", clamp(speed / meta.walkSpeed, 0.35, 2.2)); }
    else { play("Run"); rate("Run", clamp(speed / meta.runSpeed, 0.5, 2)); }
  }

  /* ------------------------------------------------------------ states */

  function walk(dt, move, running) {
    const push = Math.min(1, move.length());
    speed += (push * (running ? RUN : WALK) - speed) * damp(9, dt);
    if (push > 0.05) {
      heading += wrap(Math.atan2(move.x, move.y) - heading) * damp(11, dt);
      turnTo = null;
    } else if (turnTo !== null) {
      /* turning on the spot to face something it was asked to point at */
      heading += wrap(turnTo - heading) * damp(7, dt);
      if (Math.abs(wrap(turnTo - heading)) < 0.03) turnTo = null;
    }
    stride(dt);
    gaitClip();
  }

  function approach(dt) {
    phase += dt;
    if (phase > 8) {
      /* something kept the body from getting there: put it on the spot */
      pos.set(spot.x, ground + heightAt(spot.x, spot.z), spot.z);
      beginSit();
      return;
    }
    const wp = path[0];
    const last = path.length === 1;
    const dx = wp.x - pos.x, dz = wp.z - pos.z, d = Math.hypot(dx, dz);
    if (last && d < 0.05) { beginSit(); return; }
    if (!last && d < 0.15) { path.shift(); return; }
    const err = wrap(Math.atan2(dx, dz) - heading);
    heading += err * damp(9, dt);
    /* slow into the last metre, and hardly move while still turning toward the next leg */
    const want = WALK * (last ? clamp(d / 0.6, 0.3, 1) : 1) * Math.max(0, Math.cos(err));
    speed += (want - speed) * damp(8, dt);
    if (last) speed = Math.min(speed, d / Math.max(dt, 1e-3));
    stride(dt);
    gaitClip();
  }

  function beginSit() {
    state = "sitting-down";
    phase = 0;
    from = { x: pos.x, z: pos.z, heading };
    speed = 0;
    /* one short step forward between the chair's arms before lowering */
    const step = Math.hypot(seat.x - pos.x, seat.z - pos.z);
    play("Walk", 0.25);
    rate("Walk", clamp(step / (SIT_TIME * 0.7) / meta.walkSpeed, 0.3, 1));
  }

  function sittingDown(dt) {
    phase += dt;
    const u = phase / SIT_TIME;
    const p = smooth(u / 0.7);
    pos.x = from.x + (seat.x - from.x) * p;
    pos.z = from.z + (seat.z - from.z) * p;
    pos.y += (seatFloor() - pos.y) * damp(16, dt);
    heading = from.heading + wrap(seat.heading - from.heading) * smooth(u / 0.45);
    if (u > 0.4) play(seatedClip(), 0.55);
    if (u >= 1) { state = "seated"; phase = 0; }
  }

  function seated() {
    pos.set(seat.x, seatFloor(), seat.z);
    heading = seat.heading;
    speed = 0;
    play(seatedClip(), 0.4);
  }

  function beginStand() {
    state = "standing-up";
    phase = 0;
    from = { x: pos.x, z: pos.z, heading };
    speed = 0;
    turnTo = null;
    /* the walk played backwards is a step back out of the chair */
    play("Walk", 0.5);
    rate("Walk", -0.5);
  }

  function standingUp(dt) {
    phase += dt;
    const u = phase / STAND_TIME;
    const p = smooth((u - 0.15) / 0.85);
    pos.x = from.x + (spot.x - from.x) * p;
    pos.z = from.z + (spot.z - from.z) * p;
    const floor = ground + heightAt(pos.x, pos.z);
    pos.y += (floor - pos.y) * damp(16, dt);
    heading = from.heading + wrap(spot.heading - from.heading) * smooth(u);
    if (u > 0.8) play("Idle", 0.3);
    if (u >= 1) { state = "walk"; phase = 0; speed = 0; }
  }

  /* ------------------------------------------------------------ pointing */

  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
  const qParent = new THREE.Quaternion(), qLocal = new THREE.Quaternion();
  const qTurn = new THREE.Quaternion(), qPart = new THREE.Quaternion(), qNone = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);

  /* rotate a bone by a world-space rotation, keeping its parent where it is */
  function turnBone(bone, q) {
    bone.parent.getWorldQuaternion(qParent);
    qLocal.copy(qParent).invert().multiply(q).multiply(qParent);
    bone.quaternion.premultiply(qLocal);
    bone.updateMatrixWorld(true);
  }

  function aimBones() {
    const { chest, arm, hand } = bones;
    if (!arm || !hand) return;
    root.updateMatrixWorld(true);
    if (chest) aim.chest.copy(chest.quaternion);
    aim.arm.copy(arm.quaternion);
    aim.applied = true;
    const w = aim.w, T = aim.target;

    if (chest) {
      /* the chest takes half the turn toward the target, within what a seated or standing
         back allows, and none of it while the hands are on the keys */
      chest.getWorldPosition(vA);
      const rel = wrap(Math.atan2(T.x - vA.x, T.z - vA.z) - heading);
      const limit = state === "walk" ? 0.3 : 0.55;
      qTurn.setFromAxisAngle(UP, clamp(rel * 0.5, -limit, limit) * w * aim.free);
      turnBone(chest, qTurn);
    }

    /* then the upper arm swings so the line from shoulder to hand runs through the target */
    arm.getWorldPosition(vA);
    hand.getWorldPosition(vB);
    vB.sub(vA).normalize();
    vC.copy(T).sub(vA).normalize();
    qTurn.setFromUnitVectors(vB, vC);
    const angle = 2 * Math.acos(clamp(qTurn.w, -1, 1));
    const most = pointing.arm ? 1.1 : 2.6;   // without the clip the arm has to come all the way up by itself
    const k = angle > most ? most / angle : 1;
    qPart.slerpQuaternions(qNone, qTurn, k * w);
    turnBone(arm, qPart);
  }

  function point(target) {
    aim.target.copy(target);
    aim.pending = true;
    if (state === "walk") turnTo = Math.atan2(target.x - pos.x, target.z - pos.z);
  }

  function animate(dt) {
    if (aim.pending) {
      if (state === "approach" || state === "sitting-down" || state === "standing-up") {
        aim.pending = false;
      } else if (state === "seated" || turnTo === null || Math.abs(wrap(turnTo - heading)) < 0.35) {
        /* standing, the body turns to face the spot first; seated, the chest and arm do it */
        aim.pending = false;
        aim.t = aim.t >= 0 ? Math.min(aim.t, POINT_IN) : 0;
        for (const a of pointLayers()) if (!a.isRunning()) a.reset().setEffectiveWeight(0).play();
      }
    }
    /* eased, so switching between Sit and SitType mid-point does not snap the chest */
    const onKeys = !!base && base === actions.SitType;
    aim.free += ((onKeys ? 0 : 1) - aim.free) * damp(6, dt);
    if (aim.t >= 0) {
      aim.t += dt;
      /* walking off, or leaving the chair, lets the arm drop */
      if ((state === "walk" && speed > 0.6) || state === "standing-up") aim.t = Math.max(aim.t, POINT_HOLD);
      aim.w = smooth(aim.t / POINT_IN) * (1 - smooth((aim.t - POINT_HOLD) / POINT_OUT));
      if (aim.t > POINT_HOLD + POINT_OUT) {
        aim.t = -1;
        aim.w = 0;
        for (const a of pointLayers()) a.stop();
      } else {
        /* an added layer must stay at or below weight 1; beyond that three.js extrapolates the rotation */
        if (pointing.arm) pointing.arm.setEffectiveWeight(POINT_WEIGHT * aim.w);
        if (pointing.chest) pointing.chest.setEffectiveWeight(aim.w * aim.free);
        if (pointing.look) pointing.look.setEffectiveWeight(aim.w);
      }
    }

    if (!mixer) return;
    /* the mixer only writes a bone when its animated value changes, so the aim
       added last frame is taken off before it runs */
    if (aim.applied) {
      if (bones.chest) bones.chest.quaternion.copy(aim.chest);
      if (bones.arm) bones.arm.quaternion.copy(aim.arm);
      aim.applied = false;
    }
    mixer.update(dt);
    if (aim.w > 0.001) aimBones();
  }

  /* ------------------------------------------------------------ public */

  function update(dt, move, running) {
    switch (state) {
      case "walk": walk(dt, move, running); break;
      case "approach": approach(dt); break;
      case "sitting-down": sittingDown(dt); break;
      case "seated": seated(dt); break;
      case "standing-up": standingUp(dt); break;
    }
    root.position.copy(pos);
    root.rotation.y = heading;
    blob.position.set(pos.x, ground + heightAt(pos.x, pos.z) + 0.02, pos.z);
    animate(dt);
    return speed;
  }

  /* Walk to the spot behind the chair and sit. instant puts the body straight
     in the chair, for the header link and deep links. */
  function sit(seatSpot, approachSpot, { instant = false } = {}) {
    seat = seatSpot;
    spot = approachSpot;
    turnTo = null;
    if (instant) {
      pos.set(seat.x, seatFloor(), seat.z);
      heading = seat.heading;
      speed = 0;
      state = "seated";
      phase = 0;
      path = [];
      if (mixer) play(seatedClip(), 0);
      root.position.copy(pos);
      root.rotation.y = heading;
      return true;
    }
    if (state !== "walk") return false;
    path = route(solids, pos, spot);
    state = "approach";
    phase = 0;
    return true;
  }

  /* Get up and step back to the spot behind the chair; on the way there, just stop. */
  function standUp({ instant = false } = {}) {
    if (state === "walk" || state === "standing-up") return false;
    if (state === "approach") { state = "walk"; path = []; return true; }
    if (instant) {
      pos.set(spot.x, ground + heightAt(spot.x, spot.z), spot.z);
      heading = spot.heading;
      speed = 0;
      state = "walk";
      if (mixer) play("Idle", 0);
      return true;
    }
    beginStand();
    return true;
  }

  function teleport({ x, z, heading: h }) {
    state = "walk";
    path = [];
    turnTo = null;
    pos.set(x, ground + heightAt(x, z), z);
    heading = h;
    speed = 0;
    collide(pos);
    root.position.copy(pos);
    root.rotation.y = heading;
    if (mixer) play("Idle", 0.15);
  }

  return {
    position: pos,
    get heading() { return heading; },
    get speed() { return speed; },
    get state() { return state; },
    height: HEIGHT,
    radius: RADIUS,
    walkSpeed: WALK,
    runSpeed: RUN,
    meta,
    update,
    teleport,
    sit,
    standUp,
    point,
    setTyping(on) { typing = !!on; },
    setColliders(list) { solids = list || []; }
  };
}
